import * as vscode from 'vscode';
import { Class, Type } from './language/structs';
import { ParseSmaliDocument } from './language/parser';

import * as smali_symbol from './symbol';
import * as smali_hover from './hover';
import * as smali_definition from './definition';
import * as smali_reference from './reference';

let jclasses: Map<vscode.Uri, Class>;
let diagnosticCollection: vscode.DiagnosticCollection;

export async function activate(context: vscode.ExtensionContext) {
    jclasses = new Map<vscode.Uri, Class>();

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

    vscode.window.showInformationMessage('Smalise: Parsing smali classes......');
    let files = await vscode.workspace.findFiles('**/*.smali');
    for (const file of files) {
        jclasses.set(file, null);
    }
    for (const textDoc of vscode.workspace.textDocuments) {
        ProcessNewSmaliClass(textDoc);
    }
    vscode.window.showInformationMessage('Smalise: Parsing complete.');

    vscode.workspace.onDidOpenTextDocument(ProcessNewSmaliClass);
    vscode.workspace.onDidChangeTextDocument((e) => {
        jclasses.delete(e.document.uri);
        diagnosticCollection.delete(e.document.uri);
        ProcessNewSmaliClass(e.document);
    });
}

export function ProcessNewSmaliClass(document: vscode.TextDocument): Class {
    if (document.languageId !== 'smali') {
        return null;
    }
    let jclass = jclasses.get(document.uri);
    if (jclass === undefined) {
        try {
            jclass = ParseSmaliDocument(document);
            jclasses.set(document.uri, jclass);
        }
        catch (err) {
            if (err instanceof vscode.Diagnostic) {
                diagnosticCollection.set(document.uri, [err]);
            } else {
                diagnosticCollection.set(document.uri, [new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    'Unexpected error: ' + err,
                    vscode.DiagnosticSeverity.Error
                )]);
            }
        }
    }
    return jclass;
}

export function SearchSmaliClass(type: Type): { uri: vscode.Uri, jclass: Class } {
    let path = type.FilePath;
    if (path === null) {
        return { uri: null, jclass: null };
    }
    for (const record of jclasses) {
        if (record[0].path.endsWith(path)) {
            // If the class has been parsed, then double check its class name.
            if (record[1] !== null && record[1].Name !== type) {
                continue;
            }
            return { uri: record[0], jclass: record[1] };
        }
    }
    return { uri: null, jclass: null };
}

// export function deactivate() {

// }