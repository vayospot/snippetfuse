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

      const sendSettings = () => {
        const config = vscode.workspace.getConfiguration("snippetfuse.prompts");
        const promptSettings = {
          default: config.get("default"),
          bugReport: config.get("bugReport"),
          featureRequest: config.get("featureRequest"),
          codeReview: config.get("codeReview"),
          requestFullCodePrompt: config.get("requestFullCodePrompt"),
        };
        webviewView.webview.postMessage({
          type: "initialize-settings",
          payload: promptSettings,
        });
      };

      sendSettings();

      context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration("snippetfuse.prompts")) {
            sendSettings();
          }
        })
      );

      webviewView.webview.onDidReceiveMessage(async (message) => {
        switch (message.type) {
          case "show-notification":
            vscode.window.showInformationMessage(message.payload.text);
            break;

          case "add-files": {
            vscode.commands.executeCommand(message.payload.command);
            break;
          }

          case "get-smart-suggestions": {
            try {
              const addSnippetCmd = require("../commands/addSnippet");
              await addSnippetCmd.getSuggestionsFromActiveSnippets(
                message.payload.snippets || []
              );
            } catch (err) {
              console.error("Failed to calculate smart suggestions:", err);
              webviewView.webview.postMessage({
                type: "render-smart-suggestions",
                payload: { suggestions: [] },
              });
            }
            break;
          }

          case "add-full-files-from-suggestions": {
            const { filePaths } = message.payload;
            await require("../commands/addSnippet").addFullFileToWebview(
              filePaths
            );
            break;
          }

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
            const { promptText, snippets, includeProjectTree, format } =
              message.payload;
            let outputContent = `${promptText}\n---\n`;

            snippets.forEach((snippet) => {
              if (snippet.type === "code") {
                outputContent += `### ${snippet.fileInfo}\n\n`;
                outputContent += "```\n";
                outputContent += `${snippet.code}\n`;
                outputContent += "```\n";
              } else if (snippet.type === "terminal") {
                outputContent += `\n\n### Terminal Log\n\n\`\`\`\n${snippet.code}\n\`\`\`\n`;
              } else if (snippet.type === "external") {
                outputContent += `\n\n### External Information\n\n${snippet.code}\n`;
              }

              if (snippet.note) {
                outputContent += `> ${snippet.note}\n\n`;
              }
              outputContent += "---\n";
            });

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
                "AI Context copied to clipboard."
              );
            } else if (format === "md" || format === "txt") {
              const defaultUri = vscode.Uri.file(
                path.join(
                  vscode.workspace.workspaceFolders[0].uri.fsPath,
                  `snippetfuse-context.${format}`
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
                  `AI Context exported to ${path.basename(fileUri.fsPath)}.`
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
