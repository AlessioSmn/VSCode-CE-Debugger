import * as vscode from 'vscode';
const Handlebars = require('handlebars');

let interval: NodeJS.Timeout;

export class NucleoInfo {
    public static currentPanel: NucleoInfo | undefined;

	public static readonly viewType = 'nucleoInfo';

	private readonly _extensionUri: vscode.Uri;
	
	public process_list: any | undefined;
	public semaphore_list: any | undefined;
	public esecuzione: any | undefined;
	public pronti: any | undefined;
	public sospesi: any | undefined;

    private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	public refreshInfo = async () => {
		const infoPanel = this._panel.webview;
		infoPanel.html = this._getLoadingPage();
		
        const session = vscode.debug.activeDebugSession;

		this.process_list = await this.customCommand(session, "process list");
		this.semaphore_list = await this.customCommand(session, "semaphore");
		this.esecuzione = await this.customCommand(session, "esecuzione");
		this.pronti = await this.customCommand(session, "pronti");
		this.sospesi = await this.customCommand(session, "sospesi");

		infoPanel.html = this._getHtmlForWebview();
	};

    public dispose() {
		// Clean up our resources
		NucleoInfo.currentPanel = undefined;
        clearInterval(interval);
		this._panel.dispose();
	}

    public static createInfoPanel(extensionUri: vscode.Uri, webViewPosition: vscode.ViewColumn) {
		const panel = vscode.window.createWebviewPanel(
			NucleoInfo.viewType,
			'Info Nucleo',
			webViewPosition,
			getWebviewOptions(extensionUri),
		);
		NucleoInfo.currentPanel = new NucleoInfo(panel, extensionUri);		
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
		let esecuzioneJson = JSON.parse(this.esecuzione);
		if(esecuzioneJson.pointer == 0)
			return `<div><h2>Esecuzione <span class="info title">empty</span></h2></div>`;

		let exec_dump = esecuzioneJson.exec_dump;
		let exec_pid = esecuzioneJson.pid;
		let source = `

		<div>
			<h2>Esecuzione <span class="info title">id: ${exec_pid}</span></h2>
			<p class="toggle">Informazioni sul processo</p>
			{{#each exec_dump}}
			<ul class="p-dump toggable">
				<li class="p-item"><span class="key"> pid = </span> <span class="value">{{pid}}</span></li>			
				<li class="p-item"><span class="key"> livello = </span> <span class="value">{{livello}}</span></li>			
				<li class="p-item"><span class="key"> corpo = </span> <span class="value">{{corpo}}</span></li>			
				<li class="p-item"><span class="key"> rip = </span> <span class="value">{{rip}}</span></li>
				<li class="p-ca-dump-list">
					<div class="toggle"><span class="key">campi aggiuntivi</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each campi_aggiuntivi}}
						<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
				<li class="p-dump-list "> 
					<div class="toggle"><span class="key">dump Pila</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each pila_dmp}}
						<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
				<li class="p-dump-list"> 
					<div class="toggle"><span class="key">dump registri</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each reg_dmp}}
						<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
			</ul>
			{{/each}}
		</div>
		`;

		let template = Handlebars.compile(source);
		return template({exec_dump: exec_dump});
	}

	private formatCodaPronti(){
		let prontiJson = JSON.parse(this.pronti);
		let pronti_count = prontiJson.process_list.length;
		let pronti_list = prontiJson.process_list;

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
		let sospesiJson = JSON.parse(this.sospesi);
		let sospesi_count = sospesiJson.request_list.length;
		let sospesi_list = sospesiJson.request_list;

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
		let semaphoreListJson = JSON.parse(this.semaphore_list);
		let sem_count = semaphoreListJson.sem_list.length;
		let sem_active_list: any = [];
		let sem_inact_utn_list: any = [];
		let sem_inact_sys_list: any = [];

		semaphoreListJson.sem_list.forEach(element => {
			if(element.sem_info.counter < 0) sem_active_list.push(element);
			else{
				if(element.livello == "utente") sem_inact_utn_list.push(element);
				else sem_inact_sys_list.push(element);
			}
		});

		let source = `
		<div>
			<h2>Semafori<span class="info">: ${sem_count}</span></h2>
			<div>
				<h3><span>Semafori occupati </span><span class="info">${sem_active_list.length}</span></h3>

				{{#each sem_active_list}}
				<div>
					<h5 class="p-title toggle">Sem <span class="key">[{{index}}]</span></h5>
					<div class="toggable">
						<div>
							<p>Livello: <span>{{livello}}</span></p>
							<p>Counter: <span>{{sem_info.counter}}</span></p>
							{{#if sem_info.process_list.length}}
								<p><span>Processi in coda (IDs): </span>
								{{#each sem_info.process_list}}
									<span class="info">{{this}}</span>
									<span>	
										{{#unless this}}[DUMMY]{{/unless}}
										{{#unless @last}}, {{/unless}}
									</span>
								{{/each}}
								</p>
							{{/if}}
						</div>
					</div>
				</div>
				{{/each}}

				<h3><span>Semafori liberi </span><span class="info">${sem_inact_sys_list.length} + ${sem_inact_utn_list.length} </span></h3>
				<div>

					<h4>
						<span class="key">Sistema </span>
						<span class="info">${sem_inact_sys_list.length}</span>
					</h4>
					{{#each sem_inact_sys_list}}
					<div>
						<p>
							Sem 
							<span class="key">[{{index}}]</span>
							- counter: <span>{{sem_info.counter}}</span>
						</p>
					</div>
					{{/each}}

					<h4>
						<span class="key">Utente </span>
						<span class="info">${sem_inact_utn_list.length}</span>
					</h4>
					{{#each sem_inact_utn_list}}
					<div>
						<p>
							Sem 
							<span class="key">[{{index}}]</span>
							- counter: <span>{{sem_info.counter}}</span>
						</p>
					</div>
					{{/each}}

				</div>
			</div>
		</div>
		`;

		let template = Handlebars.compile(source);
		return template({
			sem_active_list: sem_active_list,
			sem_inact_sys_list: sem_inact_sys_list, 
			sem_inact_utn_list: sem_inact_utn_list});
	}
	
	private formatProcessList(){
		let processListJson = JSON.parse(this.process_list);
		let proc_count = processListJson.process.length;
		let proc_sys: any = [];
		let proc_utn: any = [];
		processListJson.process.forEach(element => {
			if(element.livello == "sistema") proc_sys.push(element);
			else proc_utn.push(element);
		});

		let source = `
		<div>
			<h2>Processi creati<span class="info">: ${proc_count}</span></h2>
			<div>
				<h3 class="p-title toggle"><span class="key">Sistema </span><span class="info">${proc_sys.length}</span></h3>
				<div class="toggable">
					{{#each proc_sys}}
						<div>
							<h3 class="p-title toggle"><span class="key">[{{pid}}]</span><span class="info">: object</span></h3>
							<ul class="p-dump toggable">
								<li class="p-item"><span class="key"> pid = </span> <span class="value">{{pid}}</span></li>			
								<li class="p-item"><span class="key"> livello = </span> <span class="value">{{livello}}</span></li>			
								<li class="p-item"><span class="key"> corpo = </span> <span class="value">{{corpo}}</span></li>			
								<li class="p-item"><span class="key"> rip = </span> <span class="value">{{rip}}</span></li>
								<li class="p-ca-dump-list" >
									<div class="toggle"><span class="key">campi aggiuntivi</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each campi_aggiuntivi}}
											<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list "> 
									<div class="toggle"><span class="key">dump Pila</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each pila_dmp}}
											<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list"> 
									<div class="toggle"><span class="key">dump registri</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each reg_dmp}}
											<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
							</ul>
						</div>
					{{/each}}
				</div>
			</div>
			<div>
				<h3 class="p-title toggle"><span class="key">Utente</span><span class="info"> ${proc_utn.length}</span></h3>
				<div class="toggable">
					{{#each proc_utn}}
						<div>
							<h3 class="p-title toggle"><span class="key">[{{pid}}]</span><span class="info">: object</span></h3>
							<ul class="p-dump toggable">
								<li class="p-item"><span class="key"> pid = </span> <span class="value">{{pid}}</span></li>			
								<li class="p-item"><span class="key"> livello = </span> <span class="value">{{livello}}</span></li>			
								<li class="p-item"><span class="key"> corpo = </span> <span class="value">{{corpo}}</span></li>			
								<li class="p-item"><span class="key"> rip = </span> <span class="value">{{rip}}</span></li>
								<li class="p-ca-dump-list" >
									<div class="toggle"><span class="key">campi aggiuntivi</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each campi_aggiuntivi}}
											<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list "> 
									<div class="toggle"><span class="key">dump pila</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each pila_dmp}}
											<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
										{{/each}}
									</ul>
								</li>
								<li class="p-dump-list"> 
									<div class="toggle"><span class="key">dump registri</span><span class="info">: array[]</span></div> 
									<ul class="toggable">
										{{#each reg_dmp}}
											<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
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

    private _getHtmlForWebview() {
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
