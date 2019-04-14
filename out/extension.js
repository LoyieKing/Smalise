"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const smali_language = require("./language");
const smali_symbol = require("./symbol");
const smali_hover = require("./hover");
const definition_1 = require("./definition");
let diagnosticCollection;
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        exports.jclasses = new Map();
        diagnosticCollection = vscode.languages.createDiagnosticCollection('smali');
        context.subscriptions.push(diagnosticCollection);
        context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider('smali', new smali_symbol.SmaliDocumentSymbolProvider()));
        context.subscriptions.push(vscode.languages.registerHoverProvider('smali', new smali_hover.SmaliHoverProvider()));
        context.subscriptions.push(vscode.languages.registerDefinitionProvider('smali', new definition_1.SmaliDefinitionProvider()));
        vscode.window.showInformationMessage('Parsing...');
        let files = yield vscode.workspace.findFiles('**/*.smali');
        for (const file of files) {
            exports.jclasses.set(file, null);
        }
        for (const textDoc of vscode.workspace.textDocuments) {
            ParseTextDocument(textDoc);
        }
        vscode.window.showInformationMessage('Parse complete.');
        vscode.workspace.onDidOpenTextDocument(ParseTextDocument);
    });
}
exports.activate = activate;
function ParseTextDocument(textDoc) {
    if (textDoc.languageId !== 'smali') {
        return null;
    }
    let jclass = exports.jclasses.get(textDoc.uri);
    if (jclass === undefined) {
        try {
            jclass = smali_language.ParseSmali(textDoc.getText());
            exports.jclasses.set(textDoc.uri, jclass);
        }
        catch (ex) {
            diagnosticCollection.set(textDoc.uri, [ex]);
        }
    }
    return jclass;
}
exports.ParseTextDocument = ParseTextDocument;
// export function deactivate() {
// }
//# sourceMappingURL=extension.js.map