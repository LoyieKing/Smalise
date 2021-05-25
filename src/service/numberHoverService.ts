import * as vscode from 'vscode';
import { resourceIdMap } from './resourceService';


export function numberHover(numberText: string, range: vscode.Range) {
    const num = Number.parseInt(numberText)
    let md = `
Binary: \`${num.toString(2)}\`

Octal: \`${num.toString(8)}\`

Dec: \`${num.toString(10)}\`

Hex: \`${num.toString(16)}\`
`

    let ieee754 = hexToIEEE754(numberText)
    if (ieee754.float !== undefined) {
        md += `
Float: \`${ieee754.float}\`
`
    }
    if (ieee754.double !== undefined) {
        md += `
Double: \`${ieee754.double}\`
`
    }

    let resourceItem = resourceIdMap[num]
    if (resourceItem) {
        md += `
Resource: \`R.${resourceItem.type}.${resourceItem.name}\`
`
    }

    return new vscode.Hover(new vscode.MarkdownString(md), range)
}



function hexToIEEE754(numberText: string): { float?: number, double?: number } {
    const neg = numberText.startsWith("-")
    if (neg) {
        numberText = numberText.substring(1)
    }
    const num = Number.parseInt(numberText)
    const dv4 = new DataView(new ArrayBuffer(4))
    const dv8 = new DataView(new ArrayBuffer(8))


    let float: number | undefined = undefined
    let double: number | undefined = undefined

    if (num <= 0xFFFFFFFF) { //if num is too big, must not be a float.
        dv4.setUint32(0, num)
        float = dv4.getFloat32(0)
    }

    dv8.setUint32(0, num)
    dv8.setBigInt64(0, BigInt(num))
    double = dv8.getFloat64(0)


    return { float, double }
}