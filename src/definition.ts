import * as vscode from 'vscode';
import * as extension from './extension';

import { AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference} from './language/parser';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        let type = AsType(document, position);
        if (type && type.Identifier) {
            const jclass = await extension.SearchSmaliClass(type.Identifier);
            if (jclass) {
                return new vscode.Location(jclass.Uri, new vscode.Position(0, 0));
            }
        }

        let myfield = AsFieldDefinition(document, position);
        if (myfield) {
            return new vscode.Location(document.uri, myfield.Range);
        }

        let mymethod = AsMethodDefinition(document, position);
        if (mymethod) {
            return new vscode.Location(document.uri, mymethod.Range);
        }

        let { owner: fowner, field } = AsFieldReference(document, position);
        if (fowner && field) {
            const jclass = await extension.SearchSmaliClass(fowner.Identifier);
            if (jclass) {
                let fields = extension.SearchFieldDefinition(jclass, field);
                return fields.map(f => new vscode.Location(jclass.Uri, f.Range));
            }
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            const jclass = await extension.SearchSmaliClass(mowner.Identifier);
            if (jclass) {
                let methods = extension.SearchMethodDefinition(jclass, method);
                return methods.map(m => new vscode.Location(jclass.Uri, m.Range));
            }
        }
    }
}