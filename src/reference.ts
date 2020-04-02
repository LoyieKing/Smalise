import * as vscode from 'vscode';
import { ReferenceType } from './language/structs';
import { AsType } from './language/parser';

import { SearchSymbolReference } from './extension';

export class SmaliReferenceProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        let type = AsType(document, position);
        if (type && type instanceof ReferenceType) {
            return SearchSymbolReference(type.Raw);
        }
    }
}