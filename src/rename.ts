import * as vscode from 'vscode';
import * as extension from './extension';

import { AsClassName, AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference } from './language/parser';

export class SmaliRenameProvider implements vscode.RenameProvider {
    prepareRename?(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): { range: vscode.Range; placeholder: string; } {
        let type = AsType(document, position);
        if (type && type.Identifier) {
            return { range: type.Range, placeholder: type.Identifier };
        }

        let myfield = AsFieldDefinition(document, position);
        if (myfield) {
            return { range: myfield.Name.Range, placeholder: myfield.Name.Text };
        }

        let mymethod = AsMethodDefinition(document, position);
        if (mymethod) {
            return { range: mymethod.Name.Range, placeholder: mymethod.Name.Text };
        }

        let { field } = AsFieldReference(document, position);
        if (field) {
            return { range: field.Name.Range, placeholder: field.Name.Text };
        }

        let { method } = AsMethodReference(document, position);
        if (method) {
            return { range: method.Name.Range, placeholder: method.Name.Text };
        }
    }

    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit> {
        let edit = new vscode.WorkspaceEdit();
        let owner = AsClassName(document);

        let type = AsType(document, position);
        if (type && type.Identifier) {
            // Rename class header.
            let jclasses = await extension.SearchSmaliClass(type.Identifier);
            for (const jclass of jclasses) {
                edit.replace(jclass.Uri, jclass.Name.Range, newName);
            }
            // Rename class references.
            let locations = await extension.SearchSymbolReference(type.Identifier);
            for (const location of locations) {
                edit.replace(location.uri, location.range, newName);
            }
            return edit;
        }

        let myfield = AsFieldDefinition(document, position);
        if (myfield) {
            // Rename field definition.
            edit.replace(document.uri, myfield.Name.Range, newName);
            // Rename field references.
            let locations = await extension.SearchSymbolReference(owner + '->' + myfield.getIdentifier());
            let newIdentifier = myfield.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, owner + '->' + newIdentifier);
            }
            return edit;
        }

        let mymethod = AsMethodDefinition(document, position);
        if (mymethod) {
            // Rename method definition.
            edit.replace(document.uri, mymethod.Name.Range, newName);
            // Rename method references.
            let locations = await extension.SearchSymbolReference(owner + '->' + mymethod.getIdentifier());
            let newIdentifier = mymethod.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, owner + '->' + newIdentifier);
            }
            return edit;
        }

        let { owner: fowner, field } = AsFieldReference(document, position);
        if (fowner && field) {
            // Rename field definition.
            let jclasses = await extension.SearchSmaliClass(fowner.Identifier);
            for (const jclass of jclasses) {
                if (jclass) {
                    let fields = extension.SearchFieldDefinition(jclass, field);
                    for (const field of fields) {
                        edit.replace(jclass.Uri, field.Name.Range, newName);
                    }
                }
            }
            // Rename field references.
            let locations = await extension.SearchSymbolReference(fowner + '->' + field.getIdentifier());
            let newIdentifier = field.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, fowner + '->' + newIdentifier);
            }
            return edit;
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            // Rename method definition.
            let jclasses = await extension.SearchSmaliClass(mowner.Identifier);
            for (const jclass of jclasses) {
                if (jclass) {
                    let methods = extension.SearchMethodDefinition(jclass, method);
                    for (const method of methods) {
                        edit.replace(jclass.Uri, method.Name.Range, newName);
                    }
                }
            }
            // Rename method references.
            let locations = await extension.SearchSymbolReference(mowner + '->' + method.getIdentifier());
            let newIdentifier = method.getIdentifier(newName);
            for (const location of locations) {
                edit.replace(location.uri, location.range, mowner + '->' + newIdentifier);
            }
            return edit;
        }

        return edit;
    }
}