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
exports.NucleoInfo = void 0;
const vscode = __importStar(require("vscode"));
const Handlebars = require('handlebars');
let interval;
class NucleoInfo {
    static currentPanel;
    static viewType = 'nucleoInfo';
    _extensionUri;
    process_list;
    semaphore_list;
    esecuzione;
    pronti;
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
            this.process_list = await this.customCommand(session, "process list");
            this.semaphore_list = await this.customCommand(session, "semaphore");
            this.esecuzione = await this.customCommand(session, "esecuzione");
            this.pronti = await this.customCommand(session, "pronti");
            const infoPanel = this._panel.webview;
            infoPanel.html = this._getHtmlForWebview();
        };
        interval = setInterval(updateInfo, 500);
    }
    dispose() {
        // Clean up our resources
        NucleoInfo.currentPanel = undefined;
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
        const panel = vscode.window.createWebviewPanel(NucleoInfo.viewType, 'Info Nucleo', vscode.ViewColumn.Beside, getWebviewOptions(extensionUri));
        NucleoInfo.currentPanel = new NucleoInfo(panel, extensionUri);
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
    formatEsecuzione() {
        let esecuzioneJson = JSON.parse(this.esecuzione);
        if (esecuzioneJson.pointer == 0)
            return `<h3>Esecuzione <span class="info title">empty</span></h3>`;
        let exec_dump = esecuzioneJson.exec_dump;
        let exec_pid = esecuzioneJson.pid;
        let source = `

		<div class="">
			<h3 class="toggle">Esecuzione <span class="info title">pid: ${exec_pid}</span></h3>
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
        return template({ exec_dump: exec_dump });
    }
    formatCodaPronti() {
        let prontiJson = JSON.parse(this.pronti);
        let pronti_count = prontiJson.process_list.length;
        let pronti_list = prontiJson.process_list;
        if (pronti_count == 0)
            return `<h3>Coda pronti <span class="info title">empty</span></h3>`;
        let source = `
		<div class="">
			<h3>Coda pronti <span class="info title">${pronti_count} processi</span></h3>
			<div><p>
			{{#each pronti_list}}
				<span>
					{{this}}
    				{{#unless this}}[DUMMY]{{/unless}}
					{{#unless @last}}, {{/unless}}
			</span>
			{{/each}}
			</p></div>
		</div>
		`;
        let template = Handlebars.compile(source);
        return template({ pronti_list: pronti_list });
    }
    formatSemaphoreList() {
        let semaphoreListJson = JSON.parse(this.semaphore_list);
        let sem_count = semaphoreListJson.sem_list.length;
        let sem_list = [];
        semaphoreListJson.sem_list.forEach(element => {
            sem_list.push(element);
        });
        if (sem_count == 0)
            return `<h3>Semafori<span class="info">: ${sem_count}</span></h3>`;
        let source = `
		<div class="">
			<h3 class="toggle">Semafori<span class="info">: ${sem_count}</span></h3>
			<div class="toggable">
				{{#each sem_list}}
				<div class="">
					<h3 class="p-title toggle"><span class="key">Indice</span><span class="info">[{{index}}]</span></h3>
					<div class="toggable">
						<div class="">
							<p>Counter: <span>{{sem_info.counter}}</span></p>
							<p>Processi in coda: <span>{{sem_info.pointer}}</span></p>
						</div>
					</div>
				</div>
				{{/each}}
			</div>
		</div>
		`;
        let template = Handlebars.compile(source);
        return template({ sem_list: sem_list, });
    }
    // Handles the HTML formatting for the process_list command
    formatProcessList() {
        let processListJson = JSON.parse(this.process_list);
        let proc_count = processListJson.process.length;
        let proc_sys = [];
        let proc_utn = [];
        processListJson.process.forEach(element => {
            if (element.livello == "sistema") {
                proc_sys.push(element);
            }
            else {
                proc_utn.push(element);
            }
        });
        if (proc_count == 0) {
            return `<h3>Processi creati<span class="info">: ${proc_count}</span></h3>`;
        }
        let source = `
		<div class="">
			<h3 class="toggle">Processi creati<span class="info">: ${proc_count}</span></h3>
			<div class="toggable">
				<div class="">
					<h3 class="p-title toggle"><span class="key">sistema</span><span class="info">: ${proc_sys.length}</span></h3>
					<div class="toggable">
						{{#each proc_sys}}
							<div class="">
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
				<div class="">
					<h3 class="p-title toggle"><span class="key">utente</span><span class="info">: ${proc_utn.length}</span></h3>
					<div class="toggable">
						{{#each proc_utn}}
							<div class="">
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
		</div>
		`;
        let template = Handlebars.compile(source);
        return template({ proc_sys: proc_sys, proc_utn: proc_utn, });
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
					{{{executionProcess}}}
					<hr>
					{{{readyProcessList}}}
					<hr>
					{{{processList}}}
					<hr>
					{{{semaphoreList}}}
					<script src="${scriptUri}"></script>
				</body>
			</html>
		`;
        let template = Handlebars.compile(sourceDocument);
        return template({
            executionProcess: this.formatEsecuzione(),
            readyProcessList: this.formatCodaPronti(),
            processList: this.formatProcessList(),
            semaphoreList: this.formatSemaphoreList()
        });
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
//# sourceMappingURL=nucleoweb.js.map