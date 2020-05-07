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

    abstract get identifier(): string | undefined;
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

    get identifier(): string | undefined { return undefined; }
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

    get identifier(): string | undefined { return this.raw; }
}

export class ArrayType extends Type {
    readonly element: Type;
    readonly layers: number;

    constructor(range: Range, element: Type, layers: number) {
        super('['.repeat(layers) + element.raw, range);
        this.element = element;
        this.layers = layers;
    }

    toString(): string {
        return this.element + '[]'.repeat(this.layers);
    }

    get identifier(): string | undefined {
        return this.element.identifier;
    }
}

/***************************************************************
 * Field
 ***************************************************************/

export class Field {
    readonly range: Range;
    readonly modifiers: string[];
    readonly name: TextRange;
    readonly type: Type;
    readonly initial: TextRange | undefined;

    constructor(range: Range, modifiers: string[], name: TextRange, type: Type, initial: TextRange | undefined) {
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
        const modifiers: string = this.modifiers.length === 0 ? '' : `${this.modifiers.join(' ')} `;
        const initial: string   = !this.initial ? '' : ` = ${this.initial}`;
        return `${modifiers}${this.type} ${name}${initial}`;
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
    readonly modifiers: string[];
    readonly name: TextRange;
    readonly parameters: Type[];
    readonly returnType: Type;

    readonly isConstructor: boolean;

    constructor(
        range: Range,
        modifiers: string[],
        name: TextRange,
        parameters: Type[],
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
        const modifiers: string = this.modifiers.length === 0 ? '' : `${this.modifiers.join(' ')} `;
        return `${modifiers}${name}(${this.getReadableParameterList()}): ${this.returnType}`;
    }

    toIdentifier(name: string = this.name.text) {
        return `${name}(${this.getRawParameterList()})${this.returnType.raw}`;
    }

    getRawParameterList(): string {
        return (this.parameters || []).map(p => p.raw).join('');
    }

    getReadableParameterList(): string {
        return (this.parameters || []).map((type, i) => `${type} param${i}`).join();
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
    text: string;
    version: number;

    name: Type;
    modifiers: string[];
    super: Type;
    source: TextRange;
    implements: Type[];
    //innerClasses: Class[];

    constructors: Method[];
    fields: Field[];
    methods: Method[];

    constructor(document: TextDocument) {
        this.version = document.version;
        this.text = document.getText();
        this.modifiers = [];
        this.implements = [];
        this.constructors = [];
        this.fields = [];
        this.methods = [];
    }
}

function areParametersEqual(types1: Type[], types2: Type[]): boolean {
    if (types1.length !== types2.length) {
        return false;
    }
    return types1.every((v, i) => v.equal(types2[i]));
}