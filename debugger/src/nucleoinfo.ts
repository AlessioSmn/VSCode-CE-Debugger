// @ts-nocheck
import * as vscode from 'vscode';
import * as ProcessInfoMethods from './nucleoinfo_proc';
import * as VmInfoMethods from './nucleoinfo_vm';
const Handlebars = require('handlebars');

let interval: NodeJS.Timeout;

export enum PanelType {
    Process = 0,
    Memory = 1
}

export class NucleoInfo {

	public static currentPanels: (NucleoInfo | undefined)[] = [];
	
	public procList: any | undefined;
	public semList: any | undefined;
	public procExecId: any | undefined;
	public codaPronti: any | undefined;
	public codaSospesi: any | undefined;
	public vmMaps: any | undefined;
	public vmTree: any | undefined;
	
    private readonly _panel: vscode.WebviewPanel;
	private readonly _panelType: PanelType;
	private readonly _extensionUri: vscode.Uri;

	private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, panelType: PanelType, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._panelType = panelType;

		if(panelType == PanelType.Process){
			this.formatEsecuzione = ProcessInfoMethods.formatEsecuzione.bind(this);
			this.formatCodaPronti = ProcessInfoMethods.formatCodaPronti.bind(this);
			this.formatCodaSospesi = ProcessInfoMethods.formatCodaSospesi.bind(this);
			this.formatSemaphoreList = ProcessInfoMethods.formatSemaphoreList.bind(this);
			this.formatProcesses = ProcessInfoMethods.formatProcesses.bind(this);
		}

		if(panelType == PanelType.Memory){
			this.formatVmMaps = VmInfoMethods.formatVmMaps.bind(this);
			this.formatVmTree = VmInfoMethods.formatVmTree.bind(this);
			this.vmPathAnalyzer = VmInfoMethods.vmPathAnalyzer.bind(this);
		}

		// Listen for when the panel is disposed: this happens when the user closes the panel
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	public async updateInformation (){
		const infoPanel = this._panel.webview;
		infoPanel.html = this.generateLoadingPage();
		let retrievedInfo;

		// Get active debug session
        const session = vscode.debug.activeDebugSession;

		switch(this._panelType){
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
	};

    public dispose() {
		NucleoInfo.currentPanels[this._panelType] = undefined;
		clearInterval(interval);
		this._panel.dispose();
	}

    public static createPanel(panelType: PanelType, extensionUri: vscode.Uri, webViewPosition: vscode.ViewColumn) {
		// Customize viewType and panel title
		let viewType, panelTitle;
		switch(panelType){
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
        const panel = vscode.window.createWebviewPanel(
			viewType, 
			panelTitle, 
			webViewPosition, 
			getWebviewOptions(extensionUri)
		);

		// Assign it to currentPanel, in the correct type
        NucleoInfo.currentPanels[panelType] = new NucleoInfo(panel, panelType, extensionUri);
	}

    private async customCommand(session: typeof vscode.debug.activeDebugSession, command: string, arg?: any){
		if(session) {
			const sTrace = await session.customRequest('stackTrace', { threadId: 1 });
			if(sTrace === undefined){
				return;
			}
			const frameId = sTrace.stackFrames[0].id;
		
			// Build and exec the command
			const text = '-exec ' + command;
			let result = session.customRequest('evaluate', {expression: text, frameId: frameId, context:'hover'}).then((response) => {
				return response.result;
			});
			return result;
		}     
    }

    private generateLoadingPage() {
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

    private formatHTMLprocessInfo() {
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

    private formatHTMLMemoryInfo() {
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

	private formatEsecuzione() : string;
	private formatCodaPronti(): string;
	private formatCodaSospesi(): string;
	private formatSemaphoreList() : string;
	private formatProcesses() : string;

	private formatVmMaps() : string;
	private formatVmTree(): string;
	private vmPathAnalyzer(): string;
		
	private getVmTreeJsonParsed(){
		return this.vmTree.vm_tree;
	}
	
	private getMaxLivJsonParsed(){
		return this.vmTree.depth_level;
	}
}

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, '/')]
	};
}