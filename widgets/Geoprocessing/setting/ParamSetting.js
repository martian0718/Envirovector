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
  'dojo/_base/html',
  'dojo/on',
  'dojo/text!./ParamSetting.html',
  'dijit/_WidgetBase',
  'dijit/_TemplatedMixin',
  'dijit/_WidgetsInTemplateMixin',
  'jimu/dijit/Popup',
  'jimu/utils',
  '../editorManager',
  '../EditorChooser',
  '../utils',
  'dijit/form/TextBox',
  'jimu/dijit/CheckBox'
],
function(declare, lang, html, on, template, _WidgetBase, _TemplatedMixin,
  _WidgetsInTemplateMixin,
  Popup, utils, editorManager, EditorChooser, gputils) {
  var clazz = declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
    baseClass: 'jimu-widget-setting-gp-param',
    templateString: template,

    postCreate: function(){
      this.inherited(arguments);
      editorManager.setMap(this.map);
      editorManager.setNls(this.nls);

      this.own(on(this.useDynamicSchema, 'change', lang.hitch(this, function(checked) {
        if (this.spart && this.spart.domNode) {
          if(checked) {
            html.setStyle(this.spart.domNode, 'display', 'none');
          } else {
            html.setStyle(this.spart.domNode, 'display', 'block');
          }
        }
      })));

      this.own(on(this.ignore, 'change', lang.hitch(this, this._updateStatus)));
    },

    _updateStatus: function(ignored) {
      if (ignored) {
        this.layerInvisible.setStatus(false);
        this.useDynamicSchema.setStatus(false);
        if (this.spart && this.spart.domNode) {
          html.setStyle(this.spart.domNode, 'display', 'none');
        }
      } else {
        this.layerInvisible.setStatus(true);
        this.useDynamicSchema.setStatus(true);
        if (this.spart && this.spart.domNode) {
          if (this.useDynamicSchema.getValue()) {
            html.setStyle(this.spart.domNode, 'display', 'none');
          } else {
            html.setStyle(this.spart.domNode, 'display', 'block');
          }
        }
      }
    },

    setParam: function(param, direction){
      this.param = param;
      this.direction = direction;

      if(param.label === undefined){
        param.label = '';
      }
      this.label.setValue(param.label);

      if(param.tooltip === undefined){
        if(param.label === undefined){
          param.tooltip = '';
        }else{
          param.tooltip = param.label;
        }
      }
      this.tooltip.setValue(param.tooltip);

      //spart, means special part, it's an editor(for input param) or a renderer(for output param)
      if(this.spart){
        this.spart.destroy();
        html.destroy(this.spartLabelNode);
        html.destroy(this.changeEditorNode);
      }
      this._createSpecialPart();

      if (direction === 'output') {
        html.setStyle(this.visibleDiv, 'display', 'none');
        html.setStyle(this.ignoreDiv, 'display', 'block');
        this.ignore.setValue(param.ignore);

        if (this.param.dataType === 'GPFeatureRecordSetLayer' ||
            this.param.dataType === 'MapServiceLayer') {
          this.layerInvisible.setStatus(true);
          html.setStyle(this.layerVisibleDiv, 'display', 'block');
          this.layerInvisible.setValue(param.layerInvisible);
        } else {
          html.setStyle(this.layerVisibleDiv, 'display', 'none');
        }
        if (this.param.dataType === 'GPFeatureRecordSetLayer' ||
            this.param.dataType === 'GPRecordSet') {
          this.useDynamicSchema.setStatus(true);
          this.useDynamicSchema.setValue(gputils.useDynamicSchema(this.param, this.config));
          html.setStyle(this.dynamicSchemaDiv, 'display', 'block');
        } else {
          html.setStyle(this.dynamicSchemaDiv, 'display', 'none');
        }
        this._updateStatus(param.ignore === true);
      } else {
        this.visible.setValue(param.visible);
        html.setStyle(this.visibleDiv, 'display', 'block');
        html.setStyle(this.ignoreDiv, 'display', 'none');
        html.setStyle(this.layerVisibleDiv, 'display', 'none');
        html.setStyle(this.dynamicSchemaDiv, 'display', 'none');
      }
    },

    acceptValue: function(){
      if(!this.param){
        return;
      }
      this.param.label = this.label.getValue();
      this.param.tooltip = this.tooltip.getValue();

      var value;
      if(this.spart.getValue){
        value = this.spart.getValue();
        if(this.param.dataType === 'GPFeatureRecordSetLayer' || this.param.dataType === 'GPRecordSet'){
          lang.mixin(this.param, value);
        }else{
          this.param.defaultValue = value;
        }
      }

      if (this.direction === 'output') {
        if (this.param.dataType === 'GPFeatureRecordSetLayer' ||
            this.param.dataType === 'GPRecordSet') {
          this.param.useDynamicSchema = this.useDynamicSchema.getValue();
        }
        this.param.ignore = this.ignore.getValue();
        if (this.param.dataType === 'GPFeatureRecordSetLayer' ||
            this.param.dataType === 'MapServiceLayer') {
          this.param.layerInvisible = this.layerInvisible.getValue();
        } else {
          this.param.layerInvisible = true;
        }
      } else {
        this.param.visible = this.visible.getValue();
      }
    },

    setConfig: function(config){
      this.config = config;
    },

    _createSpecialPart: function(){
      var label;
      if(this.direction === 'input' && this.param.dataType === 'GPFeatureRecordSetLayer'){
        label = this.nls.inputFeatureBy;
      }else if(this.direction === 'input' && this.param.dataType === 'GPRecordSet'){
        label = this.nls.inputRecordBy;
      }else if(this.direction === 'input'){
        label = this.nls.defaultValue;
        //hide this feature temporary
        // if(this.param.dataType === 'GPString' || this.param.editorName ||
        //   this.param.dataType === 'GPMultiValue:GPString' &&
        //    (!this.param.choiceList || this.param.choiceList.length === 0)){
        //   this.changeEditorNode = this._createChangeEditorNode();
        // }
      }else if(this.direction === 'output' && this.param.dataType === 'GPFeatureRecordSetLayer'){
        label = '';
      }else if(this.direction === 'output'){
        label = this.nls.displayType;
      }
      this.spart = editorManager.createEditor(this.param, this.direction, 'setting', {
        config: this.config
      });
      this.spartLabelNode = html.create('div', {
        'class': 'input-label',
        innerHTML: utils.sanitizeHTML(label),
        style: {
          display: label === ''? 'none': 'inline-block'
        }
      }, this.specialSectionNode);
      this.spart.placeAt(this.specialSectionNode);
      if(this.changeEditorNode){
        html.place(this.changeEditorNode, this.spartLabelNode, 'after');
      }

      this.spart.startup();
    },

    _createChangeEditorNode: function(){
      var node = html.create('div', {
        'class': 'change-editor',
        innerHTML: 'Change',
        style: {
          display: 'inline-block'
        }
      });
      this.own(on(node, 'click', lang.hitch(this, function(){
        var editorChooser = new EditorChooser({
          inputParams: this.config.inputParams
        });
        new Popup({
          titleLabel: 'Choose Editor',
          content: editorChooser,
          container: 'main-page',
          buttons: [
            {
              label: this.nls.ok,
              onClick: lang.hitch(this, this._onEditorChange, editorChooser)
            }, {
              label: this.nls.cancel,
              classNames: ['jimu-btn-vacation']
            }
          ]
        });
        editorChooser.startup();
      })));
      return node;
    },

    _onEditorChange: function(editorChooser){
      if(this.param.editorName === editorChooser.selectedEditor.name){
        return;
      }

      editorChooser.popup.close();

      this.param.editorName = editorChooser.selectedEditor.name;

      if(editorChooser.selectedEditor.dependParam){
        this.param.editorDependParamName = editorChooser.selectedEditor.dependParam;
      }
      this.spart.destroy();
      this.spart = editorManager.createEditor(this.param, 'input', 'setting', {
        config: this.config
      });
      html.place(this.spart.domNode, this.specialSectionNode);

    }
  });

  return clazz;

});
