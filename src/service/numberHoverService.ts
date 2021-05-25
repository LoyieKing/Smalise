import * as vscode from 'vscode';
import { resourceIdMap } from './resourceService';


export function numberHover(numberText: string, range: vscode.Range) {
    const num = Number.parseInt(numberText)
    let md =
        `
Binary: \`${num.toString(2)}\`

Octal: \`${num.toString(8)}\`

Dec: \`${num.toString(10)}\`

Hex: \`${num.toString(16)}\`
`

    let resourceItem = resourceIdMap[num]
    if (resourceItem) {
        md = md +
            `
Resource: \`R.${resourceItem.type}.${resourceItem.name}\`
`
    }

    return new vscode.Hover(new vscode.MarkdownString(md), range)
}