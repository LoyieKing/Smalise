import * as vscode from 'vscode';
import { Class, Type, Field, Method } from './language/structs';
import { parseSmaliDocument, findClassName } from './language/parser';

import { SmaliDocumentSymbolProvider } from './symbol';
import { SmaliHoverProvider } from './hover';
import { SmaliDefinitionProvider } from './definition';
import { SmaliReferenceProvider } from './reference';
import { SmaliRenameProvider } from './rename';

import LRUCache = require('lru-cache');

let loading: Promise<any>;
let diagnostics: vscode.DiagnosticCollection;

let identifiers: Map<string, string> = new Map(); // A hash map used to store the class identifier for each file, i.e. { uri: class identifier }
let classes: LRUCache<string, Class>; // A LRU cache used to store the class structure for each file, i.e. { uri: class structure }

export function activate(context: vscode.ExtensionContext) {
    const configuration = vscode.workspace.getConfiguration('smalise');
    const configCacheMemoryLimit: number = configuration.get('cache.memoryLimit');
    classes = new LRUCache({
        max: configCacheMemoryLimit * 1024 * 1024,
        length: (value, _) => value.text.length
    });

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
        vscode.workspace.onDidCreateFiles(event => events.onSmaliDocumentsCreated(event.files)),
        vscode.workspace.onDidRenameFiles(event => events.onSmaliDocumentsRenamed(event.files)),
        vscode.workspace.onDidDeleteFiles(event => events.onSmaliDocumentsRemoved(event.files)),
        vscode.workspace.onDidChangeTextDocument(events.onSmaliDocumentsChanged),
        vscode.workspace.onDidChangeConfiguration(events.onSmaliseConfigurationChanged),
    ]);

    loading = new Promise((resolve, reject) => {
        vscode.workspace.findFiles('**/*.smali').then(files => {
            events.onSmaliDocumentsCreated(files).then(resolve).catch(reject);
        });
    });
    loading.catch((reason) => {
        vscode.window.showErrorMessage(`Smalise: Loading smali classes failed! ${reason}`);
    });
}

export function deactivate() {
    loading = null;
    identifiers.clear();
    classes.reset();
}

namespace fs {
    export async function readFile(file: vscode.Uri): Promise<string> {
        for (const document of vscode.workspace.textDocuments) {
            if (file.toString() === document.uri.toString()) {
                return document.getText();
            }
        } 
        return (await vscode.workspace.fs.readFile(file)).toLocaleString();
    }
    
    export async function searchFiles(keywords: string[]): Promise<string[]> {
        const files: Array<string> = new Array();
        for (const [file, _] of identifiers) {
            const jclass = classes.get(file);
            if (jclass) {
                if (keywords.some(text => jclass.text.includes(text))) {
                    files.push(file);
                }
                continue;
            }
            const content = await readFile(vscode.Uri.parse(file));
            if (keywords.some(text => content.toLocaleString().includes(text))) {
                files.push(file);
            }
        }
        return files;
    }
}

namespace events {
    export async function onSmaliDocumentsCreated(files: readonly vscode.Uri[]) {
        for (const file of files) {
            const content = await fs.readFile(file);
            const identifier = findClassName(content);
            identifiers.set(file.toString(), identifier);
        }
    }

    export function onSmaliDocumentsRenamed(files: readonly {oldUri: vscode.Uri; newUri: vscode.Uri}[]) {
        for (const file of files) {
            let diagnostic = diagnostics.get(file.oldUri);
            diagnostics.delete(file.oldUri);
            diagnostics.set(file.newUri, diagnostic);

            let id = identifiers.get(file.oldUri.toString());
            if (id) {
                identifiers.delete(file.oldUri.toString());
                identifiers.set(file.newUri.toString(), id);
            }

            let jclass = classes.get(file.oldUri.toString());
            if (jclass) {
                classes.del(file.oldUri.toString());
                classes.set(file.newUri.toString(), jclass);
            }
        }
    }

    export function onSmaliDocumentsRemoved(files: readonly vscode.Uri[]) {
        for (const file of files) {
            diagnostics.delete(file);
            identifiers.delete(file.toString());
            classes.del(file.toString());
        }
    }

    export function onSmaliDocumentsChanged(event: vscode.TextDocumentChangeEvent) {
        smali.loadClass(event.document);
    }

    export function onSmaliseConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
        if (event.affectsConfiguration('smalise.cache.memoryLimit')) {
            if (classes) {
                classes.reset();
            }
            const configuration = vscode.workspace.getConfiguration('smalise');
            const configCacheMemoryLimit: number = configuration.get('cache.memoryLimit');
            classes = new LRUCache({
                max: configCacheMemoryLimit * 1024 * 1024,
                length: (value, _) => value.text.length
            });
        }
    }
}

export namespace smali {
    export function loadClass(document: vscode.TextDocument): Class {
        if (document.languageId !== 'smali') {
            return null;
        }
        diagnostics.delete(document.uri);

        const cache = classes.get(document.uri.toString());
        if (cache && cache.version >= document.version) {
            return cache;
        }

        try {
            const jclass = parseSmaliDocument(document);
            if (jclass) {
                identifiers.set(document.uri.toString(), jclass.name.identifier);
                classes.set(document.uri.toString(), jclass);
            }
            return jclass;
        } catch (err) {
            if (err instanceof vscode.Diagnostic) {
                diagnostics.set(document.uri, [err]);
            } else {
                diagnostics.set(document.uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), `Unexpected error: ${err}`, vscode.DiagnosticSeverity.Error)]);
            }
        }
    }

    export async function searchClasses(identifier: string): Promise<[vscode.Uri, Class][]> {
        if (!identifier) {
            return null;
        }
        await loading;
        
        const results: Array<[vscode.Uri, Class]> = new Array();
        for (const [file, classID] of identifiers) {
            if (classID === identifier) {
                if (classes.has(file)) {
                    results.push([vscode.Uri.parse(file), classes.get(file)]);
                } else {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(file));
                    results.push([vscode.Uri.parse(file), loadClass(document)]);
                }
            }
        }
        return results;
    }

    export async function searchRootClassIdsForMethod(identifier: string, method: Method, acceptPrivateMethod: boolean = true): Promise<string[]> {
        if (!identifier) {
            return null;
        }
        await loading;

        const classes = await searchClasses(identifier);
        let roots: Array<string> = new Array();
        for (const [_, jclass] of classes) {
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
        }
        return roots;
    }

    export async function searchSuperClassIds(identifier: string): Promise<string[]> {
        if (!identifier) {
            return null;
        }
        await loading;
        
        const classes = await searchClasses(identifier);
        let results = new Array<string>();
        for (const [_, jclass] of classes) {
            const parents = [jclass.super].concat(jclass.implements).map(type => type.identifier);
            const grandparents = await Promise.all(parents.map(id => searchSuperClassIds(id)));
            results = results.concat(parents, ...grandparents);
        }
        return results;
    }

    export async function searchSubClassIds(identifier: string): Promise<string[]> {
        if (!identifier) {
            return null;
        }
        await loading;
        
        const keywords = [`.super ${identifier}`, `.implements ${identifier}`];
        const children = (await fs.searchFiles(keywords)).map(uri => identifiers.get(uri));
        const grandchildren = await Promise.all(children.map(id => searchSubClassIds(id)));
        return children.concat(...grandchildren);
    }

    export async function searchMemberAndEnclosedClassIds(identifier: string): Promise<string[]> {
        if (!identifier) {
            return null;
        }
        await loading;
        return Array.from(classes.keys()).filter(key => key.startsWith(`${identifier.slice(0, -1)}$`));
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

        const locations: vscode.Location[][] = symbols.map(() => new Array());
        const files = await fs.searchFiles(symbols);
        for (const file of files) {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(file));
            symbols.forEach((symbol, index) => {
                let offset: number = document.getText().indexOf(symbol);
                while (offset !== -1) {
                    let start = document.positionAt(offset);
                    let end   = document.positionAt(offset + symbol.length);
                    locations[index].push(new vscode.Location(document.uri, new vscode.Range(start, end)));
                    offset = document.getText().indexOf(symbol, offset + 1);
                }
            });
            loadClass(document);
        }
        return locations;
    }
}