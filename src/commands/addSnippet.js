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

  const fullPath = editor.document.fileName;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    editor.document.uri
  );
  const relativePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, fullPath)
    : fullPath;

  const startLine = rangeToUse.start.line + 1;
  const endLine = rangeToUse.end.line + 1;

  if (text && webviewView) {
    const snippet = {
      type: "add-snippet",
      payload: {
        fileName: relativePath,
        text,
        startLine,
        endLine,
        destination,
      },
    };

    if (destination === "main") hasMainSnippet = true;

    webviewView.webview.postMessage(snippet);
    vscode.window.showInformationMessage(
      `Added snippet to ${destination === "main" ? "Main Issue" : "Context"}!`
    );
  }
}

async function addFullFileToWebview(relativeFilePaths) {
  vscode.commands.executeCommand("snippetfuse.mainView.focus");

  if (!webviewView || !relativeFilePaths || relativeFilePaths.length === 0) {
    return;
  }

  const rootUri = vscode.workspace.workspaceFolders[0].uri;
  const destination = "context";
  let addedCount = 0;

  for (const relativePath of relativeFilePaths) {
    try {
      const fileUri = vscode.Uri.joinPath(rootUri, relativePath);
      const content = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(content).toString("utf8");

      if (!text) continue;

      const endLine = text.split(/\r\n|\r|\n/).length;

      const snippet = {
        type: "add-snippet",
        payload: {
          fileName: relativePath,
          text,
          startLine: 1,
          endLine,
          destination,
          isFullFile: true,
        },
      };

      webviewView.webview.postMessage(snippet);
      addedCount++;
    } catch (e) {
      console.error(`Failed to read file ${relativePath}:`, e);
    }
  }

  if (addedCount > 0) {
    vscode.window.showInformationMessage(
      `Added ${addedCount} file(s) to Context snippets!`
    );
  }
}

module.exports = {
  addSnippetToWebview,
  setWebview,
  hasMain,
  resetMain,
  addFullFileToWebview,
};
