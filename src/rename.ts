import * as vscode from 'vscode';
import * as extension from './extension';

import { ReferenceType } from './language/structs';
import { AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference } from './language/parser';

export class SmaliRenameProvider implements vscode.RenameProvider {
    prepareRename?(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): { range: vscode.Range; placeholder: string; } {
        let type = AsType(document, position);
        if (type && type instanceof ReferenceType) {
            return { range: type.Range, placeholder: type.Raw };
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

    provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): vscode.ProviderResult<vscode.WorkspaceEdit> {
        throw new Error("Method not implemented.");
    }
}