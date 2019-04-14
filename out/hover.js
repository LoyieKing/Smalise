"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const smali_language = require("./language");
class SmaliHoverProvider {
    provideHover(document, position, token) {
        let info = smali_language.SpotPosition(document, position);
        let str;
        if (info.spot instanceof smali_language.Filed) {
            str = info.spot.Modifiers.join(' ') + ' ' + info.spot.Type + ' ' + info.spot.Name;
            if (info.spot.Initial) {
                str += ' = ' + info.spot.Initial;
            }
        }
        else if (info.spot instanceof smali_language.Method) {
            if (info.spot.Modifiers) {
                str = info.spot.Modifiers.join(' ') + ' ' + info.spot.Name + '(' + params2string(info.spot.Parameters) + ') : ' + info.spot.ReturnType.Readable;
            }
            else {
                str = info.spot.Name + '(' + params2string(info.spot.Parameters) + ') : ' + info.spot.ReturnType.Readable;
            }
        }
        else if (info.spot instanceof smali_language.Constructor) {
            if (info.spot.Modifiers) {
                str = info.spot.Modifiers.join(' ') + ' ' + info.spot.Name + '(' + params2string(info.spot.Parameters) + ')';
            }
            else {
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
exports.SmaliHoverProvider = SmaliHoverProvider;
function params2string(params) {
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
//# sourceMappingURL=hover.js.map