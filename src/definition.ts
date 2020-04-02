import * as vscode from 'vscode';
import * as extension from './extension';

import { Class, Field, Method } from './language/structs';
import { AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference} from './language/parser';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        let type = AsType(document, position);
        if (type && type.Identifier) {
            const jclasses = await extension.SearchSmaliClass(type.Identifier);
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
            const jclasses = await extension.SearchSmaliClass(fowner.Identifier);
            let locations = new Array<vscode.Location>();
            for (const jclass of jclasses) {
                if (jclass) {
                    let fields = extension.SearchFieldDefinition(jclass, field);
                    locations = locations.concat(
                        fields.map(f => new vscode.Location(jclass.Uri, f.Range))
                    );
                }
            }
            return locations;
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            const jclasses = await extension.SearchSmaliClass(mowner.Identifier);
            let locations = new Array<vscode.Location>();
            for (const jclass of jclasses) {
                if (jclass) {
                    let methods = extension.SearchMethodDefinition(jclass, method);
                    locations = locations.concat(
                        methods.map(m => new vscode.Location(jclass.Uri, m.Range))
                    );
                }
            }
            return locations;
        }
    }
}