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

let structure: Map<string, Map<string, Class>> = new Map(); // { [identifier: string] { [uri: string]: Class } }

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

    vscode.window.showInformationMessage('Smalise: Loading all the smali classes......');
    loading = new Promise((resolve, reject) => {
        vscode.workspace.findFiles('**/*.smali').then(files => {
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
    if (document.languageId !== 'smali') {
        return null;
    }

    let identifier = AsClassName(document);
    let jclasses = structure.get(identifier);
    if (jclasses) {
        let jclass = jclasses.get(document.uri.toString());
        if (jclass) {
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
        let jclasses = structure.get(jclass.Name.Identifier);
        if (!jclasses) {
            jclasses = new Map();
        }
        jclasses.set(document.uri.toString(), jclass);
        structure.set(jclass.Name.Identifier, jclasses);

        return jclass;
    } catch (err) {
        if (!(err instanceof vscode.Diagnostic)) {
            err = new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                'Unexpected error: ' + err,
                vscode.DiagnosticSeverity.Error);
        }
        diagnostics.set(document.uri, [<vscode.Diagnostic>err]);
    }
}

export async function SearchSmaliClass(identifier: string): Promise<Class[]> {
    if (!identifier) {
        return null;
    }
    await loading;
    return [...structure.get(identifier).values()];
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
    for (const record of structure) {
        let jclasses: Map<string, Class> = record[1];
        if (jclasses) {
            for (const jclass of jclasses.values()) {
                if (symbol in jclass.References) {
                    locations.push(...jclass.References[symbol].map(range => new vscode.Location(jclass.Uri, range)));
                }
            }
        }
    }
    return locations;
}

// export function deactivate() {

// }