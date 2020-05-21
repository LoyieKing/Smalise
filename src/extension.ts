import * as vscode from 'vscode';
import { Class, Type, Field, Method } from './language/structs';
import { parseSmaliDocument, findClassName } from './language/parser';

import { SmaliDocumentSymbolProvider } from './symbol';
import { SmaliHoverProvider } from './hover';
import { SmaliDefinitionProvider } from './definition';
import { SmaliReferenceProvider } from './reference';
import { SmaliRenameProvider } from './rename';

import LRUCache = require('lru-cache');

let loading: Promise<void> | undefined;
let diagnostics: vscode.DiagnosticCollection | undefined;

const classes: LRUCache<string, Class> = new LRUCache({length: (value) => value.text.length}); // A LRU cache used to store the class structure for each file, i.e. { uri: class structure }
const identifiers: Map<string, string | undefined> = new Map(); // A hash map used to store the class identifier for each file, i.e. { uri: class identifier }

export function activate(context: vscode.ExtensionContext) {
    const configuration = vscode.workspace.getConfiguration('smalise');
    const configCacheMemoryLimit: number = configuration.get('cache.memoryLimit') || 128;
    classes.max = configCacheMemoryLimit * 1024 * 1024;

    loading = new Promise((resolve, reject) => {
        vscode.workspace.findFiles('**/*.smali').then(files => {
            events.onSmaliDocumentsCreated(files).then(resolve).catch(reject);
        });
    });
    loading.catch((reason) => {
        vscode.window.showErrorMessage(`Smalise: Loading smali classes failed! ${reason}`);
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
}

export function deactivate() {
    loading = undefined;
    classes.reset();
    identifiers.clear();
}

namespace fs {
    export async function readFile(file: vscode.Uri): Promise<string> {
        // Search LRU cache for class structures.
        const jclass = classes.get(file.toString());
        if (jclass) {
            return jclass.text;
        }
        // Search opened text documents.
        for (const document of vscode.workspace.textDocuments) {
            if (file.toString() === document.uri.toString()) {
                return document.getText();
            }
        } 
        // Read file directly.
        return (await vscode.workspace.fs.readFile(file)).toLocaleString();
    }
    
    export async function searchFiles(keywords: string[]): Promise<string[]> {
        const files: string[] = [];
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
            if (diagnostics) {
                const diagnostic = diagnostics.get(file.oldUri);
                diagnostics.delete(file.oldUri);
                diagnostics.set(file.newUri, diagnostic);
            }

            const id = identifiers.get(file.oldUri.toString());
            if (id) {
                identifiers.delete(file.oldUri.toString());
                identifiers.set(file.newUri.toString(), id);
            }

            const jclass = classes.get(file.oldUri.toString());
            if (jclass) {
                classes.del(file.oldUri.toString());
                classes.set(file.newUri.toString(), jclass);
            }
        }
    }

    export function onSmaliDocumentsRemoved(files: readonly vscode.Uri[]) {
        for (const file of files) {
            diagnostics?.delete(file);
            classes.del(file.toString());
            identifiers.delete(file.toString());
        }
    }

    export function onSmaliDocumentsChanged(event: vscode.TextDocumentChangeEvent) {
        smali.loadClass(event.document);
    }

    export function onSmaliseConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
        if (event.affectsConfiguration('smalise.cache.memoryLimit')) {
            const configuration = vscode.workspace.getConfiguration('smalise');
            const configCacheMemoryLimit: number = configuration.get('cache.memoryLimit') || 128;
            classes.max = configCacheMemoryLimit * 1024 * 1024;
        }
    }
}

export namespace smali {
    export function loadClass(document: vscode.TextDocument): Class | undefined {
        if (document.languageId !== 'smali') {
            return undefined;
        }
        diagnostics?.delete(document.uri);

        const cache = classes.get(document.uri.toString());
        if (cache && cache.version >= document.version) {
            return cache;
        }

        try {
            const jclass = parseSmaliDocument(document);
            if (jclass) {
                classes.set(document.uri.toString(), jclass);
                identifiers.set(document.uri.toString(), jclass.name.identifier);
            }
            return jclass;
        } catch (err) {
            if (err instanceof vscode.Diagnostic) {
                diagnostics?.set(document.uri, [err]);
            } else {
                diagnostics?.set(document.uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), `Unexpected error: ${err}`, vscode.DiagnosticSeverity.Error)]);
            }
        }
    }

    export async function searchClasses(identifier: string | undefined): Promise<[vscode.Uri, Class][]> {
        if (!identifier) { return []; }
        await loading;
        
        const results: [vscode.Uri, Class][] = [];
        for (const [uri, id] of identifiers) {
            if (id === identifier) {
                const cached = classes.get(uri);
                if (cached) {
                    results.push([vscode.Uri.parse(uri), cached]);
                }
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
                const loaded = loadClass(document);
                if (loaded) {
                    results.push([vscode.Uri.parse(uri), loaded]);
                }
            }
        }
        return results;
    }

    export async function searchRootClassIdsForMethod(identifier: string | undefined, method: Method, acceptPrivateMethod: boolean = true): Promise<string[]> {
        if (!identifier) { return []; }
        await loading;

        const classes = await searchClasses(identifier);
        const roots: string[] = [];
        for (const [_, jclass] of classes) {
            const parents = [jclass.super, ...jclass.implements].map(type => type.identifier);
            for (const parent of parents) {
                roots.push(...await searchRootClassIdsForMethod(parent, method, false));
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

    export async function searchSuperClassIds(identifier: string | undefined): Promise<string[]> {
        if (!identifier) { return []; }
        await loading;
        
        const results: string[] = [];
        const classes = await searchClasses(identifier);
        for (const [_, jclass] of classes) {
            const parents = [jclass.super, ...jclass.implements].map(type => type.identifier!);
            for (const parent of parents) {
                results.push(...await searchSuperClassIds(parent));
            }
            results.push(...parents);
        }
        return results;
    }

    export async function searchSubClassIds(identifier: string | undefined): Promise<string[]> {
        if (!identifier) { return []; }
        await loading;
        
        const results: string[] = [];
        const keywords = [`.super ${identifier}`, `.implements ${identifier}`];
        const children = (await fs.searchFiles(keywords)).map(uri => identifiers.get(uri)!);
        for (const child of children) {
            results.push(...await searchSubClassIds(child));
        }
        results.push(...children);
        return results;
    }

    export async function searchMemberAndEnclosedClassIds(identifier: string | undefined): Promise<string[]> {
        if (!identifier) { return []; }
        await loading;

        return Array.from(classes.keys()).filter(key => key.startsWith(`${identifier.slice(0, -1)}$`));
    }

    export function searchFieldDefinition(jclass: Class, field: Field): Field[] {
        return jclass.fields.filter(f => field.equal(f));
    }

    export function searchMethodDefinition(jclass: Class, method: Method): Method[] {
        if (method.isConstructor) {
            return jclass.constructors.filter(m => method.equal(m));
        } else {
            return jclass.methods.filter(m => method.equal(m));
        }
    }

    function searchSymbols(document: vscode.TextDocument, symbol: string, offset: number = 0): vscode.Location[] {
        const index: number = document.getText().indexOf(symbol, offset);
        if (index !== -1) {
            const start = document.positionAt(index);
            const end   = document.positionAt(index + symbol.length);
            const location = new vscode.Location(document.uri, new vscode.Range(start, end));
            return [location, ...searchSymbols(document, symbol, index + 1)];
        }
        return [];
    }

    export async function searchSymbolReference(symbols: string[]): Promise<vscode.Location[][]> {
        await loading;

        const locations: vscode.Location[][] = symbols.map(() => []);
        const files = await fs.searchFiles(symbols);
        for (const file of files) {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(file));
            for (const i in symbols) {
                locations[i].push(...searchSymbols(document, symbols[i]));
            }
            loadClass(document);
        }
        return locations;
    }
}