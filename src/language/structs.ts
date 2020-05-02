import { Range, TextDocument, Uri } from 'vscode';
import { JavaPrimitiveTypes } from './literals';

/***************************************************************
 * Types
 ***************************************************************/

export abstract class Type {
    readonly raw: string;
    readonly range: Range;

    constructor(raw: string, range: Range) {
        this.raw = raw;
        this.range = range;
    }

    equal(type: Type): boolean {
        return this.raw === type.raw;
    }

    abstract toString(): string;

    abstract get identifier(): string;
}

export class PrimitiveType extends Type {
    constructor (raw: string, range: Range) {
        if (raw in JavaPrimitiveTypes) {
            super(raw, range);
        } else {
            throw Error(`Unknown type identifier: ${raw}`);
        }
    }

    toString(): string {
        return JavaPrimitiveTypes[this.raw];
    }

    get identifier(): string { return null; }
}

export class ReferenceType extends Type {
    constructor(raw: string, range: Range) {
        if (raw.startsWith('L') && raw.endsWith(';')) {
            super(raw, range);
        } else {
            throw Error(`Unknown type identifier: ${raw}`);
        }
    }

    toString(): string {
        return this.raw.slice(1, -1).replace(/\//g, '.');
    }

    get identifier(): string {
        return this.raw;
    }
}

export class ArrayType extends Type {
    readonly type: Type;
    readonly layers: number;

    constructor(range: Range, type: Type, layers: number) {
        super('['.repeat(layers) + type.raw, range);
        this.type = type;
        this.layers = layers;
    }

    toString(): string {
        return this.type + '[]'.repeat(this.layers);
    }

    get identifier(): string {
        return this.type.identifier;
    }
}

/***************************************************************
 * Field
 ***************************************************************/

export class Field {
    readonly range: Range;
    readonly modifiers: Array<string>;
    readonly name: TextRange;
    readonly type: Type;
    readonly initial: TextRange;

    constructor(range: Range, modifiers: Array<string>, name: TextRange, type: Type, initial: TextRange) {
        this.range = range;
        this.modifiers = modifiers;
        this.name = name;
        this.type = type;
        this.initial = initial;
    }

    equal(field: Field): boolean {
        return this.name.text === field.name.text &&
               this.type.equal(field.type);
    }

    toString(name: string = this.name.text): string {
        let ret: string = '';
        if (this.modifiers) {
            ret += this.modifiers.join(' ') + ' ';
        }
        ret += `${this.type} ${name}`;
        if (this.initial) {
            ret += ` = ${this.initial}`;
        }
        return ret;
    }

    toIdentifier(name: string = this.name.text): string {
        return `${name}:${this.type.raw}`;
    }
}

/***************************************************************
 * Methods
 ***************************************************************/

export class Method {
    readonly range: Range;
    readonly modifiers: Array<string>;
    readonly name: TextRange;
    readonly parameters: Array<Type>;
    readonly returnType: Type;

    readonly isConstructor: boolean;

    constructor(
        range: Range,
        modifiers: Array<string>,
        name: TextRange,
        parameters: Array<Type>,
        returnType: Type
    ) {
        this.range = range;
        this.modifiers = modifiers;
        this.name = name;
        this.parameters = parameters;
        this.returnType = returnType;
        this.isConstructor = (this.name.text === '<init>' || this.name.text === '<clinit>');
    }

    equal(method: Method): boolean {
        return this.name.text === method.name.text &&
               this.returnType.equal(method.returnType) &&
               areParametersEqual(this.parameters, method.parameters);
    }

    toString(name: string = this.name.text): string {
        return `${this.modifiers.join(' ')} ${name}(${this.getReadableParameterList()}): ${this.returnType}`;
    }

    toIdentifier(name: string = this.name.text) {
        return `${name}(${this.getRawParameterList()})${this.returnType.raw}`;
    }

    getRawParameterList(): string {
        if (!this.parameters) {
            return '';
        }
        return this.parameters.map(p => p.raw).join('');
    }

    getReadableParameterList(): string {
        if (!this.parameters) {
            return '';
        }
        return this.parameters.map((type, i) => `${type} param${i}`).join();
    }
}

/***************************************************************
 * Miscellaneous
 ***************************************************************/

export class TextRange {
    readonly text: string;
    readonly range: Range;

    constructor(text: string, range: Range) {
        this.text = text;
        this.range = range;
    }

    get length(): number { return this.text.length; }

    toString(): string { return this.text; }
}

export class Class {
    uri: Uri;
    text: string;

    name: Type;
    modifiers: Array<string>;
    super: Type;
    source: TextRange;
    implements: Array<Type>;
    //innerClasses: Array<Class>;

    constructors: Array<Method>;
    fields: Array<Field>;
    methods: Array<Method>;

    constructor(document: TextDocument) {
        this.uri = document.uri;
        this.text = document.getText();
        this.modifiers = new Array<string>();
        this.implements = new Array<Type>();
        this.constructors = new Array<Method>();
        this.fields = new Array<Field>();
        this.methods = new Array<Method>();
    }
}

function areParametersEqual(types1: Array<Type>, types2: Array<Type>): boolean {
    if (types1.length !== types2.length) {
        return false;
    }
    return types1.every((v, i) => v.equal(types2[i]));
}