import * as vscode from 'vscode';
const Handlebars = require('handlebars');

let interval: NodeJS.Timeout;

export enum PanelType {
    Process = 0,
    Memory = 1
}

export class NucleoInfo {

	// Customizable for any number of panels needed
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

		// Listen for when the panel is disposed: this happens when the user closes the panel
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	public async updateInformation (){
		const infoPanel = this._panel.webview;
		infoPanel.html = this._getLoadingPage();
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

	private formatEsecuzione(){
		if(isNaN(this.procExecId))
			return `<div><h2>Esecuzione <span class="info title">empty</span></h2></div>`;

		let procExec = this.procList.find(proc => proc.pid == this.procExecId);
		let source = `
		<div>
			<h2>Esecuzione <span class="info title">id: ${procExec.pid}</span></h2>
			<p class="toggle">Informazioni sul processo</p>
			<ul class="p-dump toggable">
				<li class="p-item"><span> pid = </span> <span class="value">{{procExec.pid}}</span></li>			
				<li class="p-item"><span> livello = </span> <span class="value">{{procExec.livello}}</span></li>			
				<li class="p-item"><span> corpo = </span> <span class="value">{{procExec.corpo}}</span></li>			
				<li class="p-item"><span> rip = </span> <span class="value">{{procExec.rip}}</span></li>
				<li class="p-ca-dump-list">
					<div class="toggle"><span>campi aggiuntivi</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each procExec.campi_aggiuntivi}}
						<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
				<li class="p-dump-list "> 
					<div class="toggle"><span>dump Pila</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each procExec.pila_dmp}}
						<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
				<li class="p-dump-list"> 
					<div class="toggle"><span>dump registri</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each procExec.reg_dmp}}
						<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
			</ul>
		</div>
		`;

		let template = Handlebars.compile(source);
		return template({procExec: procExec});
	}

	private formatCodaPronti(){
		let pronti_count = this.codaPronti.length;
		let pronti_list = this.codaPronti;

		if(pronti_count == 0)
			return `<div><h2>Coda pronti <span class="info title">empty</span></h2></div>`;
		
		let source = `
		<div>
			<h2>Coda pronti <span class="info title">${pronti_count} process${pronti_count == 1 ? 'o' : 'i'}</span></h2>
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

		let template = Handlebars.compile(source);
		return template({pronti_list: pronti_list});

	}

	private formatCodaSospesi(){
		let sospesi_count = this.codaSospesi.length;
		let sospesi_list = this.codaSospesi;

		if(sospesi_count == 0)
			return `<div><h2>Processi sospesi <span class="info title">empty</span></h2></div>`;
		
		let source = `
		<div>
			<h2>Processi sospesi <span class="info title">${sospesi_count} process${sospesi_count == 1 ? 'o' : 'i'}</span></h2>
			<div><ul>
				{{#each sospesi_list}}
				<li>
					Process <span class="info">{{process}}</span> - 
					attesa: [<span class="info">+{{attesa_relativa}}</span> | tot: <span class="info">{{attesa_totale}}</span>]
				{{/each}}
				</li>
			</ul></div>
		</div>
		`;

		let template = Handlebars.compile(source);
		return template({sospesi_list: sospesi_list});

	}

	private formatSemaphoreList(){
		let sem_count = this.semList.length;
		let sem_act_utn_list: any = [];
		let sem_act_sys_list: any = [];
		let sem_inact_utn_list: any = [];
		let sem_inact_sys_list: any = [];
		let activeSem = false;
		let inactiveSem = false;

		this.semList.forEach(element => {
			if(element.sem_info.counter < 0){
				if(element.livello == "utente") sem_act_utn_list.push(element);
				else sem_act_sys_list.push(element);
				activeSem = true;
			}
			else{
				if(element.livello == "utente") sem_inact_utn_list.push(element);
				else sem_inact_sys_list.push(element);
				inactiveSem = true;
			}
		});

		let source = `
		<div>
			<h2>Semafori</h2>

			{{#if activeSem}}
			<div>
				<h3>
					<span>Semafori occupati </span>
					<span class="info">${sem_act_utn_list.length} + ${sem_act_sys_list.length} </span>
				</h3>
				{{#if sem_act_utn_list}}
					<h4>
						<span>Utente </span>
						<span class="info">${sem_act_utn_list.length}</span>
					</h4>
					{{#each sem_act_utn_list}}
						<div>
							<p>
								Sem [{{index}}]:
								 coda: {
								{{#each sem_info.process_list}}
									<span class="info">{{this}}</span>
									{{#unless this}}[DUMMY]{{/unless}}
									{{#unless @last}}, {{/unless}}
								{{/each}}
								}; counter = {{sem_info.counter}}
							</p>
						</div>
					{{/each}}
				{{/if}}
				{{#if sem_act_sys_list}}
					<h4>
						<span>Sistema </span>
						<span class="info">${sem_act_sys_list.length}</span>
					</h4>
					{{#each sem_act_sys_list}}
						<div>
							<p>
								Sem [{{index}}]:
								 coda: {
								{{#each sem_info.process_list}}
									<span class="info">{{this}}</span>
									{{#unless this}}[DUMMY]{{/unless}}
									{{#unless @last}}, {{/unless}}
								{{/each}}
								}; counter = {{sem_info.counter}}
							</p>
						</div>
					{{/each}}
				{{/if}}
			</div>
			{{/if}}

			{{#if inactiveSem}}
			<div>
				<h3>
					<span>Semafori liberi </span>
					<span class="info">${sem_inact_utn_list.length} + ${sem_inact_sys_list.length} </span>
				</h3>

				{{#if sem_inact_utn_list}}
					<h4>
						<span>Utente </span>
						<span class="info">${sem_inact_utn_list.length}</span>
					</h4>
					{{#each sem_inact_utn_list}}
						<p>Sem [{{index}}]: counter = {{sem_info.counter}}</p>
					{{/each}}
				{{/if}}

				{{#if sem_inact_sys_list}}
					<h4>
						<span>Sistema </span>
						<span class="info">${sem_inact_sys_list.length}</span>
					</h4>
					{{#each sem_inact_sys_list}}
						<p>Sem [{{index}}]: counter = {{sem_info.counter}}</p>
					{{/each}}
				{{/if}}

			</div>
			{{/if}}
		</div>
		`;

		let template = Handlebars.compile(source);
		return template({
			sem_act_sys_list: sem_act_sys_list, 
			sem_act_utn_list: sem_act_utn_list,
			sem_inact_sys_list: sem_inact_sys_list, 
			sem_inact_utn_list: sem_inact_utn_list,
			activeSem: activeSem,
			inactiveSem: inactiveSem
		});
	}
	
	private formatProcessList(){
		let proc_count = this.procList.length;
		let proc_sys: any = [];
		let proc_utn: any = [];
		this.procList.forEach(element => {
			if(element.livello == "sistema") proc_sys.push(element);
			else proc_utn.push(element);
		});

		let source = `
		<div>
			<h2>Processi creati <span class="info">${proc_count}</span></h2>
			<div>
				<h3 class="p-title toggle"><span>Sistema </span><span class="info">${proc_sys.length}</span></h3>
				<div class="toggable">
					{{#each proc_sys}}
						<div>
							<p class="p-title toggle"><span>[{{pid}}]</span></p>
							<ul class="p-dump toggable">
								<li class="p-item"><span> pid = </span> <span class="value">{{pid}}</span></li>			
								<li class="p-item"><span> livello = </span> <span class="value">{{livello}}</span></li>			
								<li class="p-item"><span> corpo = </span> <span class="value">{{corpo}}</span></li>			
								<li class="p-item"><span> rip = </span> <span class="value">{{rip}}</span></li>
								<li class="p-ca-dump-list" >
									<div class="toggle"><span>campi aggiuntivi</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each campi_aggiuntivi}}
											<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list "> 
									<div class="toggle"><span>dump Pila</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each pila_dmp}}
											<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list"> 
									<div class="toggle"><span>dump registri</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each reg_dmp}}
											<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
							</ul>
						</div>
					{{/each}}
				</div>
			</div>
			<div>
				<h3 class="p-title toggle"><span>Utente</span><span class="info"> ${proc_utn.length}</span></h3>
				<div class="toggable">
					{{#each proc_utn}}
						<div>
							<p class="p-title toggle"><span>[{{pid}}]</span></p>
							<ul class="p-dump toggable">
								<li class="p-item"><span> pid = </span> <span class="value">{{pid}}</span></li>			
								<li class="p-item"><span> livello = </span> <span class="value">{{livello}}</span></li>			
								<li class="p-item"><span> corpo = </span> <span class="value">{{corpo}}</span></li>			
								<li class="p-item"><span> rip = </span> <span class="value">{{rip}}</span></li>
								<li class="p-ca-dump-list" >
									<div class="toggle"><span>campi aggiuntivi</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each campi_aggiuntivi}}
											<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list "> 
									<div class="toggle"><span>dump pila</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each pila_dmp}}
											<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list"> 
									<div class="toggle"><span>dump registri</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each reg_dmp}}
											<li class="p-dmp-item"> <span>{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
							</ul>
						</div>
					{{/each}}
				</div>
			</div>
		</div>
		`;

		let template = Handlebars.compile(source);
		return template({proc_sys: proc_sys, proc_utn: proc_utn,});
	}

	private formatVmMaps(){
		let mem_part: any = [];
		this.vmMaps.forEach(element => {mem_part.push(element)});
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
		let template = Handlebars.compile(source);
		return template({mem_part: mem_part});
	}

	private getVmTreeJsonParsed(){
		return this.vmTree.vm_tree;
	}
	
	private getMaxLivJsonParsed(){
		return this.vmTree.depth_level;
	}
		
	private formatVmTree(){
		let vmTreeFirstLevel: any = [];
		this.vmTree.vm_tree.forEach(element => {vmTreeFirstLevel.push(element);});		
		
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

		let template = Handlebars.compile(source);
		return template({vmTreeFirstLevel: vmTreeFirstLevel});
	}

	private vmPathAnalyzer(){
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

		let template = Handlebars.compile(source);
		return template();
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
			processList: this.formatProcessList(),
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
