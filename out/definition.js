"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const smali_language = require("./language");
const extension_1 = require("./extension");
const fs_1 = require("fs");
class SmaliDefinitionProvider {
    provideDefinition(document, position, token) {
        let locations = new Array();
        let type = smali_language.AsType(document, position);
        if (type) {
            let classfile_name = type2fspath(type.spot);
            for (const jclass of extension_1.jclasses) {
                if (jclass[0].path.endsWith(classfile_name)) {
                    locations.push(new vscode.Location(jclass[0], new vscode.Position(0, 0)));
                }
            }
        }
        let field = smali_language.AsField(document, position);
        if (field) {
            let classfile_name = type2fspath(field.type);
            for (const jclass of extension_1.jclasses) {
                if (jclass[0].path.endsWith(classfile_name)) {
                    if (!jclass[1]) {
                        let doc = fs_1.readFileSync(jclass[0].fsPath).toString();
                        jclass[1] = smali_language.ParseSmali(doc);
                    }
                    for (const _field of jclass[1].Fileds) {
                        if (field.field.equal(_field)) {
                            locations.push(new vscode.Location(jclass[0], _field.Range));
                        }
                    }
                }
            }
        }
        let method = smali_language.AsMethod(document, position);
        if (method) {
            let classfile_name = type2fspath(method.type);
            for (const jclass of extension_1.jclasses) {
                if (jclass[0].path.endsWith(classfile_name)) {
                    if (!jclass[1]) {
                        let doc = fs_1.readFileSync(jclass[0].fsPath).toString();
                        jclass[1] = smali_language.ParseSmali(doc);
                    }
                    if (method.spot instanceof smali_language.Constructor) {
                        for (const _cotr of jclass[1].Constructors) {
                            if (method.spot.equal(_cotr)) {
                                locations.push(new vscode.Location(jclass[0], _cotr.Range));
                            }
                        }
                    }
                    else if (method.spot instanceof smali_language.Method) {
                        for (const _method of jclass[1].Methods) {
                            if (method.spot.equal(_method)) {
                                locations.push(new vscode.Location(jclass[0], _method.Range));
                            }
                        }
                    }
                }
            }
        }
        return locations;
    }
}
exports.SmaliDefinitionProvider = SmaliDefinitionProvider;
function type2fspath(type) {
    if (!type) {
        return null;
    }
    let name = type.Raw.substr(1, type.Raw.length - 2);
    name = name + '.smali';
    return name;
}
//# sourceMappingURL=definition.js.map