import * as vscode from 'vscode';
import * as extension from './extension';

import { findClassName, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference } from './language/parser';
import { Field, Method } from './language/structs';

export class SmaliRenameProvider implements vscode.RenameProvider {
    prepareRename?(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): { range: vscode.Range; placeholder: string; } | undefined {
        {
            const type = findType(document, position);
            if (type && type.identifier) {
                return { range: type.range, placeholder: type.identifier };
            }
        }
        {
            const myfield = findFieldDefinition(document, position);
            if (myfield) {
                return { range: myfield.name.range, placeholder: myfield.name.text };
            }
        }
        {
            const mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                return { range: mymethod.name.range, placeholder: mymethod.name.text };
            }
        }
        {    
            const { field } = findFieldReference(document, position);
            if (field) {
                return { range: field.name.range, placeholder: field.name.text };
            }
        }
        {
            const { method } = findMethodReference(document, position);
            if (method) {
                return { range: method.name.range, placeholder: method.name.text };
            }
        }
        return undefined;
    }

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit> {
        const edit = new vscode.WorkspaceEdit();
        {
            const identifier = findType(document, position)?.identifier;
            if (identifier) {
                const innerIds = await extension.smali.searchMemberAndEnclosedClassIds(identifier);
                const oldIds = [identifier, ...innerIds];
                const newIds = oldIds.map(id => id.replace(identifier.slice(0, -1), newName.slice(0, -1)));
                return renameClasses(edit, oldIds, newIds);
            }
        }
        {
            const myfield = findFieldDefinition(document, position);
            if (myfield) {
                const owner = findClassName(document.getText());
                if (owner) {
                    return renameField(edit, owner, myfield, newName);
                }
            }
        }
        {
            const mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                const owner = findClassName(document.getText());
                if (owner) {
                    const subclasses: string[] = [];
                    const roots = await extension.smali.searchRootClassIdsForMethod(owner, mymethod);
                    for (const root of roots) {
                        subclasses.push(root, ...await extension.smali.searchSubClassIds(root));
                    }
                    return renameMethod(edit, subclasses, mymethod, newName);
                }
            }
        }
        {
            const { owner, field } = findFieldReference(document, position);
            if (owner && field) {
                return renameField(edit, owner.identifier, field, newName);
            }
        }
        {
            const { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                const subclasses: string[] = [];
                const roots = await extension.smali.searchRootClassIdsForMethod(owner.identifier, method);
                for (const root of roots) {
                    subclasses.push(root, ...await extension.smali.searchSubClassIds(root));
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
    const oldReferences: string[] = new Array<string>().concat(...oldIds.map(id => [id, `"${id.slice(0, -1)}"`]));
    const newReferences: string[] = new Array<string>().concat(...newIds.map(id => [id, `"${id.slice(0, -1)}"`]));
    const results = await extension.smali.searchSymbolReference(oldReferences);
    for (const i in results) {
        for (const location of results[i]) {
            edit.replace(location.uri, location.range, newReferences[i]);
        }
    }
    // Rename class file.
    for (const i in oldIds) {
        const results = await extension.smali.searchClasses(oldIds[i]);
        for (const [oldUri, jclass] of results) {
            const oldPath = escape(`${jclass.name.identifier!.slice(1, -1)}.smali`);
            const newPath = escape(`${newIds[i].slice(1, -1)}.smali`);
            const newUri = vscode.Uri.parse(oldUri.toString().replace(oldPath, newPath));
            edit.renameFile(oldUri, newUri);
        }
    }
    return edit;
}

async function renameField(edit: vscode.WorkspaceEdit, ownerId: string | undefined, field: Field, newName: string): Promise<vscode.WorkspaceEdit> {
    // Rename field definition.
    const results = await extension.smali.searchClasses(ownerId);
    for (const [uri, jclass] of results) {
        const fields = extension.smali.searchFieldDefinition(jclass, field);
        for (const field of fields) {
            edit.replace(uri, field.name.range, newName);
        }
    }
    // Rename field references.
    const locations = await extension.smali.searchSymbolReference([`${ownerId}->${field.toIdentifier()}`]);
    const newIdentifier = field.toIdentifier(newName);
    for (const location of locations[0]) {
        edit.replace(location.uri, location.range, `${ownerId}->${newIdentifier}`);
    }
    return edit;
}

async function renameMethod(edit: vscode.WorkspaceEdit, ownerIds: (string | undefined)[], method: Method, newName: string): Promise<vscode.WorkspaceEdit> {
    // Rename method definition.
    for (const ownerId of ownerIds) {
        const results = await extension.smali.searchClasses(ownerId);
        for (const [uri, jclass] of results) {
            const methods = extension.smali.searchMethodDefinition(jclass, method);
            for (const method of methods) {
                edit.replace(uri, method.name.range, newName);
            }
        }
    }
    // Rename method references.
    const oldReferences = ownerIds.map(ownerId => `${ownerId}->${method.toIdentifier()}`);
    const newReferences = ownerIds.map(ownerId => `${ownerId}->${method.toIdentifier(newName)}`);
    const locations = await extension.smali.searchSymbolReference(oldReferences);
    for (const i in locations) {
        for (const location of locations[i]) {
            edit.replace(location.uri, location.range, newReferences[i]);
        }
    }
    return edit;
}
