const vscode = require("vscode");
const path = require("path");

let webviewView;
let hasMainSnippet = false;

function setWebview(view) {
  webviewView = view;
}

function hasMain() {
  return hasMainSnippet;
}

function resetMain() {
  hasMainSnippet = false;
}

function addSnippetToWebview(destination, source) {
  vscode.commands.executeCommand("snippetfuse.mainView.focus");

  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage(
      "No active editor found. Please open a file first."
    );
    return;
  }

  let text;
  let rangeToUse;

  if (source === "editor-title-context") {
    rangeToUse = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    text = editor.document.getText(rangeToUse);
  } else if (!editor.selection.isEmpty) {
    rangeToUse = editor.selection;
    text = editor.document.getText(rangeToUse);
  } else {
    vscode.window.showInformationMessage(
      "Please make a selection to add a snippet to Context."
    );
    return;
  }

  const fileName = path.basename(editor.document.fileName);
  const startLine = rangeToUse.start.line + 1;
  const endLine = rangeToUse.end.line + 1;

  if (text && webviewView) {
    const snippet = {
      type: "add-snippet",
      payload: { fileName, text, startLine, endLine, destination },
    };

    if (destination === "main") hasMainSnippet = true;

    webviewView.webview.postMessage(snippet);
    vscode.window.showInformationMessage(
      `Added snippet to ${destination === "main" ? "Main Issue" : "Context"}!`
    );
  }
}

module.exports = { addSnippetToWebview, setWebview, hasMain, resetMain };
