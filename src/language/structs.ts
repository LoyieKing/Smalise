import { Range } from 'vscode';
import { JavaPrimitiveTypes } from './literals';

/***************************************************************
 * Types
 ***************************************************************/

export abstract class AbstractType {
    readonly Raw: string;
    readonly Range: Range;

    constructor(raw: string, range: Range) {
        this.Raw = raw;
        this.Range = range;
    }

    equal(type: AbstractType): boolean {
        return this.Raw === type.Raw;
    }

    abstract toString(): string;

    abstract get FilePath(): string;
}

export class PrimitiveType extends AbstractType {
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

export class ReferenceType extends AbstractType {
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

export class ArrayType extends AbstractType {
    readonly Type: AbstractType;
    readonly Layers: number;

    constructor(range: Range, type: AbstractType, layers: number) {
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
    Type: AbstractType;
    Initial: TextRange;

    constructor(range: Range, modifiers: Array<string>, name: TextRange, type: AbstractType, initial: TextRange) {
        this.Range = range;
        this.Modifiers = modifiers;
        this.Name = name;
        this.Type = type;
        this.Initial = initial;
    }

    equal(field: Field): boolean {
        return this.Name === field.Name &&
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

export abstract class AbstractMethod {
    Range: Range;
    Modifiers: Array<string>;
    Name: TextRange;
    Parameters: Array<AbstractType>;
    ReturnType: AbstractType;

    constructor(
        range: Range,
        modifiers: Array<string>,
        name: TextRange,
        parameters: Array<AbstractType>,
        returnType: AbstractType
    ) {
        this.Range = range;
        this.Modifiers = modifiers;
        this.Name = name;
        this.Parameters = parameters;
        this.ReturnType = returnType;
    }

    abstract isConstructor(): boolean;

    equal(method: AbstractMethod): boolean {
        return this.Name === method.Name &&
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
        let modifiers: string = ''
        if (this.Modifiers) {
            modifiers = this.Modifiers.join(' ') + ' ';
        }
        return modifiers + this.Name.Text + '(' + this.getReadableParameterList() + '): ' + this.ReturnType.toString();
    }
}

export class Constructor extends AbstractMethod {
    isConstructor() { return true; }
}

export class Method extends AbstractMethod {
    isConstructor() { return false; }
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
    Name: AbstractType;
    Modifiers: Array<string>;
    Super: AbstractType;
    Source: JString;
    Implements: Array<AbstractType>;

    Constructors: Array<Constructor>;
    Fields: Array<Field>;
    Methods: Array<Method>;

    //InnerClasses: Array<Class>;

    References: { [raw: string]: Array<Range>; };

    constructor() {
        this.Modifiers = new Array<string>();
        this.Implements = new Array<AbstractType>();
        this.Constructors = new Array<Constructor>();
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

    addTypeReference(type: AbstractType) {
        if (type instanceof ArrayType) {
            type = type.Type;
        }
        if (type instanceof ReferenceType) {
            this.addReference(type.Raw, type.Range);
        }
    }
}

function ParamsEqual(types1: Array<AbstractType>, types2: Array<AbstractType>): boolean {
    if (types1.length !== types2.length) {
        return false;
    }
    return types1.every((v, i) => { v.equal(types2[i]); });
}