"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const extension = require("./extension");
class SmaliDocumentSymbolProvider {
    provideDocumentSymbols(document, token) {
        let jclass = extension.ParseTextDocument(document);
        if (jclass === null) {
            return null;
        }
        let symbols = new Array();
        for (const field of jclass.Fileds) {
            symbols.push(new vscode.SymbolInformation(field.Name, vscode.SymbolKind.Field, field.Modifiers.join(' ') + ' ' + field.Type, new vscode.Location(document.uri, field.Range)));
        }
        for (const ctor of jclass.Constructors) {
            symbols.push(new vscode.SymbolInformation(`Constructors(${ctor.Parameters.join(' , ')})`, vscode.SymbolKind.Constructor, ctor.Name, new vscode.Location(document.uri, ctor.Range)));
        }
        for (const method of jclass.Methods) {
            symbols.push(new vscode.SymbolInformation(`${method.Name}(${method.Parameters.join(' , ')})`, vscode.SymbolKind.Method, method.ReturnType.Readable, new vscode.Location(document.uri, method.Range)));
        }
        return Promise.resolve(symbols);
    }
}
exports.SmaliDocumentSymbolProvider = SmaliDocumentSymbolProvider;
//# sourceMappingURL=symbol.js.map