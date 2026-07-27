"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasOwnProperty = void 0;
exports.objectType = objectType;
exports.clone = clone;
exports.hasOwnProperty = Object.prototype.hasOwnProperty;
function objectType(object) {
    if (object === undefined) {
        return 'undefined';
    }
    if (object === null) {
        return 'null';
    }
    if (Array.isArray(object)) {
        return 'array';
    }
    return typeof object;
}
function isNonPrimitive(value) {
    // loose-equality checking for null is faster than strict checking for each of null/undefined/true/false
    // checking null first, then calling typeof, is faster than vice-versa
    return value != null && typeof value == 'object';
}
/**
Recursively copy a value.

@param source - should be a JavaScript primitive, Array, Date, or (plain old) Object.
@returns copy of source where every Array and Object have been recursively
         reconstructed from their constituent elements
*/
function clone(source) {
    if (!isNonPrimitive(source)) {
        // short-circuiting is faster than a single return
        return source;
    }
    // x.constructor == Array is the fastest way to check if x is an Array
    if (source.constructor == Array) {
        // construction via imperative for-loop is faster than source.map(arrayVsObject)
        var length = source.length;
        // setting the Array length during construction is faster than just `[]` or `new Array()`
        var arrayTarget = new Array(length);
        for (var i = 0; i < length; i++) {
            arrayTarget[i] = clone(source[i]);
        }
        return arrayTarget;
    }
    // Date
    if (source.constructor == Date) {
        var dateTarget = new Date(+source);
        return dateTarget;
    }
    // Object
    var objectTarget = {};
    // declaring the variable (with const) inside the loop is faster
    for (var key in source) {
        // hasOwnProperty costs a bit of performance, but it's semantically necessary
        // using a global helper is MUCH faster than calling source.hasOwnProperty(key)
        if (exports.hasOwnProperty.call(source, key)) {
            objectTarget[key] = clone(source[key]);
        }
    }
    return objectTarget;
}
