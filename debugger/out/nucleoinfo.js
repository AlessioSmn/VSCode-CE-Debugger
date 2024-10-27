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
    formatEsecuzione() {
        if (isNaN(this.procExecId))
            return `<div><h2>Esecuzione <span class="info title">empty</span></h2></div>`;
        let procExec = this.procList.find(proc => proc.pid == this.procExecId);
        let source = `
		<div>
			<h2>Esecuzione <span class="info title">id: ${procExec.pid}</span></h2>
			<p class="toggle">Informazioni sul processo</p>
			<ul class="p-dump toggable">
				<li class="p-item"><span class="key"> pid = </span> <span class="value">{{procExec.pid}}</span></li>			
				<li class="p-item"><span class="key"> livello = </span> <span class="value">{{procExec.livello}}</span></li>			
				<li class="p-item"><span class="key"> corpo = </span> <span class="value">{{procExec.corpo}}</span></li>			
				<li class="p-item"><span class="key"> rip = </span> <span class="value">{{procExec.rip}}</span></li>
				<li class="p-ca-dump-list">
					<div class="toggle"><span class="key">campi aggiuntivi</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each procExec.campi_aggiuntivi}}
						<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
				<li class="p-dump-list "> 
					<div class="toggle"><span class="key">dump Pila</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each procExec.pila_dmp}}
						<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
				<li class="p-dump-list"> 
					<div class="toggle"><span class="key">dump registri</span><span class="info">: array[]</span></div> 
					<ul class="toggable">
						{{#each procExec.reg_dmp}}
						<li class="p-dmp-item"> <span class="key">{{@key}} =</span> <span class="value">{{this}}</span></li>
						{{/each}}
					</ul>
				</li>
			</ul>
		</div>
		`;
        let template = Handlebars.compile(source);
        return template({ procExec: procExec });
    }
    formatCodaPronti() {
        let pronti_count = this.codaPronti.length;
        let pronti_list = this.codaPronti;
        if (pronti_count == 0)
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
        return template({ pronti_list: pronti_list });
    }
    formatCodaSospesi() {
        let sospesi_count = this.codaSospesi.length;
        let sospesi_list = this.codaSospesi;
        if (sospesi_count == 0)
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
        return template({ sospesi_list: sospesi_list });
    }
    formatSemaphoreList() {
        let sem_count = this.semList.length;
        let sem_active_list = [];
        let sem_inact_utn_list = [];
        let sem_inact_sys_list = [];
        this.semList.forEach(element => {
            if (element.sem_info.counter < 0)
                sem_active_list.push(element);
            else {
                if (element.livello == "utente")
                    sem_inact_utn_list.push(element);
                else
                    sem_inact_sys_list.push(element);
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
            sem_inact_utn_list: sem_inact_utn_list
        });
    }
    formatProcessList() {
        let proc_count = this.procList.length;
        let proc_sys = [];
        let proc_utn = [];
        this.procList.forEach(element => {
            if (element.livello == "sistema")
                proc_sys.push(element);
            else
                proc_utn.push(element);
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
        return template({ proc_sys: proc_sys, proc_utn: proc_utn, });
    }
    formatVmMaps() {
        let mem_part = [];
        this.vmMaps.forEach(element => { mem_part.push(element); });
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
        return template({ mem_part: mem_part });
    }
    getVmTreeJsonParsed() {
        return this.vmTree.vm_tree;
    }
    getMaxLivJsonParsed() {
        return this.vmTree.depth_level;
    }
    formatVmTree() {
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
            processList: this.formatProcessList(),
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
exports.NucleoInfo = NucleoInfo;
function getWebviewOptions(extensionUri) {
    return {
        // Enable javascript in the webview
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, '/')]
    };
}
//# sourceMappingURL=nucleoinfo.js.map