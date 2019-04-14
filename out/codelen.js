"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class GoCodeLensProvider {
    provideCodeLenses(document, token) {
        let codelens = new Array();
        let text = document.getText();
        for (const str of text.match(/"(.*?)"/)) {
        }
    }
    resolveCodeLens(codeLens, token) {
    }
}
//# sourceMappingURL=codelen.js.map