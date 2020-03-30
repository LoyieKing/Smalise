import * as vscode from 'vscode';
import * as smali_language from './language';
import { TextDocument } from 'vscode-languageclient';
import { jclasses } from './extension';
import { AnyARecord, CONNREFUSED } from 'dns';
import { readFileSync } from 'fs';

export class SmaliDefinitionProvider implements vscode.DefinitionProvider {
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.Location | vscode.Location[] | vscode.LocationLink[] {
        let locations = new Array<vscode.Location>();

        let type = smali_language.AsType(document, position);
        if (type) {
            let classfile_name = type2fspath(type.spot);
            for (const jclass of jclasses) {
                if (jclass[0].path.endsWith(classfile_name)) {
                    locations.push(new vscode.Location(jclass[0], new vscode.Position(0, 0)));
                }
            }
        }

        let field = smali_language.AsField(document, position);
        if (field) {
            let classfile_name = type2fspath(field.owner);
            for (const jclass of jclasses) {
                if (jclass[0].path.endsWith(classfile_name)) {
                    if (!jclass[1]) {
                        let doc = readFileSync(jclass[0].fsPath).toString();
                        jclass[1] = smali_language.ParseSmali(doc);
                    }
                    for (const _field of jclass[1].Fields) {
                        if (field.field.equal(_field)) {
                            locations.push(new vscode.Location(jclass[0], _field.Range));
                        }
                    }
                }
            }
        }

        let method = smali_language.AsMethod(document, position);
        if (method) {
            let classfile_name = type2fspath(method.owner);
            for (const jclass of jclasses) {
                if (jclass[0].path.endsWith(classfile_name)) {
                    if (!jclass[1]) {
                        let doc = readFileSync(jclass[0].fsPath).toString();
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

function type2fspath(type: smali_language.Type): string {
    if (!type) {
        return null;
    }
    let name = type.Raw.substr(1, type.Raw.length - 2);
    name = name + '.smali';
    return name;
}