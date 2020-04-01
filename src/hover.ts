import * as vscode from 'vscode';
import { AsString, AsType, AsFieldDefinition, AsMethodDefinition, AsFieldReference, AsMethodReference } from './language/parser';

export class SmaliHoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.Hover {
        let line = document.lineAt(position.line);

        let str = AsString(document, position);
        if (str) {
            return new vscode.Hover({ language: 'java', value: unescape(str.Text.replace(/\\u/g, '%u')) }, str.Range);
        }

        let type = AsType(document, position);
        if (type) {
            return new vscode.Hover({ language: 'java', value: type.toString() }, type.Range);
        }

        let myfield = AsFieldDefinition(document, position);
        if (myfield) {
            return new vscode.Hover({ language: 'java', value: myfield.toString() }, line.range);
        }

        let mymethod = AsMethodDefinition(document, position);
        if (mymethod) {
            return new vscode.Hover({ language: 'java', value: mymethod.toString() }, line.range);
        }

        let { owner: fowner, field } = AsFieldReference(document, position);
        if (fowner && field) {
            field.Name.Text = fowner.toString() + '.' + field.Name.Text;
            return new vscode.Hover({ language: 'java', value: field.toString()}, field.Range);
        }

        let { owner: mowner, method } = AsMethodReference(document, position);
        if (mowner && method) {
            if (method.isConstructor()) {
                method.Name.Text = 'new ' + mowner.toString();
            } else {
                method.Name.Text = mowner.toString() + '.' + method.Name.Text;
            }
            return new vscode.Hover({ language: 'java', value: method.toString()}, method.Range);
        }

        return null;
    }
}