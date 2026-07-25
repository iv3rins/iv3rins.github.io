import { AddOperation, RemoveOperation, ReplaceOperation, MoveOperation, CopyOperation, TestOperation, Operation } from './diff';
export interface Options {
    /**
    When true, "add" operations with path ending in "/-" will implicitly
    create an empty array where possible.
  
    For example, with this option enabled, for the object `{live: true}`,
    the operation `add "/tag/-" 123` will result in `{live: true, tag: [123]}`.
    Subsequent operations behave normally: another `add "/tag/-" 456` will result
    in `{live: true, tag: [123, 456]}`.
  
    If the indicated array property already exists but is not an array, this will
    produce an error.
  
    Only the leaf array will be inferred; missing parent objects will still
    produce errors.
    */
    implicitArrayCreation?: boolean;
}
export declare class MissingError extends Error {
    path: string;
    constructor(path: string);
}
export declare class TestError extends Error {
    actual: any;
    expected: any;
    constructor(actual: any, expected: any);
}
/**
>  o  If the target location specifies an array index, a new value is
>     inserted into the array at the specified index.
>  o  If the target location specifies an object member that does not
>     already exist, a new member is added to the object.
>  o  If the target location specifies an object member that does exist,
>     that member's value is replaced.
*/
export declare function add(object: any, operation: AddOperation, options?: Options): MissingError | null;
/**
> The "remove" operation removes the value at the target location.
> The target location MUST exist for the operation to be successful.
*/
export declare function remove(object: any, operation: RemoveOperation, options?: Options): MissingError | null;
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
export declare function replace(object: any, operation: ReplaceOperation, options?: Options): MissingError | null;
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
export declare function move(object: any, operation: MoveOperation, options?: Options): MissingError | null;
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
export declare function copy(object: any, operation: CopyOperation, options?: Options): MissingError | null;
/**
> The "test" operation tests that a value at the target location is
> equal to a specified value.
> The operation object MUST contain a "value" member that conveys the
> value to be compared to the target location's value.
> The target location MUST be equal to the "value" value for the
> operation to be considered successful.
*/
export declare function test(object: any, operation: TestOperation, options?: Options): TestError | null;
export declare class InvalidOperationError extends Error {
    operation: Operation;
    constructor(operation: Operation);
}
/**
Switch on `operation.op`, applying the corresponding patch function for each
case to `object`.
*/
export declare function apply(object: any, operation: Operation, options?: Options): MissingError | InvalidOperationError | TestError | null;
