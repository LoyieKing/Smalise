import * as vscode from 'vscode';
import * as extension from './extension';

import { Class, Field, ReferenceType, Method } from './language/structs';
import { AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference} from './language/parser';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        let type = AsType(document, position);
        if (type && type instanceof ReferenceType) {
            const jclasses = await extension.SearchSmaliClass(type);
            return jclasses.filter(c => c).map(jclass => new vscode.Location(jclass.Uri, new vscode.Position(0, 0)));
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
            const jclasses = await extension.SearchSmaliClass(fowner);
            let locations = new Array<vscode.Location>();
            for (const jclass of jclasses) {
                if (jclass !== null) {
                    locations = locations.concat(searchFieldDefinition(jclass, field));
                }
            }
            return locations;
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            const jclasses = await extension.SearchSmaliClass(mowner);
            let locations = new Array<vscode.Location>();
            for (const jclass of jclasses) {
                if (jclass !== null) {
                    locations = locations.concat(searchMethodDefinition(jclass, method));
                }
            }
            return locations;
        }
    }
}

function searchFieldDefinition(jclass: Class, field: Field): Array<vscode.Location> {
    let locations = new Array<vscode.Location>();
    for (const _field of jclass.Fields) {
        if (field.equal(_field)) {
            locations.push(new vscode.Location(jclass.Uri, _field.Range));
        }
    }
    return locations;
}

function searchMethodDefinition(jclass: Class, method: Method): Array<vscode.Location> {
    let locations = new Array<vscode.Location>();
    if (method.isConstructor) {
        for (const _cotr of jclass.Constructors) {
            if (method.equal(_cotr)) {
                locations.push(new vscode.Location(jclass.Uri, _cotr.Range));
            }
        }
    } else {
        for (const _method of jclass.Methods) {
            if (method.equal(_method)) {
                locations.push(new vscode.Location(jclass.Uri, _method.Range));
            }
        }
    }
    return locations;
}