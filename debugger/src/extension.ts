// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { NucleoInfo } from './nucleoweb';
import { VMInfo } from './vmweb';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	vscode.debug.onDidStartDebugSession( ()=>{
        NucleoInfo.createInfoPanel(context.extensionUri);
        VMInfo.createInfoPanel(context.extensionUri);
    }); 

    vscode.debug.onDidTerminateDebugSession(() =>{
        NucleoInfo.currentPanel?.dispose();
        VMInfo.currentPanel?.dispose();
    });
 
}

// This method is called when your extension is deactivated
export function deactivate() {}
