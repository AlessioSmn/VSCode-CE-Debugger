// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { NucleoInfo } from './nucleoweb';
import { VMInfo } from './vmweb';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	vscode.debug.onDidStartDebugSession( ()=>{
        // Open a new column
        NucleoInfo.createInfoPanel(context.extensionUri, vscode.ViewColumn.Beside);
        // Open next webviews in the same columns
        VMInfo.createInfoPanel(context.extensionUri, vscode.ViewColumn.Active);
    }); 

    // Called whenever a debugger command is issued (continue / step / etc..)
    // Update nucleo info only when the debugger changes its state
    vscode.debug.onDidChangeActiveStackItem(event => {
        NucleoInfo.currentPanel?.refreshInfo();
        VMInfo.currentPanel?.refreshInfo();
    });

    vscode.debug.onDidTerminateDebugSession(() =>{
        NucleoInfo.currentPanel?.dispose();
        VMInfo.currentPanel?.dispose();
    });
 
}

// This method is called when your extension is deactivated
export function deactivate() {}
