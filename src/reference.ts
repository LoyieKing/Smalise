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
            let locations = await extension.searchSymbolReference([
                type.identifier,
                '"' + type.identifier.slice(0, -1) + '"',
            ]);
            return [].concat(...locations);
        }

        let myfield = findFieldDefinition(document, position);
        if (owner && myfield) {
            let locations = await extension.searchSymbolReference([owner + '->' + myfield.getIdentifier()]);
            return locations[0];
        }

        let mymethod = findMethodDefinition(document, position);
        if (owner && mymethod) {
            let locations = await extension.searchSymbolReference([owner + '->' + mymethod.getIdentifier()]);
            return locations[0];
        }

        let { owner: fowner, field } = findFieldReference(document, position);
        if (fowner && field) {
            let locations = await extension.searchSymbolReference([fowner.identifier + '->' + field.getIdentifier()]);
            return locations[0];
        }

        let { owner: mowner, method } = findMethodReference(document, position);
        if (mowner && method) {
            let locations = await extension.searchSymbolReference([mowner.identifier + '->' + method.getIdentifier()]);
            return locations[0];
        }
    }
}