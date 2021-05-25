import * as vscode from 'vscode';
import * as xml2js from "xml2js";

export type ResourceItem = { type: string, name: string, id: string }

export const resourceIdMap: {
    [resourceID: number]: ResourceItem | undefined
} = {}

export async function loadPublicXml(path: vscode.Uri) {
    for (let id in resourceIdMap) {
        delete resourceIdMap[id];
    }

    const xmlString = await (await vscode.workspace.fs.readFile(path))
    const xml = await xml2js.parseStringPromise(xmlString)
    const values: { type: string, name: string, id: string }[] = xml?.resources?.public.map(it => it.$)
    values.forEach(it => {
        const id = Number.parseInt(it.id)
        resourceIdMap[id] = it
    })

}