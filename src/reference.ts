import * as vscode from 'vscode';
import * as extension from './extension';

import { findClassName, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference } from './language/parser';

export class SmaliReferenceProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        let owner = findClassName(document);

        let type = findType(document, position);
        if (type && type.identifier) {
            let references = await extension.searchSymbolReference(type.identifier);
            let annotations = await extension.searchSymbolReference('"' + type.identifier.slice(0, -1) + '"');
            return [].concat(references, annotations);
        }

        let myfield = findFieldDefinition(document, position);
        if (owner && myfield) {
            return extension.searchSymbolReference(owner + '->' + myfield.getIdentifier());
        }

        let mymethod = findMethodDefinition(document, position);
        if (owner && mymethod) {
            return extension.searchSymbolReference(owner + '->' + mymethod.getIdentifier());
        }

        let { owner: fowner, field } = findFieldReference(document, position);
        if (fowner && field) {
            return extension.searchSymbolReference(fowner.raw + '->' + field.getIdentifier());
        }

        let { owner: mowner, method } = findMethodReference(document, position);
        if (mowner && method) {
            return extension.searchSymbolReference(mowner.raw + '->' + method.getIdentifier());
        }
    }
}