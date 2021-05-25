import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument, TextLine } from 'vscode';
import { DalvikModifiers, JavaPrimitiveTypes } from './literals';
import {
    Type, PrimitiveType, ReferenceType, ArrayType,
    TextRange, Field, Method, Class
} from './structs';

const regex = {
    ClassName:       /\.class.*?(L[\w\$\/-]+;)/,
    String:          /"(?:[^"\\]|\\.)*"/,
    Number:          /-?0x[a-fA-F0-9]+L?/,
    Type:            /\[*(?:[VZBSCIJFD]|L[\w\$\/-]+;)/,
    Label:           /(?<!\w):\w+/,
    ClassReference:  /L[\w\$\/-]+;/,
    FieldReference:  /L[\w\$\/-]+;->[\w\$]+:\[*(?:[VZBSCIJFD]|L[\w\$\/-]+;)/,
    MethodReference: /L[\w\$\/-]+;->(?:[\w\$]+|<init>|<clinit>)\(.*?\)\[*(?:[VZBSCIJFD]|L[\w\$\/-]+;)/
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

    isEOF(): boolean {
        return this.offset === this.text.length;
    }

    skipSpace() {
        const dest = this.text.substr(this.offset).search(/\S/);
        if (dest !== -1) {
            this.moveTo(this.offset + dest);
        }
    }

    skipLine() {
        const EOL = this.text.indexOf('\n', this.offset);
        if (EOL !== -1) {
            this.moveTo(EOL + 1);
        } else {
            this.moveTo(this.text.length);
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

    readToken(): TextRange | undefined {
        const match = this.text.substr(this.offset).match(/\S+/);
        if (!match) {
            this.moveTo(this.text.length);
            return undefined;
        }
        this.moveTo(this.offset + match.index!);
        const start = this.position;
        this.moveTo(this.offset + match[0].length);
        const end = this.position;
        return new TextRange(match[0], new Range(start, end));
    }

    readTokenUntil(separator: string): TextRange {
        this.skipSpace();

        let EOL = this.text.indexOf('\n', this.offset);
        if (EOL === -1) {
            EOL = this.text.length;
        }
        const line = this.text.substring(this.offset, EOL);
        const dest = line.indexOf(separator);
        if (dest === -1) {
            throw new Diagnostic(
                new Range(this.position, this.document.positionAt(EOL)),
                `Expect separator '${separator}' here.`,
                DiagnosticSeverity.Warning
            );
        }
        const start = this.document.positionAt(this.offset);
        const end = this.document.positionAt(this.offset + dest);

        this.moveTo(this.offset + dest + separator.length); // skip separator for next read.
        return new TextRange(line.substring(0, dest), new Range(start, end));
    }

    readModifiers(): string[] {
        const token = this.readToken();
        if (token) {
            if (token.text in DalvikModifiers) {
                return [token.text, ...this.readModifiers()];
            } else {
                this.moveTo(this.offset - token.length);
            }
        }
        return [];
    }

    readType(): Type {
        const start = this.position;

        if (this.expectToken('[')) {
            const type = this.readType();
            if (!(type instanceof ArrayType)) {
                return new ArrayType(new Range(start, type.range.end), type, 1);
            } else {
                return new ArrayType(new Range(start, type.range.end), type.element, type.layers + 1);
            }
        }

        const char: string = this.peekChar();
        if (char in JavaPrimitiveTypes) {
            this.moveTo(this.offset + 1);
            return new PrimitiveType(char, new Range(start, this.position));
        }
        if (char === 'L') {
            const match = this.text.substr(this.offset).match(regex.ClassReference);
            if (match && match.index === 0) {
                this.moveTo(this.offset + match[0].length);
                return new ReferenceType(match[0], new Range(start, this.position));
            }
        }
        throw new Diagnostic(this.line.range, 'Incomplete type identifier.', DiagnosticSeverity.Warning);
    }

    // Read a field definition string after '.field' keyword.
    readFieldDefinition(): Field {
        const range = this.line.range;
        const modifiers = this.readModifiers();
        const name = this.readTokenUntil(':');
        const type = this.readType();
        const initial = this.expectToken('=') ? this.readToken() : undefined;
        return new Field(range, modifiers, name, type, initial);
    }

    // Read a method definition string after '.method' keyword.
    readMethodDefinition(): Method {
        const range = this.line.range;
        const modifiers = this.readModifiers();
        const name = this.readTokenUntil('(');
        const parameters: Type[] = [];
        while (!this.expectToken(')')) {
            parameters.push(this.readType());
        }
        const returnType = this.readType();
        return new Method(range, modifiers, name, parameters, returnType);
    }

    readFieldReference(): { owner: ReferenceType, field: Field } {
        const start = this.position;
        const owner = <ReferenceType>this.readType();
        if (!this.expectToken('->')) {
            throw new Diagnostic(
                new Range(this.position, this.position.translate(0, 2)),
                `Expect -> after ${owner}`,
                DiagnosticSeverity.Warning);
        }
        const name = this.readTokenUntil(':');
        const type = this.readType();
        const end = this.position;

        const range: Range = new Range(start, end);
        return { owner: owner, field: new Field(range, [], name, type, undefined) };
    }

    readMethodReference(): { owner: ReferenceType, method: Method } {
        const start = this.position;
        const owner = <ReferenceType>this.readType();
        if (!this.expectToken('->')) {
            throw new Diagnostic(
                new Range(this.position, this.position.translate(0, 2)),
                `Expect -> after ${owner}`,
                DiagnosticSeverity.Warning);
        }
        const name = this.readTokenUntil('(');
        const parameters: Type[] = [];
        while (!this.expectToken(')')) {
            parameters.push(this.readType());
        }
        const returnType = this.readType();
        const end = this.position;

        const range: Range = new Range(start, end);
        return { owner: owner, method: new Method(range, [], name, parameters, returnType) };
    }
}

const triggers: { [keyword: string]: (parser: Parser, jclass: Class) => void; } = {
    '#': function (parser: Parser, jclass: Class) {
        parser.skipLine();
    },
    '.implements': function (parser: Parser, jclass: Class) {
        const type = parser.readType();
        jclass.implements.push(type);
    },
    '.annotation': function (parser: Parser, jclass: Class) {
        const start = new Position(parser.position.line, 0);
        while (!parser.expectToken('.end annotation')) {
            if (parser.isEOF()) {
                throw new Diagnostic(
                    new Range(start, parser.position),
                    'Can not find ".end annotation" pair',
                    DiagnosticSeverity.Error);
            }
            parser.skipLine();
        }
    },
    '.field': function (parser: Parser, jclass: Class) {
        const field = parser.readFieldDefinition();
        jclass.fields.push(field);
    },
    '.method': function (parser: Parser, jclass: Class) {
        const start = new Position(parser.position.line, 0);
        // Read method definition
        const method = parser.readMethodDefinition();
        if (method.isConstructor) {
            jclass.constructors.push(method);
        } else {
            jclass.methods.push(method);
        }
        // Read method body
        while (!parser.expectToken('.end method')) {
            if (parser.isEOF()) {
                throw new Diagnostic(
                    new Range(start, parser.position),
                    'Can not find ".end method" pair',
                    DiagnosticSeverity.Error);
            }
            parser.skipLine();
        }
    },
};

export function parseSmaliDocument(document: TextDocument): Class {
    const parser: Parser = new Parser(document);
    const jclass: Class = new Class(document);


    /* read header start */
    if (!parser.expectToken('.class')) {
        throw new Diagnostic(
            new Range(parser.position, parser.position.translate(0, 6)),
            'Expect ".class" here, the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }
    jclass.modifiers = parser.readModifiers();
    jclass.name = parser.readType();

    if (!parser.expectToken('.super')) {
        throw new Diagnostic(
            new Range(parser.position, parser.position.translate(0, 6)),
            'Expect ".super" here, the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }
    jclass.super = parser.readType();

    if (parser.expectToken('.source')) {
        const source = parser.readToken();
        if (source === undefined) {
            throw new Diagnostic(parser.line.range, 'Incomplete .source information.', DiagnosticSeverity.Warning);
        }
        jclass.source = source;
    }
    /* read header end */


    while (!parser.isEOF()) {
        const token = parser.readToken();
        if (token && triggers[token.text]) {
            triggers[token.text](parser, jclass);
        }
    }

    return jclass;
}

export function findClassName(text: string): string | undefined {
    const match = text.match(regex.ClassName);
    if (!match) {
        return undefined;
    }
    return match[1];
}

export function findString(document: TextDocument, position: Position): TextRange | undefined {
    const range = document.getWordRangeAtPosition(position, regex.String);
    if (!range) {
        return undefined;
    }
    return new TextRange(document.getText(range), range);
}

export function findNumber(document: TextDocument, position: Position): TextRange | undefined {
    const range = document.getWordRangeAtPosition(position, regex.Number);
    if (!range) {
        return undefined;
    }
    return new TextRange(document.getText(range), range);
}

export function findType(document: TextDocument, position: Position): Type | undefined {
    const range = document.getWordRangeAtPosition(position, regex.Type);
    if (!range) {
        return undefined;
    }

    // Check if the primitive type we just matched is merely a capital letter in arbitrary word.
    const text = document.getText(range);
    if (text[text.length - 1] in JavaPrimitiveTypes) {
        const currentLine = document.lineAt(range.end.line);
        const following = currentLine.text.substr(range.end.character);
        if (following !== '' && following[0] !== ')' && following.search(regex.Type) !== 0) {
            return undefined;
        }
    }

    const parser = new Parser(document, range.start);
    return parser.readType();
}

export function findLabel(document: TextDocument, position: Position): TextRange | undefined {
    const range = document.getWordRangeAtPosition(position, regex.Label);
    if (!range) {
        return undefined;
    }
    return new TextRange(document.getText(range), range);
}

export function findFieldDefinition(document: TextDocument, position: Position): Field | undefined {
    const parser = new Parser(document, new Position(position.line, 0));
    if (!parser.expectToken('.field')) {
        return undefined;
    }
    return parser.readFieldDefinition();
}

export function findMethodDefinition(document: TextDocument, position: Position): Method | undefined {
    const parser = new Parser(document, new Position(position.line, 0));
    if (!parser.expectToken('.method')) {
        return undefined;
    }
    return parser.readMethodDefinition();
}

export function findFieldReference(document: TextDocument, position: Position): { owner: ReferenceType | undefined, field: Field | undefined } {
    const range = document.getWordRangeAtPosition(position, regex.FieldReference);
    if (!range) {
        return { owner: undefined, field: undefined };
    }
    const parser = new Parser(document, range.start);
    return parser.readFieldReference();
}

export function findMethodReference(document: TextDocument, position: Position): { owner: ReferenceType | undefined, method: Method | undefined } {
    const range = document.getWordRangeAtPosition(position, regex.MethodReference);
    if (!range) {
        return { owner: undefined, method: undefined };
    }

    const parser = new Parser(document, range.start);
    return parser.readMethodReference();
}

export function findMethodBody(document: TextDocument, position: Position): TextRange | undefined {
    const text = document.getText();
    const start = text.lastIndexOf('.method', document.offsetAt(position));
    const end = text.indexOf('.end method', document.offsetAt(position));
    if (start === -1 || end === -1) {
        return undefined;
    }
    return new TextRange(text.substring(start, end), new Range(document.positionAt(start), document.positionAt(end)));
}