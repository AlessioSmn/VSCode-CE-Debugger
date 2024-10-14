import * as vscode from 'vscode';
const Handlebars = require('handlebars');

let interval: NodeJS.Timeout;

export class VMInfo {
    public static currentPanel: VMInfo | undefined;

	public static readonly viewType = 'vmInfo';

	private readonly _extensionUri: vscode.Uri;
	
	public vm_maps: any | undefined;
	public vm_tree: any | undefined;

    private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	public refreshInfo = async() => {
		const infoPanel = this._panel.webview;
		infoPanel.html = this._getLoadingPage();

        const session = vscode.debug.activeDebugSession;

		this.vm_maps = await this.customCommand(session, "vm maps");
		this.vm_tree = await this.customCommand(session, "vm tree");

		infoPanel.html = this._getHtmlForWebview();
	};

    public dispose() {
		// Clean up our resources
		VMInfo.currentPanel = undefined;
        clearInterval(interval);
		this._panel.dispose();
	}

    public static createInfoPanel(extensionUri: vscode.Uri, webViewPosition: vscode.ViewColumn) {
		const panel = vscode.window.createWebviewPanel(
			VMInfo.viewType,
			'Virtual Memory Info',
			webViewPosition,
			getWebviewOptions(extensionUri),
		);
		VMInfo.currentPanel = new VMInfo(panel, extensionUri);		
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
			return result
		}     
    }

	private formatVmMaps(){
		let vmMapsJson = JSON.parse(this.vm_maps);
		let memPartsCount = vmMapsJson.mem_maps.length;
		let mem_part: any = [];
		vmMapsJson.mem_maps.forEach(element => {mem_part.push(element)});
		let source = `
			<div>
				<h3>Zone di memoria<span class="info">: ${memPartsCount}</span></h3>
				<div class="">
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
		return template({mem_part: mem_part});
	}

	private getVmTreeJsonParsed(){
		let vmTreeJson = JSON.parse(this.vm_tree);
		return vmTreeJson.vm_tree;
	}
		
	private formatVmTree(){
		let vmTreeJson = JSON.parse(this.vm_tree);
		let vmLevels = parseInt(vmTreeJson.depth_level);

		let vmTreeFirstLevel: any = [];

		vmTreeJson.vm_tree.forEach(element => {
			vmTreeFirstLevel.push(element);
		});		
		
		let source = `
			<div>
				<h3>VM Mapping Tree</h3>
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
		return template({vmTreeFirstLevel: vmTreeFirstLevel});
	}

    private _getHtmlForWebview() {
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
			VMtree: this.formatVmTree(),
			VMmaps: this.formatVmMaps()
		});
	}

    private _getLoadingPage() {
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

function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
	return {
		// Enable javascript in the webview
		enableScripts: true,
		localResourceRoots: [vscode.Uri.joinPath(extensionUri, '/')]
	};
}
