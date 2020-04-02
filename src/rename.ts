import * as vscode from 'vscode';
import * as extension from './extension';

export class SmaliRenameProvider implements vscode.RenameProvider {
    prepareRename?(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string; }> {
        throw new Error("Method not implemented.");
    }

    provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string, token: vscode.CancellationToken): vscode.ProviderResult<vscode.WorkspaceEdit> {
        throw new Error("Method not implemented.");
    }
}