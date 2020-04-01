import * as vscode from 'vscode';

export class SmaliReferenceProvider implements vscode.ReferenceProvider {
    public provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Thenable<vscode.Location[]> {
        return new Promise((resolve) => {
            let locations = new Array<vscode.Location>();

            resolve(locations);
        });
    }
}