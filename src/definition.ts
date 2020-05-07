import * as vscode from 'vscode';
import * as extension from './extension';

import { findClassName, findLabel, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference, findMethodBody } from './language/parser';
import { Field, Method } from './language/structs';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        {
            const type = findType(document, position);
            if (type && type.identifier) {
                const results = await extension.smali.searchClasses(type.identifier);
                return results.map(([uri, _]) => new vscode.Location(uri, new vscode.Position(0, 0)));
            }
        }
        {
            const label = findLabel(document, position);
            if (label) {
                const locations: vscode.Location[] = [];
                const body = findMethodBody(document, position);
                if (body) {
                    const lines = body.text.split('\n');
                    for (const i in lines) {
                        if (lines[i].trim() === label.text) {
                            const start = new vscode.Position(body.range.start.line + Number(i), lines[i].indexOf(':'));
                            const end   = new vscode.Position(body.range.start.line + Number(i), lines[i].length);
                            locations.push(new vscode.Location(document.uri, new vscode.Range(start, end)));
                        }
                    }
                }
                return locations;
            }
        }
        {
            const myfield = findFieldDefinition(document, position);
            if (myfield) {
                return new vscode.Location(document.uri, myfield.range);
            }
        }
        {
            const mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                const location = new vscode.Location(document.uri, mymethod.range);
                const owner = findClassName(document.getText());
                if (owner) {
                    const superclasses = await extension.smali.searchSuperClassIds(owner);
                    return [location, ...await searchMethodDefinition(superclasses, mymethod)];
                }
                return [location];
            }
        }
        {
            const { owner, field } = findFieldReference(document, position);
            if (owner && field) {
                return searchFieldDefinition([owner.identifier], field);
            }
        }
        {
            const { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                const superclasses = await extension.smali.searchSuperClassIds(owner.identifier);
                return searchMethodDefinition([owner.identifier, ...superclasses], method);
            }
        }
        return [];
    }
}

async function searchFieldDefinition(identifiers: (string | undefined)[], field: Field): Promise<vscode.Location[]> {
    const locations: vscode.Location[] = [];
    for (const identifier of identifiers) {
        const results = await extension.smali.searchClasses(identifier);
        for (const [uri, jclass] of results) {
            const fields = extension.smali.searchFieldDefinition(jclass, field);
            fields.forEach(f => locations.push(new vscode.Location(uri, f.range)));
        }
    }
    return locations;
}

async function searchMethodDefinition(identifiers: (string | undefined)[], method: Method): Promise<vscode.Location[]> {
    const locations: vscode.Location[] = [];
    for (const identifier of identifiers) {
        const results = await extension.smali.searchClasses(identifier);
        for (const [uri, jclass] of results) {
            const methods = extension.smali.searchMethodDefinition(jclass, method);
            methods.forEach(m => locations.push(new vscode.Location(uri, m.range)));
        }
    }
    return locations;
}