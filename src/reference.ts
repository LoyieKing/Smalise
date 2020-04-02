import * as vscode from 'vscode';
import * as extension from './extension';

import { AsClassName, AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference } from './language/parser';

export class SmaliReferenceProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        let owner = AsClassName(document);

        let type = AsType(document, position);
        if (type && type.Identifier) {
            return extension.SearchSymbolReference(type.Identifier);
        }

        let myfield = AsFieldDefinition(document, position);
        if (owner && myfield) {
            return extension.SearchSymbolReference(owner + '->' + myfield.getIdentifier());
        }

        let mymethod = AsMethodDefinition(document, position);
        if (owner && mymethod) {
            return extension.SearchSymbolReference(owner + '->' + mymethod.getIdentifier());
        }

        let { owner: fowner, field } = AsFieldReference(document, position);
        if (fowner && field) {
            return extension.SearchSymbolReference(fowner.Raw + '->' + field.getIdentifier());
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            return extension.SearchSymbolReference(mowner.Raw + '->' + method.getIdentifier());
        }
    }
}