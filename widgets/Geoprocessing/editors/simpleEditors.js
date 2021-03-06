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

define(['dojo/_base/declare',
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/_base/html',
  'dojo/on',
  'dojo/Deferred',
  'dojo/promise/all',
  'dojo/json',
  'dijit/form/NumberTextBox',
  'dijit/form/Select',
  'dijit/form/Textarea',
  'dijit/form/DateTextBox',
  'dijit/form/TimeTextBox',
  'jimu/dijit/CheckBox',
  'jimu/dijit/URLInput',
  'jimu/utils',
  'esri/tasks/LinearUnit',
  'esri/tasks/FeatureSet',
  'esri/geometry/Polygon',
  'esri/graphic',
  '../BaseEditor'
],
function(declare, lang, array, html, on, Deferred, all, json, NumberTextBox, Select,
  Textarea, DateTextBox, TimeTextBox, CheckBox, URLInput, utils,
  LinearUnit, FeatureSet, Polygon, Graphic, BaseEditor) {
  var mo = {};

  function createValueListEditor(valueList, defaultValue) {
    return new Select({
      value: defaultValue,
      options: array.map(valueList, function(valueItem) {
        return {label: valueItem, value: valueItem};
      })
    });
  }

  function getFilterType(param) {
    if (param.filter && param.filter.type) {
      return param.filter.type.toLowerCase();
    }
    return null;
  }

  function getRange(filter) {
    var min, max;
    if (filter.list && filter.list.length === 2) {
      min = +filter.list[0];
      max = +filter.list[1];
    } else {
      min = filter.minimum;
      max = filter.maximum;
    }
    if (!isNaN(min) && !isNaN(max)) {
      min = Math.min(min, max);
      max = Math.max(min, max);
      return [min, max];
    }
    return null;
  }

  mo.UnsupportEditor = declare(BaseEditor, {
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-unsupport',
    editorName: 'UnsupportEditor',

    postCreate: function(){
      this.inherited(arguments);
      html.setAttr(this.domNode, 'innerHTML', utils.sanitizeHTML(this.message));
    },

    getValue: function(){
      return null;
    }
  });

  mo.ShowMessage = declare(BaseEditor, {
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-message',
    editorName: 'ShowMessage',

    postCreate: function(){
      this.inherited(arguments);
      html.setAttr(this.domNode, 'innerHTML', utils.sanitizeHTML(this.message));
    },

    getValue: function(){
      return null;
    }
  });

  mo.GeneralEditorWrapperEditor = declare(BaseEditor, {
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-wrapper',
    editorName: 'GeneralEditorWrapperEditor',

    postCreate: function(){
      this.inherited(arguments);
      html.setStyle(this.gEditor.domNode, 'width', '100%');
      if(this.editorName === 'Select'){ // from choiceList
        html.addClass(this.gEditor.domNode, 'restrict-select-width');
      } else {
        var filterType = getFilterType(this.param);
        if (filterType === 'valuelist' && this.param.filter.list && this.param.filter.list.length > 0) {
          this.gEditor = createValueListEditor(this.param.filter.list, this.param.defaultValue);
          html.addClass(this.gEditor.domNode, 'restrict-select-width');
        }
      }

      this.gEditor.placeAt(this.domNode);
    },

    reset: function() {
      this.gEditor.set('value', '');
    },

    getValue: function(){
      var value = this.gEditor.getValue();
      if (typeof value === 'string' && lang.trim(value) === '') {
        return null;
      }
      return value;
    }
  });

  mo.LongNumberEditor = declare(BaseEditor, {
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-long',
    editorName: 'LongNumberEditor',

    postCreate: function(){
      this.inherited(arguments);
      this.value = !isNaN(this.param.defaultValue) ? this.param.defaultValue : NaN;

      var filterType = getFilterType(this.param);
      if (filterType === 'range') {
        var range = getRange(this.param.filter);
        if (range) {
          this.editor = new NumberTextBox({
            value: this.value,
            constraints: {
              places:0,
              min: range[0],
              max: range[1]
            }
          });
        }
      } else if (filterType === 'valuelist' && this.param.filter.list && this.param.filter.list.length > 0) {
        this.editor = createValueListEditor(this.param.filter.list, this.param.defaultValue);
      }

      if (!this.editor) {
        this.editor = new NumberTextBox({
          value: this.value,
          constraints: {
            places: 0
          }
        });
      }

      this.editor.placeAt(this.domNode);
    },

    reset: function() {
      this.editor.set('value', NaN);
    },

    getValue: function(){
      var ret = this.editor.get('value');

      if(isNaN(ret)){
        return null;
      }else{
        return ret;
      }
    }
  });

  mo.DoubleNumberEditor = declare(BaseEditor, {
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-double',
    editorName: 'DoubleNumberEditor',

    postCreate: function(){
      this.inherited(arguments);
      this.value = !isNaN(this.param.defaultValue) ? this.param.defaultValue : NaN;

      var filterType = getFilterType(this.param);
      if (filterType === 'range') {
        var range = getRange(this.param.filter);
        if (range) {
          this.editor = new NumberTextBox({
            value: this.value,
            constraints: {
              places: '0,15',
              min: range[0],
              max: range[1]
            }
          });
        }
      } else if (filterType === 'valuelist' && this.param.filter.list && this.param.filter.list.length > 0) {
        this.editor = createValueListEditor(this.param.filter.list, this.param.defaultValue);
      }

      if (!this.editor) {
        this.editor = new NumberTextBox({
          value: this.value,
          constraints: {
            places: '0,15'
          }
        });
      }

      this.editor.placeAt(this.domNode);
    },

    reset: function() {
      this.editor.set('value', NaN);
    },

    getValue: function(){
      var ret = this.editor.get('value');

      if(isNaN(ret)){
        return null;
      }else{
        return ret;
      }
    }
  });

  mo.MultiValueChooser = declare(BaseEditor, {
    //this dijit is used to choose multi value from choice list
    //we support simple value only for now
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-multivalue-chooser',
    editorName: 'MultiValueChooser',

    postCreate: function(){
      this.inherited(arguments);
      this.checkBoxs = [];
      array.forEach(this.param.choiceList, function(choice){
        var dijit = new CheckBox({
          label: choice,
          checked: this.param.defaultValue && this.param.defaultValue.indexOf(choice) > -1?
          true: false
        });
        dijit.placeAt(this.domNode);
        this.checkBoxs.push(dijit);
      }, this);
    },

    getValue: function(){
      var value = [];
      array.forEach(this.checkBoxs, function(checkBox){
        if(checkBox.checked){
          value.push(checkBox.label);
        }
      }, this);
      return value;
    }
  });

  mo.MultiValueEditor = declare(BaseEditor, {
    //this dijit is used to edit multi value, can add/delete value
    //we support simple value only for now
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-multivalue',
    editorName: 'MultiValueEditor',

    postCreate: function(){
      this.inherited(arguments);
      this.editors = [];

      var inputListNode = html.create('div', {
        'class': 'input-list'
      }, this.domNode);

      var _param = lang.clone(this.param, inputListNode);
      _param.dataType = this.param.dataType.substr('GPMultiValue'.length + 1,
        this.param.dataType.length);
      _param.originParam = this.param;

      this._initChildEditors(_param, inputListNode);
      this._createAddInputNode(_param, inputListNode);
    },

    _initChildEditors: function(_param, inputListNode){
      if(this.param.defaultValue && this.param.defaultValue.length > 0){
        array.forEach(this.param.defaultValue, function(v){
          _param.defaultValue = v;
          this._createSingleInputContainerNode(_param, inputListNode);
        }, this);
      }else{
        //if no default value, create a default input area
        delete _param.defaultValue;
        this._createSingleInputContainerNode(_param, inputListNode);
      }
    },

    getValue: function(){
      var value = [];
      array.forEach(this.editors, function(editor){
        var editorValue = editor.getValue();
        if (editorValue) {
          value.push(editorValue);
        }
      }, this);
      return value;
    },

    getGPValue: function(){
      var def = new Deferred(), defs = [];
      array.forEach(this.editors, function(editor){
        defs.push(editor.getGPValue());
      }, this);
      all(defs).then(function(values){
        def.resolve(values);
      }, function(err){
        def.reject(err);
      });
      return def;
    },

    destroy: function(){
      array.forEach(this.editors, function(editor){
        editor.destroy();
      });
      this.editors = [];
      this.inherited(arguments);
    },

    _createSingleInputContainerNode: function(param, inputListNode){
      var node = html.create('div', {
        'class': 'single-input'
      }, inputListNode);

      var inputEditor = this.editorManager.createEditor(param, 'input', this.context, {
        widgetUID: this.widgetUID,
        config: this.config
      });
      inputEditor.placeAt(node);

      this._createRemoveInputNode(node);
      node.inputEditor = inputEditor;
      this.editors.push(inputEditor);
      return node;
    },

    _createRemoveInputNode: function(containerNode){
      var node = html.create('div', {
        'class': 'remove',
        innerHTML: '-'
      }, containerNode);
      this.own(on(node, 'click', lang.hitch(this, function(){
        this.editors.splice(this.editors.indexOf(containerNode.inputEditor), 1);
        containerNode.inputEditor.destroy();
        html.destroy(containerNode);
      })));
      return node;
    },

    _createAddInputNode: function(param, inputListNode){
      var node = html.create('div', {
        'class': 'add-input'
      }, this.domNode);
      var addNode = html.create('div', {
        'class': 'add-btn',
        innerHTML: '+'
      }, node);
      this.own(on(addNode, 'click', lang.hitch(this, function(){
        this._createSingleInputContainerNode(param, inputListNode);
      })));
      return node;
    }
  });

  mo.LinerUnitEditor = declare(BaseEditor, {
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-liner-unit',
    editorName: 'LinerUnitEditor',

    postCreate: function(){
      this.inherited(arguments);
      this.distance = this.param.defaultValue ? this.param.defaultValue.distance : 0;
      this.units = this.param.defaultValue ? this.param.defaultValue.units : 'esriMeters';

      this.inputDijit = new NumberTextBox({
        value: this.distance,
        constraints: {
          places: '0,15',
        }
      });
      this.selectDijit = new Select({
        value: this.units,
        options: [
          {label: this.nls.meters, value: 'esriMeters'},
          {label: this.nls.kilometers, value: 'esriKilometers'},
          {label: this.nls.feet, value: 'esriFeet'},
          {label: this.nls.miles, value: 'esriMiles'},
          {label: this.nls.nauticalMiles, value: 'esriNauticalMiles'},
          {label: this.nls.yards, value: 'esriYards'}
        ]
      });
      html.addClass(this.selectDijit.domNode, 'restrict-select-width');
      this.inputDijit.placeAt(this.domNode);
      this.selectDijit.placeAt(this.domNode);
    },

    getValue: function(){
      var ret = new LinearUnit();
      ret.distance = this.inputDijit.getValue();
      ret.units = this.selectDijit.getValue();
      return ret;
    }
  });

  mo.DateTimeEditor = declare(BaseEditor, {
    baseClass: 'jimu-gp-editor-base jimu-gp-editor-datatime',
    editorName: 'DateTimeEditor',

    postCreate: function(){
      var defaultDt = new Date(this.param.defaultValue);

      //we re-create date again because if we use the today/defaultDt directly,
      //the TimeTextBox can't work. I dont know why.
      this.value = this.param.defaultValue?
        new Date(defaultDt.getFullYear(),
          defaultDt.getMonth(),
          defaultDt.getDate(),
          defaultDt.getHours(),
          defaultDt.getMinutes(),
          defaultDt.getSeconds()):
          null;
      this.inherited(arguments);
      this.dateDijit = new DateTextBox({
        value: this.value,
        style: {width: '60%'}
      });

      this.timeDijit = new TimeTextBox({
        value: this.value,
        style: {width: '40%'},
        constraints: {
          timePattern: 'HH:mm:ss',
          clickableIncrement: 'T00:15:00',
          visibleIncrement: 'T00:15:00'
        }
      });
      this.dateDijit.placeAt(this.domNode);
      this.timeDijit.placeAt(this.domNode);
    },

    startup: function(){
      this.dateDijit.startup();
      this.timeDijit.startup();
    },

    reset: function() {
      this.dateDijit.set('value', undefined);
      this.timeDijit.set('value', undefined);
    },

    getValue: function(){
      var ret = new Date();
      var dt = this.dateDijit.getValue();
      var time = this.timeDijit.getValue();

      if(dt !== null && time !== null){
        ret.setFullYear(dt.getFullYear());
        ret.setMonth(dt.getMonth());
        ret.setDate(dt.getDate());
        ret.setHours(time.getHours());
        ret.setMinutes(time.getMinutes());
        ret.setSeconds(time.getSeconds());
        return ret.getTime();
      }else{
        return null;
      }
    }
  });

  mo.GetUrlObjectFromLayer = declare([BaseEditor, Select], {
    editorName: 'GetUrlObjectFromLayer',

    postCreate: function(){
      this.options = [];
      array.forEach(this.map.graphicsLayerIds, function(layerId){
        var layer = this.map.getLayer(layerId);
        if(layer.declaredClass === 'esri.layers.FeatureLayer' &&
          (!this.geometryType || layer.geometryType === this.geometryType)){
          this.options.push({
            label: layer.label || layer.title || layer.name || layer.id,
            value: layer.id
          });
        }
      }, this);

      this.inherited(arguments);

      this.setValue(this.value);
      html.addClass(this.domNode, 'jimu-gp-editor-sffl');
      html.addClass(this.domNode, 'jimu-gp-editor-base');
    },

    getValue: function(){
      return this.value;
    },

    getGPValue: function(){
      var url, value;
      array.forEach(this.map.graphicsLayerIds, function(layerId){
        var layer = this.map.getLayer(layerId);
        if(layerId === this.getValue()){
          url = layer.url;
        }
      }, this);

      value = {url: url};
      value = this.wrapGPValue(value);
      return this.wrapValueToDeferred(value);
    }
  });

  mo.ObjectUrlEditor = declare([BaseEditor, URLInput], {
    editorName: 'ObjectUrlEditor',

    postCreate: function(){
      this.rest = false;
      this.inherited(arguments);
      html.addClass(this.domNode, 'jimu-gp-editor-ourl');
      html.addClass(this.domNode, 'jimu-gp-editor-base');
    },

    getValue: function(){
      return this.value;
    },

    getGPValue: function(){
      var value;
      if(this.getValue()){
        value = {url: this.getValue()};
      }else{
        value = null;
      }
      value = this.wrapGPValue(value);
      return this.wrapValueToDeferred(value);
    }
  });

  mo.SimpleJsonEditor = declare([BaseEditor, Textarea], {
    editorName: 'SimpleJsonEditor',

    postMixInProperties: function() {
      this.inherited(arguments);
      if(typeof this.value === 'object'){
        this.value = json.stringify(this.value);
      }
    },

    postCreate: function(){
      this.inherited(arguments);
      html.addClass(this.domNode, 'jimu-gp-editor-json');
      html.addClass(this.domNode, 'jimu-gp-editor-base');
      this.set('placeholder', this.nls.jsonPlaceholder);
    },

    getValue: function(){
      return this.value;
    },

    getGPValue: function(){
      var value;
      if(this.getValue()){
        value = json.parse(this.getValue());
      }else{
        value = null;
      }
      value = this.wrapGPValue(value);
      return this.wrapValueToDeferred(value);
    }
  });

  mo.currentExtentEditor = declare(BaseEditor, {
    editorName: 'SelectFeatureSetFromMap',

    postCreate: function(){
      this.inherited(arguments);
      html.setAttr(this.domNode, 'innerHTML', this.message);
    },

    getValue: function(){
      var featureset = new FeatureSet();
      var graphic = new Graphic(Polygon.fromExtent(this.map.extent));
      var features = [graphic];

      featureset.features = features;
      return featureset;
    }
  });

  return mo;
});
