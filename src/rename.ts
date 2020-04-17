import * as vscode from 'vscode';
import * as extension from './extension';

import { findClassName, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference } from './language/parser';
import { Field, Method } from './language/structs';

export class SmaliRenameProvider implements vscode.RenameProvider {
    prepareRename?(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): { range: vscode.Range; placeholder: string; } {
        let type = findType(document, position);
        if (type && type.identifier) {
            return { range: type.range, placeholder: type.identifier };
        }

        let myfield = findFieldDefinition(document, position);
        if (myfield) {
            return { range: myfield.name.range, placeholder: myfield.name.text };
        }

        let mymethod = findMethodDefinition(document, position);
        if (mymethod) {
            return { range: mymethod.name.range, placeholder: mymethod.name.text };
        }

        let { field } = findFieldReference(document, position);
        if (field) {
            return { range: field.name.range, placeholder: field.name.text };
        }

        let { method } = findMethodReference(document, position);
        if (method) {
            return { range: method.name.range, placeholder: method.name.text };
        }
    }

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit> {
        let edit = new vscode.WorkspaceEdit();
        let owner = findClassName(document);

        let type = findType(document, position);
        if (type && type.identifier) {
            // Rename class references.
            let locations = await extension.searchSymbolReference([
                type.identifier,
                '"' + type.identifier.slice(0, -1) + '"',
            ]);
            for (const reference of locations[0]) {
                edit.replace(reference.uri, reference.range, newName);
            }
            for (const annotation of locations[1]) {
                edit.replace(annotation.uri, annotation.range, '"' + newName.slice(0, -1) + '"');
            }
            // Rename class file.
            let jclass = await extension.searchSmaliClass(type.identifier);
            let oldPath = escape(jclass.name.identifier.slice(1, -1) + '.smali');
            let newPath = escape(newName.slice(1, -1) + '.smali');
            let oldUri = jclass.uri;
            let newUri = vscode.Uri.parse(oldUri.toString().replace(oldPath, newPath));
            edit.renameFile(oldUri, newUri);
            return edit;
        }

        let myfield = findFieldDefinition(document, position);
        if (myfield) {
            return renameField(edit, owner, myfield, newName);
        }

        let mymethod = findMethodDefinition(document, position);
        if (mymethod) {
            let subclasses: string[] = new Array();
            let roots = await extension.searchRootClassIdsForMethod(owner, mymethod);
            for (const root of roots) {
                subclasses = subclasses.concat(root, ...await extension.searchSmaliSubclassIds(root));
            }
            return renameMethod(edit, subclasses, mymethod, newName);
        }

        let { owner: fowner, field } = findFieldReference(document, position);
        if (fowner && field) {
            return renameField(edit, fowner.identifier, field, newName);
        }

        let { owner: mowner, method } = findMethodReference(document, position);
        if (mowner && method) {
            let subclasses: string[] = new Array();
            let roots = await extension.searchRootClassIdsForMethod(mowner.identifier, method);
            for (const root of roots) {
                subclasses = subclasses.concat(root, ...await extension.searchSmaliSubclassIds(root));
            }
            return renameMethod(edit, subclasses, method, newName);
        }

        return edit;
    }
}

async function renameField(edit: vscode.WorkspaceEdit, ownerId: string, field: Field, newName: string): Promise<vscode.WorkspaceEdit> {
    // Rename field definition.
    let jclass = await extension.searchSmaliClass(ownerId);
    if (jclass) {
        let fields = extension.searchFieldDefinition(jclass, field);
        for (const field of fields) {
            edit.replace(jclass.uri, field.name.range, newName);
        }
    }
    // Rename field references.
    let locations = await extension.searchSymbolReference([ownerId + '->' + field.getIdentifier()]);
    let newIdentifier = field.getIdentifier(newName);
    for (const location of locations[0]) {
        edit.replace(location.uri, location.range, ownerId + '->' + newIdentifier);
    }
    return edit;
}

async function renameMethod(edit: vscode.WorkspaceEdit, ownerIds: string[], method: Method, newName: string): Promise<vscode.WorkspaceEdit> {
    // Rename method definition.
    for (const ownerId of ownerIds) {
        let jclass = await extension.searchSmaliClass(ownerId);
        if (jclass) {
            let methods = extension.searchMethodDefinition(jclass, method);
            for (const method of methods) {
                edit.replace(jclass.uri, method.name.range, newName);
            }
        }
    }
    // Rename method references.
    let oldReferences = ownerIds.map(ownerId => ownerId + '->' + method.getIdentifier());
    let newReferences = ownerIds.map(ownerId => ownerId + '->' + method.getIdentifier(newName));
    let locations = await extension.searchSymbolReference(oldReferences);
    for (let i = 0; i < locations.length; i++) {
        for (const location of locations[i]) {
            edit.replace(location.uri, location.range, newReferences[i]);
        }
    }
    return edit;
}
