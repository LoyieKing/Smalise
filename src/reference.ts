import * as vscode from 'vscode';
import { ReferenceType } from './language/structs';
import { AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference, ParseSmaliDocumentClassName } from './language/parser';

import { SearchSymbolReference } from './extension';

export class SmaliReferenceProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        let owner = ParseSmaliDocumentClassName(document);

        let type = AsType(document, position);
        if (type && type instanceof ReferenceType) {
            return SearchSymbolReference(type.Raw);
        }

        let myfield = AsFieldDefinition(document, position);
        if (myfield) {
            return SearchSymbolReference(owner.Raw + '->' + myfield.Raw);
        }

        let mymethod = AsMethodDefinition(document, position);
        if (mymethod) {
            return SearchSymbolReference(owner.Raw + '->' + mymethod.Raw);
        }

        let { owner: fowner, field } = AsFieldReference(document, position);
        if (fowner && field) {
            return SearchSymbolReference(fowner.Raw + '->' + field.Raw);
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            return SearchSymbolReference(mowner.Raw + '->' + method.Raw);
        }
    }
}