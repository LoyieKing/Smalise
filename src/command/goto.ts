import * as vscode from 'vscode';

export default function (symbol: string | undefined) {
    if (!symbol) {

    }
}


async function showSymbolsForUser() {
    let selections = [];
    vscode.window.showInputBox()
    let result = vscode.window.showQuickPick(selections, {
        canPickMany: false
    })
}

function gotoSymbol() {

}