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
    static viewType = 'nucleoInfo';
    _extensionUri;
    vm_tree;
    // delare your new GDB response variable
    _panel;
    _disposables = [];
    constructor(panel, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        // Set the webview's initial html content
        this._update();
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        // Update the content based on view changes (moved around the window)
        // this._panel.onDidChangeViewState(
        // 	e => {
        // 		if (this._panel.visible) {
        // 			this._update();
        // 		}
        // 	},
        // 	null,
        // 	this._disposables
        // );
        // This can be useful if you need to handle input from the webview
        // Handle messages from the webview
        // this._panel.webview.onDidReceiveMessage(
        // 	message => {
        // 		switch (message.command) {
        // 			case 'alert':
        // 				vscode.window.showErrorMessage(message.text);
        // 				return;
        // 		}
        // 	},
        // 	null,
        // 	this._disposables
        // );
        const session = vscode.debug.activeDebugSession;
        const updateInfo = async () => {
            // Insert your command
            // this.VAR = this.customCommand(session, "COMMAND");
            const infoPanel = this._panel.webview;
            infoPanel.html = this._getHtmlForWebview();
        };
        interval = setInterval(updateInfo, 500);
    }
    dispose() {
        // Clean up our resources
        VMInfo.currentPanel = undefined;
        clearInterval(interval);
        this._panel.dispose();
    }
    // Update the webview
    _update() {
        // const infoPanel = this._panel.webview;
        // infoPanel.html = this._getHtmlForWebview();
    }
    static createInfoPanel(extensionUri) {
        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(VMInfo.viewType, 'Virtual Memory Info', vscode.ViewColumn.Beside, getWebviewOptions(extensionUri));
        VMInfo.currentPanel = new VMInfo(panel, extensionUri);
    }
    // execute custom command 
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
    formatVmTree() {
        return `<h3>MEMORIA VIRTUALE<span class="info">: -todo</span></h3>`;
    }
    _getHtmlForWebview() {
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, '/media/webview', 'main.js');
        // And the uri we use to load this script in the webview
        const scriptUri = this._panel.webview.asWebviewUri(scriptPathOnDisk);
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
					{{{VMtree}}}
					<script src="${scriptUri}"></script>
				</body>
			</html>
		`;
        let template = Handlebars.compile(sourceDocument);
        return template({
            VMtree: this.formatVmTree(),
        });
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