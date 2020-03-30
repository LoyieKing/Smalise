

import { TextDocument, Diagnostic, CodeAction, Range, SourceControlInputBox, Position, TextEditor, TextEditorRevealType } from 'vscode';
import { stringify } from 'querystring';
import { DiagnosticSeverity, FileEvent } from 'vscode-languageclient';
import { S_IFDIR } from 'constants';
import { NullLogger } from 'vscode-jsonrpc';
import { ParseTextDocument } from './extension';

enum TokenType {
    Modifier,
    string
}

const Tokens: { [key: string]: TokenType; } = {
    'public': TokenType.Modifier,
    'protected': TokenType.Modifier,
    'private': TokenType.Modifier,

    'transient': TokenType.Modifier,
    'volatile': TokenType.Modifier,

    'abstract': TokenType.Modifier,
    'synchronized': TokenType.Modifier,
    'native': TokenType.Modifier,
    'strictfp': TokenType.Modifier,
    'varargs': TokenType.Modifier,
    'synthetic': TokenType.Modifier,

    'static': TokenType.Modifier,
    'final': TokenType.Modifier,

    'interface': TokenType.Modifier,
    'enum': TokenType.Modifier,

    'declared-synchronized': TokenType.Modifier,
    'bridge': TokenType.Modifier
};

const JavaType: { [key: string]: string; } = {
    'V': 'void',
    'Z': 'boolean',
    'B': 'byte',
    'S': 'short',
    'C': 'char',
    'I': 'int',
    'J': 'long',
    'F': 'float',
    'D': 'double',
    'Ljava/lang/String;': 'String'
};


export class Type {
    private raw: string;
    private readable: string;

    constructor(word: string) {
        this.Raw = word;
    }

    get Raw(): string {
        return this.raw;
    }

    set Raw(word: string) {
        this.raw = word;

        let array = 0;
        while (word[array] === '[') {
            array++;
        }
        word = word.substr(array, word.length - array);

        this.readable = JavaType[word];
        if (this.readable === undefined) {
            if (word.startsWith('L') && word.endsWith(';')) {
                this.readable = word.substr(1, word.length - 2)
                                    .replace(/\//g, '.');
            } else {
                throw new Error('Not a smali type!');
            }
        }
        this.readable += '[]'.repeat(array);
    }

    get Readable(): string {
        return this.readable;
    }

    equal(type: Type): boolean {
        return this.raw === type.raw;
    }

    toString(): string {
        return this.readable;
    }
}

function ParamsEqual(types1: Array<Type>, types2: Array<Type>): boolean {
    if (types1.length !== types2.length) {
        return false;
    }
    for (let i = 0; i < types1.length; i++) {
        if (!types1[i].equal(types2[i])) {
            return false;
        }
    }
    return true;
}

export class AbstractMethod {
    Modifiers: Array<string>;
    Parameters: Array<Type>;
    Name: string;
    Range: Range;

    constructor() {
        this.Parameters = new Array<Type>();
    }
}

export class Constructor extends AbstractMethod {
    constructor() {
        super();
    }

    equal(ctor: Constructor): boolean {
        return this.Name === ctor.Name && ParamsEqual(this.Parameters, ctor.Parameters);
    }
}

export class Method extends AbstractMethod {
    ReturnType: Type;

    constructor() {
        super();
    }

    equal(method: Method): boolean {
        return this.Name === method.Name && this.ReturnType.equal(method.ReturnType) && ParamsEqual(this.Parameters, method.Parameters);
    }
}

export class Field {
    Name: string;
    Modifiers: Array<string>;
    Type: Type;
    Range: Range;
    Initial: string;

    constructor() {
        this.Modifiers = new Array<string>();
    }

    equal(field: Field): boolean {
        return (this.Name === field.Name) && this.Type.equal(field.Type);
    }
}

export class Class {
    Name: Type;
    Modifiers: Array<string>;
    Super: Type;
    Source: string;

    Implements: Array<Type>;

    Constructors: Array<Constructor>;
    Fields: Array<Field>;
    Methods: Array<Method>;

    //InnerClasses: Array<Class>;

    constructor() {
        this.Modifiers = new Array<string>();
        this.Implements = new Array<Type>();
        this.Constructors = new Array<Constructor>();
        this.Fields = new Array<Field>();
        this.Methods = new Array<Method>();
    }
}

class Document {
    text: string;
    line: number;
    char: number;
    index: number;

    constructor(text: string) {
        this.text = text;
        this.line = 0;
        this.char = 0;
        this.index = 0;
    }

    IsSpace(): boolean {
        return this.text[this.index] === ' '  ||
               this.text[this.index] === '\f' ||
               this.text[this.index] === '\r' ||
               this.text[this.index] === '\t' ||
               this.text[this.index] === '\v' ||
               this.text[this.index] === '\n';
    }

    IsLineBreak(): boolean {
        return this.text[this.index] === '\n';
    }

    SkipSpace() {
        while (this.index < this.text.length && this.IsSpace()) {
            this.ReadChar();
        }
    }

    SkipLine(): boolean {
        while (this.index < this.text.length) {
            let char = this.ReadChar();
            if (char === '\n') {
                return true;
            }
        }
        return false;
    }

    ExpectToken(word: string): boolean {
        this.SkipSpace();
        if (this.text.startsWith(word, this.index)) {
            this.index += word.length;
            this.char += word.length;
            return true;
        } else {
            return false;
        }
    }

    ReadChar(): string {
        if (this.IsLineBreak()) {
            this.line++;
            this.char = 0;
        } else {
            this.char++;
        }
        return this.text[this.index++];
    }

    ReadToken(): string {
        let word = [];
        this.SkipSpace();
        while (this.index < this.text.length) {
            if (this.IsSpace()) {
                break;
            }
            word.push(this.ReadChar());
        }
        return word.join('');
    }
}

const SwitchWord: { [key: string]: (doc: Document, jclass: Class) => void; } = {
    '#': function (doc: Document, jclass: Class) {
        doc.SkipLine();
    },
    '.implements': function (doc: Document, jclass: Class) {
        jclass.Implements.push(new Type(doc.ReadToken()));
    },
    '.annotation': function (doc: Document, jclass: Class) {
        let tdoc = { ...doc };
        while (!doc.ExpectToken('.end annotation')) {
            doc.SkipLine();
        }
        if (doc.index === doc.text.length) {
            throw new Diagnostic(
                new Range(tdoc.line, tdoc.char - 11, tdoc.line, tdoc.char),
                'Can not find ".end annotation" pair',
                DiagnosticSeverity.Hint);
        }
    },
    '.field': function (doc: Document, jclass: Class) {
        let field = new Field();
        field.Range = new Range(doc.line, 0, doc.line, 999);

        let word: string = doc.ReadToken();
        while (Tokens[word] === TokenType.Modifier) {
            field.Modifiers.push(word);
            word = doc.ReadToken();
        }

        let words = word.split(':');
        field.Name = words[0];
        field.Type = new Type(words[1]);
        jclass.Fields.push(field);
    },
    '.method': function (doc: Document, jclass: Class) {
        let method: AbstractMethod;
        let modifiers = new Array<string>();
        let position_start = new Position(doc.line, 0);

        let word: string = doc.ReadToken();
        while (Tokens[word] === TokenType.Modifier) {
            modifiers.push(word);
            word = doc.ReadToken();
        }

        if (word === 'constructor') {
            method = new Constructor();
            method.Modifiers = modifiers;

            word = doc.ReadToken();
            let match = word.match(/(<clinit>|<init>)\((.*)\)(.+)/);
            if (!match) {
                throw new Diagnostic(
                    new Range(doc.line, doc.char - word.length, doc.line, doc.char),
                    'Can not match the constructor',
                    DiagnosticSeverity.Hint);
            }

            method.Name = match[1];
            if (match[2]) {
                let typeMatches = match[2].match(/(\[*[VZBSCIJFD]|(?:L.+?;))/g);
                for (const typeMatch of typeMatches) {
                    method.Parameters.push(new Type(typeMatch));
                }
            }
        } else {
            method = new Method();
            method.Modifiers = modifiers;

            let match = word.match(/(.+)\((.*)\)(.+)/);
            if (!match) {
                throw new Diagnostic(
                    new Range(doc.line, doc.char - word.length, doc.line, doc.char),
                    'Can not match the method',
                    DiagnosticSeverity.Hint);
            }

            method.Name = match[1];
            if (match[2]) {
                let typeMatches = match[2].match(/(\[*[VZBSCIJFD]|(?:L.+?;))/g);
                for (const typeMatch of typeMatches) {
                    method.Parameters.push(new Type(typeMatch));
                }
            }
            (<Method>method).ReturnType = new Type(match[3]);
        }

        while (!doc.ExpectToken('.end method')) {
            doc.SkipLine();
        }
        if (doc.index === doc.text.length) {
            let tdoc = { ...doc };
            throw new Diagnostic(
                new Range(tdoc.line, tdoc.char - 7, tdoc.line, tdoc.char),
                'Can not find ".end method" pair',
                DiagnosticSeverity.Hint);
        }

        let position_end = new Position(doc.line, doc.char);
        method.Range = new Range(position_start, position_end);

        if (method instanceof Constructor) {
            jclass.Constructors.push(method);
        }
        if (method instanceof Method) {
            jclass.Methods.push(method);
        }
    },
};


export function ParseSmali(text: string): Class {
    let doc: Document = new Document(text);
    let jclass: Class = new Class();


    /* read header start */
    if (!doc.ExpectToken('.class')) {
        throw new Diagnostic(
            new Range(doc.line, doc.char, doc.line, doc.char + 6),
            'Expect ".class" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }

    let word: string = doc.ReadToken();
    while (Tokens[word] === TokenType.Modifier) {
        jclass.Modifiers.push(word);
        word = doc.ReadToken();
    }
    jclass.Name = new Type(word);

    if (!doc.ExpectToken('.super')) {
        throw new Diagnostic(
            new Range(doc.line, doc.char, doc.line, doc.char + 6),
            'Expect ".super" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }

    jclass.Super = new Type(doc.ReadToken());

    if (doc.ExpectToken('.source')) {
        jclass.Source = doc.ReadToken();
    }
    /* read header end */


    while (doc.index < doc.text.length) {
        let range_start = new Position(doc.line, doc.char);
        let next_word = doc.ReadToken();
        try {
            if (SwitchWord[next_word] !== undefined) {
                SwitchWord[next_word](doc, jclass);
            }
        } catch (err) {
            if (err instanceof Diagnostic) {
                throw err;
            } else {
                let range_end = new Position(doc.line, doc.char);
                throw new Diagnostic(
                    new Range(range_start.line, range_start.character, range_end.line, range_end.character),
                    `Parse error: ${err}, please contact the developer.`,
                    DiagnosticSeverity.Hint);
            }
        }
    }

    return jclass;
}

export class JString {
    value: string;
    constructor(v: string) {
        this.value = v;
    }
}

export function SpotPosition(textDocument: TextDocument, position: Position): {
    spot: Type | Field | Constructor | Method | JString,
    range: Range
} {
    let line = textDocument.lineAt(position.line);
    let character = position.character;

    let str = AsString(textDocument, position);
    if (str) {
        return str;
    }

    let type = AsType(textDocument, position);
    if (type) {
        return type;
    }

    let field = AsField(textDocument, position);
    if (field) {
        field.field.Name = field.owner.Readable + '.' + field.field.Name;
        return {
            spot: field.field,
            range: field.field.Range
        };
    }

    let method = AsMethod(textDocument, position);
    if (method) {
        if (method.spot instanceof Constructor) {
            method.spot.Name = 'new ' + method.owner.Readable;
        } else {
            method.spot.Name = method.owner.Readable + '.' + method.spot.Name;
        }
        return method;
    }

    let myfield = AsMyField(textDocument, position);
    if (myfield) {
        return {
            spot: myfield,
            range: line.range
        };
    }

    let mymethod = AsMyMethod(textDocument, position);
    if (mymethod) {
        if (mymethod instanceof Constructor || mymethod instanceof Method) {
            return {
                spot: mymethod,
                range: line.range
            };
        }
    }

    return null;

}

const strRegexExp    = /(".*?")/;
const typeRegexExp   = /(\[*[VZBSCIJFD]|\[*L[\w\$\/]+?;)/;
const typesRegexExp  = /(\[*[VZBSCIJFD]|\[*L[\w\$\/]+?;)/g;
const fieldRegexExp  = /(\[*[VZBSCIJFD]|\[*L[\w\$\/]+?;)->([\w\$]+?):(\[*[VZBSCIJFD]|\[*L[\w\$\/]+?;)/;
const methodRegexExp = /(\[*[VZBSCIJFD]|\[*L[\w\$\/]+?;)->([\w\$]+?|<init>|<clinit>)\((.*?)\)(\[*[VZBSCIJFD]|\[*L[\w\$\/]+?;)/;

export function AsString(textDocument: TextDocument, position: Position): { spot: JString, range: Range } {
    let range = textDocument.getWordRangeAtPosition(position, strRegexExp);
    if (!range) {
        return null;
    }
    let text = textDocument.getText(range);
    return { spot: new JString(unescape(text.replace(/\\u/g, '%u'))), range: range };
}

export function AsType(textDocument: TextDocument, position: Position): { spot: Type, range: Range } {
    let range = textDocument.getWordRangeAtPosition(position, typeRegexExp);
    if (!range) {
        return null;
    }
    let text = textDocument.getText(range);
    return { spot: new Type(text), range: range };
}

export function AsField(textDocument: TextDocument, position: Position): { owner: Type, field: Field } {
    let range = textDocument.getWordRangeAtPosition(position, fieldRegexExp);
    if (!range) {
        return null;
    }
    let text = textDocument.getText(range);

    let match = text.match(fieldRegexExp);
    let field = new Field();
    field.Range = range;
    field.Name = match[2];
    field.Type = new Type(match[3]);

    return { owner: new Type(match[1]), field: field };
}

export function AsMethod(textDocument: TextDocument, position: Position): { owner: Type, spot: Constructor | Method, range: Range } {
    let range = textDocument.getWordRangeAtPosition(position, methodRegexExp);
    if (!range) {
        return null;
    }
    let text = textDocument.getText(range);

    let match = text.match(methodRegexExp);
    if (!match) {
        return null;
    }

    let method: Constructor | Method;
    if (match[2] === '<init>' || match[2] === '<clinit>') {
        method = new Constructor();
    } else {
        method = new Method();
        (<Method>method).ReturnType = new Type(match[4]);
    }

    method.Name = match[2];
    if (match[3]) {
        let typeMatches = match[3].match(typesRegexExp);
        for (const typeMatch of typeMatches) {
            method.Parameters.push(new Type(typeMatch));
        }
    }

    return { owner: new Type(match[1]), spot: method, range: range };
}

export function AsMyMethod(textDocument: TextDocument, position: Position): AbstractMethod {
    let doc = new Document(textDocument.lineAt(position).text);
    if (!doc.ExpectToken('.method')) {
        return null;
    }

    let method: AbstractMethod;
    let modifiers = new Array<string>();

    let word: string = doc.ReadToken();
    while (Tokens[word] === TokenType.Modifier) {
        modifiers.push(word);
        word = doc.ReadToken();
    }

    if (word === 'constructor') {
        method = new Constructor();
        method.Modifiers = modifiers;

        word = doc.ReadToken();
        let match = word.match(/(<clinit>|<init>)\((.*)\)(.+)/);
        if (!match) {
            return null;
        }

        method.Name = ParseTextDocument(textDocument).Name.Readable;
        if (match[2]) {
            let typeMatches = match[2].match(typesRegexExp);
            for (const typeMatch of typeMatches) {
                method.Parameters.push(new Type(typeMatch));
            }
        }
    } else {
        method = new Method();
        method.Modifiers = modifiers;

        let match = word.match(/(.+)\((.*)\)(.+)/);
        if (!match) {
            return null;
        }

        method.Name = match[1];
        if (match[2]) {
            let typeMatches = match[2].match(typesRegexExp);
            for (const typeMatch of typeMatches) {
                method.Parameters.push(new Type(typeMatch));
            }
        }
        (<Method>method).ReturnType = new Type(match[3]);
    }

    return method;
}

export function AsMyField(textDocument: TextDocument, position: Position): Field {
    let doc = new Document(textDocument.lineAt(position).text);
    if (!doc.ExpectToken('.field')) {
        return null;
    }
    let field = new Field();

    let word: string = doc.ReadToken();
    while (Tokens[word] === TokenType.Modifier) {
        field.Modifiers.push(word);
        word = doc.ReadToken();
    }

    let words = word.split(':');
    field.Name = words[0];
    field.Type = new Type(words[1]);

    if (!doc.ExpectToken('=')) {
        return field;
    }

    field.Initial = doc.ReadToken();
    return field;
}