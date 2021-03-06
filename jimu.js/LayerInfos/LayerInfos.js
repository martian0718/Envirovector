///////////////////////////////////////////////////////////////////////////
// Copyright © Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
  'dojo/_base/declare',
  'dojo/_base/array',
  'dojo/_base/lang',
  'dojo/Deferred',
  'dojo/on',
  'dojo/topic',
  'dojo/Evented',
  'dojo/promise/all',
  './LayerInfoFactory',
  'libs/crc'
], function(declare, array, lang, Deferred, on, topic,
  Evented, all, LayerInfoFactory, crc) {
  var clazz = declare([Evented], {
    declaredClass: "jimu.LayerInfos",
    map: null,
    _operLayers: null,
    _layerInfos: null,
    _finalLayerInfos: null,
    _tableInfos: null,
    //_finalTableInfos: null,
    _basemapLayerInfos: null,
    _finalBasemapLayerInfos: null,
    _basemapLayers: null,
    _unreachableLayersTitleOfWebmap: null,
    _objectId: null,
    _layerInfoFactory: null,
    _previousLayerOrder: null,

    constructor: function(map, webmapItemData) {
      this._objectId = Math.random();
      this._unreachableLayersTitleOfWebmap = [];
      this._basemapLayers = webmapItemData.baseMap.baseMapLayers;
      this._operLayers = webmapItemData.operationalLayers;
      this._tables = webmapItemData.tables;
      this._layerInfoFactory = new LayerInfoFactory(map, this);
      this.map = map;
      this._previousLayerOrder = [].concat(this.map.layerIds, this.map.graphicsLayerIds);
      this._initLayerInfos();
      this._initBasemapLayerInfos();
      this._initTablesInfos();
      this.update();
      this._bindEvents();
    },

    update: function() {
      this._extraSetLayerInfos();
      this._clearAddedFlag(this._finalLayerInfos);
      this._clearAddedFlag(this._finalBasemapLayerInfos);
      //this._initFinalTableInfos();
      this._initFinalLayerInfos();
      this._initFinalBasemapLayerInfos();
      this._markFirstOrLastNode();
    },

    getLayerInfoArrayOfWebmap: function() {
      // var layerInfoArrayOfWebmap = [];
      // for(var i = this._layerInfos.length - 1; i >= 0; i--) {
      //   if(!this._layerInfos[i]._extraOfWebmapLayerInfo) {
      //     layerInfoArrayOfWebmap.push(this._layerInfos[i]);
      //   }
      // }
      // return layerInfoArrayOfWebmap;
      var layerInfoArrayOfWebmap = [];
      array.forEach(this.getLayerInfoArray(), function(layerInfo) {
        for(var i = 0; i < this._operLayers.length; i++) {
          if(layerInfo.id === this._operLayers[i].id) {
            layerInfoArrayOfWebmap.push(layerInfo);
            break;
          }
        }
        if(i === this._operLayers.length) {
          var index =
            this._removedLayerInfoIdsFromFeatureCollection.indexOf(layerInfo.id);
          if(index >= 0) {
            layerInfoArrayOfWebmap.push(layerInfo);
          }
        }
      }, this);
      return layerInfoArrayOfWebmap;
    },

    getTableInfoArrayOfWebmap: function(){
      var tableInfoArrayOfWebmap = [];
      array.forEach(this.getTableInfoArray(), function(tableInfo) {
        for(var i = 0; i < this._tables.length; i++) {
          if(tableInfo.id === this._tables[i].id) {
            tableInfoArrayOfWebmap.push(tableInfo);
            break;
          }
        }
      }, this);
      return tableInfoArrayOfWebmap;
    },

    getLayerInfoArray: function() {
      return array.filter(this._finalLayerInfos, function(layerInfo) {
        // supports to set isTemporaryLayer when layerObject already added to map.
        if(lang.getObject("_wabProperties.isTemporaryLayer", false, layerInfo.layerObject)) {
          layerInfo._flag._isTemporaryLayerInfo = true;
        }
        return !layerInfo._flag._isTemporaryLayerInfo;
      });
    },

    getTableInfoArray: function() {
      return this._tableInfos;
    },

    getBasemapLayerInfoArray: function() {
      return this._finalBasemapLayerInfos;
    },

    addFeatureCollection: function(featureLayers, title) {
      var id = this._getUniqueTopLayerInfoId(title);

      var featureCollection = {
        layers: []
      };
      // set layer id
      array.forEach(featureLayers, function(featureLayer, index) {
        featureLayer.id = id + '_' + index;
        featureCollection.layers.push({
          id: featureLayer.id,
          layerObject: featureLayer
        });
      }, this);

      this.map.addLayers(featureLayers);

      var newLayerInfo;
      try {
        newLayerInfo = this._layerInfoFactory.create({
          featureCollection: featureCollection,
          title: title || id,
          id: id
        }, this.map);
        newLayerInfo.init();
      } catch (err) {
        console.warn(err.message);
        newLayerInfo = null;
      }

      if(newLayerInfo) {
        newLayerInfo._extraOfWebmapLayerInfo = true;
        this._layerInfos.push(newLayerInfo);
        this.update();
        this._onLayersUpdated(newLayerInfo, newLayerInfo.getRootLayerInfo());
      }

    },

    addTable: function(table) {
      // summary:
      //    add a table to LayerInfos
      // description:
      //    parameter table = {
      //      id: Optional parameters;
      //      title:
      //      url: alternative with featureCollectionData
      //      featureCollectionData: alternative with url
      //      options: Optional parameters; See options list of FeatureLayer's Constructor from
      //               ArcGIS JavaScript API reference.
      //    }
      var tableInfos = this._addTables([table], this._tableInfos);
      return tableInfos[0] ? tableInfos[0] : null;
    },

    removeTable: function(tableInfo) {
      var tableInfoIndex = -1;
      array.forEach(this._tableInfos, function(_tableInfo, index) {
        if(tableInfo.id === _tableInfo.id) {
          tableInfoIndex = index;
        }
      });

      if(tableInfoIndex >= 0) {
        var removedTableInfo = this._tableInfos[tableInfoIndex];
        this._tableInfos.splice(tableInfoIndex, 1);
        removedTableInfo.destroy();
        this._onTableChange([tableInfo], clazz.REMOVED);
      }
    },

    _addTables: function(tables, targetTableInfos) {
      var tableInfos = [];
      var tableObjectDefs = [];
      array.forEach(tables, function(table) {
        var tableInfo;
        try {
          table.layerObject = {
            url: table.url,
            featureCollectionData: table.featureCollectionData,
            empty: true
          };
          table.id = this._getUniqueTableId(table.id);
          table.selfType = 'table';

          tableInfo = this._layerInfoFactory.create(table);
          tableInfo.init();
        } catch (err) {
          console.warn(err.message);
          tableInfo = null;
        }
        if(tableInfo) {
          tableInfos.push(tableInfo);
          targetTableInfos.push(tableInfo);
          tableObjectDefs.push(tableInfo.getLayerObject());
        }
      }, this);
      all(tableObjectDefs).then(lang.hitch(this, function(tableObjects) {
        var addedTableInfos = [];
        array.forEach(tableObjects, function(tableObject, index) {
          var currentTableInfo = tableInfos[index];
          if(tableObject) {
            addedTableInfos.push(currentTableInfo);
          } else {
            this.removeTable(currentTableInfo);
            currentTableInfo.destroy();
          }
        }, this);
        this._onTableChange(addedTableInfos, clazz.ADDED);
      }));

      return tableInfos;
    },


    _getUniqueTableId: function(id) {
      var tableInfos = this._tableInfos.concat(this._tableInfos || []);
      return this._getUniqueLayerOrTableId(id, tableInfos);
    },

    _getUniqueTopLayerInfoId: function(id) {
      return this._getUniqueLayerOrTableId(id, this._finalLayerInfos);
    },

    _getUniqueLayerOrTableId: function(id, layerOrTableInfos) {
      var number = 1;
      var tempId;

      if (!id) {
        id = 'table';
      }
      tempId = id;
      while (true) {
        for (var i = 0; i < layerOrTableInfos.length; i++) {
          if (layerOrTableInfos[i].id === tempId) {
            break;
          }
        }
        if (i === layerOrTableInfos.length) {
          return tempId;
        } else {
          tempId = id + '_' + number.toString();
          number++;
        }
      }
    },

    //callback(layerInfo){
    // return true;   will interrupte traversal
    // return false;  contiue traversal
    //}
    _traversal: function(callback, layerInfoArray) {
      for (var i = 0; i < layerInfoArray.length; i++) {
        if (layerInfoArray[i].traversal(callback)) {
          return true;
        }
      }
      return false;
    },

    //callback(layerInfo){
    // return true;   will interrupte traversal
    // return false;  contiue traversal
    //}
    traversal: function(callback) {
      var layerInfoArray = this.getLayerInfoArray();
      return this._traversal(callback, layerInfoArray);
    },

    //callback(layerInfo){
    // return true;   will interrupte traversal
    // return false;  contiue traversal
    //}
    traversalLayerInfosOfWebmap: function(callback) {
      var layerInfoArray = this.getLayerInfoArrayOfWebmap();
      return this._traversal(callback, layerInfoArray);
    },

    //callback(layerInfo){
    // return true;   will interrupte traversal
    // return false;  contiue traversal
    //}
    traversalAll: function(callback) {
      // summary:
      //  traversal all layerInfoArray and table tableInfoArray
      var layerInfoArray = this.getLayerInfoArray();
      var baseMapLayerInfoArray = this.getBasemapLayerInfoArray();
      var tableInfoArray = this.getTableInfoArray();
      var allLayerInfos = layerInfoArray.concat(baseMapLayerInfoArray.concat(tableInfoArray));

      return this._traversal(callback, allLayerInfos);
    },

    //callback(layerInfo){
    // return true;   will interrupte traversal
    // return false;  contiue traversal
    //}
    _traversalAllWithSpecialLayerInfo: function(callback) {
      // summary:
      //  traversal all layerInfoArray and table tableInfoArray
      var layerInfoArray = this._finalLayerInfos;
      var tableInfoArray = this._tableInfos;
      return this._traversal(callback, layerInfoArray.concat(tableInfoArray));
    },

    getLayerInfoById: function(layerId) {
      return this._findLayerInfoById(layerId);
    },

    getTableInfoById: function(tableId) {
      var tableInfoResult = null;
      array.some(this.getTableInfoArray(), function(tableInfo) {
        if(tableInfo.id === tableId) {
          tableInfoResult = tableInfo;
          return true;
        }
      });
      return tableInfoResult;
    },

    getLayerOrTableInfoById: function(layerOrTableId) {
      var layerOrTableInfoResult = null;
      this.traversalAll(function(layerOrTableInfo) {
        if(layerOrTableInfo.id === layerOrTableId) {
          layerOrTableInfoResult = layerOrTableInfo;
          return true;
        }
      });
      return layerOrTableInfoResult;
    },

    // interface concern layerInfo or tableInfo has to redefine.
    getLayerInfoByTopLayerId: function(layerId) {
      return this._findTopLayerInfoById(layerId);
    },

    moveUpLayer: function(layerInfo, steps) {
      // summary:
      //    move up layerInfo
      // description:
      //    parameters:
      //      layerInfo: layerInfo to be moved
      //      steps: steps of move down
      var beChangedLayerInfo = null/*, tempLayerInfo*/;
      steps = steps ? steps : 1;
      var index = this._getTopLayerInfoIndexById(layerInfo.id), l;
      if (index - steps >= 0) {
        l = this._finalLayerInfos[index - steps].obtainLayerIndexesInMap().length;
        this._finalLayerInfos[index].moveRightOfIndex(this._finalLayerInfos[index - steps]
          .obtainLayerIndexesInMap()[l - 1].index);
        beChangedLayerInfo = this._finalLayerInfos[index - steps];
        //this.update();
        /*
        tempLayerInfo = this._finalLayerInfos[index];
        this._finalLayerInfos.splice(index, 1);
        this._finalLayerInfos.splice(index - steps, 0, tempLayerInfo);
        this._markFirstOrLastNode();
        topic.publish('layerInfos/layerReorder');
        */
        //topic.publish('layerInfos/layerReorder', index, steps, 'moveup');
      }
      return beChangedLayerInfo;
    },

    _reorderLayerInfosArray: function(beMovedLayerInfoIndex, steps, moveUpOrDown) {
      var tempLayerInfo;
      if(moveUpOrDown === "moveup") {
        tempLayerInfo = this._finalLayerInfos[beMovedLayerInfoIndex];
        this._finalLayerInfos.splice(beMovedLayerInfoIndex, 1);
        this._finalLayerInfos.splice(beMovedLayerInfoIndex - steps, 0, tempLayerInfo);
        this._markFirstOrLastNode();
      } else {
        tempLayerInfo = this._finalLayerInfos[beMovedLayerInfoIndex];
        this._finalLayerInfos.splice(beMovedLayerInfoIndex + steps + 1, 0, tempLayerInfo);
        this._finalLayerInfos.splice(beMovedLayerInfoIndex, 1);
        this._markFirstOrLastNode();
      }

      return tempLayerInfo;
    },

    moveDownLayer: function(layerInfo, steps) {
      // summary:
      //    move down layerInfo
      // description:
      //    parameters:
      //      layerInfo: layerInfo to be moved
      //      steps: steps of move down
      var beChangedLayerInfo = null/*, tempLayerInfo*/;
      steps = steps ? steps : 1;
      var index = this._getTopLayerInfoIndexById(layerInfo.id);
      if (index + steps <= (this._finalLayerInfos.length - 1)) {
        this._finalLayerInfos[index].moveLeftOfIndex(this._finalLayerInfos[index + steps]
          .obtainLayerIndexesInMap()[0].index);
        beChangedLayerInfo = this._finalLayerInfos[index + steps];
        //this.update();
        /*
        tempLayerInfo = this._finalLayerInfos[index];
        this._finalLayerInfos.splice(index + steps + 1, 0, tempLayerInfo);
        this._finalLayerInfos.splice(index, 1);
        this._markFirstOrLastNode();
        topic.publish('layerInfos/layerReorder');
        */
        //topic.publish('layerInfos/layerReorder', index, steps, 'movedown');
      }
      return beChangedLayerInfo;
    },

    getBasemapLayers: function() {
      var basemapLayers = [];
      array.forEach(this.map.layerIds.concat(this.map.graphicsLayerIds || []), function(layerId) {
        var layer = this.map.getLayer(layerId);
        if (layer._basemapGalleryLayerType === "basemap" ||
          layer._basemapGalleryLayerType === "reference") {
          basemapLayers.push(layer);
        }
      }, this);

      /*
      if (basemapLayers.length === 0) {
        basemapLayers = this._basemapLayers;
      }
      */

      return basemapLayers.reverse();
    },

    getMapNotesLayerInfoArray: function() {
      // summary:
      //    get all map notes layerInfos.
      // description:
      //    return value:
      //      the order is opposite of map.graphicsLayerIds
      return array.filter(this.getLayerInfoArray(), function(layerInfo) {
        // var mapNotesCondition = layerInfo.originOperLayer.featureCollection &&
        //   layerInfo.id.indexOf("mapNotes_") === 0 &&
        //   layerInfo.originOperLayer.layerType === "ArcGISFeatureLayer" &&
        //   !this.map.getLayer(layerInfo.id);
        // return mapNotesCondition;
        return layerInfo.isMapNotesLayerInfo();
      }, this);
    },

    // options = {
    // layerOptions: {
    //  id: {
    //        visible: true/false
    //      }
    //  }
    // }
    restoreState: function(options) {
      // restore layers visibility
      var layerOptions = options && options.layerOptions ? options.layerOptions: null;
      array.forEach(this._finalLayerInfos, function(rootLayerInfo) {
        rootLayerInfo.resetLayerObjectVisibility(layerOptions);
      }, this);
    },

    _getEncodedLayerIdsOfCurrentMap: function() {
      if(this._encodedLayerIds) {
        return this._encodedLayerIds;
      } else {
        this._encodedLayerIds = {
          encodedToLayerIds: {},
          layerIdsToEncoded: {}
        };
        this.traversal(lang.hitch(this, function(layerInfo) {
          var encodedLayerId = this._encodeLayerId(layerInfo.id);
          this._encodedLayerIds.encodedToLayerIds[encodedLayerId] = layerInfo.id;
          this._encodedLayerIds.layerIdsToEncoded[layerInfo.id] = encodedLayerId;
        }));
      }
      return this._encodedLayerIds;
    },

    _getShowOrHideLayerIdsBySimpleState: function(simpleState) {
      var showLayerIds = [];
      var hideLayerIds = [];
      var result = {
        showLayerIds: null,
        hideLayerIds: null
      };
      var encodedLayerIds = this._getEncodedLayerIdsOfCurrentMap().encodedToLayerIds;
      if(simpleState && simpleState.showLayersEncoded && encodedLayerIds) {
        array.forEach(simpleState.showLayersEncoded, function(encodedLayerId) {
          var layerId = encodedLayerIds[encodedLayerId];
          if(layerId) {
            showLayerIds.push(layerId);
          }
        });
        result.showLayerIds = showLayerIds;
      } else if (simpleState && simpleState.showLayers) {
        result.showLayerIds = simpleState.showLayers;
      } else if (simpleState && simpleState.hideLayersEncoded && encodedLayerIds) {
        array.forEach(simpleState.hideLayersEncoded, function(encodedLayerId) {
          var layerId = encodedLayerIds[encodedLayerId];
          if(layerId) {
            hideLayerIds.push(layerId);
          }
        });
        result.hideLayerIds = hideLayerIds;
      } else if (simpleState && simpleState.hideLayers) {
        result.hideLayerIds = simpleState.hideLayers;
      }
      return result;
    },

    _getSibilingLayerInfos: function(layerInfo) {
      if(layerInfo.isRootLayer()) {
        return this._finalLayerInfos;
      } else {
        return layerInfo.parentLayerInfo.getSubLayers();
      }
    },

    _revertSibilingLayersOnState: function(layerInfo, state, targetVisibility) {
      //reverse sibiling layers
      var sibilingLayerInfos = this._getSibilingLayerInfos(layerInfo);
      array.some(sibilingLayerInfos, lang.hitch(this, function(sibilingLayerInfo) {
        var sibilingLayerId = sibilingLayerInfo.id;
        if(!state.layerOptions[sibilingLayerId]) {
          state.layerOptions[sibilingLayerId] = {visible: targetVisibility};
        }
      }));
    },

    // simplificationState = {
    //   showLayers: [],            // layerId or layerTitle, alternative with other show/hide layers
    //   showLayersEncoded: [],     // alternative with other show/hide layers
    //   hideLayers: [],            // alternative with other show/hide layers
    //   hideLayersEncoded: [],     // alternative with other show/hide layers
    //   enablePopupLayers: [],
    //   visibilityScaleRange: {layerId: scaleRange}
    // }
    setSimplificationState: function(simplificationState) {
      var state = {layerOptions: {}};
      var showOrHideLayerIdsObj = this._getShowOrHideLayerIdsBySimpleState(simplificationState);
      this.traversal(lang.hitch(this, function(layerInfo) {
        //state.layerOptions[layerInfo.id] = {};
        // restore layers visibility.
        var showOrHideLayerIds;
        var isShowLayerIds;
        var layerId = null;
        if(showOrHideLayerIdsObj.showLayerIds) {
          showOrHideLayerIds = showOrHideLayerIdsObj.showLayerIds;
          isShowLayerIds = true;
        } else {
          showOrHideLayerIds = showOrHideLayerIdsObj.hideLayerIds;
          isShowLayerIds = false;
        }

        array.some(showOrHideLayerIds, function(layerIdOrTitle) {
          if(layerInfo.id === layerIdOrTitle) {
            layerId = layerInfo.id;
            return true;
          } else if(layerInfo.title.trim &&
                    layerIdOrTitle.trim &&
                    layerInfo.title.trim() === layerIdOrTitle.trim()) { // remove the end blank
            layerId = layerInfo.id;
            return false;
          }
        });
        if(isShowLayerIds) {
          if(layerId !== null) {
            // layerId exist at isShowLayerIds.
            state.layerOptions[layerInfo.id] = {visible: true};
            this._revertSibilingLayersOnState(layerInfo, state, false);
          } else if(showOrHideLayerIds.length === 0){
            // means url parameter is empty (showlayers= )
            state.layerOptions[layerInfo.id] = {visible: false};
          } // else, keeps layer visibility
        } else {
          if(layerId !== null) {
            state.layerOptions[layerInfo.id] = {visible: false};
            this._revertSibilingLayersOnState(layerInfo, state, true);
          } else if(showOrHideLayerIds.length === 0){
            // means url parameter is empty (hidelayers= )
            state.layerOptions[layerInfo.id] = {visible: true};
          } // else, keeps layer visibility
        }
      }));

      this.restoreState(state);
    },

    // simplificationState = {
    //   showLayers: [], // layerId or layerTitle
    //   showLayersEncoded: [],
    //   hideLayers: [],
    //   hideLayersEncoded: [],
    //   enablePopupLayers: [],
    //   visibilityScaleRange: {layerId: scaleRange}
    // }
    getSimplificationState: function() {
      var simplificationState = {
        showLayers: [],
        showLayersEncoded: [],
        hideLayers: [],
        hideLayersEncoded: []
      };
      this.traversal(lang.hitch(this, function(layerInfo) {
        if(layerInfo.isVisible()) {
          simplificationState.showLayers.push(layerInfo.id);
          simplificationState.showLayersEncoded.push(this._encodeLayerId(layerInfo.id));
        } else {
          simplificationState.hideLayers.push(layerInfo.id);
          simplificationState.hideLayersEncoded.push(this._encodeLayerId(layerInfo.id));
        }
      }));

      return simplificationState;
    },

    _encodeLayerId: function(layerId) {
      var crc24 = crc.crc24;
      var sum = crc24(layerId);
      sum = parseInt(sum, 16);
      sum = sum.toString(36);
      return sum;
    },

    getUnreachableLayersTitle: function() {
      return this._unreachableLayersTitleOfWebmap;
    },

    getObjectId: function() {
      return this._objectId;
    },

    _initLayerInfos: function() {
      this._layerInfos = [];
      this._initSpecifiedLayerInfos(this._operLayers, this._layerInfos);
    },

    _initBasemapLayerInfos: function() {
      this._basemapLayerInfos = [];
      this._initSpecifiedLayerInfos(this._basemapLayers, this._basemapLayerInfos);
    },

    _initSpecifiedLayerInfos: function(webmapLayers, layerInfos) {
      var layerInfo;
      array.forEach(webmapLayers, function(operLayer) {
        try {
          layerInfo = this._layerInfoFactory.create(operLayer);
          layerInfo.init();
        } catch (err) {
          console.warn(err.message);
          layerInfo = null;
          if(err.message.indexOf("declaredClass") >= 0) {
            this._unreachableLayersTitleOfWebmap.push(operLayer.title);
          }
        }
        if (layerInfo) {
          layerInfos.push(layerInfo);
        }
      }, this);
    },

    _extraSetLayerInfos: function() {
      //temporary code for getLayerInfoArrayOfWebmap
      this._removedLayerInfoIdsFromFeatureCollection = [];
      array.forEach(this._finalLayerInfos || this._layerInfos, function(layerInfo, index) {
        var newLayerInfo;
        if (layerInfo._needToRenew()) {
          try {
            newLayerInfo = this._layerInfoFactory.create(layerInfo.originOperLayer);
            newLayerInfo.init();
          } catch (err) {
            console.warn(err.message);
            newLayerInfo = null;
          }
          if (newLayerInfo) {
            //show new
            layerInfo.destroy();
            this._finalLayerInfos[index] = newLayerInfo;
          }
        } else if (layerInfo.originOperLayer.featureCollection) {
          var subLayerIds = [];
          array.forEach(layerInfo.getSubLayers(), function(subLayerInfo) {
            subLayerIds.push(subLayerInfo.id);
          });
          array.forEach(subLayerIds, function(subLayerId) {
            if (!this.map.getLayer(subLayerId)) {
              layerInfo.removeSubLayerById(subLayerId);
            }
          }, this);

          if (layerInfo.getSubLayers().length === 1) {
            var subLayerInfo = layerInfo.getSubLayers()[0];
            var subLayerObject = this.map.getLayer(subLayerInfo.id);
            subLayerObject.title = layerInfo.title;
            layerInfo.removeSubLayerById(subLayerInfo.id);
            this._removedLayerInfoIdsFromFeatureCollection.push(subLayerInfo.id);
            layerInfo.id = layerInfo.id + "_logically_removed";
          }
        }
      }, this);
    },

    _refineFinalLayerInfos: function() {
      // keep _finalLayerInfos is null if it's null.
      if(this._finalLayerInfos) {
        this._finalLayerInfos = array.filter(this._finalLayerInfos, function(layerInfo) {
          return !layerInfo._flag._invalid;
        });
      }
    },

    _initFinalLayerInfos: function() {
      //handle order to dicide _finalLayerInfos order
      var i, id;
      var baseLayerInfos = this._finalLayerInfos || this._layerInfos;
      this._finalLayerInfos = [];

      //for (i = 0; i < this.map.graphicsLayerIds.length; i++) {
      for (i = this.map.graphicsLayerIds.length - 1; i >= 0; i--) {
        id = this.map.graphicsLayerIds[i];
        if (!this._isBasemap(id)) {
          this._addToFinalLayerInfos(this._findLayerInfoByIdAndReturnTopLayer(id, baseLayerInfos),
            id,
            true);
        }
      }

      //for (i = 0; i < this.map.layerIds.length; i++) {
      for (i = this.map.layerIds.length - 1; i >= 0; i--) {
        id = this.map.layerIds[i];
        if (!this._isBasemap(id)) {
          this._addToFinalLayerInfos(this._findLayerInfoByIdAndReturnTopLayer(id, baseLayerInfos),
            id,
            false);
        }
      }
      this._refineFinalLayerInfos();
    },

    _initTablesInfos: function() {
      this._tableInfos = [];
      var reverseTables = this._tables && this._tables.reverse();
      if(reverseTables) {
        this._addTables(reverseTables, this._tableInfos);
      }
    },

    _initFinalBasemapLayerInfos: function() {
      var oldBasemapLayerInfos = this._finalBasemapLayerInfos || this._basemapLayerInfos;
      this._finalBasemapLayerInfos = [];
      array.forEach(this.getBasemapLayers(), function(baseMapLayer) {
        var layerInfo;
        array.some(oldBasemapLayerInfos, function(oldBasemapLayerInfo) {
          if(oldBasemapLayerInfo.id === baseMapLayer.id) {
            layerInfo = oldBasemapLayerInfo;
            return true;
          }
        }, this);

        this._addToFinalBasemapLayerInfos(layerInfo, baseMapLayer.id, false);
      }, this);
    },

    // _initFinalTableInfos: function() {
    //   // this._finalTableInfos = [];
    //   // array.forEach(this._tableInfos, function(tableInfo) {
    //   //   this._finalTableInfos.push(tableInfo);
    //   // }, this);
    //   var baseTableInfosInfos = this._finalTableInfos || this._tableInfos;
    //   this._finalTableInfos = [];
    //   array.forEach(baseTableInfosInfos, function(tableInfo) {
    //     this._finalTableInfos.push(tableInfo);
    //   }, this);
    // },

    _isBasemap: function(id) {
      var isBasemap = false;
      // var layerIds = this.map.layerIds;
      // var basemapLayers = [];
      // array.forEach(layerIds, function (layerId) {
      //   var layer = this.map.getLayer(layerId);
      //   if (layer._basemapGalleryLayerType === "basemap" ||
      //         layer._basemapGalleryLayerType === "reference") {
      //     basemapLayers.push(layer);
      //   }
      // }, this);

      // if(basemapLayers.length === 0) {
      //   basemapLayers = this._basemapLayers;
      // }

      var basemapLayers = this.getBasemapLayers();

      for (var i = 0; i < basemapLayers.length; i++) {
        // temporary code
        //if (this._basemapLayers[i].id === id ||
        //this.map.getLayer(id).url === this._basemapLayers[i].layerObject.url) {
        if (basemapLayers[i].id === id) {
          isBasemap = true;
        }
      }

      return isBasemap;
    },

    _addToFinalBasemapLayerInfos: function(layerInfo, id, isGraphicLayer) {
      this._addToSpecifiedLayerInfos(layerInfo, id, isGraphicLayer, this._finalBasemapLayerInfos);
    },

    _addToFinalLayerInfos: function(layerInfo, id, isGraphicLayer) {
      this._addToSpecifiedLayerInfos(layerInfo, id, isGraphicLayer, this._finalLayerInfos);
    },

    _addToSpecifiedLayerInfos: function(layerInfo, id, isGraphicLayer, specifiedLayerInfos) {
      var newLayer;
      var newLayerInfo;
      if (layerInfo) {
        if (!layerInfo._addedFlag && (layerInfo.isGraphicLayer() === isGraphicLayer)) {
          specifiedLayerInfos.push(layerInfo);
          layerInfo._addedFlag = true;
        }
      } else {
        newLayer = this.map.getLayer(id);
        // if newLayer is featueLayer add it.
        //if (newLayer.type && ((newLayer.type === "Feature Layer") ||
        //(newLayer.type === "Table"))) {
        //if (newLayer.declaredClass === 'esri.layers.FeatureLayer') {
        if (newLayer.declaredClass !== "esri.layers.GraphicsLayer" &&
            newLayer.declaredClass !== "esri.layers.LabelLayer") {
          try {
            var originOperLayer = {
              layerObject: newLayer,
              title: this._getLayerTitle(newLayer),
              id: newLayer.id || " "
            };
            // mixin originOperLayer from layerObject if it has.
            lang.mixin(originOperLayer, lang.getObject("_wabProperties.originOperLayer", false, newLayer));
            newLayerInfo = this._layerInfoFactory.create(originOperLayer, this.map);
            newLayerInfo.init();
          } catch (err) {
            console.warn(err.message);
            newLayerInfo = null;
          }
          if (newLayerInfo) {
            if(lang.getObject('_wabProperties.isTemporaryLayer', false, newLayer)) {
              newLayerInfo._flag._isTemporaryLayerInfo = true;
            }
            specifiedLayerInfos.push(newLayerInfo);
          }
        }

        // add table for new layerInfo.
        if (newLayer.declaredClass === "esri.layers.ArcGISDynamicMapServiceLayer" ||
          newLayer.declaredClass === "esri.layers.ArcGISTiledMapServiceLayer") {
          if (newLayerInfo) {
            newLayerInfo._getServiceDefinition().then(lang.hitch(this, function(serviceDefinition) {
              //var newTableInfos = [];
              var tableDifinations = [];
              array.forEach(serviceDefinition.tables, function(tableDifination) {
                tableDifination.url = newLayerInfo.getUrl() + '/' + tableDifination.id;
                tableDifination.id = newLayerInfo.id + '_' + tableDifination.id;
                tableDifination.title = this._getLayerTitle(tableDifination);
                // var newTalbeInfo = this._addTable([tableDifination], this._tableInfos);
                // if (newTalbeInfo) {
                //   newTableInfos.push(newTalbeInfo);
                // }
                tableDifinations.push(tableDifination);
              }, this);
              this._addTables(tableDifinations, this._tableInfos);
            }));
          }
        }
      }
    },

    _getLayerTitle: function(layer) {

      if(layer.title) {
        return layer.title;
      }

      if(lang.getObject("_wabProperties.originalLayerName", false, layer)) {
        return layer.name || layer.id;
      }

      var title = layer.label || layer.name || "";
      // does not add the service name if the layer is an item layer.
      if (layer.url && !lang.getObject("_wabProperties.itemLayerInfo", false, layer)) {
        var serviceName;
        var index = layer.url.indexOf("/FeatureServer");
        if (index === -1) {
          index = layer.url.indexOf("/MapServer");
        }
        if (index === -1) {
          index = layer.url.indexOf("/service");
        }
        if(index > -1) {
          serviceName = layer.url.substring(0, index);
          serviceName = serviceName.substring(serviceName.lastIndexOf("/") + 1, serviceName.length);
          if (title) {
            title = serviceName + " - " + title;
          } else {
            title = serviceName;
          }
        }

      }
      return title || layer.id;
    },

    _findLayerInfoByIdAndReturnTopLayer: function(id, layerInfos) {
      // summary:
      //    recursion find LayerInof in layerInfos and return top layerInfo.
      // description:
      //    if 'layerInfo' parameter is null, use this._finalLayerInfos.
      //    return null if layerInfo does not find.
      var i, layerInfo = null;

      if (!layerInfos) {
        layerInfos = this._finalLayerInfos;
      }
      for (i = 0; i < layerInfos.length; i++) {
        layerInfo = layerInfos[i].findLayerInfoById(id);
        if (layerInfo) {
          layerInfo = layerInfos[i];
          break;
        }
      }
      return layerInfo;
    },

    _findLayerInfoById: function(id, layerInfos) {
      // summary:
      //    recursion find LayerInof in layerInfos and return layerInfo self.
      // description:
      //    if 'layerInfo' parameter is null, use this._finalLayerInfos.
      //    return null if layerInfo does not find.
      var i, layerInfo = null;

      if (!layerInfos) {
        layerInfos = this._finalLayerInfos;
      }
      for (i = 0; i < layerInfos.length; i++) {
        layerInfo = layerInfos[i].findLayerInfoById(id);
        if (layerInfo) {
          break;
        }
      }
      return layerInfo;
    },

    _findTopLayerInfoById: function(id) {
      var i, layerInfo = null;
      var layerInfos = [].concat(this._finalLayerInfos || [], this._tableInfos || []); //******
      for (i = 0; i < layerInfos.length; i++) {
        if (layerInfos[i].id === id) {
          layerInfo = layerInfos[i];
          break;
        }
      }
      return layerInfo;
    },

    _getTopLayerInfoIndexById: function(id) {
      var i, index = -1;
      for (i = 0; i < this._finalLayerInfos.length; i++) {
        if (this._finalLayerInfos[i].id === id) {
          index = i;
          break;
        }
      }
      return index;
    },


    _clearAddedFlag: function(layerInfos) {
      array.forEach(layerInfos, function(operLayer) {
        operLayer._addedFlag = false;
      });
    },

    _markFirstOrLastNode: function() {
      var i;
      if (this._finalLayerInfos.length) {
        //clearing first
        for (i = 0; i < this._finalLayerInfos.length; i++) {
          this._finalLayerInfos[i].isFirst = false;
          this._finalLayerInfos[i].isLast = false;
        }

        this._finalLayerInfos[0].isFirst = true;
        this._finalLayerInfos[this._finalLayerInfos.length - 1].isLast = true;

        for (i = 0; i < this._finalLayerInfos.length; i++) {
          if (!this._finalLayerInfos[i].isGraphicLayer()) {
            if (i) {
              (this._finalLayerInfos[i - 1].isLast = true);
            }
            this._finalLayerInfos[i].isFirst = true;
            return;
          }
        }
      }
    },

    _onReceiveBasemapGalleryeData: function(name, widgetId, basemapLayers) {
      /*jshint unused: false*/
      if (name === "BasemapGallery") {
        this._basemapLayers.length = 0;
        array.forEach(basemapLayers, lang.hitch(this, function(basemapLayer) {
          this._basemapLayers.push({
            layerObject: basemapLayer,
            id: basemapLayer.id
          });
        }), this);
        this.update();
        this.emit('layerInfosChanged');
      }
    },

    //need modify
    _onBasemapChange: function(current) {
      var i;
      this._basemapLayers.length = 0;
      for (i = 0; i < current.layers.length; i++) {
        this._basemapLayers.push({
          layerObject: current.layer[i],
          id: current.layers[i].id
        });
      }
    },

    _destroyLayerInfos: function() {
      array.forEach(this._finalLayerInfos, lang.hitch(this, function(layerInfo) {
        layerInfo.destroy();
      }));
    },

    _bindEvents: function() {
      // summary:
      //   will be listened events by this module
      var handleAdd, handleRemove, handleBeforeMapUnload, handleIsShowInMapChanged,
      handleVisibleChanged, handleFilterChanged, handleReorder, handleRendererChanged,
      handleOpacityChanged, handleTimeExtentChanged, handleScaleRangeChanged;
      handleAdd = on(this.map, "layer-add-result", lang.hitch(this, this._onLayersChange, clazz.ADDED));
      handleRemove = on(this.map, "layer-remove", lang.hitch(this, this._onLayersChange, clazz.REMOVED));


      handleReorder = on(this.map, "layer-reorder", lang.hitch(this, this._onLayerReorder));

      //handleReorder = topic.subscribe('layerInfos/layerReorder',
      //  lang.hitch(this, this._onLayerReorder));

      handleIsShowInMapChanged = topic.subscribe('layerInfos/layerInfo/isShowInMapChanged',
        lang.hitch(this, this._onShowInMapChanged));

      handleVisibleChanged = topic.subscribe('layerInfos/layerInfo/visibleChanged',
        lang.hitch(this, this._onVisibleChanged));

      handleFilterChanged = topic.subscribe('layerInfos/layerInfo/filterChanged',
        lang.hitch(this, this._onFilterChanged));

      handleRendererChanged = topic.subscribe('layerInfos/layerInfo/rendererChanged',
        lang.hitch(this, this._onRendererChanged));

      handleOpacityChanged = topic.subscribe('layerInfos/layerInfo/opacityChanged',
        lang.hitch(this, this._onOpacityChanged));

      handleScaleRangeChanged = topic.subscribe('layerInfos/layerInfo/scaleRangeChanged',
        lang.hitch(this, this._onScaleRangeChanged));

      handleTimeExtentChanged = topic.subscribe('layerInfos/layerInfo/timeExtentChanged',
        lang.hitch(this, this._onTimeExtentChanged));

      handleBeforeMapUnload = on(this.map, "before-unload", lang.hitch(this, function() {
        handleAdd.remove();
        handleRemove.remove();
        handleReorder.remove();
        handleIsShowInMapChanged.remove();
        handleVisibleChanged.remove();
        handleFilterChanged.remove();
        handleRendererChanged.remove();
        handleBeforeMapUnload.remove();
        handleOpacityChanged.remove();
        handleScaleRangeChanged.remove();
        handleTimeExtentChanged.remove();
        this._destroyLayerInfos();
      }));
    },

    _emitEvent: function() {
      try {
        this.emit.apply(this, arguments);
      } catch (err) {
        console.warn(err);
      }
    },

    _emitEventForEveryLayerInfo: function(eventName, changedLayerInfos, parameterObj) {
      try {
        array.forEach(changedLayerInfos, function(changedLayerInfo) {
          changedLayerInfo.emitEvent(eventName, parameterObj);
        }, this);
      } catch (err) {
        console.warn(err);
      }
    },

    _onLayersChange: function(changedTypePara, evt) {
      /*jshint unused: false*/
      // summary:
      //    response to any layer change.
      // description:
      //    update LayerInfos data and publish event
      //    changedTypePara: "added" or "removed"
      var layerInfo = null, layerInfoSelf, changedType;
      if (!evt.error &&
        evt.layer.declaredClass !== "esri.layers.GraphicsLayer" &&
        evt.layer.declaredClass !== "esri.layers.LabelLayer") {

        if (changedTypePara === clazz.ADDED) {
          this.update();
          //layerInfo = this._findTopLayerInfoById(evt.layer.id);
          layerInfoSelf = this._findLayerInfoById(evt.layer.id, evt.layer._basemapGalleryLayerType ?
                                                                this._finalBasemapLayerInfos :
                                                                this._finalLayerInfos);
          layerInfo = layerInfoSelf;
          changedType = clazz.ADDED;
          if(layerInfoSelf && !layerInfoSelf.isRootLayer()) {
            layerInfo = layerInfoSelf.getRootLayerInfo();
            changedType = clazz.SUBLAYER_ADDED;
          }
        } else {
          //layerInfo = this._findTopLayerInfoById(evt.layer.id);
          layerInfoSelf = this._findLayerInfoById(evt.layer.id,  evt.layer._basemapGalleryLayerType ?
                                                                this._finalBasemapLayerInfos :
                                                                this._finalLayerInfos);
          layerInfo = layerInfoSelf;
          changedType = clazz.REMOVED;
          if(layerInfoSelf && !layerInfoSelf.isRootLayer()) {
            layerInfo = layerInfoSelf.getRootLayerInfo();
            changedType = clazz.SUBLAYER_REMOVED;
          }
          if(layerInfoSelf) {
            layerInfoSelf.destroy();
          }
          this.update();
        }
        // layerInfos top layer changed.
        if(layerInfo) {
          if(evt.layer._basemapGalleryLayerType) {
            this._emitEvent('basemapLayersChanged');
            this._emitEvent('basemapLayerInfosChanged', layerInfo, changedType, layerInfoSelf);
          } else {
            this._emitEvent('layerInfosChanged', layerInfo, changedType, layerInfoSelf);
          }
        }
      }
    },

    _onTableChange: function(tableInfos, changedType) {
      var tableInfosSelf = tableInfos;
      this._emitEvent('tableInfosChanged', tableInfos, changedType, tableInfosSelf);
    },

    _onLayersUpdated: function(layerInfo, layerInfoSelf) {
      if(layerInfo.isTable) {
        this._emitEvent('tableInfosChanged', [layerInfo], clazz.UPDATED, [layerInfoSelf]);
      } else {
        this._emitEvent('layerInfosChanged', layerInfo, clazz.UPDATED, layerInfoSelf);
      }
    },

    _onShowInMapChanged: function(changedLayerInfos) {
      this._emitEvent('layerInfosIsShowInMapChanged', changedLayerInfos);
      this._emitEventForEveryLayerInfo('isShowInMapChanged', changedLayerInfos);
    },

    _onVisibleChanged: function(changedLayerInfos) {
      this._emitEvent('layerInfosIsVisibleChanged', changedLayerInfos);
      this._emitEventForEveryLayerInfo('isVisibleChanged', changedLayerInfos);
    },

    _onFilterChanged: function(changedLayerInfos, parameterObj) {
      this._emitEvent('layerInfosFilterChanged', changedLayerInfos, parameterObj);
      this._emitEventForEveryLayerInfo('filterChanged', changedLayerInfos, parameterObj);
    },

    _onLayerReorder: function(/*beMovedLayerInfoIndex, steps,  moveUpOrDown*/) {
      //// doesn't call update(), manual reorder layerInfosArrar.
      //var beMovedLayerInfo = this._reorderLayerInfosArray(beMovedLayerInfoIndex, steps, moveUpOrDown);
      //this._emitEvent('layerInfosReorder', beMovedLayerInfo, clazz.REORDERED, beMovedLayerInfo);

      var currentLayerOrder = [].concat(this.map.layerIds, this.map.graphicsLayerIds);
      var isOrderChanged = array.some(currentLayerOrder, lang.hitch(this, function(layerId, index) {
        if(layerId === this._previousLayerOrder[index]) {
          return false;
        } else {
          return true;
        }
      }));
      if((currentLayerOrder.length === this._previousLayerOrder.length) && isOrderChanged) {
        this.update();
        this._emitEvent('layerInfosReorder', null, clazz.REORDERED);
      }
      this._previousLayerOrder = currentLayerOrder;
    },

    _onRendererChanged: function(changedLayerInfos) {
      this._emitEvent('layerInfosRendererChanged', changedLayerInfos);
      this._emitEventForEveryLayerInfo('rendererChanged', changedLayerInfos);
    },

    _onOpacityChanged: function(changedLayerInfos) {
      this._emitEvent('layerInfosOpacityChanged', changedLayerInfos);
      this._emitEventForEveryLayerInfo('opacityChanged', changedLayerInfos);
    },

    _onScaleRangeChanged: function(changedLayerInfos) {
      this._emitEvent('layerInfosScaleRangeChanged', changedLayerInfos);
      this._emitEventForEveryLayerInfo('scaleRangeChanged', changedLayerInfos);
    },

    _onTimeExtentChanged: function(changedLayerInfos) {
      this._emitEvent('layerInfosTimeExtentChanged', changedLayerInfos);
      this._emitEventForEveryLayerInfo('timeExtentChanged', changedLayerInfos);
    }

    // _onUpdated: function() {
    //   this._emitEvent('updated');
    // }

  });

  // static method to get LayerInfoArray by type, support types:
  //    "FeatureLayer"
  //    "FeatureCollection"
  //    "ArcGISDynamicMapServiceLayer"
  //    "ArcGISTiledMapServiceLayer"
  //    "GeoRSSLayer"
  //    "KMLLayer"
  //    "WMSLayer"
  //    "WTMSLayer"

  clazz.getLayerInfoArrayByType = function(map, layerType) {
    var defRet = new Deferred();
    var layerObjectTypeDefs = [];
    var layerInfoArray = [];

    clazz.getInstance(map, map.iteminfo).then(function(layerInfos) {
      layerInfos.traversal(function(layerInfo) {
        var typeDef = layerInfo.getLayerType();
        typeDef.layerInfo = layerInfo;
        layerObjectTypeDefs.push(typeDef);
      });

      all(layerObjectTypeDefs).then(function(typeResults) {
        array.forEach(typeResults, function(result, index) {
          if (layerType === result) {
            layerInfoArray.push(layerObjectTypeDefs[index].layerInfo);
          }
        });
        defRet.resolve(layerInfoArray);
      });
    });

    return defRet;
  };

  /*
  var instance = {
    empty: true,
    map: null,
    layerInfos: null,
    def: new Deferred()
  };
  // Return deferred because refere eatch other between LayerInfoFactory and LayerInfos.
  clazz.getInstance = function(map, webmapItemInfo) {
    // summary:
    //   get layerInfs instance.
    // description:
    //    map: esri.map object.
    //    webmapItemInfo: itemInfo of webmap.
    if (instance.map && instance.map !== map) {
      instance = {
        empty: true,
        map: null,
        layerInfos: null,
        def: new Deferred()
      };
    }

    if (instance.layerInfos) {
      instance.def.resolve(instance.layerInfos);
    } else if (instance.empty) {
      instance.empty = false;
      LayerInfoFactory.getInstance(map).init().then(lang.hitch(this, function() {
        var layerInfos = new clazz(map, webmapItemInfo.itemData);
        instance.map = map;
        instance.layerInfos = layerInfos;
        instance.def.resolve(layerInfos);
      }));
    } // else request is sending, return def.
    return instance.def;
  };
  */

  var instance = {
    map: null,
    layerInfos: null
  };

  // Return deferred for backward compatible.
  clazz.getInstance = function(map, webmapItemInfo) {
    var def = new Deferred();
    def.resolve(clazz.getInstanceSyncForInit(map, webmapItemInfo));
    return def;
  };


  clazz.getInstanceSyncForInit = function(map, webmapItemInfo) {
    // summary:
    //   get layerInfs instance.
    // description:
    //    map: esri.map object.
    //    webmapItemInfo: itemInfo of webmap.
    if (instance.map && instance.map !== map) {
      instance = {
        map: null,
        layerInfos: null
      };
    }

    if (!instance.layerInfos) {
      instance.layerInfos = new clazz(map, webmapItemInfo.itemData);
      instance.map = map;
    }

    return instance.layerInfos;
  };

  clazz.getInstanceSync = function() {
    return instance.layerInfos;
  };

  clazz.setInstance = function(map, layerInfos) {
    instance.map = map;
    instance.layerInfos = layerInfos;
  };

  clazz.createInstance = function(map) {
    var layerInfosWrap = {
      map: map,
      layerInfos: null
    };
    layerInfosWrap.layerInfos = new clazz(map, map.itemInfo.itemData);
    return layerInfosWrap.layerInfos;
  };

  lang.mixin(clazz, {
    ADDED: "added",
    REMOVED: "removed",
    SUBLAYER_ADDED: "subLayerAdded",
    SUBLAYER_REMOVED: "subLayerRemoved",
    UPDATED: "updated",
    REORDERED: "reordered"
  });
  return clazz;
});
