import * as vscode from 'vscode';
import * as extension from './extension';

import { findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference} from './language/parser';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        {
            let type = findType(document, position);
            if (type && type.identifier) {
                const jclass = await extension.searchSmaliClass(type.identifier);
                if (jclass) {
                    return new vscode.Location(jclass.uri, new vscode.Position(0, 0));
                }
            }
        }
        {
            let myfield = findFieldDefinition(document, position);
            if (myfield) {
                return new vscode.Location(document.uri, myfield.range);
            }
        }
        {
            let mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                return new vscode.Location(document.uri, mymethod.range);
            }
        }
        {
            let { owner, field } = findFieldReference(document, position);
            if (owner && field) {
                const jclass = await extension.searchSmaliClass(owner.identifier);
                if (jclass) {
                    let fields = extension.searchFieldDefinition(jclass, field);
                    return fields.map(f => new vscode.Location(jclass.uri, f.range));
                }
            }
        }
        {
            let { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                const jclass = await extension.searchSmaliClass(owner.identifier);
                if (jclass) {
                    let methods = extension.searchMethodDefinition(jclass, method);
                    return methods.map(m => new vscode.Location(jclass.uri, m.range));
                }
            }
        }
    }
}