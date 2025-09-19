const vscode = require("vscode");
const { getWebviewContent } = require("../utils/getWebviewContent");
const { generateProjectTree } = require("../utils/projectTree");
const { setWebview, resetMain } = require("../commands/addSnippet");
const path = require("path");

function createSnippetViewProvider(context) {
  return {
    resolveWebviewView(webviewView) {
      setWebview(webviewView);

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "webview"),
          vscode.Uri.joinPath(
            context.extensionUri,
            "node_modules",
            "@vscode",
            "codicons",
            "dist"
          ),
        ],
      };

      webviewView.webview.html = getWebviewContent(
        webviewView.webview,
        context.extensionUri
      );

      webviewView.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
          case "show-notification":
            vscode.window.showInformationMessage(message.payload.text);
            break;

          case "jump-to-file": {
            const { fileName, startLine, endLine } = message.payload;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
              vscode.workspace
                .findFiles(`**/${fileName}`, "**/node_modules/**", 1)
                .then((uris) => {
                  if (uris.length > 0) {
                    const fileUri = uris[0];
                    const range = new vscode.Range(
                      startLine - 1,
                      0,
                      endLine - 1,
                      0
                    );
                    vscode.window.showTextDocument(fileUri, {
                      selection: range,
                      preview: true,
                    });
                  } else {
                    vscode.window.showErrorMessage(
                      `File not found: ${fileName}`
                    );
                  }
                });
            }
            break;
          }

          case "main-snippet-removed": {
            resetMain();
            break;
          }

          case "export-content": {
            const {
              promptText,
              snippets,
              terminalLog,
              includeProjectTree,
              format,
            } = message.payload;
            let outputContent = `${promptText}\n---\n`;

            snippets.forEach((snippet) => {
              outputContent += `### ${snippet.fileInfo}\n\n`;
              outputContent += "```\n";
              outputContent += `${snippet.code}\n`;
              outputContent += "```\n";
              if (snippet.note) {
                outputContent += `> ${snippet.note}\n\n`;
              }
              outputContent += "---\n";
            });

            if (terminalLog.include) {
              outputContent += "\n\n### Terminal Log\n\n```\n";
              outputContent += `${terminalLog.text}\n`;
              outputContent += "```\n---\n";
            }

            if (includeProjectTree) {
              const rootPath = vscode.workspace.workspaceFolders[0].uri;
              const projectTree = await generateProjectTree(rootPath);
              outputContent += "\n\n### Project Tree\n\n```\n";
              outputContent += `${projectTree}\n`;
              outputContent += "```\n";
            }

            if (format === "copy") {
              await vscode.env.clipboard.writeText(outputContent);
              vscode.window.showInformationMessage(
                "✅ AI Context copied to clipboard."
              );
            } else if (format === "md" || format === "txt") {
              const defaultUri = vscode.Uri.file(
                path.join(
                  vscode.workspace.workspaceFolders[0].uri.fsPath,
                  `ai-context.${format}`
                )
              );
              const fileUri = await vscode.window.showSaveDialog({
                defaultUri,
              });
              if (fileUri) {
                await vscode.workspace.fs.writeFile(
                  fileUri,
                  Buffer.from(outputContent)
                );
                vscode.window.showInformationMessage(
                  `✅ AI Context exported to ${path.basename(fileUri.fsPath)}.`
                );
              }
            }
            break;
          }
        }
      });
    },
  };
}

module.exports = { createSnippetViewProvider };
