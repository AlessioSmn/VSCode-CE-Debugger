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
exports.NucleoInfo = exports.PanelType = void 0;
const vscode = __importStar(require("vscode"));
const ProcessInfoMethods = __importStar(require("./nucleoinfo_proc"));
const VmInfoMethods = __importStar(require("./nucleoinfo_vm"));
const Handlebars = require('handlebars');
let interval;
var PanelType;
(function (PanelType) {
    PanelType[PanelType["Process"] = 0] = "Process";
    PanelType[PanelType["Memory"] = 1] = "Memory";
})(PanelType || (exports.PanelType = PanelType = {}));
class NucleoInfo {
    // Customizable for any number of panels needed
    static currentPanels = [];
    procList;
    semList;
    procExecId;
    codaPronti;
    codaSospesi;
    vmMaps;
    vmTree;
    _panel;
    _panelType;
    _extensionUri;
    _disposables = [];
    constructor(panel, panelType, extensionUri) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panelType = panelType;
        this.formatEsecuzione = ProcessInfoMethods.formatEsecuzione.bind(this);
        this.formatCodaPronti = ProcessInfoMethods.formatCodaPronti.bind(this);
        this.formatCodaSospesi = ProcessInfoMethods.formatCodaSospesi.bind(this);
        this.formatSemaphoreList = ProcessInfoMethods.formatSemaphoreList.bind(this);
        this.formatProcesses = ProcessInfoMethods.formatProcesses.bind(this);
        this.formatVmMaps = VmInfoMethods.formatVmMaps.bind(this);
        this.formatVmTree = VmInfoMethods.formatVmTree.bind(this);
        this.vmPathAnalyzer = VmInfoMethods.vmPathAnalyzer.bind(this);
        // Listen for when the panel is disposed: this happens when the user closes the panel
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    async updateInformation() {
        const infoPanel = this._panel.webview;
        infoPanel.html = this._getLoadingPage();
        let retrievedInfo;
        // Get active debug session
        const session = vscode.debug.activeDebugSession;
        switch (this._panelType) {
            case PanelType.Process:
                // retrieve all information and parse it
                retrievedInfo = await this.customCommand(session, "ProcessAll");
                let processInfoJson = JSON.parse(retrievedInfo);
                this.codaPronti = processInfoJson.pronti;
                this.codaSospesi = processInfoJson.sospesi;
                this.semList = processInfoJson.semaphore;
                this.procList = processInfoJson.processes;
                this.procExecId = processInfoJson.exec;
                // Format all information into an HTML page
                infoPanel.html = this.formatHTMLprocessInfo();
                break;
            case PanelType.Memory:
                // retrieve all information and parse it
                retrievedInfo = await this.customCommand(session, "MemoryAll");
                let memoryInfoJson = JSON.parse(retrievedInfo);
                this.vmMaps = memoryInfoJson.maps;
                this.vmTree = memoryInfoJson.tree;
                // Format all information into an HTML page
                infoPanel.html = this.formatHTMLMemoryInfo();
                break;
        }
    }
    ;
    dispose() {
        NucleoInfo.currentPanels[this._panelType] = undefined;
        clearInterval(interval);
        this._panel.dispose();
    }
    static createPanel(panelType, extensionUri, webViewPosition) {
        // Customize viewType and panel title
        let viewType, panelTitle;
        switch (panelType) {
            case PanelType.Process:
                viewType = "processInfo";
                panelTitle = "Processi";
                break;
            case PanelType.Memory:
                viewType = "vmInfo";
                panelTitle = "Memoria virtuale";
                break;
        }
        // Create a new panel
        const panel = vscode.window.createWebviewPanel(viewType, panelTitle, webViewPosition, getWebviewOptions(extensionUri));
        // Assign it to currentPanel, in the correct type
        NucleoInfo.currentPanels[panelType] = new NucleoInfo(panel, panelType, extensionUri);
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
    formatHTMLprocessInfo() {
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
					{{{executionProcess}}}
					{{{readyProcessList}}}
					{{{suspendedList}}}
					{{{semaphoreList}}}
					{{{processList}}}
					<script src="${scriptUri}"></script>
				</body>
			</html>
		`;
        let template = Handlebars.compile(sourceDocument);
        return template({
            executionProcess: this.formatEsecuzione(),
            readyProcessList: this.formatCodaPronti(),
            suspendedList: this.formatCodaSospesi(),
            semaphoreList: this.formatSemaphoreList(),
            processList: this.formatProcesses(),
        });
    }
    formatHTMLMemoryInfo() {
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
						const MAX_LIV = ${JSON.stringify(this.getMaxLivJsonParsed())};
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
    getVmTreeJsonParsed() {
        return this.vmTree.vm_tree;
    }
    getMaxLivJsonParsed() {
        return this.vmTree.depth_level;
    }
}
exports.NucleoInfo = NucleoInfo;
function getWebviewOptions(extensionUri) {
    return {
        // Enable javascript in the webview
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, '/')]
    };
}
//# sourceMappingURL=nucleoinfo.js.map