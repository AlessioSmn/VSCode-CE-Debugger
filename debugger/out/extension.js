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
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const nucleoinfo_1 = require("./nucleoinfo");
const nucleoinfo_2 = require("./nucleoinfo");
function activate(context) {
    vscode.debug.onDidStartDebugSession(() => {
        // Open a new column for process info
        nucleoinfo_1.NucleoInfo.createPanel(nucleoinfo_2.PanelType.Process, context.extensionUri, vscode.ViewColumn.Beside);
        // Open next webviews in the same columns
        nucleoinfo_1.NucleoInfo.createPanel(nucleoinfo_2.PanelType.Memory, context.extensionUri, vscode.ViewColumn.Active);
    });
    // Called whenever a debugger command is issued (continue / step / etc..)
    // In order to update information only when the debugger changes its state
    vscode.debug.onDidChangeActiveStackItem(event => {
        nucleoinfo_1.NucleoInfo.currentPanels[nucleoinfo_2.PanelType.Process]?.updateInformation();
        nucleoinfo_1.NucleoInfo.currentPanels[nucleoinfo_2.PanelType.Memory]?.updateInformation();
    });
    vscode.debug.onDidTerminateDebugSession(() => {
        nucleoinfo_1.NucleoInfo.currentPanels[nucleoinfo_2.PanelType.Process]?.dispose();
        nucleoinfo_1.NucleoInfo.currentPanels[nucleoinfo_2.PanelType.Memory]?.dispose();
    });
}
/*
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
    // In order to update information only when the debugger changes its state
    vscode.debug.onDidChangeActiveStackItem(event => {
        NucleoInfo.currentPanel?.refreshInfo();
        VMInfo.currentPanel?.refreshInfo();
    });

    vscode.debug.onDidTerminateDebugSession(() =>{
        NucleoInfo.currentPanel?.dispose();
        VMInfo.currentPanel?.dispose();
    });
 
}
*/
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map