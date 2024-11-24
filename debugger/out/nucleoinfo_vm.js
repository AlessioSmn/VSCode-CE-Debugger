"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatVmMaps = formatVmMaps;
exports.formatVmTree = formatVmTree;
exports.vmPathAnalyzer = vmPathAnalyzer;
const handlebars_1 = __importDefault(require("handlebars"));
function formatVmMaps() {
    let mem_part = [];
    this.vmMaps.forEach(element => { mem_part.push(element); });
    let source = `
		<div>
			<h2>Zone di memoria</h2>
			<div>
			{{#each mem_part}}
				<div>
					<h3><span>{{part}}</span></h3>
					<div>
					{{#each info}}
						<p>
							<span class="vm_maps {{t}}">
							{{a}} {{o}} {{x}}
							</span>
						</p>
					{{/each}}
					</div>		
				</div>
			{{/each}}
			</div>
		</div>
	`;
    let template = handlebars_1.default.compile(source);
    return template({ mem_part: mem_part });
}
function formatVmTree() {
    let vmTreeFirstLevel = [];
    this.vmTree.vm_tree.forEach(element => { vmTreeFirstLevel.push(element); });
    let source = `
		<div>
			<h2>VM Mapping Tree</h2>
			<div class="vm_tree_root">
			{{#each vmTreeFirstLevel}}
				<div data-index-1="{{@index}}" data-opened="0">
					<p onclick="showSubList(this)">
						{{i.o}} - {{i.a}} - {{i.x}}
					</p>
				</div>
			{{/each}}
			</div>
		</div>
	`;
    let template = handlebars_1.default.compile(source);
    return template({ vmTreeFirstLevel: vmTreeFirstLevel });
}
function vmPathAnalyzer() {
    let source = `
		<div>
			<h2>VM Translation Path</h2>
			<div style="display: inline-flex; width: 100%;">
				<input type="text" style="display:inline-block; width:50%;" id="vmadd" onkeydown="if(event.key === 'Enter') showTranslationPath();">
				<button onclick="showTranslationPath()" style="display:inline-block; width:auto; padding: 0 20px;">Show path</button>
			</div>
			<div id="vmPath"></div>
			<div id="vmPathResult"></div>
		</div>
	`;
    let template = handlebars_1.default.compile(source);
    return template();
}
//# sourceMappingURL=nucleoinfo_vm.js.map