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
        {
            let type = findType(document, position);
            if (type && type.identifier) {
                return { range: type.range, placeholder: type.identifier };
            }
        }
        {
            let myfield = findFieldDefinition(document, position);
            if (myfield) {
                return { range: myfield.name.range, placeholder: myfield.name.text };
            }
        }
        {
            let mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                return { range: mymethod.name.range, placeholder: mymethod.name.text };
            }
        }
        {    
            let { field } = findFieldReference(document, position);
            if (field) {
                return { range: field.name.range, placeholder: field.name.text };
            }
        }
        {
            let { method } = findMethodReference(document, position);
            if (method) {
                return { range: method.name.range, placeholder: method.name.text };
            }
        }
    }

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit> {
        let edit = new vscode.WorkspaceEdit();
        {
            let type = findType(document, position);
            if (type && type.identifier) {
                const innerIds = await extension.searchMemberAndEnclosedClassIds(type.identifier);
                const oldIds = [type.identifier].concat(innerIds);
                const newIds = oldIds.map(id => id.replace(type.identifier.slice(0, -1), newName.slice(0, -1)));
                return renameClasses(edit, oldIds, newIds);
            }
        }
        {
            let myfield = findFieldDefinition(document, position);
            if (myfield) {
                let owner = findClassName(document);
                if (owner) {
                    return renameField(edit, owner, myfield, newName);
                }
            }
        }
        {
            let mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                let owner = findClassName(document);
                if (owner) {
                    let subclasses: string[] = new Array();
                    let roots = await extension.searchRootClassIdsForMethod(owner, mymethod);
                    for (const root of roots) {
                        subclasses = subclasses.concat(root, ...await extension.searchSmaliSubclassIds(root));
                    }
                    return renameMethod(edit, subclasses, mymethod, newName);
                }
            }
        }
        {
            let { owner, field } = findFieldReference(document, position);
            if (owner && field) {
                return renameField(edit, owner.identifier, field, newName);
            }
        }
        {
            let { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                let subclasses: string[] = new Array();
                let roots = await extension.searchRootClassIdsForMethod(owner.identifier, method);
                for (const root of roots) {
                    subclasses = subclasses.concat(root, ...await extension.searchSmaliSubclassIds(root));
                }
                return renameMethod(edit, subclasses, method, newName);
            }
        }
        return edit;
    }
}

async function renameClasses(edit: vscode.WorkspaceEdit, oldIds: string[], newIds: string[]) {
    if (oldIds.length !== newIds.length) {
        throw Error(`Unexpected mismatch: oldIds.length = ${oldIds.length}, newIds.length = ${newIds.length}`);
    }
    // Rename class references.
    const oldReferences: string[] = [].concat(...oldIds.map(id => [id, `"${id.slice(0, -1)}"`]));
    const newReferences: string[] = [].concat(...newIds.map(id => [id, `"${id.slice(0, -1)}"`]));
    let results = await extension.searchSymbolReference(oldReferences);
    for (let i = 0; i < results.length; i++) {
        for (const location of results[i]) {
            edit.replace(location.uri, location.range, newReferences[i]);
        }
    }
    // Rename class file.
    for (let i = 0; i < oldIds.length; i++) {
        let jclass = await extension.searchSmaliClass(oldIds[i]);
        if (jclass) {
            let oldPath = escape(`${jclass.name.identifier.slice(1, -1)}.smali`);
            let newPath = escape(`${newIds[i].slice(1, -1)}.smali`);
            let oldUri = jclass.uri;
            let newUri = vscode.Uri.parse(oldUri.toString().replace(oldPath, newPath));
            edit.renameFile(oldUri, newUri);
        }
    }
    return edit;
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
    let locations = await extension.searchSymbolReference([`${ownerId}->${field.toIdentifier()}`]);
    let newIdentifier = field.toIdentifier(newName);
    for (const location of locations[0]) {
        edit.replace(location.uri, location.range, `${ownerId}->${newIdentifier}`);
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
    let oldReferences = ownerIds.map(ownerId => `${ownerId}->${method.toIdentifier()}`);
    let newReferences = ownerIds.map(ownerId => `${ownerId}->${method.toIdentifier(newName)}`);
    let locations = await extension.searchSymbolReference(oldReferences);
    for (let i = 0; i < locations.length; i++) {
        for (const location of locations[i]) {
            edit.replace(location.uri, location.range, newReferences[i]);
        }
    }
    return edit;
}
