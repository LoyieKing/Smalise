

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
                this.readable =
                    word.substr(1, word.length - 2)
                        .replace(/\//g, '.');
            }
            else {
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

export class Filed {
    Name: string;
    Modifiers: Array<string>;
    Type: Type;
    Range: Range;
    Initial: string;

    constructor() {
        this.Modifiers = new Array<string>();
    }

    equal(field: Filed): boolean {
        if (this.Name === field.Name &&
            this.Type.equal(field.Type)
        ) {
            return true;
        }
        return false;
    }
}

export class Class {
    Name: Type;
    Modifiers: Array<string>;
    Super: Type;
    Source: string;

    Implements: Array<Type>;

    Constructors: Array<Constructor>;
    Fileds: Array<Filed>;
    Methods: Array<Method>;

    //InnerClasses: Array<Class>;

    constructor() {
        this.Modifiers = new Array<string>();
        this.Implements = new Array<Type>();
        this.Constructors = new Array<Constructor>();
        this.Fileds = new Array<Filed>();
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

    ExpectWord(word: string): boolean {
        while (this.index < this.text.length) {
            if (this.IsEmpty()) {
                this.char++;
            }
            else if (this.IsLineBreak()) {
                this.line++;
                this.char = 0;
            }
            else if (this.text.startsWith(word, this.index)) {
                this.index += word.length;
                this.char += word.length;
                return true;
            }
            else {
                return false;
            }
            this.index++;
        }
        return false;
    }

    IsEmpty(): boolean {
        if (this.text[this.index] === ' ' ||
            this.text[this.index] === '\f' ||
            this.text[this.index] === '\r' ||
            this.text[this.index] === '\t' ||
            this.text[this.index] === '\v') {
            return true;
        }
        return false;
    }

    IsLineBreak(): boolean {
        return this.text[this.index] === '\n';
    }

    ReadNext(): string {
        let word = [];
        while (this.index < this.text.length) {
            if (this.IsEmpty()) {
                this.char++;
                this.index++;
            }
            else if (this.IsLineBreak()) {
                this.char = 0;
                this.line++;
                this.index++;
            }
            else {
                break;
            }
        }
        while (this.index < this.text.length) {
            if (this.IsEmpty() || this.IsLineBreak()) {
                break;
            }
            else {
                word.push(this.text[this.index]);
                this.char++;
                this.index++;
            }
        }
        return word.join('');
    }

    JumpLine(): boolean {
        while (this.index < this.text.length) {
            if (this.text[this.index] === '\n') {
                this.char++;
                this.index++;
                this.line++;
                return true;
            }
            else {
                this.char++;
                this.index++;
            }
        }
        return false;
    }
}

const SwitchWord: { [key: string]: (doc: Document, jclass: Class) => void; } = {
    '#': function (doc: Document, jclass: Class) {
        doc.JumpLine();
    },
    '.implements': function (doc: Document, jclass: Class) {
        jclass.Implements.push(new Type(doc.ReadNext()));
    },
    '.annotation': function (doc: Document, jclass: Class) {
        let tdoc = { ...doc };
        while (!doc.ExpectWord('.end annotation')) {
            doc.JumpLine();
        }
        if (doc.index === doc.text.length) {
            let diag: Diagnostic = new Diagnostic(
                new Range(tdoc.line, tdoc.char - 11, tdoc.line, tdoc.char),
                'Can not find ".end annotation" pair',
                DiagnosticSeverity.Hint);
            throw diag;
        }
    },
    '.field': function (doc: Document, jclass: Class) {
        let field = new Filed();
        field.Range = new Range(doc.line, 0, doc.line, 999);
        let word: string;

        while (true) {
            word = doc.ReadNext();
            if (Tokens[word] === TokenType.Modifier) {
                field.Modifiers.push(word);
            }
            else {
                break;
            }
        }

        let words = word.split(':');
        field.Name = words[0];
        field.Type = new Type(words[1]);
        jclass.Fileds.push(field);
    },
    '.method': function (doc: Document, jclass: Class) {
        let method: AbstractMethod;
        let modifiers = new Array<string>();
        let position_start = new Position(doc.line, 0);
        let word: string;

        while (true) {
            word = doc.ReadNext();
            if (Tokens[word] === TokenType.Modifier) {
                modifiers.push(word);
            }
            else {
                break;
            }
        }

        if (word === 'constructor') {
            method = new Constructor();
            method.Modifiers = modifiers;
            word = doc.ReadNext();
            let match = word.match(/(<clinit>|<init>)\((.*)\)(.+)/);
            if (!match) {
                let diag: Diagnostic = new Diagnostic(
                    new Range(doc.line, doc.char - word.length, doc.line, doc.char),
                    'Can not match the constructor',
                    DiagnosticSeverity.Hint);
                throw diag;
            }
            method.Name = match[1];

            if (match[2]) {
                let typeMatches = match[2].match(/(\[*[VZBSCIJFD]|(?:L.+?;))/g);
                for (const typeMatch of typeMatches) {
                    method.Parameters.push(new Type(typeMatch));
                }

            }


        }
        else {
            method = new Method();
            method.Modifiers = modifiers;
            let match = word.match(/(.+)\((.*)\)(.+)/);
            if (!match) {
                let diag: Diagnostic = new Diagnostic(
                    new Range(doc.line, doc.char - word.length, doc.line, doc.char),
                    'Can not match the method',
                    DiagnosticSeverity.Hint);
                throw diag;
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
        while (!doc.ExpectWord('.end method')) {
            doc.JumpLine();
        }
        if (doc.index === doc.text.length) {
            let tdoc = { ...doc };
            let diag: Diagnostic = new Diagnostic(
                new Range(tdoc.line, tdoc.char - 7, tdoc.line, tdoc.char),
                'Can not find ".end method" pair',
                DiagnosticSeverity.Hint);
            throw diag;
        }
        let position_end = new Position(doc.line, doc.char);
        method.Range = new Range(position_start, position_end);

        if (method instanceof Constructor) {
            jclass.Constructors.push(method);
        }
        else if (method instanceof Method) {
            jclass.Methods.push(method);
        }
    },


};


export function ParseSmali(text: string): Class {
    let doc: Document = new Document(text);
    let jclass: Class = new Class();



    /*read header start*/
    if (!doc.ExpectWord('.class')) {
        let diag: Diagnostic = new Diagnostic(
            new Range(doc.line, doc.char, doc.line, doc.char + 6),
            'Expect ".class" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
        throw diag;
    }


    while (true) {
        let word = doc.ReadNext();
        if (Tokens[word] === TokenType.Modifier) {
            jclass.Modifiers.push(word);
        }
        else {
            jclass.Name = new Type(word);
            break;
        }
    }

    if (!doc.ExpectWord('.super')) {
        let diag: Diagnostic = new Diagnostic(
            new Range(doc.line, doc.char, doc.line, doc.char + 6),
            'Expect ".super" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
        throw diag;
    }

    jclass.Super = new Type(doc.ReadNext());

    if (doc.ExpectWord('.source')) {
        jclass.Source = doc.ReadNext();
    }

    /*read head end */


    while (doc.index < doc.text.length) {
        let next_word = doc.ReadNext();
        try {
            if (SwitchWord[next_word] !== undefined) {
                SwitchWord[next_word](doc, jclass);
            }
        }
        catch (err) {
            let diag: Diagnostic = new Diagnostic(
                new Range(doc.line, doc.char - next_word.length, doc.line, doc.char),
                `Parse error:${err.message},please contact the developer.`,
                DiagnosticSeverity.Hint);
            throw diag;
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
    spot: Type | Filed | Constructor | Method | JString,
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
        field.field.Name = field.type.Readable + '.' + field.field.Name;
        return {
            spot: field.field,
            range: field.field.Range
        };
    }

    let method = AsMethod(textDocument, position);
    if (method) {
        if (method.spot instanceof Constructor) {
            method.spot.Name = 'new ' + method.type.Readable;
        } else {
            method.spot.Name = method.type.Readable + '.' + method.spot.Name;
        }
        return method;
    }


    let myfield = AsMyFied(textDocument, position);
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


const typeRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/;
const typesRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/g;
const wordRegxExp = /[a-zA-Z_\$][a-zA-Z_\$\d]*/;
const fieldRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))->([a-zA-Z_\$\d]+?):(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/;
const methodRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))->([a-zA-Z_\$\d]+?|<init>|<clinit>)\((.*?)\)(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/;

export function AsString(textDocument: TextDocument, position: Position): { spot: JString, range: Range } {
    let strrange = textDocument.getWordRangeAtPosition(position, /(".*?")/);
    if (!strrange) {
        return null;
    }
    let str = textDocument.getText(strrange);
    return { spot: new JString(unescape(str.replace(/\\u/g, '%u'))), range: strrange };
}

export function AsType(textDocument: TextDocument, position: Position): { spot: Type, range: Range } {
    let wordrange = textDocument.getWordRangeAtPosition(position, wordRegxExp);
    if (textDocument
        .getText(wordrange)
        .match(/[^VZBSCIJFD]/)) {

        let trange = textDocument.getWordRangeAtPosition(position, /(L[a-zA-Z_\$\d/]+?;)/);
        if (!trange) {
            return null;
        }
        let tword = textDocument.getText(trange);

        return {
            spot: new Type(tword),
            range: trange
        };
    }
    else {
        let trange = textDocument.getWordRangeAtPosition(position, /[VZBSCIJFD]/);
        if (!trange) {
            return null;
        }
        let tword = textDocument.getText(trange);

        return {
            spot: new Type(tword),
            range: trange
        };
    }

    // let fieldrange = textDocument.getWordRangeAtPosition(position, fieldRegexExp);

    // if (textDocument
    //     .getText(fieldrange)
    //     .match(fieldRegexExp)[2]
    //     === textDocument.getText(wordrange)) {
    //     return null;
    // }

}

export function AsField(textDocument: TextDocument, position: Position): { field: Filed, type: Type } {

    let trange = textDocument.getWordRangeAtPosition(position, fieldRegexExp);
    if (!trange) {
        return null;
    }
    let tword = textDocument.getText(trange);
    let match = tword.match(fieldRegexExp);
    let field = new Filed();
    field.Name = match[2];
    field.Range = trange;
    field.Type = new Type(match[3]);

    return { field: field, type: new Type(match[1]) };
}

export function AsMethod(textDocument: TextDocument, position: Position): { type: Type, spot: Constructor | Method, range: Range } {
    let trange = textDocument.getWordRangeAtPosition(position, methodRegexExp);
    if (!trange) {
        return null;
    }
    let tword = textDocument.getText(trange);

    let match = tword.match(methodRegexExp);
    if (!match) {
        return null;
    }
    let method: Constructor | Method;
    let type: Type;

    if (match[2] === '<init>' || match[2] === '<clinit>') {
        method = new Constructor();
    }
    else {
        method = new Method();
        (<Method>method).ReturnType = new Type(match[4]);
    }
    method.Name = match[2];
    type = new Type(match[1]);

    if (match[3]) {
        let typeMatches = match[3].match(typesRegexExp);
        for (const typeMatch of typeMatches) {
            method.Parameters.push(new Type(typeMatch));
        }
    }
    return { type: type, spot: method, range: trange };
}

export function AsMyMethod(textDocument: TextDocument, position: Position): AbstractMethod {
    let doc = new Document(textDocument.lineAt(position).text);
    if (!doc.ExpectWord('.method')) {
        return null;
    }


    let method: AbstractMethod;
    let modifiers = new Array<string>();
    let position_start = new Position(doc.line, 0);
    let word: string;

    while (true) {
        word = doc.ReadNext();
        if (Tokens[word] === TokenType.Modifier) {
            modifiers.push(word);
        }
        else {
            break;
        }
    }

    if (word === 'constructor') {
        method = new Constructor();
        method.Modifiers = modifiers;
        word = doc.ReadNext();
        let match = word.match(/(<clinit>|<init>)\((.*)\)(.+)/);
        if (!match) {
            return null;
        }
        method.Name = ParseTextDocument(textDocument).Name.Readable;
        //method.Name = match[1];

        if (match[2]) {
            let typeMatches = match[2].match(/(\[*[VZBSCIJFD]|(?:L.+?;))/g);
            for (const typeMatch of typeMatches) {
                (<Constructor>method).Parameters.push(new Type(typeMatch));
            }

        }

    }
    else {
        method = new Method();
        method.Modifiers = modifiers;
        let match = word.match(/(.+)\((.*)\)(.+)/);
        if (!match) {
            return null;
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

    return method;
}

export function AsMyFied(textDocument: TextDocument, position: Position): Filed {
    let doc = new Document(textDocument.lineAt(position).text);
    if (!doc.ExpectWord('.field')) {
        return null;
    }
    let field = new Filed();
    let word: string;

    while (true) {
        word = doc.ReadNext();
        if (Tokens[word] === TokenType.Modifier) {
            field.Modifiers.push(word);
        }
        else {
            break;
        }
    }

    let words = word.split(':');
    field.Name = words[0];
    field.Type = new Type(words[1]);

    if (!doc.ExpectWord('=')) {
        return field;
    }

    field.Initial = doc.ReadNext();
    return field;
}