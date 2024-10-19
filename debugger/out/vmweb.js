"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VMInfo = void 0;
const vscode = __importStar(require("vscode"));
const Handlebars = require('handlebars');
let interval;
class VMInfo {
    static currentPanel;
    static viewType = 'vmInfo';
    _extensionUri;
    vm_maps;
    vm_tree;
    _panel;
    _disposables = [];
    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    refreshInfo = async () => {
        const infoPanel = this._panel.webview;
        infoPanel.html = this._getLoadingPage();
        const session = vscode.debug.activeDebugSession;
        this.vm_maps = await this.customCommand(session, "vm maps");
        this.vm_tree = await this.customCommand(session, "vm tree");
        infoPanel.html = this._getHtmlForWebview();
    };
    dispose() {
        // Clean up our resources
        VMInfo.currentPanel = undefined;
        clearInterval(interval);
        this._panel.dispose();
    }
    static createInfoPanel(extensionUri, webViewPosition) {
        const panel = vscode.window.createWebviewPanel(VMInfo.viewType, 'Virtual Memory Info', webViewPosition, getWebviewOptions(extensionUri));
        VMInfo.currentPanel = new VMInfo(panel, extensionUri);
    }
    async customCommand(session, command, arg) {
        if (session) {
            const sTrace = await session.customRequest('stackTrace', { threadId: 1 });
            if (sTrace === undefined) {
                return;
            }
            const frameId = sTrace.stackFrames[0].id;
            // Build and exec the command
            const text = '-exec ' + command;
            let result = session.customRequest('evaluate', { expression: text, frameId: frameId, context: 'hover' }).then((response) => {
                return response.result;
            });
            return result;
        }
    }
    formatVmMaps() {
        let vmMapsJson = JSON.parse(this.vm_maps);
        let memPartsCount = vmMapsJson.mem_maps.length;
        let mem_part = [];
        vmMapsJson.mem_maps.forEach(element => { mem_part.push(element); });
        let source = `
			<div>
				<h2>Zone di memoria</h2>
				<div>
				{{#each mem_part}}
					<div>
						<h3><span class="key">{{part}}</span></h3>
						<div>
						{{#each info}}
							<p>
								<span class="vm_maps {{access_type}}">
								{{address}} {{addr_octal}} {{access_control_bits}}
								</span>
							</p>
						{{/each}}
						</div>		
					</div>
				{{/each}}
				</div>
			</div>
		`;
        let template = Handlebars.compile(source);
        return template({ mem_part: mem_part });
    }
    getVmTreeJsonParsed() {
        let vmTreeJson = JSON.parse(this.vm_tree);
        return vmTreeJson.vm_tree;
    }
    formatVmTree() {
        let vmTreeJson = JSON.parse(this.vm_tree);
        let vmLevels = parseInt(vmTreeJson.depth_level);
        let vmTreeFirstLevel = [];
        vmTreeJson.vm_tree.forEach(element => {
            vmTreeFirstLevel.push(element);
        });
        let source = `
			<div>
				<h2>VM Mapping Tree</h2>
				<div class="vm_tree_root">
				{{#each vmTreeFirstLevel}}
					<div data-index-1="{{@index}}" data-opened="0">
						<p onclick="showSubList(this)">
							{{info.octal}} - {{info.address}} - {{info.access}}
						</p>
					</div>
				{{/each}}
				</div>
			</div>
		`;
        let template = Handlebars.compile(source);
        return template({ vmTreeFirstLevel: vmTreeFirstLevel });
    }
    vmPathAnalyzer() {
        let source = `
			<div>
				<h2>VM Translation Path</h2>
				<input type="text" id="vmadd">
				<button onclick="showTranslationPath()">Show path</button>
				<div id="vmPath"></div>
				<h3>Translation result</h3>
				<div id="vmPathResult">
				</div>
			</div>
		`;
        let template = Handlebars.compile(source);
        return template();
    }
    _getHtmlForWebview() {
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, '/media/webview', 'main.js');
        const scriptPathOnDisk2 = vscode.Uri.joinPath(this._extensionUri, '/media/webview', 'vmTree.js');
        // And the uri we use to load this script in the webview
        const scriptUri = this._panel.webview.asWebviewUri(scriptPathOnDisk);
        const scriptUri2 = this._panel.webview.asWebviewUri(scriptPathOnDisk2);
        // Local path to css styles
        const styleResetPath = vscode.Uri.joinPath(this._extensionUri, '/media/webview', 'reset.css');
        const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, '/media/webview', 'vscode.css');
        // Uri to load styles into webview
        const stylesResetUri = this._panel.webview.asWebviewUri(styleResetPath);
        const stylesMainUri = this._panel.webview.asWebviewUri(stylesPathMainPath);
        const codiconsUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        let sourceDocument = `
		<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
						<link href="${stylesResetUri}" rel="stylesheet">
						<link href="${stylesMainUri}" rel="stylesheet">
						<link href="${codiconsUri}" rel="stylesheet" />
					<title>-</title>
				</head>
				<body>
					{{{VMpath}}}
					{{{VMtree}}}
					{{{VMmaps}}}
					<script>
						var vmTreeStringified = ${JSON.stringify(this.getVmTreeJsonParsed())};
					</script>
					<script src="${scriptUri}"></script>
					<script src="${scriptUri2}"></script>
				</body>
			</html>
		`;
        let template = Handlebars.compile(sourceDocument);
        return template({
            VMpath: this.vmPathAnalyzer(),
            VMtree: this.formatVmTree(),
            VMmaps: this.formatVmMaps()
        });
    }
    _getLoadingPage() {
        let sourceDocument = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<style>
					.loader {
						width: 80px;
						height: 80px;
						margin: auto;
						margin-top: 40px;
						border: 20px solid rgba(0, 0, 0, 0.15);
						border-radius: 50%;
						border-top: 20px solid #007ACC;
						animation: spin 2s linear infinite;
					}
					.text-container {
						text-align: center;
						margin-top: 10px;
					}

					@keyframes spin {
						0% { transform: rotate(0deg); }
						100% { transform: rotate(360deg); }
					}
				</style>
			</head>
			<body>
				<div class="loader"></div>
				<div class="text-container"><h1>Loading</h1></div>
			</body>
			</html>
		`;
        let template = Handlebars.compile(sourceDocument);
        return template();
    }
}
exports.VMInfo = VMInfo;
function getWebviewOptions(extensionUri) {
    return {
        // Enable javascript in the webview
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, '/')]
    };
}
//# sourceMappingURL=vmweb.js.map