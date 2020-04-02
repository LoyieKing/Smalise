import * as vscode from 'vscode';
import { Class, Field, Method } from './language/structs';
import { ParseSmaliDocument, AsClassName } from './language/parser';

import { SmaliDocumentSymbolProvider } from './symbol';
import { SmaliHoverProvider } from './hover';
import { SmaliDefinitionProvider } from './definition';
import { SmaliReferenceProvider } from './reference';
import { SmaliRenameProvider } from './rename';

const LOADING_FILE_NUM_LIMIT = 50;

let loading: Promise<void>;
let diagnostics: vscode.DiagnosticCollection;

let file_records: Map<string, string> = new Map(); // { file_uri: class_identifier }
let class_records: Map<string, Class> = new Map(); // { class_identifier: class }

export function activate(context: vscode.ExtensionContext) {
    diagnostics = vscode.languages.createDiagnosticCollection('smali');
    context.subscriptions.push(diagnostics);

    context.subscriptions.push(...[
        vscode.languages.registerHoverProvider({language: 'smali'}, new SmaliHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider({language: 'smali'}, new SmaliDocumentSymbolProvider()),
        vscode.languages.registerDefinitionProvider({language: 'smali'}, new SmaliDefinitionProvider()),
        vscode.languages.registerReferenceProvider({language: 'smali'}, new SmaliReferenceProvider()),
        vscode.languages.registerRenameProvider({language: 'smali'}, new SmaliRenameProvider()),
    ]);

    vscode.workspace.onDidOpenTextDocument(d => OpenSmaliDocument(d));
    vscode.workspace.onDidChangeTextDocument(e => UpdateSmaliDocument(e.document));

    vscode.workspace.onDidCreateFiles(event => LoadSmaliDocuments(event.files));
    vscode.workspace.onDidRenameFiles(event => RenameSmaliDocuments(event.files));
    vscode.workspace.onDidDeleteFiles(event => RemoveSmaliDocuments(event.files));

    vscode.window.showInformationMessage('Smalise: Loading all the smali classes......');
    loading = new Promise((resolve, reject) => {
        vscode.workspace.findFiles('**/*.smali').then(files => {
            LoadSmaliDocuments(files).then(resolve).catch(reject);
        });
    });
}

function Report(uri: vscode.Uri, message: string, severity = vscode.DiagnosticSeverity.Hint) {
    diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), message, severity)]);
}

async function LoadSmaliDocuments(files: readonly vscode.Uri[]) {
    let thenables: Array<Thenable<vscode.TextDocument>> = [];
    for (const file of files) {
        if (thenables.length >= LOADING_FILE_NUM_LIMIT) {
            await Promise.all(thenables);
            thenables = [];
        }
        thenables.push(vscode.workspace.openTextDocument(file));
    }
    await Promise.all(thenables);
    vscode.window.showInformationMessage('Smalise: Loading finished!');
}

async function RenameSmaliDocuments(files: readonly {oldUri: vscode.Uri; newUri: vscode.Uri}[]) {
    for (const file of files) {
        let identifier = file_records.get(file.oldUri.toString());
        if (identifier) {
            file_records.delete(file.oldUri.toString());
            file_records.set(file.newUri.toString(), identifier);
            let jclass = class_records.get(identifier);
            if (jclass) {
                jclass.Uri = file.newUri;
            }
        }
    }
}

async function RemoveSmaliDocuments(files: readonly vscode.Uri[]) {
    for (const file of files) {
        let identifier = file_records.get(file.toString());
        if (identifier) {
            file_records.delete(identifier);
            class_records.delete(identifier);
        }
    }
}

export function OpenSmaliDocument(document: vscode.TextDocument): Class {
    if (document.languageId !== 'smali') {
        return null;
    }

    let identifier = file_records.get(document.uri.toString());
    if (identifier) {
        let jclass = class_records.get(identifier);
        if (jclass) {
            if (document.uri !== jclass.Uri) {
                Report(document.uri, 'Class conflicted with ' + jclass.Uri.toString(), vscode.DiagnosticSeverity.Error);
                return null;
            }
            return jclass;
        }
    }
    return UpdateSmaliDocument(document);
}

export function UpdateSmaliDocument(document: vscode.TextDocument): Class {
    if (document.languageId !== 'smali') {
        return null;
    }
    diagnostics.delete(document.uri);

    try {
        let jclass = ParseSmaliDocument(document);
        file_records.set(document.uri.toString(), jclass.Name.Identifier);
        class_records.set(jclass.Name.Identifier, jclass);
        return jclass;
    } catch (err) {
        if (err instanceof vscode.Diagnostic) {
            diagnostics.set(document.uri, [err]);
        } else {
            Report(document.uri, 'Unexpected error: ' + err, vscode.DiagnosticSeverity.Error);
        }
    }
}

export async function SearchSmaliClass(identifier: string): Promise<Class> {
    if (!identifier) {
        return null;
    }
    await loading;
    return class_records.get(identifier);
}

export function SearchFieldDefinition(jclass: Class, field: Field): Array<Field> {
    return jclass.Fields.filter(field.equal);
}

export function SearchMethodDefinition(jclass: Class, method: Method): Array<Method> {
    if (method.isConstructor) {
        return jclass.Constructors.filter(method.equal);
    } else {
        return jclass.Methods.filter(method.equal);
    }
}

export async function SearchSymbolReference(symbol: string): Promise<vscode.Location[]> {
    await loading;

    let locations: vscode.Location[] = new Array();
    for (const record of class_records) {
        let jclass: Class = record[1];
        if (jclass) {
            if (symbol in jclass.References) {
                locations.push(...jclass.References[symbol].map(range => new vscode.Location(jclass.Uri, range)));
            }
        }
    }
    return locations;
}

// export function deactivate() {

// }