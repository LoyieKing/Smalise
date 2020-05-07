import * as vscode from 'vscode';
import * as extension from './extension';

import { findClassName, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference} from './language/parser';
import { Field, Method } from './language/structs';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        {
            let type = findType(document, position);
            if (type && type.identifier) {
                const results = await extension.smali.searchClasses(type.identifier);
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
                const location = new vscode.Location(document.uri, mymethod.range);
                let owner = findClassName(document.getText());
                if (owner) {
                    const superclasses = await extension.smali.searchSuperClassIds(owner);
                    return (await searchMethodDefinition(superclasses, mymethod)).concat(location);
                }
                return [location];
            }
        }
        {
            let { owner, field } = findFieldReference(document, position);
            if (owner && field) {
                return searchFieldDefinition([owner.identifier], field);
            }
        }
        {
            let { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                const superclasses = await extension.smali.searchSuperClassIds(owner.identifier);
                return searchMethodDefinition(superclasses.concat(owner.identifier), method);
            }
        }
    }
}

async function searchFieldDefinition(identifiers: string[], field: Field): Promise<vscode.Location[]> {
    const locations = new Array<vscode.Location>();
    for (const identifier of identifiers) {
        const results = await extension.smali.searchClasses(identifier);
        for (const [uri, jclass] of results) {
            const fields = extension.smali.searchFieldDefinition(jclass, field);
            fields.forEach(f => locations.push(new vscode.Location(uri, f.range)));
        }
    }
    return locations;
}

async function searchMethodDefinition(identifiers: string[], method: Method): Promise<vscode.Location[]> {
    const locations = new Array<vscode.Location>();
    for (const identifier of identifiers) {
        const results = await extension.smali.searchClasses(identifier);
        for (const [uri, jclass] of results) {
            const methods = extension.smali.searchMethodDefinition(jclass, method);
            methods.forEach(m => locations.push(new vscode.Location(uri, m.range)))
        }
    }
    return locations;
}