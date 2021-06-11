import * as vscode from 'vscode';
import * as extension from './extension';

export class SmaliDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.SymbolInformation[]> {
        const jclass = extension.smali.loadClass(document);
        if (!jclass) {
            return [];
        }
        const symbols: vscode.SymbolInformation[] = [];

        for (const field of jclass.fields) {
            symbols.push(new vscode.SymbolInformation(
                field.name.text,
                vscode.SymbolKind.Field,
                field.modifiers.join(' ') +' '+ field.type,
                new vscode.Location(document.uri, field.range)
            ));
        }

        for (const ctor of jclass.constructors) {
            symbols.push(new vscode.SymbolInformation(
                `constructor(${ctor.parameters.join(', ')})`,
                vscode.SymbolKind.Constructor,
                ctor.name.text,
                new vscode.Location(document.uri, ctor.range)
            ));
        }

        for (const method of jclass.methods) {
            symbols.push(new vscode.SymbolInformation(
                `${method.name.text}(${method.parameters.join(', ')})`,
                vscode.SymbolKind.Method,
                `${method.returnType}`,
                new vscode.Location(document.uri, method.range)
            ));
        }

        if (token.isCancellationRequested) {
            return [];
        }
        return symbols;
    }
}