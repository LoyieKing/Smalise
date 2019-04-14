"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const extension_1 = require("./extension");
var TokenType;
(function (TokenType) {
    TokenType[TokenType["Modifier"] = 0] = "Modifier";
    TokenType[TokenType["string"] = 1] = "string";
})(TokenType || (TokenType = {}));
const Tokens = {
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
const JavaType = {
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
class Type {
    constructor(word) {
        this.Raw = word;
    }
    get Raw() {
        return this.raw;
    }
    set Raw(word) {
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
    get Readable() {
        return this.readable;
    }
    equal(type) {
        return this.raw === type.raw;
    }
    toString() {
        return this.readable;
    }
}
exports.Type = Type;
function ParamsEqual(types1, types2) {
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
class AbstractMethod {
    constructor() {
        this.Parameters = new Array();
    }
}
exports.AbstractMethod = AbstractMethod;
class Constructor extends AbstractMethod {
    constructor() {
        super();
    }
    equal(ctor) {
        return this.Name === ctor.Name && ParamsEqual(this.Parameters, ctor.Parameters);
    }
}
exports.Constructor = Constructor;
class Method extends AbstractMethod {
    constructor() {
        super();
    }
    equal(method) {
        return this.Name === method.Name && this.ReturnType.equal(method.ReturnType) && ParamsEqual(this.Parameters, method.Parameters);
    }
}
exports.Method = Method;
class Filed {
    constructor() {
        this.Modifiers = new Array();
    }
    equal(field) {
        if (this.Name === field.Name &&
            this.Type.equal(field.Type)) {
            return true;
        }
        return false;
    }
}
exports.Filed = Filed;
class Class {
    //InnerClasses: Array<Class>;
    constructor() {
        this.Modifiers = new Array();
        this.Implements = new Array();
        this.Constructors = new Array();
        this.Fileds = new Array();
        this.Methods = new Array();
    }
}
exports.Class = Class;
class Document {
    constructor(text) {
        this.text = text;
        this.line = 0;
        this.char = 0;
        this.index = 0;
    }
    ExpectWord(word) {
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
    IsEmpty() {
        if (this.text[this.index] === ' ' ||
            this.text[this.index] === '\f' ||
            this.text[this.index] === '\r' ||
            this.text[this.index] === '\t' ||
            this.text[this.index] === '\v') {
            return true;
        }
        return false;
    }
    IsLineBreak() {
        return this.text[this.index] === '\n';
    }
    ReadNext() {
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
    JumpLine() {
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
const SwitchWord = {
    '#': function (doc, jclass) {
        doc.JumpLine();
    },
    '.implements': function (doc, jclass) {
        jclass.Implements.push(new Type(doc.ReadNext()));
    },
    '.annotation': function (doc, jclass) {
        let tdoc = Object.assign({}, doc);
        while (!doc.ExpectWord('.end annotation')) {
            doc.JumpLine();
        }
        if (doc.index === doc.text.length) {
            let diag = new vscode_1.Diagnostic(new vscode_1.Range(tdoc.line, tdoc.char - 11, tdoc.line, tdoc.char), 'Can not find ".end annotation" pair', vscode_languageclient_1.DiagnosticSeverity.Hint);
            throw diag;
        }
    },
    '.field': function (doc, jclass) {
        let field = new Filed();
        field.Range = new vscode_1.Range(doc.line, 0, doc.line, 999);
        let word;
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
    '.method': function (doc, jclass) {
        let method;
        let modifiers = new Array();
        let position_start = new vscode_1.Position(doc.line, 0);
        let word;
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
                let diag = new vscode_1.Diagnostic(new vscode_1.Range(doc.line, doc.char - word.length, doc.line, doc.char), 'Can not match the constructor', vscode_languageclient_1.DiagnosticSeverity.Hint);
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
                let diag = new vscode_1.Diagnostic(new vscode_1.Range(doc.line, doc.char - word.length, doc.line, doc.char), 'Can not match the method', vscode_languageclient_1.DiagnosticSeverity.Hint);
                throw diag;
            }
            method.Name = match[1];
            if (match[2]) {
                let typeMatches = match[2].match(/(\[*[VZBSCIJFD]|(?:L.+?;))/g);
                for (const typeMatch of typeMatches) {
                    method.Parameters.push(new Type(typeMatch));
                }
            }
            method.ReturnType = new Type(match[3]);
        }
        while (!doc.ExpectWord('.end method')) {
            doc.JumpLine();
        }
        if (doc.index === doc.text.length) {
            let tdoc = Object.assign({}, doc);
            let diag = new vscode_1.Diagnostic(new vscode_1.Range(tdoc.line, tdoc.char - 7, tdoc.line, tdoc.char), 'Can not find ".end method" pair', vscode_languageclient_1.DiagnosticSeverity.Hint);
            throw diag;
        }
        let position_end = new vscode_1.Position(doc.line, doc.char);
        method.Range = new vscode_1.Range(position_start, position_end);
        if (method instanceof Constructor) {
            jclass.Constructors.push(method);
        }
        else if (method instanceof Method) {
            jclass.Methods.push(method);
        }
    },
};
function ParseSmali(text) {
    let doc = new Document(text);
    let jclass = new Class();
    /*read header start*/
    if (!doc.ExpectWord('.class')) {
        let diag = new vscode_1.Diagnostic(new vscode_1.Range(doc.line, doc.char, doc.line, doc.char + 6), 'Expect ".class" here,the file may not be a standard smali file.', vscode_languageclient_1.DiagnosticSeverity.Hint);
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
        let diag = new vscode_1.Diagnostic(new vscode_1.Range(doc.line, doc.char, doc.line, doc.char + 6), 'Expect ".super" here,the file may not be a standard smali file.', vscode_languageclient_1.DiagnosticSeverity.Hint);
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
            let diag = new vscode_1.Diagnostic(new vscode_1.Range(doc.line, doc.char - next_word.length, doc.line, doc.char), `Parse error:${err.message},please contact the developer.`, vscode_languageclient_1.DiagnosticSeverity.Hint);
            throw diag;
        }
    }
    return jclass;
}
exports.ParseSmali = ParseSmali;
class JString {
    constructor(v) {
        this.value = v;
    }
}
exports.JString = JString;
function SpotPosition(textDocument, position) {
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
        }
        else {
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
exports.SpotPosition = SpotPosition;
const typeRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/;
const typesRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/g;
const wordRegxExp = /[a-zA-Z_\$][a-zA-Z_\$\d]*/;
const fieldRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))->([a-zA-Z_\$\d]+?):(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/;
const methodRegexExp = /(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))->([a-zA-Z_\$\d]+?|<init>|<clinit>)\((.*?)\)(\[*[VZBSCIJFD]|(?:L[a-zA-Z_\$\d/]+?;))/;
function AsString(textDocument, position) {
    let strrange = textDocument.getWordRangeAtPosition(position, /(".*?")/);
    if (!strrange) {
        return null;
    }
    let str = textDocument.getText(strrange);
    return { spot: new JString(unescape(str.replace(/\\u/g, '%u'))), range: strrange };
}
exports.AsString = AsString;
function AsType(textDocument, position) {
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
exports.AsType = AsType;
function AsField(textDocument, position) {
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
exports.AsField = AsField;
function AsMethod(textDocument, position) {
    let trange = textDocument.getWordRangeAtPosition(position, methodRegexExp);
    if (!trange) {
        return null;
    }
    let tword = textDocument.getText(trange);
    let match = tword.match(methodRegexExp);
    if (!match) {
        return null;
    }
    let method;
    let type;
    if (match[2] === '<init>' || match[2] === '<clinit>') {
        method = new Constructor();
    }
    else {
        method = new Method();
        method.ReturnType = new Type(match[4]);
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
exports.AsMethod = AsMethod;
function AsMyMethod(textDocument, position) {
    let doc = new Document(textDocument.lineAt(position).text);
    if (!doc.ExpectWord('.method')) {
        return null;
    }
    let method;
    let modifiers = new Array();
    let position_start = new vscode_1.Position(doc.line, 0);
    let word;
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
        method.Name = extension_1.ParseTextDocument(textDocument).Name.Readable;
        //method.Name = match[1];
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
            return null;
        }
        method.Name = match[1];
        if (match[2]) {
            let typeMatches = match[2].match(/(\[*[VZBSCIJFD]|(?:L.+?;))/g);
            for (const typeMatch of typeMatches) {
                method.Parameters.push(new Type(typeMatch));
            }
        }
        method.ReturnType = new Type(match[3]);
    }
    return method;
}
exports.AsMyMethod = AsMyMethod;
function AsMyFied(textDocument, position) {
    let doc = new Document(textDocument.lineAt(position).text);
    if (!doc.ExpectWord('.field')) {
        return null;
    }
    let field = new Filed();
    let word;
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
exports.AsMyFied = AsMyFied;
//# sourceMappingURL=language.js.map