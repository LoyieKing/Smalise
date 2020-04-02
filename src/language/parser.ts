import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument, TextLine } from 'vscode';
import { DalvikModifiers, JavaPrimitiveTypes } from './literals';
import {
    Type, PrimitiveType, ReferenceType, ArrayType,
    JString, TextRange, Field, Method, Class
} from './structs';

const regex = {
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

    MoveTo(offset: number) {
        this.offset = offset;
    }

    SkipSpace() {
        let dest = this.text.substr(this.offset).search(/\S/);
        if (dest !== -1) {
            this.MoveTo(this.offset + dest);
        }
    }

    SkipLine() {
        let EOL = this.text.indexOf('\n', this.offset);
        if (EOL !== -1) {
            this.MoveTo(EOL + 1);
        }
    }

    PeekChar(): string { return this.text[this.offset]; }

    ReadChar(): string { return this.text[this.offset++]; }

    PeekToken(): string {
        let text = this.text.substr(this.offset);
        let match = text.match(/(\S+?)\s/);
        if (!match) {
            return text;
        }
        return match[1];
    }

    ExpectToken(token: string): boolean {
        this.SkipSpace();
        if (this.text.startsWith(token, this.offset)) {
            this.MoveTo(this.offset + token.length);
            return true;
        } else {
            return false;
        }
    }

    ReadToken(): TextRange {
        this.SkipSpace();
        let start = this.position;
        let text = this.PeekToken();
        this.MoveTo(this.offset + text.length);
        let end = this.position;
        return new TextRange(text, new Range(start, end));
    }

    ReadTokenUntil(separator: string, includeSeparator: boolean = false): TextRange {
        this.SkipSpace();

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
        this.MoveTo(dest);
        let end = this.position;

        if (includeSeparator) {
            word += this.ReadChar();
            end = this.position;
        } else {
            this.ReadChar(); // Skip the separator after reading the token.
        }
        return new TextRange(word, new Range(start, end));
    }

    ReadType(): Type {
        let start = this.position;
        if (this.ExpectToken('[')) {
            let array: number = 1;
            while (this.ExpectToken('[')) { array++; }
            let type = this.ReadType();
            return new ArrayType(new Range(start, type.Range.end), type, array);
        }

        if (this.PeekChar() in JavaPrimitiveTypes) {
            let end = this.position;
            return new PrimitiveType(this.ReadChar(), new Range(start, end));
        }
        if (this.PeekChar() === 'L') {
            let token = this.ReadTokenUntil(';', true);
            return new ReferenceType(token.Text, token.Range);
        }

        throw new Diagnostic(
            new Range(this.position, this.position.translate(0, 1)),
            'Unknown type identifier: ' + this.PeekChar(),
            DiagnosticSeverity.Error);
    }

    // Read a field definition string after '.field' keyword.
    ReadFieldDefinition(): Field {
        // TODO: read annotation for generic types?
        let range = this.line.range;

        let modifiers = new Array<string>();
        let token = this.ReadToken();
        while (token.Text in DalvikModifiers) {
            modifiers.push(token.Text);
            token = this.ReadToken();
        }
        this.MoveTo(this.offset - token.length);

        let name = this.ReadTokenUntil(':');
        let type = this.ReadType();

        let initial: TextRange;
        if (this.ExpectToken('=')) {
            initial = this.ReadToken();
        }

        return new Field(range, modifiers, name, type, initial);
    }

    // Read a method definition string after '.method' keyword.
    ReadMethodDefinition(): Method {
        // TODO: read annotation for generic types?
        let range = this.line.range;

        let modifiers = new Array<string>();
        let token = this.ReadToken();
        while (token.Text in DalvikModifiers) {
            modifiers.push(token.Text);
            token = this.ReadToken();
        }
        this.MoveTo(this.offset - token.length);

        let name = this.ReadTokenUntil('(');
        let parameters = new Array<Type>();
        while (!this.ExpectToken(')')) {
            parameters.push(this.ReadType());
        }
        let returnType = this.ReadType();

        return new Method(range, modifiers, name, parameters, returnType);
    }

    ReadFieldReference(): { owner: ReferenceType, field: Field } {
        let start = this.position;
        let owner = <ReferenceType>this.ReadType();
        if (!this.ExpectToken('->')) {
            throw Error('Cannot find -> after parsing ' + owner.toString());
        }
        let name = this.ReadTokenUntil(':');
        let type = this.ReadType();
        let end = this.position;

        let range: Range = new Range(start, end);
        return { owner: owner, field: new Field(range, undefined, name, type, undefined) };
    }

    ReadMethodReference(): { owner: ReferenceType, method: Method } {
        let start = this.position;
        let owner = <ReferenceType>this.ReadType();
        if (!this.ExpectToken('->')) {
            throw Error('Cannot find -> after parsing ' + owner.toString());
        }
        let name = this.ReadTokenUntil('(');
        let parameters = Array<Type>();
        while (!this.ExpectToken(')')) {
            parameters.push(this.ReadType());
        }
        let returnType = this.ReadType();
        let end = this.position;

        let range: Range = new Range(start, end);
        return { owner: owner, method: new Method(range, undefined, name, parameters, returnType) };
    }
}

const SwitchWord: { [key: string]: (parser: Parser, jclass: Class) => void; } = {
    '#': function (parser: Parser, jclass: Class) {
        parser.SkipLine();
    },
    '.implements': function (parser: Parser, jclass: Class) {
        jclass.Implements.push(parser.ReadType());
    },
    '.annotation': function (parser: Parser, jclass: Class) {
        let start = new Position(parser.position.line, 0);
        while (!parser.ExpectToken('.end annotation')) {
            parser.SkipLine();
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
        let field = parser.ReadFieldDefinition();
        jclass.Fields.push(field);
        jclass.addTypeReference(field.Type);
    },
    '.method': function (parser: Parser, jclass: Class) {
        let start = new Position(parser.position.line, 0);

        // Read method definition
        let method = parser.ReadMethodDefinition();
        if (method.isConstructor) {
            jclass.Constructors.push(method);
        } else {
            jclass.Methods.push(method);
        }
        for (let type of method.Parameters) {
            jclass.addTypeReference(type);
        }
        jclass.addTypeReference(method.ReturnType);
        // Read method body
        while (!parser.ExpectToken('.end method')) {
            // Expect field reference.
            if (parser.ExpectToken('iget') ||
                parser.ExpectToken('iput') ||
                parser.ExpectToken('sget') ||
                parser.ExpectToken('sput')
            ) {
                let line = parser.line;
                let match = line.text.match(regex.FieldReference);
                if (match) {
                    let matchStart = new Position(line.lineNumber, match.index);
                    parser.MoveTo(parser.document.offsetAt(matchStart));
                    let { owner, field } = parser.ReadFieldReference();

                    jclass.addTypeReference(owner);
                    jclass.addTypeReference(field.Type);
                    jclass.addReference(match[0], new Range(matchStart, matchStart.translate(0, match[0].length)));
                }
            }
            // Expect method reference.
            if (parser.ExpectToken('invoke')) {
                let line = parser.line;
                let match = line.text.match(regex.MethodReference);
                if (match) {
                    let matchStart = new Position(line.lineNumber, match.index);
                    parser.MoveTo(parser.document.offsetAt(matchStart));
                    let { owner, method } = parser.ReadMethodReference();

                    jclass.addTypeReference(owner);
                    for (let parameter of method.Parameters) {
                        jclass.addTypeReference(parameter);
                    }
                    jclass.addTypeReference(method.ReturnType);
                    jclass.addReference(match[0], new Range(matchStart, matchStart.translate(0, match[0].length)));
                }
            }
            parser.SkipLine();
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

export function ParseSmaliDocument(document: TextDocument): Class {
    let parser: Parser = new Parser(document);
    let jclass: Class = new Class();


    /* read header start */
    if (!parser.ExpectToken('.class')) {
        throw new Diagnostic(
            new Range(parser.position, parser.position.translate(0, 6)),
            'Expect ".class" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }
    let token = parser.ReadToken();
    while (token.Text in DalvikModifiers) {
        jclass.Modifiers.push(token.Text);
        token = parser.ReadToken();
    }
    parser.MoveTo(parser.offset - token.length);
    jclass.Name = parser.ReadType();

    if (!parser.ExpectToken('.super')) {
        throw new Diagnostic(
            new Range(parser.position, parser.position.translate(0, 6)),
            'Expect ".super" here,the file may not be a standard smali file.',
            DiagnosticSeverity.Hint);
    }
    jclass.Super = parser.ReadType();

    if (parser.ExpectToken('.source')) {
        jclass.Source = new JString(parser.ReadToken().Text);
    }
    /* read header end */


    while (parser.offset < parser.text.length) {
        let start = parser.position;
        let token = parser.ReadToken();
        try {
            if (SwitchWord[token.Text] !== undefined) {
                SwitchWord[token.Text](parser, jclass);
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

export function ParseSmaliDocumentClassName(document: TextDocument): Type {
    let parser = new Parser(document);
    if (!parser.ExpectToken('.class')) {
        return null;
    }
    let token = parser.ReadToken();
    while (token.Text in DalvikModifiers) {
        token = parser.ReadToken();
    }
    parser.MoveTo(parser.offset - token.length);
    return parser.ReadType();
}

export function AsString(document: TextDocument, position: Position): TextRange {
    let range = document.getWordRangeAtPosition(position, regex.String);
    if (!range) {
        return null;
    }
    let text = document.getText(range);
    return new TextRange(text, range);
}

export function AsType(document: TextDocument, position: Position): Type {
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
    return parser.ReadType();
}

export function AsFieldDefinition(document: TextDocument, position: Position): Field {
    let parser = new Parser(document, new Position(position.line, 0));
    if (!parser.ExpectToken('.field')) {
        return null;
    }
    return parser.ReadFieldDefinition();
}

export function AsMethodDefinition(document: TextDocument, position: Position): Method {
    let parser = new Parser(document, new Position(position.line, 0));
    if (!parser.ExpectToken('.method')) {
        return null;
    }
    return parser.ReadMethodDefinition();
}

export function AsFieldReference(document: TextDocument, position: Position): { owner: ReferenceType, field: Field } {
    let range = document.getWordRangeAtPosition(position, regex.FieldReference);
    if (!range) {
        return { owner: null, field: null };
    }
    let parser = new Parser(document, range.start);
    return parser.ReadFieldReference();
}

export function AsMethodReference(document: TextDocument, position: Position): { owner: ReferenceType, method: Method } {
    let range = document.getWordRangeAtPosition(position, regex.MethodReference);
    if (!range) {
        return { owner: null, method: null };
    }

    let parser = new Parser(document, range.start);
    return parser.ReadMethodReference();
}