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
                const results = await extension.smali.searchSmaliClasses(type.identifier);
                return results.map(([uri, _]) => new vscode.Location(uri, new vscode.Position(0, 0)));
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
                const results = await extension.smali.searchSmaliClasses(owner.identifier);
                const locations = new Array<vscode.Location>();
                for (const [uri, jclass] of results) {
                    const fields = extension.smali.searchFieldDefinition(jclass, field);
                    fields.forEach(f => locations.push(new vscode.Location(uri, f.range)))
                }
                return locations;
            }
        }
        {
            let { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                const results = await extension.smali.searchSmaliClasses(owner.identifier);
                const locations = new Array<vscode.Location>();
                for (const [uri, jclass] of results) {
                    const methods = extension.smali.searchMethodDefinition(jclass, method);
                    methods.forEach(m => locations.push(new vscode.Location(uri, m.range)))
                }
                return locations;
            }
        }
    }
}