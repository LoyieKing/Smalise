import * as vscode from 'vscode';
import { findString, findType, findFieldDefinition, findMethodDefinition, findFieldReference, findMethodReference } from './language/parser';

export class SmaliHoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.Hover {
        let line = document.lineAt(position.line);
        {
            let str = findString(document, position);
            if (str) {
                return new vscode.Hover({ language: 'java', value: unescape(str.text.replace(/\\u/g, '%u')) }, str.range);
            }
        }
        {
            let type = findType(document, position);
            if (type) {
                return new vscode.Hover({ language: 'java', value: type.toString() }, type.range);
            }
        }
        {
            let myfield = findFieldDefinition(document, position);
            if (myfield) {
                return new vscode.Hover({ language: 'java', value: myfield.toString() }, line.range);
            }
        }
        {
            let mymethod = findMethodDefinition(document, position);
            if (mymethod) {
                return new vscode.Hover({ language: 'java', value: mymethod.toString() }, line.range);
            }
        }
        {
            let { owner, field } = findFieldReference(document, position);
            if (owner && field) {
                return new vscode.Hover({
                    language: 'java',
                    value: field.toString(owner.toString() + '.' + field.name.text)
                }, field.range);
            }
        }
        {
            let { owner, method } = findMethodReference(document, position);
            if (owner && method) {
                if (method.isConstructor) {
                    return new vscode.Hover({
                        language: 'java',
                        value: method.toString('new ' + owner.toString())
                    }, method.range);
                } else {
                    return new vscode.Hover({
                        language: 'java',
                        value: method.toString(owner.toString() + '.' + method.name.text)
                    }, method.range);
                }
            }
        }
        return null;
    }
}