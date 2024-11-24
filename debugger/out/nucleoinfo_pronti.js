"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCodaPronti = formatCodaPronti;
const handlebars_1 = __importDefault(require("handlebars"));
function formatCodaPronti() {
    let pronti_count = this.codaPronti.length;
    let pronti_list = this.codaPronti;
    if (pronti_count === 0) {
        return `<div><h2>Coda pronti <span class="info title">empty</span></h2></div>`;
    }
    let source = `
        <div>
            <h2>Coda pronti <span class="info title">${pronti_count} process${pronti_count === 1 ? 'o' : 'i'}</span></h2>
            <div><p>
            {{#each pronti_list}}
                <span class="info">{{this}}</span>
                <span>	
                    {{#unless this}}[DUMMY]{{/unless}}
                    {{#unless @last}} &#8594; {{/unless}}
                </span>
            {{/each}}
            </p></div>
        </div>
    `;
    let template = handlebars_1.default.compile(source);
    return template({ pronti_list: pronti_list });
}
//# sourceMappingURL=nucleoinfo_pronti.js.map