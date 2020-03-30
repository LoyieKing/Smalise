import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as smali_language from './language';

import * as smali_symbol from './symbol';
import * as smali_hover from './hover';
import * as smali_definition from './definition';
import * as smali_reference from './reference';

let diagnosticCollection: vscode.DiagnosticCollection;
export let jclasses: Map<vscode.Uri, smali_language.Class>;


export async function activate(context: vscode.ExtensionContext) {
    jclasses = new Map<vscode.Uri, smali_language.Class>();
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
    )

    vscode.window.showInformationMessage('Parsing...');
    let files = await vscode.workspace.findFiles('**/*.smali');
    for (const file of files) {
        jclasses.set(file, null);
    }
    for (const textDoc of vscode.workspace.textDocuments) {
        ParseTextDocument(textDoc);
    }
    vscode.window.showInformationMessage('Parse complete.');

    vscode.workspace.onDidOpenTextDocument(ParseTextDocument);
}

export function ParseTextDocument(textDoc: vscode.TextDocument): smali_language.Class {
    if (textDoc.languageId !== 'smali') {
        return null;
    }
    let jclass = jclasses.get(textDoc.uri);
    if (jclass === undefined) {
        try {
            jclass = smali_language.ParseSmali(textDoc.getText());
            jclasses.set(textDoc.uri, jclass);
        }
        catch (ex) {
            diagnosticCollection.set(textDoc.uri, [<vscode.Diagnostic>ex]);
        }
    }
    return jclass;
}

// export function deactivate() {

// }