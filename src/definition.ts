import * as vscode from 'vscode';
import { AbstractType, Class, Field, ReferenceType, AbstractMethod } from './language/structs';
import * as smali_parser from './language/parser';

import { jclasses, ParseSmaliDocumentWithCache } from './extension';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Thenable<vscode.Definition | vscode.DefinitionLink[]> {
        return new Promise((resolve) => {
            let type = smali_parser.AsType(document, position);
            if (type && type instanceof ReferenceType) {
                let { uri } = searchClass(type.FilePath);
                if (uri) {
                    resolve([new vscode.Location(uri, new vscode.Position(0, 0))]);
                    return;
                }
            }

            let { owner: fowner, field } = smali_parser.AsFieldReference(document, position);
            if (fowner && field) {
                let { uri, jclass } = searchClass(fowner.FilePath);
                if (uri) {
                    if (!jclass) {
                        vscode.workspace.openTextDocument(uri).then((document) => {
                            jclass = ParseSmaliDocumentWithCache(document);
                            resolve(searchFieldDefinition(uri, jclass, field));
                        });
                    } else {
                        resolve(searchFieldDefinition(uri, jclass, field));
                    }
                    return;
                }
            }

            let { owner: mowner, method } = smali_parser.AsMethodReference(document, position);
            if (mowner && method) {
                let { uri, jclass } = searchClass(mowner.FilePath);
                if (uri) {
                    if (!jclass) {
                        vscode.workspace.openTextDocument(uri).then((document) => {
                            jclass = ParseSmaliDocumentWithCache(document);
                            resolve(searchMethodDefinition(uri, jclass, method));
                        });
                    } else {
                        resolve(searchMethodDefinition(uri, jclass, method));
                    }
                    return;
                }
            }
        });
    }
}

function searchClass(path: string): { uri: vscode.Uri, jclass: Class } {
    if (path === null) {
        return { uri: null, jclass: null };
    }
    for (const jclass of jclasses) {
        if (jclass[0].path.endsWith(path)) {
            return { uri: jclass[0], jclass: jclass[1] };
        }
    }
    return { uri: null, jclass: null };
}

function searchFieldDefinition(uri: vscode.Uri, jclass: Class, field: Field): Array<vscode.Location> {
    let locations = new Array<vscode.Location>();
    for (const _field of jclass.Fields) {
        if (field.equal(_field)) {
            locations.push(new vscode.Location(uri, _field.Range));
        }
    }
    return locations;
}

function searchMethodDefinition(uri: vscode.Uri, jclass: Class, method: AbstractMethod): Array<vscode.Location> {
    let locations = new Array<vscode.Location>();
    if (method.isConstructor()) {
        for (const _cotr of jclass.Constructors) {
            if (method.equal(_cotr)) {
                locations.push(new vscode.Location(uri, _cotr.Range));
            }
        }
    } else {
        for (const _method of jclass.Methods) {
            if (method.equal(_method)) {
                locations.push(new vscode.Location(uri, _method.Range));
            }
        }
    }
    return locations;
}