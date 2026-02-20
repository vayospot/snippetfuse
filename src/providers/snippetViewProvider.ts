import * as vscode from "vscode";
import * as path from "path";
import { getWebviewContent } from "../utils/getWebviewContent";
import { getProjectTree } from "../utils/projectTree";
import {
  setWebview,
  resetMain,
  addFullFileToWebview,
  getSuggestionsFromActiveSnippets,
} from "../commands/addSnippet";
import jsPDF from "jspdf";
import type { ExportPayload, WebviewMessage } from "../types";

/**
 * Handles the export logic for different formats (copy, markdown, text, PDF).
 */
async function handleExport(payload: ExportPayload): Promise<void> {
  const { promptText, snippets, includeProjectTree, format, requestFullCode } =
    payload;

  // Get the "Request full code" prompt from settings
  const config = vscode.workspace.getConfiguration("snippetfuse.prompts");
  const requestFullCodePrompt = config.get<string>("requestFullCodePrompt");

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
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (rootPath) {
      const projectTree = await getProjectTree(rootPath);
      outputContent += "\n\n### Project Tree\n\n```\n";
      outputContent += `${projectTree}\n`;
      outputContent += "```\n";
    }
  }

  // Add "Request full code" prompt if checkbox is checked
  if (requestFullCode && requestFullCodePrompt) {
    outputContent += `\n\n${requestFullCodePrompt}\n`;
  }

  if (format === "copy") {
    await vscode.env.clipboard.writeText(outputContent);
    vscode.window.showInformationMessage("AI Context copied to clipboard.");
  } else if (format === "md" || format === "txt") {
    const defaultUri = vscode.Uri.file(
      path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        `snippetfuse-context.${format}`,
      ),
    );
    const fileUri = await vscode.window.showSaveDialog({ defaultUri });
    if (fileUri) {
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(outputContent));
      vscode.window.showInformationMessage(
        `AI Context exported to ${path.basename(fileUri.fsPath)}.`,
      );
    }
  } else if (format === "pdf") {
    // Generate PDF
    const doc = new jsPDF({
      compress: true,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const maxWidth = pageWidth - margin * 2;
    let yPos = margin;

    // Helper to check and add new page if needed
    const checkPageBreak = (lineCount = 1): boolean => {
      const lineHeight = 4;
      const neededHeight = lineCount * lineHeight;
      if (yPos + neededHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };

    // Helper function to add text with proper wrapping
    const addText = (
      text: string,
      fontSize = 11,
      isBold = false,
      isCode = false,
    ): void => {
      doc.setFontSize(fontSize);
      doc.setFont(isCode ? "courier" : "helvetica", isBold ? "bold" : "normal");

      // Get wrapped lines
      const lines = doc.splitTextToSize(text, maxWidth);
      const lineCount = lines.length;
      const lineHeight = fontSize * 0.45;

      // Check if we need a new page BEFORE writing
      checkPageBreak(lineCount);

      for (let i = 0; i < lines.length; i++) {
        // Check page break before each line
        if (yPos > pageHeight - margin - lineHeight) {
          doc.addPage();
          yPos = margin;
        }
        doc.text(lines[i], margin, yPos);
        yPos += lineHeight;
      }
    };

    // Add prompt text
    addText(promptText, 12, true);
    yPos += 2;
    doc.setDrawColor(150);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    // Add snippets
    for (const snippet of snippets) {
      // Check page break before snippet
      checkPageBreak(5);

      // Add file info header
      const header =
        snippet.type === "code"
          ? snippet.fileInfo
          : snippet.type === "terminal"
            ? "Terminal Log"
            : "External Information";
      addText(header, 11, true);
      yPos += 1;

      // Add code/text content - process line by line for better control
      const codeLines = snippet.code.split("\n");
      for (const codeLine of codeLines) {
        addText(codeLine, 9, false, true);
      }
      yPos += 2;

      // Add note if exists
      if (snippet.note) {
        addText(`Note: ${snippet.note}`, 9, false, false);
        yPos += 2;
      }

      // Separator
      doc.setDrawColor(200);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;
    }

    // Add project tree if enabled
    if (includeProjectTree) {
      const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (rootPath) {
        let projectTree = await getProjectTree(rootPath);

        // Replace Unicode box-drawing characters with ASCII equivalents
        projectTree = projectTree
          .replace(/│/g, "|")
          .replace(/├──/g, "|--")
          .replace(/└──/g, "--")
          .replace(/──/g, "--");

        checkPageBreak(10);
        addText("Project Tree", 11, true);
        yPos += 1;

        // Process tree line by line
        const treeLines = projectTree.split("\n");
        for (const treeLine of treeLines) {
          addText(treeLine, 8, false, true);
        }
      }
    }

    // Save PDF
    const defaultUri = vscode.Uri.file(
      path.join(
        vscode.workspace.workspaceFolders![0].uri.fsPath,
        "snippetfuse-context.pdf",
      ),
    );
    const fileUri = await vscode.window.showSaveDialog({ defaultUri });
    if (fileUri) {
      const pdfBuffer = doc.output("arraybuffer");
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(pdfBuffer));
      vscode.window.showInformationMessage(
        `AI Context exported to ${path.basename(fileUri.fsPath)}.`,
      );
    }
  }
}

/**
 * Creates the webview provider for the SnippetFuse sidebar.
 */
function createSnippetViewProvider(
  context: vscode.ExtensionContext,
): vscode.WebviewViewProvider {
  return {
    resolveWebviewView(webviewView: vscode.WebviewView): void {
      // Set the webview reference for the addSnippet module
      setWebview(webviewView);

      // Configure webview options
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "webview"),
          vscode.Uri.joinPath(
            context.extensionUri,
            "node_modules",
            "@vscode",
            "codicons",
            "dist",
          ),
        ],
      };

      // Set the HTML content
      webviewView.webview.html = getWebviewContent(
        webviewView.webview,
        context.extensionUri,
      );

      // Function to send settings to the webview
      const sendSettings = (): void => {
        const config = vscode.workspace.getConfiguration("snippetfuse.prompts");
        const promptSettings = {
          default: config.get<string>("default"),
          bugReport: config.get<string>("bugReport"),
          featureRequest: config.get<string>("featureRequest"),
          codeReview: config.get<string>("codeReview"),
          requestFullCodePrompt: config.get<string>("requestFullCodePrompt"),
        };
        webviewView.webview.postMessage({
          type: "initialize-settings",
          payload: promptSettings,
        });
      };

      // Listen for configuration changes
      context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
          if (e.affectsConfiguration("snippetfuse.prompts")) {
            sendSettings();
          }
        }),
      );

      // Handle messages from the webview using type-safe discriminated union
      webviewView.webview.onDidReceiveMessage(
        async (message: WebviewMessage) => {
          switch (message.type) {
            // Send settings only when webview is ready
            case "webview-ready": {
              sendSettings();
              break;
            }

            case "show-notification": {
              vscode.window.showInformationMessage(message.payload.text);
              break;
            }

            case "add-files": {
              vscode.commands.executeCommand(message.payload.command);
              break;
            }

            case "get-smart-suggestions": {
              try {
                await getSuggestionsFromActiveSnippets(
                  message.payload.snippets,
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
              await addFullFileToWebview(message.payload.filePaths);
              break;
            }

            case "jump-to-file": {
              const { fileName, startLine, endLine } = message.payload;
              const workspaceFolders = vscode.workspace.workspaceFolders;
              if (workspaceFolders) {
                const uris = await vscode.workspace.findFiles(
                  `**/${fileName}`,
                  "**/node_modules/**",
                  1,
                );
                if (uris.length > 0) {
                  const fileUri = uris[0];
                  const range = new vscode.Range(
                    startLine - 1,
                    0,
                    endLine - 1,
                    0,
                  );
                  vscode.window.showTextDocument(fileUri, {
                    selection: range,
                    preview: true,
                  });
                } else {
                  vscode.window.showErrorMessage(`File not found: ${fileName}`);
                }
              }
              break;
            }

            case "main-snippet-removed": {
              resetMain();
              break;
            }

            case "export-content": {
              await handleExport(message.payload);
              break;
            }
          }
        },
      );
    },
  };
}

export { createSnippetViewProvider };
