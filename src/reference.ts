import * as vscode from 'vscode';
import * as extension from './extension';

import { findClassName, findLabel, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference, findMethodBody } from './language/parser';

export class SmaliReferenceProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        {
            const type = findType(document, position);
            if (type && type.identifier) {
                const locations = await extension.smali.searchSymbolReference([
                    type.identifier,
                    `"${type.identifier.slice(0, -1)}"`,
                ]);
                return [].concat(...locations);
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
                        if (lines[i].trim() !== label.text && lines[i].includes(label.text)) {
                            const start = new vscode.Position(body.range.start.line + Number(i), lines[i].indexOf(label.text));
                            const end   = new vscode.Position(body.range.start.line + Number(i), start.character + label.length);
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
                const owner = findClassName(document.getText());
                if (owner) {
                    const locations = await extension.smali.searchSymbolReference([`${owner}->${myfield.toIdentifier()}`]);
                    return locations[0];
                }
            }
        }
        {
            const mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                const owner = findClassName(document.getText());
                if (owner) {
                    const superclasses = await extension.smali.searchSuperClassIds(owner);
                    const references = [owner, ...superclasses].map(id => `${id}->${mymethod.toIdentifier()}`);
                    return [].concat(...await extension.smali.searchSymbolReference(references));
                }
            }
        }
        {
            const { owner, field } = findFieldReference(document, position);
            if (owner && field) {
                const locations = await extension.smali.searchSymbolReference([`${owner.identifier}->${field.toIdentifier()}`]);
                return locations[0];
            }
        }
        {
            const { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                const superclasses = await extension.smali.searchSuperClassIds(owner.identifier);
                const references = [owner.identifier, ...superclasses].map(id => `${id}->${method.toIdentifier()}`);
                return [].concat(...await extension.smali.searchSymbolReference(references));
            }
        }
    }
}