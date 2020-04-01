import * as vscode from 'vscode';
import * as extension from './extension';

export class SmaliDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Thenable<vscode.SymbolInformation[]> {
        return new Promise<vscode.SymbolInformation[]>((resolve) => {
            let jclass = extension.ParseSmaliDocumentWithCache(document);
            if (jclass === null) {
                return null;
            }
            let symbols = new Array<vscode.SymbolInformation>();

            for (const field of jclass.Fields) {
                symbols.push(new vscode.SymbolInformation(
                    field.Name.Text,
                    vscode.SymbolKind.Field,
                    field.Modifiers.join(' ') +' '+ field.Type,
                    new vscode.Location(document.uri, field.Range)
                ));
            }

            for (const ctor of jclass.Constructors) {
                symbols.push(new vscode.SymbolInformation(
                    `Constructors(${ctor.Parameters.join(', ')})`,
                    vscode.SymbolKind.Constructor,
                    ctor.Name.Text,
                    new vscode.Location(document.uri, ctor.Range)
                ));
            }

            for (const method of jclass.Methods) {
                symbols.push(new vscode.SymbolInformation(
                    `${method.Name.Text}(${method.Parameters.join(', ')})`,
                    vscode.SymbolKind.Method,
                    method.ReturnType.toString(),
                    new vscode.Location(document.uri, method.Range)
                ));
            }

            resolve(symbols);
        });
    }
}