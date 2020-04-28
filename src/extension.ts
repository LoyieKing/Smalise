import * as vscode from 'vscode';
import { Class, Type, Field, Method } from './language/structs';
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
let subclassRecords: Map<string, Array<string>> = new Map();

export function activate(context: vscode.ExtensionContext) {
    diagnostics = vscode.languages.createDiagnosticCollection('smali');
    context.subscriptions.push(diagnostics);

    context.subscriptions.push(...[
        vscode.languages.registerHoverProvider({ language: 'smali' }, new SmaliHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider({ language: 'smali' }, new SmaliDocumentSymbolProvider()),
        vscode.languages.registerDefinitionProvider({ language: 'smali' }, new SmaliDefinitionProvider()),
        vscode.languages.registerReferenceProvider({ language: 'smali' }, new SmaliReferenceProvider()),
        vscode.languages.registerRenameProvider({ language: 'smali' }, new SmaliRenameProvider()),
    ]);

    context.subscriptions.push(...[
        vscode.workspace.onDidCreateFiles(event => loadSmaliDocuments(event.files, openSmaliDocument)),
        vscode.workspace.onDidRenameFiles(event => onSmaliDocumentsRenamed(event.files)),
        vscode.workspace.onDidDeleteFiles(event => onSmaliDocumentsRemoved(event.files)),
        vscode.workspace.onDidChangeTextDocument(event => onSmaliDocumentsChanged(event)),
    ]);

    loading = new Promise((resolve, reject) => {
        vscode.workspace.findFiles('**/*.smali').then(files => {
            loadSmaliDocuments(files, openSmaliDocument).then(resolve).catch(reject);
        });
    });
    loading.catch((reason) => {
        vscode.window.showErrorMessage('Smalise: Loading smali classes failed because ' + reason);
    });
}

export function deactivate() {
    loading = null;
    fileRecords.clear();
    classRecords.clear();
}

function report(uri: vscode.Uri, message: string, severity = vscode.DiagnosticSeverity.Hint) {
    diagnostics.set(uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), message, severity)]);
}

function positionAt(text: string, offset: number): vscode.Position {
    let SOL = text.lastIndexOf('\n', offset - 1);
    let line = (text.substring(0, offset).match(/\n/g) || []).length;
    let char = offset - SOL - 1;
    return new vscode.Position(line, char);
}

function addSubclassRecord(superclass: Type, subclass: Type) {
    let subclasses = (subclassRecords.get(superclass.identifier) || []);
    subclasses.push(subclass.identifier);
    subclassRecords.set(superclass.identifier, subclasses);
}

function replaceSubclassRecord(superclass: Type, prevIdentifier: string, currIdentifier: string) {
    let subclasses = subclassRecords.get(superclass.identifier);
    if (subclasses) {
        subclasses = subclasses.filter(identifier => identifier !== prevIdentifier);
        subclasses.push(currIdentifier);
        subclassRecords.set(superclass.identifier, subclasses);
    }
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

function onSmaliDocumentsRenamed(files: readonly {oldUri: vscode.Uri; newUri: vscode.Uri}[]) {
    for (const file of files) {
        let diagnostic = diagnostics.get(file.oldUri);
        diagnostics.delete(file.oldUri);
        diagnostics.set(file.newUri, diagnostic);

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

function onSmaliDocumentsRemoved(files: readonly vscode.Uri[]) {
    for (const file of files) {
        let identifier = fileRecords.get(file.toString());
        if (identifier) {
            diagnostics.delete(file);
            fileRecords.delete(file.toString());
            classRecords.delete(identifier);
            subclassRecords.delete(identifier);
        }
    }
}

function onSmaliDocumentsChanged(event: vscode.TextDocumentChangeEvent) {
    let jclass = parseSmaliDocumentWithDiagnostic(event.document);
    if (jclass) {
        let prevID = fileRecords.get(event.document.uri.toString());
        let currID = jclass.name.identifier;
        if (prevID !== currID) {
            fileRecords.set(event.document.uri.toString(), currID);
            classRecords.delete(prevID);

            subclassRecords.set(currID, subclassRecords.get(prevID));
            replaceSubclassRecord(jclass.super, prevID, currID);
            jclass.implements.forEach(iface => replaceSubclassRecord(iface, prevID, currID));
        }
        classRecords.set(currID, jclass);
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

    let jclass = parseSmaliDocumentWithDiagnostic(document);
    if (jclass) {
        fileRecords.set(document.uri.toString(), jclass.name.identifier);
        classRecords.set(jclass.name.identifier, jclass);
        addSubclassRecord(jclass.super, jclass.name);
        jclass.implements.forEach(iface => addSubclassRecord(iface, jclass.name));
    }
    return jclass;
}

export function parseSmaliDocumentWithDiagnostic(document: vscode.TextDocument): Class {
    if (document.languageId !== 'smali') {
        return null;
    }
    diagnostics.delete(document.uri);

    try {
        return parseSmaliDocument(document);
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

export async function searchRootClassIdsForMethod(identifier: string, method: Method, acceptPrivateMethod: boolean = true): Promise<string[]> {
    if (!identifier) {
        return null;
    }
    await loading;
    let jclass = classRecords.get(identifier);
    if (jclass) {
        let roots: Array<string> = new Array();
        const parents = [jclass.super.identifier].concat(jclass.implements.map(type => type.identifier));
        for (const parent of parents) {
            roots = roots.concat(await searchRootClassIdsForMethod(parent, method, false));
        }
        if (roots.length === 0) {
            const methods = searchMethodDefinition(jclass, method);
            if (methods.length !== 0) {
                if (acceptPrivateMethod || methods.every(it => !it.modifiers.includes('private'))) {
                    return [identifier];
                }
            }
        }
        return roots;
    }
    return [];
}

export async function searchSmaliSubclassIds(identifier: string): Promise<string[]> {
    if (!identifier) {
        return null;
    }
    await loading;
    const children: Array<string> = (subclassRecords.get(identifier) || []);
    const grandchildren = await Promise.all(children.map(id => searchSmaliSubclassIds(id)));
    return children.concat(...grandchildren);
}

export async function searchMemberAndEnclosedClassIds(identifier: string): Promise<string[]> {
    if (!identifier) {
        return null;
    }
    await loading;
    return Array.from(classRecords.keys()).filter(key => key.startsWith(identifier.slice(0, -1) + '$'));
}

export function searchFieldDefinition(jclass: Class, field: Field): Array<Field> {
    return jclass.fields.filter(f => field.equal(f));
}

export function searchMethodDefinition(jclass: Class, method: Method): Array<Method> {
    if (method.isConstructor) {
        return jclass.constructors.filter(m => method.equal(m));
    } else {
        return jclass.methods.filter(m => method.equal(m));
    }
}

export async function searchSymbolReference(symbols: string[]): Promise<vscode.Location[][]> {
    await loading;

    let locations: vscode.Location[][] = symbols.map(() => new Array());
    for (const record of classRecords) {
        let text = record[1].text;
        symbols.forEach((symbol, index) => {
            let offset: number = text.indexOf(symbol);
            while (offset !== -1) {
                let start = positionAt(text, offset);
                let end   = positionAt(text, offset + symbol.length);
                locations[index].push(new vscode.Location(record[1].uri, new vscode.Range(start, end)));
                offset = text.indexOf(symbol, offset + 1);
            }
        });
    }
    return locations;
}