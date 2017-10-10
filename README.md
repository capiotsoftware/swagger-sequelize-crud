# swagger-sequelize-crud
[![Build Status](https://travis-ci.org/capiotsoftware/swagger-mongoose-crud.svg?branch=master)](https://travis-ci.org/capiotsoftware/swagger-mongoose-crud)

A Simple wrapper for Swagger based SQL CRUD operation. This plugin is a modfied version of the Mongoose CRUD operation introducted by [Micheal Krone](https://github.com/michaelkrone).

This module exposes following basic operations.
* Create
* Update
* Read
* Delete
* Index (list)

## Installation
``` sh
npm install https://github.com/capiotsoftware/swagger-sequelize-crud.git --save
```

## Usage 
```javascript
const Sequelize = require('sequelize');
const SMCrud = require("swagger-sequelize-crud");
//In your controller, simply expose the following
var sequelize = new Sequelize("dbUrl,options);
//db needs to be created before using sequelize object
var definition = {}; //Your mongoose Schema definition here.  
var modelName = "Your Table Name";
var options = {
 collectionName: "name of your Table",
 logger: "your logger object"
}

var crud = new SMCrud(sequelize, definition, modelName, options);
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

