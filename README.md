# swagger-sequelize-crud


A Simple wrapper for Swagger based SQL CRUD operation. This plugin is a modfied version of the Mongoose CRUD operation introducted by [Micheal Krone](https://github.com/michaelkrone).

This module exposes following basic operations.
* Create
* Update
* Read
* Delete
* Index (list)

## Installation
``` sh
npm install https://bitbucket.org/capiot/swagger-sequelize-crud.git --save
```

## Usage 
```javascript
const Sequelize = require('sequelize');
const SSCrud = require("swagger-sequelize-crud");
//In your controller, simply expose the following
var sequelize = new Sequelize("dbUrl,options);
//db needs to be created before using sequelize object
var definition = {}; //Your mongoose Schema definition here.  
var modelName = "Your Table Name";
var options = {
 collectionName: "name of your Table",
 logger: "your logger object"
}
var hooks = []; //array of hook object. Hook object should contain event, hookName and func; List of event supported can be found in http://docs.sequelizejs.com/manual/tutorial/hooks.html; func is a function which takes data object and option as argument and may return a promise. 
var crud = new SSCrud(sequelize, definition, modelName, options, hooks);
var exports = {};
//Takes all parameters for creating an entry
exports.create = crud.create; 

//Takes parameter 'id' for searching in the DB, will update rest of the parameters.
exports.update = crud.update;

//Will list out the entire collection, No parameters
exports.index = crud.index;

//Will mark the entity as deleted by setting deleted dateTime to time it was deleted, takes 'id'
exports.markAsDeleted = crud.markAsDeleted;

//Will show a single entity, takes 'id'
exports.show = crud.show;


module.exports = exports;
```

## Fields added by this library to your schema

* createdAt : Type Date. The time of creation of the tuple.
* updatedAt : Type Date. The last updated time of the tuple.
* deletedAt : Type Date. This is null by default. The value is updated when Delete operation is called by crud.
* id: Type integer. This will be unique and primary key of the model.

## APIs
* GET : To fetch all/single document. 
     * Query params:
        * select: comma separated list of attributes to be fetched. Returns all attribute if not provided. To exclude attributes provide list with '-' sign. Eg: -id,-name. To include or exclude a complex feild give '.'  separated feild. Eg: address.line1, address.* .
        * sort: comma separated attributes.
        * filter: json object to filter document. Sample json: ```{
    "$where": {
        "name": "Neamen",
        "template_id": "123"
    },
    "contact_id": {
        "$where": {
            "id": {
                "$gt": 1
            },
            "value": "234"
        }
    }
}```
filter should be always inside $where key. For more options in filter refer to http://docs.sequelizejs.com/manual/tutorial/querying.html#where
        * page: page number of the ducument.
        * count: number of records in a page.
*   POST: To create a document.
*   PUT: To update a document.
*   DELETE: to delete a document.

 
