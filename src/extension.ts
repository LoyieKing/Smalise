import * as vscode from 'vscode';
import { Class, Field, Method } from './language/structs';
import { parseSmaliDocument } from './language/parser';

import { SmaliDocumentSymbolProvider } from './symbol';
import { SmaliHoverProvider } from './hover';
import { SmaliDefinitionProvider } from './definition';
import { SmaliReferenceProvider } from './reference';
import { SmaliRenameProvider } from './rename';

const LOADING_FILE_NUM_LIMIT = 50;

let loading: Promise<void>;
let diagnostics: vscode.DiagnosticCollection;

let fileRecords: Map<string, string> = new Map(); // { file_uri: class_identifier }
let classRecords: Map<string, Class> = new Map(); // { class_identifier: class }

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

    context.subscriptions.push(...[
        vscode.workspace.onDidCreateFiles(event => loadSmaliDocuments(event.files, openSmaliDocument)),
        vscode.workspace.onDidRenameFiles(event => renameSmaliDocuments(event.files)),
        vscode.workspace.onDidDeleteFiles(event => removeSmaliDocuments(event.files)),
        vscode.workspace.onDidChangeTextDocument(e => updateSmaliDocument(e.document)),
    ]);

    vscode.window.showInformationMessage('Smalise: Loading all the smali classes......');
    loading = new Promise((resolve, reject) => {
        vscode.workspace.findFiles('**/*.smali').then(files => {
            loadSmaliDocuments(files, openSmaliDocument).then(resolve).catch(reject);
        });
    });
    loading.then(() =>
        vscode.window.showInformationMessage('Smalise: Loading finished!')
    );
}

export function deactivate() {
    loading = null;
    fileRecords.clear();
    classRecords.clear();
}

function report(uri: vscode.Uri, message: string, severity = vscode.DiagnosticSeverity.Hint) {
    diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), message, severity)]);
}

async function loadSmaliDocuments(files: readonly vscode.Uri[], handler: (document: vscode.TextDocument) => any) {
    let thenables: Array<Thenable<Class>> = [];
    for (const file of files) {
        if (thenables.length >= LOADING_FILE_NUM_LIMIT) {
            await Promise.all(thenables);
            thenables = [];
        }
        thenables.push(vscode.workspace.openTextDocument(file).then(handler));
    }
    await Promise.all(thenables);
}

async function renameSmaliDocuments(files: readonly {oldUri: vscode.Uri; newUri: vscode.Uri}[]) {
    for (const file of files) {
        let identifier = fileRecords.get(file.oldUri.toString());
        if (identifier) {
            fileRecords.delete(file.oldUri.toString());
            fileRecords.set(file.newUri.toString(), identifier);
            let jclass = classRecords.get(identifier);
            if (jclass) {
                jclass.uri = file.newUri;
            }
        }
    }
}

async function removeSmaliDocuments(files: readonly vscode.Uri[]) {
    for (const file of files) {
        let identifier = fileRecords.get(file.toString());
        if (identifier) {
            fileRecords.delete(identifier);
            classRecords.delete(identifier);
        }
    }
}

export function openSmaliDocument(document: vscode.TextDocument): Class {
    if (document.languageId !== 'smali') {
        return null;
    }

    let identifier = fileRecords.get(document.uri.toString());
    if (identifier) {
        let jclass = classRecords.get(identifier);
        if (jclass) {
            if (document.uri.toString() !== jclass.uri.toString()) {
                report(document.uri, 'Class conflicted with ' + jclass.uri.toString(), vscode.DiagnosticSeverity.Error);
                return null;
            }
            return jclass;
        }
    }
    return updateSmaliDocument(document);
}

export function updateSmaliDocument(document: vscode.TextDocument): Class {
    if (document.languageId !== 'smali') {
        return null;
    }
    diagnostics.delete(document.uri);

    try {
        let jclass = parseSmaliDocument(document);
        fileRecords.set(document.uri.toString(), jclass.name.identifier);
        classRecords.set(jclass.name.identifier, jclass);
        return jclass;
    } catch (err) {
        if (err instanceof vscode.Diagnostic) {
            diagnostics.set(document.uri, [err]);
        } else {
            report(document.uri, 'Unexpected error: ' + err, vscode.DiagnosticSeverity.Error);
        }
    }
}

export async function searchSmaliClass(identifier: string): Promise<Class> {
    if (!identifier) {
        return null;
    }
    await loading;
    return classRecords.get(identifier);
}

export function searchFieldDefinition(jclass: Class, field: Field): Array<Field> {
    return jclass.fields.filter(field.equal);
}

export function searchMethodDefinition(jclass: Class, method: Method): Array<Method> {
    if (method.isConstructor) {
        return jclass.constructors.filter(method.equal);
    } else {
        return jclass.methods.filter(method.equal);
    }
}

export async function searchSymbolReference(symbol: string): Promise<vscode.Location[]> {
    let locations = new Array<vscode.Location>();
    let files = await vscode.workspace.findFiles('**/*.smali');
    await loadSmaliDocuments(files, document => {
        let text = document.getText();
        if (text.includes(symbol)) {
            let offset: number = text.indexOf(symbol);
            while (offset !== -1) {
                let start = document.positionAt(offset);
                let end   = document.positionAt(offset + symbol.length);
                locations.push(new vscode.Location(document.uri, new vscode.Range(start, end)));
                offset = text.indexOf(symbol, offset + 1);
            }
        }
    });
    return locations;
}