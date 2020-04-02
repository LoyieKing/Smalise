import * as vscode from 'vscode';
import { Class, Type } from './language/structs';
import { ParseSmaliDocument } from './language/parser';

import * as smali_symbol from './symbol';
import * as smali_hover from './hover';
import * as smali_definition from './definition';
import * as smali_reference from './reference';

const LOADING_FILE_NUM_LIMIT = 50;

let loading: Promise<void>;
let jclasses: Map<string, Class>;
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
    jclasses = new Map<string, Class>();

    diagnosticCollection = vscode.languages.createDiagnosticCollection('smali');
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            'smali', new smali_symbol.SmaliDocumentSymbolProvider()
        ));
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            'smali', new smali_hover.SmaliHoverProvider()
        )
    );
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            'smali', new smali_definition.SmaliDefinitionProvider()
        )
    );
    context.subscriptions.push(
        vscode.languages.registerReferenceProvider(
            'smali', new smali_reference.SmaliReferenceProvider()
        )
    );

    vscode.workspace.onDidOpenTextDocument(d => OpenSmaliDocument(d));
    vscode.workspace.onDidChangeTextDocument(e => UpdateSmaliDocument(e.document));

    vscode.window.showInformationMessage('Smalise: Loading all the smali classes......');
    loading = new Promise((resolve, reject) => {
        vscode.workspace.findFiles('**/*.smali').then(files => {
            for (const file of files) {
                jclasses.set(file.toString(), null);
            }
            LoadSmaliDocuments(files).then(resolve).catch(reject);
        });
    });
}

async function LoadSmaliDocuments(files: vscode.Uri[]) {
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

export function OpenSmaliDocument(document: vscode.TextDocument): Class {
    let jclass = jclasses.get(document.uri.toString());
    if (jclass) {
        return jclass;
    }
    return UpdateSmaliDocument(document);
}

export function UpdateSmaliDocument(document: vscode.TextDocument): Class {
    if (document.languageId !== 'smali') {
        return null;
    }
    diagnosticCollection.delete(document.uri);

    try {
        let jclass = ParseSmaliDocument(document);
        jclasses.set(document.uri.toString(), jclass);
        return jclass;
    } catch (err) {
        if (!(err instanceof vscode.Diagnostic)) {
            err = new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                'Unexpected error: ' + err,
                vscode.DiagnosticSeverity.Error);
        }
        diagnosticCollection.set(document.uri, [<vscode.Diagnostic>err]);
    }
}

export async function SearchSmaliClass(type: Type): Promise<[vscode.Uri, Class][]> {
    let path = type.FilePath;
    if (!path) {
        return Promise.resolve([]);
    }

    let thenables = new Array<Thenable<[vscode.Uri, Class]>>();
    for (const record of jclasses) {
        let uri: vscode.Uri = vscode.Uri.parse(record[0]);
        let jclass: Class = record[1];
        if (uri.path.endsWith(path)) {
            if (!jclass) {
                let opened = vscode.workspace.openTextDocument(uri);
                thenables.push(opened.then(document => {
                    let jclass = UpdateSmaliDocument(document);
                    if (!jclass.Name.equal(type)) {
                        return null;
                    }
                    return [uri, jclass];
                }));
            } else {
                thenables.push(Promise.resolve([uri, jclass]));
            }
        }
    }

    return Promise.all(thenables);
}

export async function SearchSymbolReference(symbol: string): Promise<vscode.Location[]> {
    await loading;

    let thenables = new Array<Thenable<vscode.Location[]>>();
    for (const record of jclasses) {
        let uri: vscode.Uri = vscode.Uri.parse(record[0]);
        let jclass: Class = record[1];
        if (!jclass) {
            let opened = vscode.workspace.openTextDocument(uri);
            thenables.push(opened.then(document => {
                let jclass = UpdateSmaliDocument(document);
                if (symbol in jclass.References) {
                    return jclass.References[symbol].map(range => new vscode.Location(uri, range));
                }
                return null;
            }));
        } else {
            if (symbol in jclass.References) {
                let locations = jclass.References[symbol].map(range => new vscode.Location(uri, range));
                thenables.push(Promise.resolve(locations));
            }
        }
    }

    const results = await Promise.all(thenables);
    return [].concat(...results.filter(r => r));
}

// export function deactivate() {

// }