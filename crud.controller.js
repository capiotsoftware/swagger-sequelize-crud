'use strict';

var _ = require('lodash');
var BaseController = require('./base.controller');
var params = require('./swagger.params.map');
const requestLib = require('request');
// var result = {};

/**
* Constructor function for CrudController.
* @classdesc Controller for basic CRUD operations on mongoose models.
* Uses the passed id name as the request parameter id to identify models.
* @constructor
* @inherits BaseController
* @param {Model} model - The mongoose model to operate on
* @param {Object} logger - The logger object 
* @param {Integer} complexLevel - Max nested level of schema
* @param {Map} modelMap - Map of all Sequelize Model mapped to its tableName.
*/

function CrudController(model, logger, complexLevel, modelMap, shaObject) {
    // call super constructor
    BaseController.call(this, this);
    // set the model instance to work on
    this.model = model;
    this.logger = logger;
    this.complexLevel = complexLevel;
    this.modelMap = modelMap;
    this.shaObject = shaObject;
    // set id name if defined, defaults to 'id'
    this.omit = [];
    _.bindAll(this);
}

function insertWhere(modelMap, includeStruct, whereStruct, modelName, shaObject) {
    Object.keys(whereStruct).forEach(el => {
        if (el == '$where') {
            includeStruct['where'] = whereStruct['$where'];
        } else {
            if (typeof includeStruct['include'] == 'undefined')
                includeStruct['include'] = [];
            var modelExistFlag = false;
            includeStruct['include'].forEach(includeObj => {
                if (typeof includeObj['as'] != 'undefined' && includeObj['as'] == shaObject['modelToShaMap'][el]) {
                    insertWhere(modelMap, includeObj, whereStruct[el], el, shaObject);
                    modelExistFlag = true;
                    // break;
                }
            })
            if (!modelExistFlag) {
                var newIncludeObj = { as: el, model: modelMap[el], attributes: [] }
                insertWhere(modelMap, newIncludeObj, whereStruct[el], el, shaObject);
                includeStruct['include'].push(newIncludeObj);
            }
        }
    })
}

function unwrapSimpleArray(obj) {
    Object.keys(obj).forEach(el => {
        // console.log('el ',el);
        if (obj[el] instanceof Array) {
            var valArray = obj[el].map(_ => typeof _['#value'] == 'undefined' ? unwrapSimpleArray(_) : _['#value']);
            // console.log('valArray ', valArray);
            obj[el] = valArray;
        } else if (obj[el] != null && typeof obj[el] === 'object') {
            unwrapSimpleArray(obj[el])
        }
    })
    return obj;
}

function wrapSeqSchema(json, key, shaObject) {
    var sequelizeJson = {};
    Object.keys(json).forEach(el => {
        var newShaKey = shaObject['modelToShaMap'][key+"#"+el];
        var newKey = key+"#"+el;
        if(el === '$where'){
            sequelizeJson[el] = json[el];
        }
        else if (json[el] instanceof Array) {
            sequelizeJson[newShaKey] = [];
            json[el].forEach(data => {
                (typeof data == 'object') ? sequelizeJson[newShaKey].push(wrapSeqSchema(data, newKey, shaObject)) : sequelizeJson[newShaKey].push(data);
            })
        }
        else if (typeof json[el] == 'object') {
            sequelizeJson[newShaKey] = wrapSeqSchema(json[el], newKey, shaObject);
        }
        else {
            sequelizeJson[el] = json[el];
        }
    })
    return sequelizeJson;
}

function unwrapSeqSchema(obj, shaObject){
    Object.keys(obj).forEach(el=>{        
        if(obj[el] instanceof Array && obj[el][0] && typeof obj[el][0] === 'object'){
            obj[el].forEach(subObj=>{
                unwrapSeqSchema(subObj, shaObject)
            })
        }
        else if(obj[el] != null && typeof obj[el] === 'object'){
            unwrapSeqSchema(obj[el], shaObject)
        }
        // console.log('el is ',el);
        // console.log('sha is ',shaObject);
        var newEl = typeof shaObject['shaToModelMap'][el] === 'undefined' ? el : shaObject['shaToModelMap'][el];
        // console.log("newEl ",newEl);
        var elArray = newEl.split("#");
        var newKey = elArray[elArray.length - 1];
        obj[newKey] = obj[el];
        if(elArray.length>1)
            delete obj[el];
    })
}

function addStruct(parentStruct, child, key) {
    var childArray = child.split('.');
    if (childArray.length == 1) {
        parentStruct[child] = true;
    } else {
        var newKey = key+'#'+childArray[0]; 
        // console.log('Parent struct is '+parentStruct[childArray[0]]);
        if (typeof parentStruct[newKey] == 'undefined')
            parentStruct[newKey] = {};
        addStruct(parentStruct[newKey], child.substr(child.indexOf('.') + 1), newKey);
    }
}

function generateInclude(select, modelMap, rootTableName, excludeFlag, shaObject) {
    var struct = {};
    var newSelect = [];
    if (excludeFlag)
        newSelect = select.filter(el => el.split('')[0] === "-").map(el => el.substring(1, el.length));
    else
        newSelect = select.filter(el => el.split('')[0] !== "-").map(el => el.split('')[0] === '+' ? el.substring(1, el.length) : el)
    newSelect.forEach(el => {
        addStruct(struct, el, rootTableName);
    })
    // console.log("struct is " + JSON.stringify(struct, null, 4));
    var includeOption = generateIncludeRecursive(modelMap, struct, rootTableName, false, excludeFlag, shaObject);
    // console.log("Include object is " + JSON.stringify(includeOption, null, 4));
    return includeOption;
}

function generateIncludeRecursive(modelMap, struct, model, modelOption, excludeFlag, shaObject) {
    var includeObj = null;
    if (modelMap[shaObject['modelToShaMap'][model]] != null) {
        var attrArray = [], includeArray = [];
        includeObj = {};
        if (modelOption) {
            includeObj['as'] = shaObject['modelToShaMap'][model];
            includeObj['model'] = modelMap[shaObject['modelToShaMap'][model]];
            // console.log("Attributes of model are "+JSON.stringify(,null,4));
        }
        var validAttributes = Object.keys(modelMap[shaObject['modelToShaMap'][model]].rawAttributes);
        var allFlag = false;
        Object.keys(struct).forEach(el => {
            if (struct[el] == true) {
                if (validAttributes.indexOf(el) != -1)
                    attrArray.push(el);
                else if (el == '*') {
                    // console.log("found *");
                    allFlag = true;
                }
            } else if (typeof struct[el] == 'object') {
                var singleInclude = generateIncludeRecursive(modelMap, struct[el], el, true, excludeFlag, shaObject);
                if (singleInclude != null)
                    includeArray.push(singleInclude);
            }
        })
        if (allFlag) {
            if (excludeFlag) { console.log("all exclude"); includeObj['attributes'] = [] }
            else includeObj['attributes'] = { all: true }
        } else {
            if (excludeFlag) includeObj['attributes'] = { exclude: attrArray }
            else includeObj['attributes'] = attrArray
        }
        // includeObj['attributes'] = excludeFlag ? { exclude: attrArray } : attrArray;
        includeArray.length == 0 ? null : includeObj['include'] = includeArray;
    }
    return includeObj;
}



//var updatePromises = [];
function updateTable(result, updateBody, updatePromises, shaObject) {
    // console.log("Result object is " + JSON.stringify(result, null, 4));
    var updateFields = {};
    // console.log("wrap update body", updateBody);
    Object.keys(updateBody).forEach(el => {
        if (updateBody[el] instanceof Array) {
            if (updateBody[el][0] && typeof updateBody[el][0] != 'object') {
                if (typeof result[el] != 'undefined') {
                    result[el].forEach(ele => {
                        ele.destroy();
                    })
                } else {
                    updatePromises.push(new Promise((res, rej) => {
                        rej(new Error(el + " key does not exist"));
                    }))
                    return;
                }
                var methodName = "create" + el.substr(0, 1).toUpperCase() + el.substr(1);
                if (typeof result[methodName] === 'function') {
                    updateBody[el].forEach(ele => {
                        updatePromises.push(result["create" + el.substr(0, 1).toUpperCase() + el.substr(1)]({ '#value': ele }));
                    })
                } else {
                    updatePromises.push(new Promise((res, rej) => {
                        rej(new Error("Could not update table. Function " + methodName + " does not exist"));
                    }));
                }
            } else {
                updateBody[el].forEach(ele => {
                    if (ele['id']) {
                        result[el].forEach(resultEle => {
                            if (resultEle['id'] === ele['id']) {
                                updatePromises.push(resultEle.updateAttributes(ele));
                            }
                        })
                    } else {
                        // console.log("New Error no id complex object");

                        updatePromises.push(new Promise((res, rej) => {
                            rej(new Error('Need id to update '+el));
                        }));
                        return;
                    }
                })
            }
        }
        else if (typeof updateBody[el] == 'object') {
            updateTable(result[el], updateBody[el], updatePromises, shaObject);
        } else {
            updateFields[el] = updateBody[el];
        }
    })
    // console.log("Fields to be updated are " + JSON.stringify(updateFields, null, 4));
    updatePromises.push(result.updateAttributes(updateFields));
}
function getDepthOfObject(object) {
    var level = 1;
    Object.keys(object).forEach(key => {
        if (typeof object[key] == 'object') {
            var depth = getDepthOfObject(object[key]) + 1;
            level = Math.max(depth, level);
        }
    })
    return level;
}

function getIncludeOptions(depth) {
    // var depth = getDepthOfObject(object);
    var newObj = { include: { all: true } };
    for (var i = 0; i < depth - 1; i++) {
        newObj['include'] = { all: true, include: newObj['include'] };
    }
    return newObj;
}

function convertToSequelizeCreate(key, json, shaObject) {
    // console.log("SHA ", shaObject);
    var sequelizeCreateJson = {};
    Object.keys(json).forEach(el => {
        var newShaKey = shaObject['modelToShaMap'][key+"#"+el];
        var newKey = key+"#"+el;
        if (json[el] instanceof Array) {
            sequelizeCreateJson[newShaKey] = [];
            // console.log("--------------New sha key", newShaKey, newKey);
            json[el].forEach(data => {
                (typeof data == 'object') ? sequelizeCreateJson[newShaKey].push(convertToSequelizeCreate(newKey, data, shaObject)) : sequelizeCreateJson[newShaKey].push({ '#value': data });
            })
        }
        else if (typeof json[el] == 'object') {
            // console.log("--------------New sha key", newShaKey);
            sequelizeCreateJson[newShaKey] = convertToSequelizeCreate(newKey, json[el], shaObject);
        }
        else {
            sequelizeCreateJson[el] = json[el];
        }
    })
    return sequelizeCreateJson;
}

CrudController.prototype = {

    /**
    * Set our own constructor property for instanceof checks
    * @private
    */
    constructor: CrudController,

    /**
    * The model instance to perform operations with
    * @type {MongooseModel}
    */
    model: null,

    /**
    * The id  parameter name
    * @type {String}
    * @default 'id'
    */
    idName: 'id',


    /**
    * Flag indicating whether the index query should be performed lean
    * @type {Boolean}
    * @default true
    */
    lean: true,

    /**
    * Array of fields passed to the select statement of the index query.
    * The array is joined with a whitespace before passed to the select
    * method of the controller model.
    * @type {Array}
    * @default The empty Array
    */
    select: [],

    /**
    * Array of fields that should be omitted from the query.
    * The property names are stripped from the query object.
    * @type {Array}
    * @default The empty Array
    */
    omit: [],

    /**
    * Name of the property (maybe a virtual) that should be returned
    * (send as response) by the methods.
    * @type {String}
    * @default The empty String
    */
    defaultReturn: '',
    auditLogger: function (doc, body) {
        var intersection = _.pick(doc, _.keysIn(body));
        this.logger.audit('Object with id :-' + doc._id + ' has been updated, old values:-' + JSON.stringify(intersection) + ' new values:- ' + JSON.stringify(body));
    },
    /**
    * Default Data handlers for Okay Response
    * @type {function}
    * @default Okay response.
    */
    Okay: function (res, data) {
        res.status(200).json(data);
    },
    /**
    * Default Data handlers for Okay Response
    * @type {function}
    * @default Okay response.
    */
    NotFound: function (res) {
        res.status(404).send();
    },
    IsString: function (val) {
        return val && val.constructor.name === 'String';
    },
    CreateRegexp: function (str) {
        if (str.charAt(0) === '/' &&
            str.charAt(str.length - 1) === '/') {
            var text = str.substr(1, str.length - 2).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
            return new RegExp(text, 'i');
        }
        else {
            return str;
        }
    },
    IsArray: function (arg) {
        return arg && arg.constructor.name === 'Array';
    },
    IsObject: function (arg) {
        return arg && arg.constructor.name === 'Object';
    },
    ResolveArray: function (arr) {
        var self = this;
        for (var x = 0; x < arr.length; x++) {
            if (self.IsObject(arr[x])) {
                arr[x] = self.FilterParse(arr[x]);
            }
            else if (self.IsArray(arr[x])) {
                arr[x] = self.ResolveArray(arr[x]);
            }
            else if (self.IsString(arr[x])) {
                arr[x] = self.CreateRegexp(arr[x]);
            }
        }
        return arr;
    },
    /*
    * Takes the filter field and parses it to a JSON object
    * @type {function}
    *
    */
    FilterParse: function (filterParsed) {
        var self = this;
        for (var key in filterParsed) {
            if (self.IsString(filterParsed[key])) {
                filterParsed[key] = self.CreateRegexp(filterParsed[key]);
            }
            else if (self.IsArray(filterParsed[key])) {
                filterParsed[key] = self.ResolveArray(filterParsed[key]);
            }
            else if (self.IsObject(filterParsed[key])) {
                filterParsed[key] = self.FilterParse(filterParsed[key]);
            }
        }
        return filterParsed;
    },
    /**
    * Default Data handlers for Okay Response
    * @type {function}
    * @default Okay response.
    */
    Error: function (res, err) {
        if (err.errors) {
            var errors = [];
            Object.keys(err.errors).forEach(el => errors.push(err.errors[el].message));
            res.status(400).json({ message: errors });
        }
        else {
            res.status(400).json({ message: [err.message] });
        }
    },
    /**
    * Get a count of results matching a particular filter criteria.
    * @param {IncomingMessage} req - The request message object
    * @param {ServerResponse} res - The outgoing response object the result is set to
    */
    _count: function (req, res) {
        var self = this;
        var reqParams = params.map(req);
        var filter = reqParams['filter'] ? reqParams.filter : {};
        if (typeof filter === 'string') {
            try {
                filter = JSON.parse(filter);
                filter = self.FilterParse(filter);
            } catch (err) {
                this.logger.error('Failed to parse filter :' + err);
                filter = {};
            }
        }
        if (this.omit.length > 0) {
            filter = _.omit(filter, this.omit);
        }
        filter.deleted = false;
        this.model.find(filter).count().exec().then(result => self.Okay(res, result),
            err => self.Error(res, err));
    },
    /**
    * Get a list of documents. If a request query is passed it is used as the
    * query object for the find method.
    * @param {IncomingMessage} req - The request message object
    * @param {ServerResponse} res - The outgoing response object the result is set to
    * @returns {ServerResponse} Array of all documents for the {@link CrudController#model} model
    * or the empty Array if no documents have been found
    */
    _index: function (req, res) {
        console.log("Inside Index");
        var reqParams = params.map(req);
        var filter = reqParams['filter'] ? reqParams.filter : '{}';
        var sort = reqParams['sort'] ? [] : [];
        reqParams['sort'] ? reqParams.sort.split(',').map(el => el.split('-').length > 1 ? sort.push([el.split('-')[1], 'DESC']) : sort.push([el.split('-')[0]])) : null;
        // reqParams['sort'] ? reqParams.sort.split(',').map(el => el.split('-').length>1?sort[el.split('-')[1]]=-1:sort[el.split('-')[0]]=1) : null;
        var page = reqParams['page'] ? reqParams.page : 1;
        var count = reqParams['count'] ? reqParams.count : 10;
        var skip = count * (page - 1);
        var self = this;
        var select = { all: true };
        var tableName = this.shaObject['shaToModelMap'][this.model.getTableName()];
        var includeOption = getIncludeOptions(self.complexLevel)
        if (reqParams['select']) {
            var selectArray = reqParams.select.split(',');
            var excludeFlag = true;
            selectArray.forEach(el => {
                if (el.substr(0, 1) != '-') {
                    excludeFlag = false;
                }
            })
            includeOption = generateInclude(selectArray, self.modelMap, tableName, excludeFlag, self.shaObject);
            console.log("include option ", includeOption);  
            select = includeOption['attributes'];
        }
        
        // console.log("IncludeOption is "+JSON.stringify(includeOption, null ,4));
        
        var jFiter = wrapSeqSchema(JSON.parse(filter), tableName, self.shaObject);
        console.log("filter", JSON.stringify(jFiter, null, 4));
        insertWhere(self.modelMap, includeOption, jFiter, tableName, self.shaObject);
        var baseWhere = {};
        if (typeof includeOption['where'] != 'undefined') {
            baseWhere = includeOption['where'];
        }
        console.log("Include ", JSON.stringify(includeOption, null, 4));
        // console.log("Include option is "+JSON.stringify(includeOption, null, 4));
        // console.log("sort is ", sort);
        this.model.findAll({ limit: count, offset: skip, attributes: select, order: sort, include: includeOption['include'], where: baseWhere }).then(results => {
            var resObj = results.map( (r) => ( r.toJSON() ) )
            console.log("results are ", resObj);
            unwrapSimpleArray(resObj);
            unwrapSeqSchema(resObj, self.shaObject);
            return self.Okay(res, resObj);
        }, err => {
            return self.Error(res, err);
        });
    },
    /**
    * Get a single document. The requested document id is read from the request parameters
    * by using the {@link CrudController#idName} property.
    * @param {IncomingMessage} req - The request message object the id is read from
    * @param {ServerResponse} res - The outgoing response object
    * @returns {ServerResponse} A single document or NOT FOUND if no document has been found
    */
    _show: function (req, res) {
        var self = this;
        console.log("Inside show");
        var reqParams = params.map(req);
        var select = { all: true };
        var includeOption = getIncludeOptions(self.complexLevel);
        var tableName = this.shaObject['shaToModelMap'][this.model.getTableName()];
        if (reqParams['select']) {
            var selectArray = reqParams.select.split(',');
            var excludeFlag = true;
            selectArray.forEach(el => {
                if (el.substr(0, 1) != '-') {
                    excludeFlag = false;
                }
            })
            includeOption = generateInclude(selectArray, self.modelMap, tableName, excludeFlag, self.shaObject);
            select = includeOption['attributes'];
        }
        this.model.findOne({ where: { id: reqParams['id'] }, attributes: select, include: includeOption['include'] }).then(results => {
            // var resObj = JSON.parse(JSON.stringify(results, null, 4));
            if(results === null){
                return self.Error(res, new Error("No record found"))
            }
            var resObj = results.get({
                plain: true
            });
            console.log("results are ", resObj);
            unwrapSimpleArray(resObj);
            unwrapSeqSchema(resObj, self.shaObject);
            return self.Okay(res, self.getResponseObject(resObj));
        }, err => {
            return self.Error(res, err);
        });
    },

    /**
    * Creates a new document in the DB.
    * @param {IncomingMessage} req - The request message object containing the json document data
    * @param {ServerResponse} res - The outgoing response object
    * @returns {ServerResponse} The response status 201 CREATED or an error response
    */
    _create: function (req, res) {
        console.log("Inside Create");
        var self = this;
        var payload = 'data';
        var body = params.map(req)[payload];
        var tableName = this.shaObject['shaToModelMap'][this.model.getTableName()];
        var sequelizeBody = convertToSequelizeCreate(tableName, body, self.shaObject);
        // console.log("create body", sequelizeBody);
        // console.log("Sequelize Body is....\n" + JSON.stringify(sequelizeBody, null, 4));
        var includeOption = getIncludeOptions(self.complexLevel);
        // console.log("Include option ",includeOption);
        var ins = this.model.build(sequelizeBody, includeOption)
        ins.save().then(data => {
            var returnObj = data.get({
                plain: true
            });
            // console.log("data in db ",returnObj);
            unwrapSimpleArray(returnObj)
            unwrapSeqSchema(returnObj, self.shaObject)
            var logObject = {
                'operation': 'Create',
                'user': req.user ? req.user.username : req.headers['masterName'],
                '_id': returnObj.id,
                'timestamp': new Date()
            };
            self.logger.audit(JSON.stringify(logObject));
            return self.Okay(res, self.getResponseObject(returnObj));
        }, err => {
            ins.destroy({ force: true });
            return self.Error(res, err);
        });
    },
    _bulkShow: function (req, res) {
        var sort = {};
        var reqParams = params.map(req);
        var ids = reqParams['id'].split(',');
        reqParams['sort'] ? reqParams.sort.split(',').map(el => sort[el] = 1) : null;
        var select = reqParams['select'] ? reqParams.select.split(',') : null;
        var query = {
            '_id': { '$in': ids },
            'deleted': false
        };
        var self = this;
        var mq = this.model.find(query);
        if (select) {
            mq = mq.select(select.join(' '));
        }
        return mq.sort(sort).exec().then(result => self.Okay(res, result), err => this.Error(res, err));
    },
    _updateMapper: function (id, body, user) {
        var self = this;
        return new Promise((resolve, reject) => {
            self.model.findOne({ '_id': id, deleted: false }, function (err, doc) {
                if (err) {
                    reject(err);
                }
                else if (!doc) {
                    reject(new Error('Document not found'));
                }
                else {
                    var oldValues = doc.toObject();
                    var updated = _.mergeWith(doc, body, self._customizer);
                    updated = new self.model(updated);
                    Object.keys(body).forEach(el => updated.markModified(el));
                    updated.save(function (err) {
                        if (err) {
                            reject(err);
                        }
                        var logObject = {
                            'operation': 'Update',
                            'user': user,
                            'originalValues': oldValues,
                            '_id': doc._id,
                            'newValues': body,
                            'timestamp': new Date()
                        };
                        self.logger.audit(JSON.stringify(logObject));
                        resolve(updated);
                    });
                }
            }).exec();
        });
    },
    _bulkUpdate: function (req, res) {
        var reqParams = params.map(req);
        var body = reqParams['data']; //Actual transformation
        var selectFields = Object.keys(body);
        var self = this;
        selectFields.push('_id');
        var ids = reqParams['id'].split(','); //Ids will be comma seperated ID list
        var user = req.user ? req.user.username : req.headers['masterName'];
        var promises = ids.map(id => self._updateMapper(id, body, user));
        var promise = Promise.all(promises).then(result => res.json(result), err => {
            self.Error(res, err);
        });
        return promise;
    },
    _bulkUpload: function (req, res) {
        try {
            let buffer = req.files.file[0].buffer.toString('utf8');
            let rows = buffer.split('\n');
            let keys = rows[0].split(',');
            let products = [];
            let self = this;
            rows.splice(0, 1);
            rows.forEach(el => {
                let values = el.split(',');
                values.length > 1 ? products.push(_.zipObject(keys, values)) : null;
            });
            Promise.all(products.map(el => self._bulkPersist(el))).
                then(result => res.status(200).json(result));
        }
        catch (e) {
            res.status(400).json(e);
        }
    },
    _bulkPersist: function (el) {
        var self = this;
        return new Promise((res, rej) => {
            self.model.create(el, function (err, doc) {
                if (err)
                    res(err);
                else
                    res(doc);
            });
        });
    },
    /**
    * Updates an existing document in the DB. The requested document id is read from the
    * request parameters by using the {@link CrudController#idName} property.
    * @param {IncomingMessage} req - The request message object the id is read from
    * @param {ServerResponse} res - The outgoing response object
    * @params {String} in -  The Body payload location, if not specified, the parameter is assumed to be 'body'
    * @returns {ServerResponse} The updated document or NOT FOUND if no document has been found
    */
    _update: function (req, res) {
        console.log("Inside update");
        var reqParams = params.map(req);
        var bodyIn = 'data';
        var body = reqParams[bodyIn];
        // updatePromises = [];
        if (body.id) {
            delete req.body.id;
        }
        var self = this;
        var bodyData = _.omit(body, this.omit);
        var tableName = this.shaObject['shaToModelMap'][this.model.getTableName()];
        // var sequelizeBody = convertToSequelizeCreate(tableName, body);
        // var collectionName=this.model.modelName;
        var includeOption = getIncludeOptions(self.complexLevel);
        var oldValues = {};
        var newValues = {};
        var updatePromises = [];
        this.model.findOne({
            where: { id: reqParams['id'] }, include: includeOption['include']
        })
            .then(result => {
                if(result === null){
                    return Promise.reject(new Error("No record found"))
                }
                oldValues = result;
                result.changed('updatedAt', true)
                updatePromises.push(result.save());
                console.log("old result ",JSON.stringify(result ,null,4));
                // console.log("table name ", tableName);
                bodyData = wrapSeqSchema(bodyData, tableName, self.shaObject);
                updateTable(result, bodyData, updatePromises, self.shaObject);
                return Promise.all(updatePromises)
            })
            .then((resolvedPromises) => {                
                return self.model.findOne({
                    where: { id: reqParams['id'] }, include: includeOption['include']
                })
            })
            .then(updatedResult => {
                // var resObj = JSON.parse(JSON.stringify(updatedResult, null, 4));
                if(updatedResult === null){
                    return Promise.reject(new Error("No record found"))
                }
                var resObj = updatedResult.get({
                    plain: true
                });
                console.log("Updated Result ", resObj);
                newValues = resObj;
                unwrapSimpleArray(resObj);
                unwrapSeqSchema(resObj, self.shaObject);
                var logObject = {
                    'operation': 'update',
                    'user': req.user ? req.user.username : req.headers['masterName'],
                    'originalValues': oldValues,
                    '_id': oldValues.id,
                    'newValues': resObj,
                    'timestamp': new Date()
                };
                self.logger.audit(JSON.stringify(logObject, null, 4));
                return self.Okay(res, resObj);
            })
            .catch(err => {
                self.logger.error(err);
                return self.Error(res, err);
            })
    },

    _customizer: function (objValue, srcValue) {
        if (_.isArray(objValue)) {
            return srcValue;
        }
    },



    /**
    * Deletes a document from the DB. The requested document id is read from the
    * request parameters by using the {@link CrudController#idName} property.
    * @param {IncomingMessage} req - The request message object the id is read from
    * @param {ServerResponse} res - The outgoing response object
    * @returns {ServerResponse} A NO CONTENT response or NOT FOUND if no document has
    * been found for the given id
    */
    _destroy: function (req, res) {
        var reqParams = params.map(req);
        var self = this;
        var collectionName = this.model.modelName;
        this.model.findOne({ '_id': reqParams['id'] }, function (err, document) {
            if (err) {
                return self.Error(res, err);
            }

            if (!document) {
                return self.NotFound(res);
            }

            document.remove(function (err) {
                if (err) {
                    return self.Error(res, err);
                }
                var logObject = {
                    'operation': 'Destory',
                    'user': req.user ? req.user.username : req.headers['masterName'],
                    '_id': document._id,
                    'timestamp': new Date()
                };
                self.logger.audit(JSON.stringify(logObject));
                var reqData = {};

                // result = callTwinComplete(reqParams['id'], res, "delete", collectionName);
                return self.Okay(res, {});
            });
        });
    },

    _markAsDeleted: function (req, res) {
        var reqParams = params.map(req);
        var self = this;
        this.model.findOne({ where: { id: reqParams['id'] } }).then(result => {
            if(result === null){
                return self.Error(res, new Error("No record found"));
            }
            result.destroy().then(rowsDeleted => {
                var logObject = {
                    'operation': 'Delete',
                    'user': req.user ? req.user.username : req.headers['masterName'],
                    'id': result.id,
                    'timestamp': new Date()
                };
                self.logger.audit(JSON.stringify(logObject));

                return self.Okay(res, {});
            }, err => {
                return self.Error(res, err);
            });

        })
    },

    _rucc: function (queryObject, callBack) {
        //rucc = Read Update Check Commit
        var self = this;
        return this.model.findOne({ _id: queryObject['id'], deleted: false }).exec().then(result => {
            if (result) {
                var snapshot = result.toObject({ getters: false, virtuals: false, depopulate: true, });
                var newResult = callBack(result);
                if (newResult && typeof newResult.then === 'function') {
                    //newResult is a promise, resolve it and then update.
                    return newResult.then(res => { self.model.findOneAndUpdate(snapshot, res, { upsert: false, runValidators: true }); })
                        .exec()
                        .then(updated => {
                            if (!updated) {
                                self.__rucc(queryObject, callBack); //Re-do the transaction.
                            } else {
                                return updated;
                            }
                        });
                } else {
                    //newResult is a mongoose object
                    return self.model.findOneAndUpdate(snapshot, newResult, { upsert: false, runValidators: true })
                        .exec()
                        .then(updated => {
                            if (!updated) {
                                self.___rucc(queryObject, callBack);
                            } else {
                                return updated;
                            }
                        });
                }
            } else {
                return null;
            }

        });
    },

    getResponseObject: function (obj) {
        return this.defaultReturn && obj[this.defaultReturn] || obj;
    }
};

CrudController.prototype = _.create(BaseController.prototype, CrudController.prototype);

/**
* The CrudController for basic CRUD functionality on Mongoose models
* @type {CrudController}
*/
exports = module.exports = CrudController;
