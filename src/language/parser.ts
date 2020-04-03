import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument, TextLine } from 'vscode';
import { DalvikModifiers, JavaPrimitiveTypes } from './literals';
import {
    Type, PrimitiveType, ReferenceType, ArrayType,
    TextRange, Field, Method, Class
} from './structs';

const regex = {
    ClassName:       /\.class.*?(L[\w\$\/]+;)/,
    String:          /(".*?")/,
    Type:            /\[*(?:[VZBSCIJFD]|L[\w\$\/]+)/,
    Types:           /\[*(?:[VZBSCIJFD]|L[\w\$\/]+)/g,
    ClassReference:  /L[\w\$\/]+/,
    FieldReference:  /L[\w\$\/]+;->[\w\$]+:\[*(?:[VZBSCIJFD]|L[\w\$\/]+;)/,
    MethodReference: /L[\w\$\/]+;->(?:[\w\$]+|<init>|<clinit>)\(.*?\)\[*(?:[VZBSCIJFD]|L[\w\$\/]+;)/
};

class Parser {
    document: TextDocument;
    text: string;
    offset: number;

    constructor(document: TextDocument, position: Position = new Position(0, 0)) {
        this.document = document;
        this.text = document.getText();
        this.offset = document.offsetAt(position);
    }

    get position(): Position {
        return this.document.positionAt(this.offset);
    }

    get line(): TextLine {
        return this.document.lineAt(this.position.line);
    }

    moveTo(offset: number) {
        this.offset = offset;
    }

    skipSpace() {
        let dest = this.text.substr(this.offset).search(/\S/);
        if (dest !== -1) {
            this.moveTo(this.offset + dest);
        }
    }

    skipLine() {
        let EOL = this.text.indexOf('\n', this.offset);
        if (EOL !== -1) {
            this.moveTo(EOL + 1);
        } else {
            this.moveTo(this.text.length - 1);
        }
    }

    peekChar(): string { return this.text[this.offset]; }

    readChar(): string { return this.text[this.offset++]; }

    expectToken(token: string): boolean {
        this.skipSpace();

        if (this.text.startsWith(token, this.offset)) {
            this.moveTo(this.offset + token.length);
            return true;
        } else {
            return false;
        }
    }

    readToken(pattern: RegExp = /\S+/): TextRange {
        let match = this.text.substr(this.offset).match(pattern);
        if (!match) {
            return null;
        }
        this.moveTo(this.offset + match.index);
        let start = this.position;
        this.moveTo(this.offset + match[0].length);
        let end   = this.position;
        return new TextRange(match[0], new Range(start, end));
    }

    readTokenUntil(separator: string): TextRange {
        this.skipSpace();

        let EOL = this.text.indexOf('\n', this.offset);
        if (EOL === -1) {
            EOL = this.text.length - 1;
        }
        let line = this.text.substring(this.offset, EOL);
        let dest = line.indexOf(separator);
        if (dest === -1) {
            throw new Diagnostic(
                new Range(this.position, this.document.positionAt(EOL)),
                'Expect separator \'' + separator + '\' here.',
                DiagnosticSeverity.Warning
            );
        }
        let start = this.document.positionAt(this.offset);
        let end   = this.document.positionAt(this.offset + dest);

        this.moveTo(this.offset + dest + separator.length); // skip separator for next read.
        return new TextRange(line.substring(0, dest), new Range(start, end));
    }

    readType(): Type {
        let start = this.position;

        let array: number = 0;
        while (this.expectToken('[')) { array++; }
        if (array > 0) {
            let type = this.readType();
            return new ArrayType(new Range(start, type.range.end), type, array);
        }

        let char: string = this.peekChar();
        if (char in JavaPrimitiveTypes) {
            this.moveTo(this.offset + 1);
            return new PrimitiveType(char, new Range(start, this.position));
        }
        if (char === 'L') {
            let match = this.text.substr(this.offset).match(regex.ClassReference);
            if (match && match.index === 0) {
                this.moveTo(this.offset + match[0].length);
                return new ReferenceType(match[0], new Range(start, this.position));
            }
        }
        throw new Diagnostic(this.line.range, 'Incomplete type identifier.', DiagnosticSeverity.Warning);
    }

    // Read a field definition string after '.field' keyword.
    readFieldDefinition(): Field {
        // TODO: read annotation for generic types?
        let range = this.line.range;

        let modifiers = new Array<string>();
        let token = this.readToken();
        while (token !== null && token.text in DalvikModifiers) {
            modifiers.push(token.text);
            token = this.readToken();
        }
        if (token === null) {
            throw new Diagnostic(range, 'Incomplete field definition.', DiagnosticSeverity.Warning);
        }
        this.moveTo(this.offset - token.length);

        let name = this.readTokenUntil(':');
        let type = this.readType();

        let initial: TextRange;
        if (this.expectToken('=')) {
            initial = this.readToken();
            if (initial === null) {
                throw new Diagnostic(range, 'Expect initial value after =.', DiagnosticSeverity.Warning);
            }
        }

        return new Field(range, modifiers, name, type, initial);
    }

    // Read a method definition string after '.method' keyword.
    readMethodDefinition(): Method {
        // TODO: read annotation for generic types?
        let range = this.line.range;

        let modifiers = new Array<string>();
        let token = this.readToken();
        while (token !== null && token.text in DalvikModifiers) {
            modifiers.push(token.text);
            token = this.readToken();
        }
        if (token === null) {
            throw new Diagnostic(range, 'Incomplete method definition.', DiagnosticSeverity.Warning);
        }
        this.moveTo(this.offset - token.length);

        let name = this.readTokenUntil('(');
        let parameters = new Array<Type>();
        while (!this.expectToken(')')) {
            parameters.push(this.readType());
        }
        let returnType = this.readType();

        return new Method(range, modifiers, name, parameters, returnType);
    }

    readFieldReference(): { owner: ReferenceType, field: Field } {
        let start = this.position;
        let owner = <ReferenceType>this.readType();
        if (!this.expectToken('->')) {
            throw new Diagnostic(
                new Range(this.position, this.position.translate(0, 2)),
                'Expect -> after ' + owner.toString(),
                DiagnosticSeverity.Warning);
        }
        let name = this.readTokenUntil(':');
        let type = this.readType();
        let end = this.position;

        let range: Range = new Range(start, end);
        return { owner: owner, field: new Field(range, undefined, name, type, undefined) };
    }

    readMethodReference(): { owner: ReferenceType, method: Method } {
        let start = this.position;
        let owner = <ReferenceType>this.readType();
        if (!this.expectToken('->')) {
            throw new Diagnostic(
                new Range(this.position, this.position.translate(0, 2)),
                'Expect -> after ' + owner.toString(),
                DiagnosticSeverity.Warning);
        }
        let name = this.readTokenUntil('(');
        let parameters = Array<Type>();
        while (!this.expectToken(')')) {
            parameters.push(this.readType());
        }
        let returnType = this.readType();
        let end = this.position;

        let range: Range = new Range(start, end);
        return { owner: owner, method: new Method(range, undefined, name, parameters, returnType) };
    }
}

const triggers: { [keyword: string]: (parser: Parser, jclass: Class) => void; } = {
    '#': function (parser: Parser, jclass: Class) {
        parser.skipLine();
    },
    '.implements': function (parser: Parser, jclass: Class) {
        let type = parser.readType();
        jclass.implements.push(type);
    },
    '.annotation': function (parser: Parser, jclass: Class) {
        let start = new Position(parser.position.line, 0);
        while (!parser.expectToken('.end annotation')) {
            parser.skipLine();
        }
        let end = parser.position;
        if (parser.offset === parser.text.length) {
            throw new Diagnostic(
                new Range(start, end),
                'Can not find ".end annotation" pair',
                DiagnosticSeverity.Error);
        }
    },
    '.field': function (parser: Parser, jclass: Class) {
        let field = parser.readFieldDefinition();
        jclass.fields.push(field);
    },
    '.method': function (parser: Parser, jclass: Class) {
        let start = new Position(parser.position.line, 0);
        // Read method definition
        let method = parser.readMethodDefinition();
        if (method.isConstructor) {
            jclass.constructors.push(method);
        } else {
            jclass.methods.push(method);
        }
        // Read method body
        while (!parser.expectToken('.end method')) {
            parser.skipLine();
        }

        let end = parser.position;
        if (parser.offset === parser.text.length) {
            throw new Diagnostic(
                new Range(start, end),
                'Can not find ".end method" pair',
                DiagnosticSeverity.Error);
        }
    },
};

export function parseSmaliDocument(document: TextDocument): Class {
    let parser: Parser = new Parser(document);
    let jclass: Class = new Class(document.uri);


    /* read header start */
    if (!parser.expectToken('.class')) {
        throw new Diagnostic(
            new Range(parser.position, parser.position.translate(0, 6)),
            'Expect ".class" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }
    let token = parser.readToken();
    while (token !== null && token.text in DalvikModifiers) {
        jclass.modifiers.push(token.text);
        token = parser.readToken();
    }
    if (token === null) {
        throw new Diagnostic(parser.line.range, 'Incomplete class definition.', DiagnosticSeverity.Warning);
    }
    parser.moveTo(parser.offset - token.length);
    jclass.name = parser.readType();

    if (!parser.expectToken('.super')) {
        throw new Diagnostic(
            new Range(parser.position, parser.position.translate(0, 6)),
            'Expect ".super" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }
    jclass.super = parser.readType();

    if (parser.expectToken('.source')) {
        jclass.source = parser.readToken();
        if (jclass.source === null) {
            throw new Diagnostic(parser.line.range, 'Incomplete .source information.', DiagnosticSeverity.Warning);
        }
    }
    /* read header end */


    while (parser.offset < parser.text.length) {
        let token = parser.readToken();
        if (triggers[token.text] !== undefined) {
            triggers[token.text](parser, jclass);
        }
    }

    return jclass;
}

export function findClassName(document: TextDocument): string {
    let match = document.lineAt(0).text.match(regex.ClassName);
    if (!match) {
        return null;
    }
    return match[1];
}

export function findString(document: TextDocument, position: Position): TextRange {
    let range = document.getWordRangeAtPosition(position, regex.String);
    if (!range) {
        return null;
    }
    let text = document.getText(range);
    return new TextRange(text, range);
}

export function findType(document: TextDocument, position: Position): Type {
    let range = document.getWordRangeAtPosition(position, regex.Type);
    if (!range) {
        return null;
    }

    // Check if the primitive type we just matched is merely a capital letter in arbitrary word.
    let text = document.getText(range);
    if (text[text.length - 1] in JavaPrimitiveTypes) {
        let currentLine = document.lineAt(range.end.line);
        let following = currentLine.text.substr(range.end.character);
        if (following !== '' && following[0] !== ')' && following.search(regex.Type) !== 0) {
            return null;
        }
    }

    let parser = new Parser(document, range.start);
    return parser.readType();
}

export function findFieldDefinition(document: TextDocument, position: Position): Field {
    let parser = new Parser(document, new Position(position.line, 0));
    if (!parser.expectToken('.field')) {
        return null;
    }
    return parser.readFieldDefinition();
}

export function findMethodDefinition(document: TextDocument, position: Position): Method {
    let parser = new Parser(document, new Position(position.line, 0));
    if (!parser.expectToken('.method')) {
        return null;
    }
    return parser.readMethodDefinition();
}

export function findFieldReference(document: TextDocument, position: Position): { owner: ReferenceType, field: Field } {
    let range = document.getWordRangeAtPosition(position, regex.FieldReference);
    if (!range) {
        return { owner: null, field: null };
    }
    let parser = new Parser(document, range.start);
    return parser.readFieldReference();
}

export function findMethodReference(document: TextDocument, position: Position): { owner: ReferenceType, method: Method } {
    let range = document.getWordRangeAtPosition(position, regex.MethodReference);
    if (!range) {
        return { owner: null, method: null };
    }

    let parser = new Parser(document, range.start);
    return parser.readMethodReference();
}