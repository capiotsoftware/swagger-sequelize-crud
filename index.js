'use strict';
var ParamController = require('./param.controller');
var _ = require('lodash');
var log4js = require('log4js');
log4js.levels.forName('AUDIT', 50001);
var logger = process.env.PROD_ENV ? log4js.getLogger('swagger-sequelize-crud') : log4js.getLogger('swagger-sequelize-crud-dev');
var params = require('./swagger.params.map');
const Sequelize = require("sequelize");
const crypto = require('crypto');


function generateTableName(data) {
  var dataArr = data.split('#');
  var tableName = "";
  if(dataArr.length>1){
    tableName = dataArr.reduce((pre, cur)=>{
      return pre+("_"+cur.substring(0,Math.min(2,cur.length)));
      },"")
  }else{
    tableName = data
  }
  var counter = 0;
  while(shaToModelMap[tableName]){
    // console.log("Table Name "+ tableName +" exist... Creating new tablename");
    counter++;
    tableName = counter>1?tableName.substring(0,tableName.length-1)+counter:tableName+counter;
  }
  // console.log("Table name is ",tableName);
  return tableName;
}


/**
* Constructor function for SequelizeModel
* @classdesc Basic mongoose Model sytem
* Uses the definition passed on the by the Input object for creating crud operations
* @constructor
* @inherits ParamController
* @param {Object} sequelize  - sequelize object with db connection.
* @param {Object} definition  - Structure of SQL tables in mongoose schema format.
* @param {String} modelName - Model name to which data needs to be populated.
* @param {Object} options - optional options object. Takes 2 values - logger and collectionName
*/
function SequelizeModel(sequelize, definition, modelName, options, hooks) {
  logger = options.logger ? options.logger : logger;
  var self = this;
  // var complexLevel = getDepthOfObject(definition) - 1;
  generateSequelize(sequelize, modelName, definition, schemaStruct)
    .then(model => {
      // console.log("------schemaStruct ", JSON.stringify(schemaStruct, null,4))
      self.model = model;
      if (typeof hooks !== 'undefined') {
        hooks.forEach(hookObj => {
          self.model.addHook(hookObj.event, hookObj.hookName, hookObj.func);
        })
      }
      sequelize.sync()
    })
    .then(() => {
      var shaObject = { shaToModelMap, modelToShaMap};
      // console.log("-----------------------SHAObject index", shaObject);
      ParamController.call(self, self.model, modelName, logger, schemaStruct, modelMap, shaObject);
    })
    .catch(err => {
      console.log("Something Messed up........ ", err);
    });

  this.index = this._index.bind(this);
  this.create = this._create.bind(this);
  this.show = this._show.bind(this);
  this.update = this._update.bind(this);
  this.destroy = this._destroy.bind(this);
  this.rucc = this._rucc.bind(this);
  this.count = this._count.bind(this);
  this.bulkUpdate = this._bulkUpdate.bind(this);
  this.bulkUpload = this._bulkUpload.bind(this);
  this.bulkShow = this._bulkShow.bind(this);
  this.markAsDeleted = this._markAsDeleted.bind(this);
}

var modelMap = [];
var shaToModelMap = [];
var modelToShaMap = [];
var schemaStruct = {};
function generateSequelize(sequelize, tableName, obj, schemaStruct) {
  // console.log("object is ", JSON.stringify(obj, null, 4));
  console.log("New Table " + tableName);
  schemaStruct[tableName] = {};
  schemaStruct[tableName]['id'] = true;
  var childModels = [];
  var columns = {};
  var promises = [];
  Object.keys(obj).forEach(el => {
    if (el == 'enum') {
      //do nothing
    }
    else if (typeof obj[el] == 'string') {
      columns['#value'] = obj;
      schemaStruct[tableName]['#value'] = true;
      // console.log("Table "+tableName+" Column "+"Value");
    }
    else if (obj[el] instanceof Array) {
      console.log(tableName + "#" + el + " has Many relation");
      // console.log(JSON.stringify(obj[el][0],null,4));
      promises.push(generateSequelize(sequelize, tableName + "#" + el, obj[el][0], schemaStruct[tableName]).then(model =>
        childModels.push({ model: model, relationship: "many", name: tableName + "#" + el })));
    } else {
      if (typeof obj[el]["type"] == 'string') {
        columns[el] = obj[el];
        schemaStruct[tableName][el] = true;
        // console.log("Table "+tableName+" Column "+el);
      } else {
        console.log(tableName + "#" + el + " has one relation");
        promises.push(generateSequelize(sequelize, tableName + "#" + el, obj[el], schemaStruct[tableName]).then(model =>
          childModels.push({ model: model, relationship: "one", name: tableName + "#" + el })));
      }
    }
  });
  // console.log(" mongoose columns are "+JSON.stringify(columns,null,4));
  //console.log(" Sequelize columns are "+JSON.stringify(columns,null,4));

  return Promise.all(promises)
    .then(_ => sequelize.authenticate())
    .then(_ => {
      var c2 = getSequelizeDefinition(columns);
      var newTableName = generateTableName(tableName);
      console.log("Creating Model for " + tableName + " with fields... \n" + require('util').inspect(c2, { depth: null }) + "with tablename " + newTableName);
      // console.log("columns are ",c2);
      var model = sequelize.define(newTableName, c2, { freezeTableName: true, paranoid: true });
      // console.log("model is ",model);
      modelMap[newTableName] = model;
      shaToModelMap[newTableName] = tableName;
      modelToShaMap[tableName] = newTableName;
      childModels.forEach(el => {
        if (el['relationship'] == 'many') { 
          model.hasMany(el['model'], { as: modelToShaMap[el['name']], onDelete: 'CASCADE', hooks: true, constraints: true });
          // el['model'].belongsTo(model);
        }
        else if (el['relationship'] == 'one') {
          model.hasOne(el['model'], { onDelete: 'cascade', hooks: true, constraints: true });
          // el['model'].belongsTo(model);
        }
      })
      return model;
    })
    .catch(err => {
      console.log("Error", err);
      console.error("Something Messed up! " + require('util').inspect(model, { depth: null }));
    });

}
var checkDefined = (object, key) => { return (typeof object[key] !== 'undefined') };

function getSequelizeDefinition(definition) {
  var column = {};
  Object.keys(definition).forEach(el => {
    var properties = {};
    properties.type = getSequelizeEquivalentType(definition[el])
    if (checkDefined(definition[el], "required")) {
      properties.allowNull = !definition[el]["required"];
    } if (checkDefined(definition[el], "unique")) {
      properties.unique = definition[el]["unique"];
    } if (checkDefined(definition[el], "default")) {
      properties.defaultValue = definition[el]["default"];
    } if (checkDefined(definition[el], "validate")) {
      properties.validate = definition[el]["validate"];
    }
    column[el] = properties;
  });
  // console.log(require('util').inspect(column, { depth: null }));
  return column;
}

function getSequelizeEquivalentType(json) {
  if (json["enum"]) {
    var en = json["enum"];
    return Sequelize.ENUM(en);
  } else {
    // console.log("Json inside getTye", json);
    var typeUCase = json["type"].toUpperCase();
    switch (typeUCase) {
      case 'NUMBER': { return Sequelize.DOUBLE; }
      case 'STRING': { return Sequelize.STRING; }
      case 'DATE': { return Sequelize.DATE; }
      case 'BOOLEAN': { return Sequelize.BOOLEAN; }
      default: {
        return Sequelize.STRING;
      }
    }
  }
}

function getDepthOfObject(object) {
  var level = 1;
  Object.keys(object).forEach(key => {
    if (typeof object[key] == 'object' && object[key] != null) {
      var depth = getDepthOfObject(object[key]) + 1;
      level = Math.max(depth, level);
    }
  })
  return level;
}



SequelizeModel.prototype = {
  constructor: SequelizeModel,
  model: null,
  schema: null,
  definition: null,
  swagMapper: params.map
};

SequelizeModel.prototype = _.create(ParamController.prototype, SequelizeModel.prototype);
exports = module.exports = SequelizeModel.bind(SequelizeModel);
