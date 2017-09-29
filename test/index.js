'use strict';
/* global describe:false, it: false */
var chai = require('chai');
var expect = chai.expect;
var Mongoose = require('mongoose');
var Crudder = require('../');
Mongoose.connect('mongodb://localhost:27017/travis');

var definition = {
    'name': { 'type': String },
    'description': { 'type': String },
    'age' : {'type' : Number}
};

var schema = Mongoose.Schema(definition);
var modelName = 'foobar';
var options = {
    collectionName: 'foobar'
};

var testCrud = new Crudder(schema, modelName, options);

describe('Methods Sanity Check', function () {
    describe('create', function () {
        it('Should be a function', function (done) {
            expect(testCrud.create).to.be.a('function');
            done();
        });
    });
    describe('update', function () {
        it('should be a function', function (done) {
            expect(testCrud.update).to.be.a('function');
            done();
        });
    });
    describe('Index', function () {
        it('should be a function', function (done) {
            expect(testCrud.index).to.be.a('function');
            done();
        });
    });
    describe('destroy', function () {
        it('should be a function', function (done) {
            expect(testCrud.destroy).to.be.a('function');
            done();
        });
    });
    describe('update', function () {
        it('should be a function', function (done) {
            expect(testCrud.update).to.be.a('function');
            done();
        });
    });
});

