"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidOperationError = exports.TestError = exports.MissingError = void 0;
exports.add = add;
exports.remove = remove;
exports.replace = replace;
exports.move = move;
exports.copy = copy;
exports.test = test;
exports.apply = apply;
var pointer_1 = require("./pointer");
var util_1 = require("./util");
var diff_1 = require("./diff");
var MissingError = /** @class */ (function (_super) {
    __extends(MissingError, _super);
    function MissingError(path) {
        var _this = _super.call(this, "Value required at path: ".concat(path)) || this;
        _this.path = path;
        _this.name = 'MissingError';
        return _this;
    }
    return MissingError;
}(Error));
exports.MissingError = MissingError;
var TestError = /** @class */ (function (_super) {
    __extends(TestError, _super);
    function TestError(actual, expected) {
        var _this = _super.call(this, "Test failed: ".concat(actual, " != ").concat(expected)) || this;
        _this.actual = actual;
        _this.expected = expected;
        _this.name = 'TestError';
        return _this;
    }
    return TestError;
}(Error));
exports.TestError = TestError;
function _add(object, key, value) {
    if (Array.isArray(object)) {
        // `key` must be an index
        if (key == '-') {
            object.push(value);
        }
        else {
            var index = parseInt(key, 10);
            object.splice(index, 0, value);
        }
    }
    else {
        object[key] = value;
    }
}
function _remove(object, key) {
    if (Array.isArray(object)) {
        // '-' syntax doesn't make sense when removing
        var index = parseInt(key, 10);
        object.splice(index, 1);
    }
    else {
        // not sure what the proper behavior is when path = ''
        delete object[key];
    }
}
/**
>  o  If the target location specifies an array index, a new value is
>     inserted into the array at the specified index.
>  o  If the target location specifies an object member that does not
>     already exist, a new member is added to the object.
>  o  If the target location specifies an object member that does exist,
>     that member's value is replaced.
*/
function add(object, operation, options) {
    var pointer = pointer_1.Pointer.fromJSON(operation.path);
    // Handle implicit array creation for terminal "/-" paths
    if ((options === null || options === void 0 ? void 0 : options.implicitArrayCreation) && pointer.tokens[pointer.tokens.length - 1] === '-') {
        // Try to evaluate the parent (the array itself)
        var parentEndpoint = pointer.parent().evaluate(object);
        // If the array property doesn't exist but its parent does,
        // and this parent is a plain object (not an array),
        // create an (empty) array that we will add to below.
        if (parentEndpoint.value === undefined && (0, util_1.objectType)(parentEndpoint.parent) === 'object') {
            parentEndpoint.parent[parentEndpoint.key] = [];
        }
    }
    var endpoint = pointer.evaluate(object);
    // it's not exactly a "MissingError" in the same way that `remove` is -- more like a MissingParent, or something
    if (endpoint.parent === undefined || endpoint.parent === null) {
        return new MissingError(operation.path);
    }
    // When using implicitArrayCreation, validate that "/-" targets are actually arrays
    if ((options === null || options === void 0 ? void 0 : options.implicitArrayCreation) && endpoint.key === '-' && !Array.isArray(endpoint.parent)) {
        return new MissingError(operation.path);
    }
    _add(endpoint.parent, endpoint.key, (0, util_1.clone)(operation.value));
    return null;
}
/**
> The "remove" operation removes the value at the target location.
> The target location MUST exist for the operation to be successful.
*/
function remove(object, operation, options) {
    // endpoint has parent, key, and value properties
    var endpoint = pointer_1.Pointer.fromJSON(operation.path).evaluate(object);
    // the root pointer "" has no parent to remove from (mirrors `replace`)
    if (endpoint.parent === null) {
        return new MissingError(operation.path);
    }
    if (endpoint.value === undefined) {
        return new MissingError(operation.path);
    }
    _remove(endpoint.parent, endpoint.key);
    return null;
}
/**
> The "replace" operation replaces the value at the target location
> with a new value.  The operation object MUST contain a "value" member
> whose content specifies the replacement value.
> The target location MUST exist for the operation to be successful.

> This operation is functionally identical to a "remove" operation for
> a value, followed immediately by an "add" operation at the same
> location with the replacement value.

Even more simply, it's like the add operation with an existence check.
*/
function replace(object, operation, options) {
    var endpoint = pointer_1.Pointer.fromJSON(operation.path).evaluate(object);
    if (endpoint.parent === null) {
        return new MissingError(operation.path);
    }
    // this existence check treats arrays as a special case
    if (Array.isArray(endpoint.parent)) {
        if (parseInt(endpoint.key, 10) >= endpoint.parent.length) {
            return new MissingError(operation.path);
        }
    }
    else if (endpoint.value === undefined) {
        return new MissingError(operation.path);
    }
    endpoint.parent[endpoint.key] = (0, util_1.clone)(operation.value);
    return null;
}
/**
> The "move" operation removes the value at a specified location and
> adds it to the target location.
> The operation object MUST contain a "from" member, which is a string
> containing a JSON Pointer value that references the location in the
> target document to move the value from.
> This operation is functionally identical to a "remove" operation on
> the "from" location, followed immediately by an "add" operation at
> the target location with the value that was just removed.

> The "from" location MUST NOT be a proper prefix of the "path"
> location; i.e., a location cannot be moved into one of its children.
*/
function move(object, operation, options) {
    var from_pointer = pointer_1.Pointer.fromJSON(operation.from);
    var from_endpoint = from_pointer.evaluate(object);
    if (from_endpoint.value === undefined) {
        return new MissingError(operation.from);
    }
    var pointer = pointer_1.Pointer.fromJSON(operation.path);
    // a location cannot be moved into one of its own children; doing so would
    // detach the destination along with the value and silently lose data
    if (from_pointer.tokens.length < pointer.tokens.length &&
        from_pointer.tokens.every(function (token, index) { return token === pointer.tokens[index]; })) {
        return new MissingError(operation.path);
    }
    var endpoint = pointer.evaluate(object);
    if (endpoint.parent === undefined || endpoint.parent === null) {
        return new MissingError(operation.path);
    }
    _remove(from_endpoint.parent, from_endpoint.key);
    _add(endpoint.parent, endpoint.key, from_endpoint.value);
    return null;
}
/**
> The "copy" operation copies the value at a specified location to the
> target location.
> The operation object MUST contain a "from" member, which is a string
> containing a JSON Pointer value that references the location in the
> target document to copy the value from.
> The "from" location MUST exist for the operation to be successful.

> This operation is functionally identical to an "add" operation at the
> target location using the value specified in the "from" member.

Alternatively, it's like 'move' without the 'remove'.
*/
function copy(object, operation, options) {
    var from_endpoint = pointer_1.Pointer.fromJSON(operation.from).evaluate(object);
    if (from_endpoint.value === undefined) {
        return new MissingError(operation.from);
    }
    var endpoint = pointer_1.Pointer.fromJSON(operation.path).evaluate(object);
    if (endpoint.parent === undefined || endpoint.parent === null) {
        return new MissingError(operation.path);
    }
    _add(endpoint.parent, endpoint.key, (0, util_1.clone)(from_endpoint.value));
    return null;
}
/**
> The "test" operation tests that a value at the target location is
> equal to a specified value.
> The operation object MUST contain a "value" member that conveys the
> value to be compared to the target location's value.
> The target location MUST be equal to the "value" value for the
> operation to be considered successful.
*/
function test(object, operation, options) {
    var endpoint = pointer_1.Pointer.fromJSON(operation.path).evaluate(object);
    // TODO: this diffAny(...).length usage could/should be lazy
    if ((0, diff_1.diffAny)(endpoint.value, operation.value, new pointer_1.Pointer()).length) {
        return new TestError(endpoint.value, operation.value);
    }
    return null;
}
var InvalidOperationError = /** @class */ (function (_super) {
    __extends(InvalidOperationError, _super);
    function InvalidOperationError(operation) {
        var _this = _super.call(this, "Invalid operation: ".concat(operation.op)) || this;
        _this.operation = operation;
        _this.name = 'InvalidOperationError';
        return _this;
    }
    return InvalidOperationError;
}(Error));
exports.InvalidOperationError = InvalidOperationError;
/**
Switch on `operation.op`, applying the corresponding patch function for each
case to `object`.
*/
function apply(object, operation, options) {
    // not sure why TypeScript can't infer typesafety of:
    //   {add, remove, replace, move, copy, test}[operation.op](object, operation)
    // (seems like a bug)
    switch (operation.op) {
        case 'add': return add(object, operation, options);
        case 'remove': return remove(object, operation, options);
        case 'replace': return replace(object, operation, options);
        case 'move': return move(object, operation, options);
        case 'copy': return copy(object, operation, options);
        case 'test': return test(object, operation, options);
    }
    return new InvalidOperationError(operation);
}
