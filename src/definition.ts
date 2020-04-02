import * as vscode from 'vscode';
import { Class, Field, ReferenceType, Method } from './language/structs';
import { AsType, AsFieldReference, AsMethodReference } from './language/parser';

import { SearchSmaliClass } from './extension';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        let type = AsType(document, position);
        if (type && type instanceof ReferenceType) {
            const records = await SearchSmaliClass(type);
            return records.filter(r => r).map(([uri, _]) => new vscode.Location(uri, new vscode.Position(0, 0)));
        }

        let { owner: fowner, field } = AsFieldReference(document, position);
        if (fowner && field) {
            const records = await SearchSmaliClass(fowner);
            let locations = new Array<vscode.Location>();
            for (let record of records) {
                if (record !== null) {
                    locations = locations.concat(searchFieldDefinition(record[0], record[1], field));
                }
            }
            return locations;
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            const records = await SearchSmaliClass(mowner);
            let locations = new Array<vscode.Location>();
            for (let record of records) {
                if (record !== null) {
                    locations = locations.concat(searchMethodDefinition(record[0], record[1], method));
                }
            }
            return locations;
        }
    }
}

function searchFieldDefinition(uri: vscode.Uri, jclass: Class, field: Field): Array<vscode.Location> {
    let locations = new Array<vscode.Location>();
    for (const _field of jclass.Fields) {
        if (field.equal(_field)) {
            locations.push(new vscode.Location(uri, _field.Range));
        }
    }
    return locations;
}

function searchMethodDefinition(uri: vscode.Uri, jclass: Class, method: Method): Array<vscode.Location> {
    let locations = new Array<vscode.Location>();
    if (method.isConstructor) {
        for (const _cotr of jclass.Constructors) {
            if (method.equal(_cotr)) {
                locations.push(new vscode.Location(uri, _cotr.Range));
            }
        }
    } else {
        for (const _method of jclass.Methods) {
            if (method.equal(_method)) {
                locations.push(new vscode.Location(uri, _method.Range));
            }
        }
    }
    return locations;
}