import * as vscode from 'vscode';
import * as extension from './extension';

import { findClassName, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference } from './language/parser';

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
            let jclass = await extension.searchSmaliClass(type.identifier);
            // Rename class file.
            let oldPath = escape(jclass.name.identifier.substr(1) + '.smali');
            let newPath = escape(newName.substr(1) + '.smali');
            let oldUri = jclass.uri.toString();
            let newUri = vscode.Uri.parse(oldUri.replace(oldPath, newPath));
            edit.renameFile(jclass.uri, newUri);
            // Rename class references.
            let locations = await extension.searchSymbolReference(type.identifier);
            for (const location of locations) {
                if (location.uri.toString() === oldUri) {
                    location.uri = newUri;
                }
                edit.replace(location.uri, location.range, newName);
            }
            return edit;
        }

        let myfield = findFieldDefinition(document, position);
        if (myfield) {
            // Rename field definition.
            edit.replace(document.uri, myfield.name.range, newName);
            // Rename field references.
            let locations = await extension.searchSymbolReference(owner + '->' + myfield.getIdentifier());
            let newIdentifier = myfield.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, owner + '->' + newIdentifier);
            }
            return edit;
        }

        let mymethod = findMethodDefinition(document, position);
        if (mymethod) {
            // Rename method definition.
            edit.replace(document.uri, mymethod.name.range, newName);
            // Rename method references.
            let locations = await extension.searchSymbolReference(owner + '->' + mymethod.getIdentifier());
            let newIdentifier = mymethod.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, owner + '->' + newIdentifier);
            }
            return edit;
        }

        let { owner: fowner, field } = findFieldReference(document, position);
        if (fowner && field) {
            // Rename field definition.
            let jclass = await extension.searchSmaliClass(fowner.identifier);
            if (jclass) {
                let fields = extension.searchFieldDefinition(jclass, field);
                for (const field of fields) {
                    edit.replace(jclass.uri, field.name.range, newName);
                }
            }
            // Rename field references.
            let locations = await extension.searchSymbolReference(fowner + '->' + field.getIdentifier());
            let newIdentifier = field.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, fowner + '->' + newIdentifier);
            }
            return edit;
        }

        let { owner: mowner, method } = findMethodReference(document, position);
        if (mowner && method) {
            // Rename method definition.
            let jclass = await extension.searchSmaliClass(mowner.identifier);
            if (jclass) {
                let methods = extension.searchMethodDefinition(jclass, method);
                for (const method of methods) {
                    edit.replace(jclass.uri, method.name.range, newName);
                }
            }
            // Rename method references.
            let locations = await extension.searchSymbolReference(mowner + '->' + method.getIdentifier());
            let newIdentifier = method.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, mowner + '->' + newIdentifier);
            }
            return edit;
        }

        return edit;
    }
}

