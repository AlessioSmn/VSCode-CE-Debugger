// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { NucleoInfo } from './nucleoinfo';
import { PanelType } from './nucleoinfo';

// Called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
	vscode.debug.onDidStartDebugSession( ()=>{
        NucleoInfo.createPanel(PanelType.Process, context.extensionUri, vscode.ViewColumn.Beside);
        NucleoInfo.createPanel(PanelType.Memory, context.extensionUri, vscode.ViewColumn.Active);
    }); 

    // Called whenever a debugger command is issued (continue / step / etc..)
    // In order to update information only when the debugger changes its state
    vscode.debug.onDidChangeActiveStackItem(event => {
        NucleoInfo.currentPanels[PanelType.Process]?.updateInformation();
        NucleoInfo.currentPanels[PanelType.Memory]?.updateInformation();
    });

    vscode.debug.onDidTerminateDebugSession(() =>{
        NucleoInfo.currentPanels[PanelType.Process]?.dispose();
        NucleoInfo.currentPanels[PanelType.Memory]?.dispose();
    });
 
}

// This method is called when your extension is deactivated
export function deactivate() {}

// test 2