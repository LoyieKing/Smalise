import * as vscode from 'vscode';
import * as smali_language from './language';

export class SmaliHoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        vscode.Hover {
        let info = smali_language.SpotPosition(document, position);

        let str: string;
        if (info.spot instanceof smali_language.Filed) {
            str = info.spot.Modifiers.join(' ') + ' ' + info.spot.Type + ' ' + info.spot.Name;
            if (info.spot.Initial) {
                str += ' = ' + info.spot.Initial;
            }
        }
        else if (info.spot instanceof smali_language.Method) {
            if (info.spot.Modifiers) {
                str = info.spot.Modifiers.join(' ') + ' ' + info.spot.Name + '(' + params2string(info.spot.Parameters) + ') : ' + info.spot.ReturnType.Readable;
            } else {
                str = info.spot.Name + '(' + params2string(info.spot.Parameters) + ') : ' + info.spot.ReturnType.Readable;
            }
        }
        else if (info.spot instanceof smali_language.Constructor) {
            if (info.spot.Modifiers) {
                str = info.spot.Modifiers.join(' ') + ' ' + info.spot.Name + '(' + params2string(info.spot.Parameters) + ')';
            } else {
                str = info.spot.Name + '(' + params2string(info.spot.Parameters) + ')';
            }
        }
        else if (info.spot instanceof smali_language.Type) {
            str = info.spot.Readable;
        }
        else if (info.spot instanceof smali_language.JString) {
            str = info.spot.value;
        }

        //return Promise.resolve();
        return new vscode.Hover({ language: 'java', value: str }, info.range);
    }
}

function params2string(params: smali_language.Type[]): string {
    if (!params) {
        return ' ';
    }
    let array = [];
    for (let i = 0; i < params.length; i++) {
        array.push(params[i].Readable);
        array.push(' ');
        array.push('param' + i + '_' + params[i].Readable.replace(/\./g, '_'));
        array.push(', ');
    }
    array.pop();
    return array.join('');
}