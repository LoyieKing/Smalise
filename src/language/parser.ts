import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument, TextLine } from 'vscode';
import { DalvikModifiers, JavaPrimitiveTypes } from './literals';
import {
    Type, PrimitiveType, ReferenceType, ArrayType,
    TextRange, Field, Method, Class
} from './structs';

const regex = {
    ClassName:       /\.class.*?(L[\w\$\/]+?;)/,
    String:          /(".*?")/,
    Type:            /\[*(?:[VZBSCIJFD]|L[\w\$\/]+?;)/,
    Types:           /\[*(?:[VZBSCIJFD]|L[\w\$\/]+?;)/g,
    FieldReference:  /L[\w\$\/]+?;->[\w\$]+?:\[*(?:[VZBSCIJFD]|L[\w\$\/]+?;)/,
    MethodReference: /L[\w\$\/]+?;->(?:[\w\$]+?|<init>|<clinit>)\(.*?\)\[*(?:[VZBSCIJFD]|L[\w\$\/]+?;)/
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
        }
    }

    peekChar(): string { return this.text[this.offset]; }

    readChar(): string { return this.text[this.offset++]; }

    peekToken(): string {
        let text = this.text.substr(this.offset);
        let match = text.match(/(\S+?)\s/);
        if (!match) {
            return text;
        }
        return match[1];
    }

    expectToken(token: string): boolean {
        this.skipSpace();
        if (this.text.startsWith(token, this.offset)) {
            this.moveTo(this.offset + token.length);
            return true;
        } else {
            return false;
        }
    }

    readToken(): TextRange {
        this.skipSpace();
        let start = this.position;
        let text = this.peekToken();
        this.moveTo(this.offset + text.length);
        let end = this.position;
        return new TextRange(text, new Range(start, end));
    }

    readTokenUntil(separator: string, includeSeparator: boolean = false): TextRange {
        this.skipSpace();

        let start = this.position;
        let dest = this.text.indexOf(separator, this.offset);
        if (dest === -1) {
            throw new Diagnostic(
                new Range(start, start.translate(0, 999)),
                'ReadTokenUntil: failed to find separator' + regex,
                DiagnosticSeverity.Error);
        }
        let word = this.text.substring(this.offset, dest);
        if (word.indexOf('\n') !== -1) {
            throw new Diagnostic(
                new Range(start, start.translate(0, word.length)),
                'ReadTokenUntil: unexpected \\n in token',
                DiagnosticSeverity.Error);
        }
        this.moveTo(dest);
        let end = this.position;

        if (includeSeparator) {
            word += this.readChar();
            end = this.position;
        } else {
            this.readChar(); // Skip the separator after reading the token.
        }
        return new TextRange(word, new Range(start, end));
    }

    readType(): Type {
        let start = this.position;
        if (this.expectToken('[')) {
            let array: number = 1;
            while (this.expectToken('[')) { array++; }
            let type = this.readType();
            return new ArrayType(new Range(start, type.range.end), type, array);
        }

        if (this.peekChar() in JavaPrimitiveTypes) {
            let end = this.position;
            return new PrimitiveType(this.readChar(), new Range(start, end));
        }
        if (this.peekChar() === 'L') {
            let token = this.readTokenUntil(';', true);
            return new ReferenceType(token.text, token.range);
        }

        throw new Diagnostic(
            new Range(this.position, this.position.translate(0, 1)),
            'Unknown type identifier: ' + this.peekChar(),
            DiagnosticSeverity.Error);
    }

    // Read a field definition string after '.field' keyword.
    readFieldDefinition(): Field {
        // TODO: read annotation for generic types?
        let range = this.line.range;

        let modifiers = new Array<string>();
        let token = this.readToken();
        while (token.text in DalvikModifiers) {
            modifiers.push(token.text);
            token = this.readToken();
        }
        this.moveTo(this.offset - token.length);

        let name = this.readTokenUntil(':');
        let type = this.readType();

        let initial: TextRange;
        if (this.expectToken('=')) {
            initial = this.readToken();
        }

        return new Field(range, modifiers, name, type, initial);
    }

    // Read a method definition string after '.method' keyword.
    readMethodDefinition(): Method {
        // TODO: read annotation for generic types?
        let range = this.line.range;

        let modifiers = new Array<string>();
        let token = this.readToken();
        while (token.text in DalvikModifiers) {
            modifiers.push(token.text);
            token = this.readToken();
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
                'Cannot find -> after parsing ' + owner.toString(),
                DiagnosticSeverity.Error);
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
                'Cannot find -> after parsing ' + owner.toString(),
                DiagnosticSeverity.Error);
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
        jclass.addTypeReference(type);
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
        jclass.addTypeReference(field.type);
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
        for (const type of method.parameters) {
            jclass.addTypeReference(type);
        }
        jclass.addTypeReference(method.returnType);
        // Read method body
        while (!parser.expectToken('.end method')) {
            // Expect field reference.
            if (parser.expectToken('iget') ||
                parser.expectToken('iput') ||
                parser.expectToken('sget') ||
                parser.expectToken('sput')
            ) {
                let line = parser.line;
                let match = line.text.match(regex.FieldReference);
                if (match) {
                    let matchStart = new Position(line.lineNumber, match.index);
                    parser.moveTo(parser.document.offsetAt(matchStart));
                    let { owner, field } = parser.readFieldReference();

                    jclass.addTypeReference(owner);
                    jclass.addTypeReference(field.type);
                    jclass.addReference(match[0], new Range(matchStart, matchStart.translate(0, match[0].length)));
                }
            }
            // Expect method reference.
            if (parser.expectToken('invoke')) {
                let line = parser.line;
                let match = line.text.match(regex.MethodReference);
                if (match) {
                    let matchStart = new Position(line.lineNumber, match.index);
                    parser.moveTo(parser.document.offsetAt(matchStart));
                    let { owner, method } = parser.readMethodReference();

                    jclass.addTypeReference(owner);
                    for (const parameter of method.parameters) {
                        jclass.addTypeReference(parameter);
                    }
                    jclass.addTypeReference(method.returnType);
                    jclass.addReference(match[0], new Range(matchStart, matchStart.translate(0, match[0].length)));
                }
            }
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
    while (token.text in DalvikModifiers) {
        jclass.modifiers.push(token.text);
        token = parser.readToken();
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
    jclass.addTypeReference(jclass.super);

    if (parser.expectToken('.source')) {
        jclass.source = parser.readToken();
    }
    /* read header end */


    while (parser.offset < parser.text.length) {
        let start = parser.position;
        let token = parser.readToken();
        try {
            if (triggers[token.text] !== undefined) {
                triggers[token.text](parser, jclass);
            }
        } catch (err) {
            if (err instanceof Diagnostic) {
                throw err;
            } else {
                let end = parser.position;
                throw new Diagnostic(
                    new Range(start, end),
                    `Parse error: ${err}, please contact the developer.`,
                    DiagnosticSeverity.Hint);
            }
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