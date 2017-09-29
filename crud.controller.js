'use strict';

var _ = require('lodash');
var BaseController = require('./base.controller');
var params = require('./swagger.params.map');
const requestLib = require('request');
var result={};

/**
 * Constructor function for CrudController.
 * @classdesc Controller for basic CRUD operations on mongoose models.
 * Uses the passed id name as the request parameter id to identify models.
 * @constructor
 * @inherits BaseController
 * @param {Model} model - The mongoose model to operate on
 * @param {String} [idName] - The name of the id request parameter to use
 */
function postRequest(result){
    requestLib({
    url: "http://localhost:3020/twin/v1/pushMQ",
    method: "POST",
    json: true,
    body: result
}, function (error, response, body){
    console.log("err ",error);
    console.log("body ",body);
    console.log("res",response);
});

}
function callTwinComplete(resdata,res,operation,collectionName){
    var result ={};
    if(res.statusCode===200){
        result.data=resdata;
        // console.log("res body ",data1);
        result.operation=operation;
        result.schemaName=collectionName;
        console.log("Status is 200. Hit external server");
        console.log("body ",result);

        postRequest(result);
    }
}
function CrudController(model,logger) {
    // call super constructor
    BaseController.call(this, this);

    // set the model instance to work on
    this.model = model;
    this.logger = logger;
    // set id name if defined, defaults to 'id'
    this.omit = [];
    _.bindAll(this);
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
    auditLogger: function (doc,body){
        var intersection = _.pick(doc,_.keysIn(body));
        this.logger.audit('Object with id :-' + doc._id + ' has been updated, old values:-'+JSON.stringify(intersection)+' new values:- '+JSON.stringify(body));
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
    IsString: function(val){
        return val && val.constructor.name === 'String';
    },
    CreateRegexp: function(str){
        if(str.charAt(0)==='/' &&
            str.charAt(str.length-1)==='/'){
            var text = str.substr(1,str.length-2).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
            return new RegExp(text,'i');
        }
        else{
            return str;
        }
    },
    IsArray: function(arg) {
        return arg && arg.constructor.name === 'Array';
    },
    IsObject: function(arg) {
        return arg && arg.constructor.name === 'Object';
    },
    ResolveArray:   function(arr){
        var self = this;
        for(var x =0;x<arr.length;x++){
            if(self.IsObject(arr[x])){
                arr[x] = self.FilterParse(arr[x]);
            }
            else if(self.IsArray(arr[x])){
                arr[x] = self.ResolveArray(arr[x]);
            }
            else if(self.IsString(arr[x])){
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
    FilterParse: function(filterParsed){
        var self = this;
        for(var key in filterParsed){
            if(self.IsString(filterParsed[key])){
                filterParsed[key] = self.CreateRegexp(filterParsed[key]);
            }
            else if(self.IsArray(filterParsed[key])){
                filterParsed[key] = self.ResolveArray(filterParsed[key]);
            }
            else if(self.IsObject(filterParsed[key])){
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
    Error: function (res,err) {
        if(err.errors){
            var errors = [];
            Object.keys(err.errors).forEach(el => errors.push(err.errors[el].message));
            res.status(400).json({message:errors});
        }
        else{
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
        this.model.find(filter).count().exec().then(result => self.Okay(res,result),
        err => self.Error(res,err));
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
        var reqParams = params.map(req);
        var filter = reqParams['filter'] ? reqParams.filter : {};
        var sort = reqParams['sort']?{}:{lastUpdated:-1};
        reqParams['sort'] ? reqParams.sort.split(',').map(el => el.split('-').length>1?sort[el.split('-')[1]]=-1:sort[el.split('-')[0]]=1) : null;
        var select = reqParams['select'] ? reqParams.select.split(',') : [];
        var page = reqParams['page'] ? reqParams.page : 1;
        var count = reqParams['count'] ? reqParams.count : 10;
        var skip = count * (page - 1);
        var self = this;
        if (typeof filter === 'string') {
            try {
                filter = JSON.parse(filter);
                filter = self.FilterParse(filter);
            } catch (err) {
                this.logger.error('Failed to parse filter :' + err);
                filter = {};
            }
        }

        if (this.omit.length) {
            filter = _.omit(filter, this.omit);
        }
        filter.deleted = false;
        var query = this.model.find(filter);

        if (this.lean) {
            query.lean();
        }

        if (this.select.length || select.length) {
            var union = this.select.concat(select);
            query.select(union.join(' '));
        }
        query.skip(skip).limit(count).sort(sort);
        query.exec(function (err, documents) {
            if (err) {
                return self.Error(res,err);
            }
            return self.Okay(res,documents);
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
        var reqParams = params.map(req);
        var select = reqParams['select']? reqParams.select.split(',') : []; //Comma seprated fileds list
        var query = this.model.findOne({ '_id': reqParams['id'], deleted: false });
        if (select.length > 0) {
            query = query.select(select.join(' '));
        }
        query.exec().then((document) => {
            if (!document) {
                return self.NotFound(res);
            } else {
                return self.Okay(res, self.getResponseObject(document));
            }
        }, err => self.Error(res, err));
    },

    /**
     * Creates a new document in the DB.
     * @param {IncomingMessage} req - The request message object containing the json document data
     * @param {ServerResponse} res - The outgoing response object
     * @returns {ServerResponse} The response status 201 CREATED or an error response
     */
    _create: function (req, res) {
        console.log("Inside Create");
        console.log("log from crudder",req.body);
        var self = this;
    //new this.model(req.body).save(function(Err,document){
    var payload = 'data';
    var body = params.map(req)[payload];
    this.model.create(body).then(data => {
      var returnObj = data.get({
        plain: true
      });
      var logObject = {
        'operation':'Create',
        'user':req.user?req.user.username:req.headers['masterName'],
        '_id':returnObj.id,
        'timestamp':new Date()
      };
      self.logger.audit(JSON.stringify(logObject));
      return self.Okay(res,self.getResponseObject(returnObj));
    }, err=>{
        return self.Error(res,err);
    });
        // //new this.model(req.body).save(function(Err,document){
        // var payload = 'data';
        // var body = params.map(req)[payload];
        // var collectionName=this.model.modelName;
        // this.model.create(body, function (err, document) {
        //     if (err) {
        //         return self.Error(res,err);
        //     }
        //     var logObject = {
        //         'operation':'insert',
        //         'user':req.user?req.user.username:req.headers['masterName'],
        //         '_id':document._id,
        //         'timestamp':new Date()
        //     };
        //     self.logger.audit(JSON.stringify(logObject));
        //     // console.log("Res form lib",res.statusCode);
        //     result=callTwinComplete(self.getResponseObject(document),res,"insert",collectionName);
        //     // console.log("documeen res ",self.getResponseObject(document));
        //     return self.Okay(res,self.getResponseObject(document));
        // });
    },
    _bulkShow: function (req, res) {
        var sort = {};
        var reqParams = params.map(req);
        var ids = reqParams['id'].split(',');
        reqParams['sort'] ? reqParams.sort.split(',').map(el => sort[el]=1) : null;
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
    _updateMapper: function(id,body,user) {
        var self = this;
        return new Promise((resolve,reject)=>{
            self.model.findOne({ '_id': id, deleted : false },function(err,doc){
                if(err){
                    reject(err);
                }
                else if(!doc){
                    reject(new Error('Document not found'));
                }
                else{
                    var oldValues = doc.toObject();
                    var updated = _.mergeWith(doc, body,self._customizer);
                    updated = new self.model(updated);
                    Object.keys(body).forEach(el => updated.markModified(el));
                    updated.save(function (err) {
                        if (err) {
                            reject(err);
                        }
                        var logObject = {
                            'operation':'Update',
                            'user':user,
                            'originalValues':oldValues,
                            '_id':doc._id,
                            'newValues':body,
                            'timestamp':new Date()
                        };
                        self.logger.audit(JSON.stringify(logObject));
                        resolve(updated);
                    });
                }
            }).exec();
        });
    },
    _bulkUpdate: function (req,res) {
        var reqParams = params.map(req);
        var body = reqParams['data']; //Actual transformation
        var selectFields = Object.keys(body);
        var self = this;
        selectFields.push('_id');
        var ids = reqParams['id'].split(','); //Ids will be comma seperated ID list
        var user = req.user?req.user.username:req.headers['masterName'];
        var promises = ids.map(id => self._updateMapper(id,body,user));
        var promise = Promise.all(promises).then(result => res.json(result), err => {
            self.Error(res, err);
        });
        return promise;
    },
    _bulkUpload: function (req,res){
        try{
            let buffer = req.files.file[0].buffer.toString('utf8');
            let rows = buffer.split('\n');
            let keys = rows[0].split(',');
            let products = [];
            let self = this;
            rows.splice(0,1);
            rows.forEach(el => {
                let values = el.split(',');
                values.length>1?products.push(_.zipObject(keys,values)):null;
            });
            Promise.all(products.map(el => self._bulkPersist(el))).
            then(result => res.status(200).json(result));
        }
        catch(e){
            res.status(400).json(e);
        }
    },
    _bulkPersist: function (el){
        var self = this;
        return new Promise((res,rej)=>{
            self.model.create(el, function(err,doc){
                if(err)
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
        var reqParams = params.map(req);
        var bodyIn = 'data';
        var body = reqParams[bodyIn];
        if (body._id) {
            delete req.body._id;
        }
        var self = this;
        var bodyData = _.omit(body, this.omit);
        var collectionName=this.model.modelName;
        this.model.findOne({ '_id': reqParams['id'], deleted : false  }, function (err, document) {
            if (err) {
                return self.Error(res,err);
            }

            if (!document) {
                return self.NotFound(res);
            }
            var oldValues = document.toObject();
            var updated = _.mergeWith(document, bodyData,self._customizer);
            updated = new self.model(updated);
            Object.keys(body).forEach(el => updated.markModified(el));
            updated.save(function (err) {
                if (err) {
                    return self.Error(res,err);
                }
                var logObject = {
                    'operation':'update',
                    'user':req.user?req.user.username:req.headers['masterName'],
                    'originalValues':oldValues,
                    '_id':document._id,
                    'newValues':body,
                    'timestamp':new Date()
                };
                self.logger.audit(JSON.stringify(logObject));
                result = callTwinComplete(self.getResponseObject(updated),res,"update",collectionName);
                return self.Okay(res,self.getResponseObject(updated));
            });
        });
    },

    _customizer: function(objValue, srcValue) {
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
        var collectionName=this.model.modelName;
        this.model.findOne({ '_id': reqParams['id'] }, function (err, document) {
            if (err) {
                return self.Error(res,err);
            }

            if (!document) {
                return self.NotFound(res);
            }

            document.remove(function (err) {
                if (err) {
                    return self.Error(res,err);
                }
                var logObject = {
                    'operation':'Destory',
                    'user':req.user?req.user.username:req.headers['masterName'],
                    '_id':document._id,
                    'timestamp':new Date()
                };
                self.logger.audit(JSON.stringify(logObject));
                var reqData={};

                result = callTwinComplete(reqParams['id'],res,"delete",collectionName);
                return self.Okay(res,{});
            });
        });
    },

    _markAsDeleted: function (req, res) {
        var reqParams = params.map(req);
        var self = this;
        this.model.findOne({ '_id': reqParams['id'], deleted:false }, function (err, document) {
            if (err) {
                return self.Error(res,err);
            }

            if (!document) {
                return self.NotFound(res);
            }
            document.deleted = true;
            document.save(function (err) {
                if (err) {
                    return self.Error(res,err);
                }
                var logObject = {
                    'operation':'Delete',
                    'user':req.user?req.user.username:req.headers['masterName'],
                    '_id':document._id,
                    'timestamp':new Date()
                };
                self.logger.audit(JSON.stringify(logObject));
                return self.Okay(res,{});
            });
        });
    },

    _rucc: function (queryObject, callBack) {
        //rucc = Read Update Check Commit
        var self = this;
        return this.model.findOne({ _id: queryObject['id'],  deleted:false }).exec().then(result => {
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
