import { Range } from 'vscode';
import { JavaPrimitiveTypes } from './literals';

/***************************************************************
 * Types
 ***************************************************************/

export abstract class Type {
    readonly Raw: string;
    readonly Range: Range;

    constructor(raw: string, range: Range) {
        this.Raw = raw;
        this.Range = range;
    }

    equal(type: Type): boolean {
        return this.Raw === type.Raw;
    }

    abstract toString(): string;

    abstract get FilePath(): string;
}

export class PrimitiveType extends Type {
    constructor (raw: string, range: Range) {
        if (raw in JavaPrimitiveTypes) {
            super(raw, range);
        } else {
            throw Error('Unknown type identifier: ' + raw);
        }
    }

    toString(): string {
        return JavaPrimitiveTypes[this.Raw];
    }

    get FilePath(): string {
        return null;
    }
}

export class ReferenceType extends Type {
    constructor(raw: string, range: Range) {
        if (raw.startsWith('L') && raw.endsWith(';')) {
            super(raw, range);
        } else {
            throw Error('Unknown type identifier: ' + raw);
        }
    }

    toString(): string {
        return this.Raw.substr(1, this.Raw.length - 2).replace(/\//g, '.');
    }

    get FilePath(): string {
        return this.Raw.substr(1, this.Raw.length - 2) + '.smali';
    }
}

export class ArrayType extends Type {
    readonly Type: Type;
    readonly Layers: number;

    constructor(range: Range, type: Type, layers: number) {
        super('['.repeat(layers) + type.Raw, range);
        this.Type = type;
        this.Layers = layers;
    }

    toString(): string {
        return this.Type.toString() + '[]'.repeat(this.Layers);
    }

    get FilePath(): string {
        return this.Type.FilePath;
    }
}

/***************************************************************
 * Field
 ***************************************************************/

export class Field {
    Range: Range;
    Modifiers: Array<string>;
    Name: TextRange;
    Type: Type;
    Initial: TextRange;

    constructor(range: Range, modifiers: Array<string>, name: TextRange, type: Type, initial: TextRange) {
        this.Range = range;
        this.Modifiers = modifiers;
        this.Name = name;
        this.Type = type;
        this.Initial = initial;
    }

    equal(field: Field): boolean {
        return this.Name.Text === field.Name.Text &&
               this.Type.equal(field.Type);
    }

    toString(): string {
        let ret: string = '';
        if (this.Modifiers) {
            ret += this.Modifiers.join(' ') + ' ';
        }
        ret += this.Type.toString() + ' ' + this.Name.Text;
        if (this.Initial) {
            ret += ' = ' + this.Initial;
        }
        return ret;
    }
}

/***************************************************************
 * Methods
 ***************************************************************/

export class Method {
    Range: Range;
    Modifiers: Array<string>;
    Name: TextRange;
    Parameters: Array<Type>;
    ReturnType: Type;
    isConstructor: boolean;

    constructor(
        range: Range,
        modifiers: Array<string>,
        name: TextRange,
        parameters: Array<Type>,
        returnType: Type
    ) {
        this.Range = range;
        this.Modifiers = modifiers;
        this.Name = name;
        this.Parameters = parameters;
        this.ReturnType = returnType;
        this.isConstructor = (this.Name.Text === '<init>' || this.Name.Text === '<clinit>');
    }

    equal(method: Method): boolean {
        return this.Name.Text === method.Name.Text &&
               this.ReturnType.equal(method.ReturnType) &&
               ParamsEqual(this.Parameters, method.Parameters);
    }

    getReadableParameterList(): string {
        if (!this.Parameters) {
            return '';
        }
        let array = [];
        for (let i = 0; i < this.Parameters.length; i++) {
            array.push(this.Parameters[i].toString());
            array.push(' ');
            array.push('param' + i);
            array.push(', ');
        }
        array.pop();
        return array.join('');
    }

    toString(): string {
        let modifiers: string = '';
        if (this.Modifiers) {
            modifiers = this.Modifiers.join(' ') + ' ';
        }
        return modifiers + this.Name.Text + '(' + this.getReadableParameterList() + '): ' + this.ReturnType.toString();
    }
}

/***************************************************************
 * Miscellaneous
 ***************************************************************/

export class JString {
    value: string;
    // TODO: add range?
    constructor(v: string) {
        this.value = v;
    }
}

export class TextRange {
    Text: string;
    Range: Range;

    constructor(text: string, range: Range) {
        this.Text = text;
        this.Range = range;
    }

    get length(): number { return this.Text.length; }
}

export class Class {
    Name: Type;
    Modifiers: Array<string>;
    Super: Type;
    Source: JString;
    Implements: Array<Type>;

    Constructors: Array<Method>;
    Fields: Array<Field>;
    Methods: Array<Method>;

    //InnerClasses: Array<Class>;

    References: { [raw: string]: Array<Range>; };

    constructor() {
        this.Modifiers = new Array<string>();
        this.Implements = new Array<Type>();
        this.Constructors = new Array<Method>();
        this.Fields = new Array<Field>();
        this.Methods = new Array<Method>();
        this.References = {};
    }

    addReference(raw: string, range: Range) {
        if (!(raw in this.References)) {
            this.References[raw] = new Array<Range>();
        }
        this.References[raw].push(range);
    }

    addTypeReference(type: Type) {
        if (type instanceof ArrayType) {
            type = type.Type;
        }
        if (type instanceof ReferenceType) {
            this.addReference(type.Raw, type.Range);
        }
    }
}

function ParamsEqual(types1: Array<Type>, types2: Array<Type>): boolean {
    if (types1.length !== types2.length) {
        return false;
    }
    return types1.every((v, i) => v.equal(types2[i]));
}