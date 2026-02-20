import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Generates the HTML content for the webview by reading the HTML file
 * and injecting the necessary CSS and JavaScript references.
 */
function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const htmlPath = path.join(extensionUri.fsPath, "webview", "index.html");

  let htmlContent: string;
  try {
    htmlContent = fs.readFileSync(htmlPath, "utf8");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read webview HTML file at "${htmlPath}": ${errorMessage}. ` +
      "Make sure the webview folder exists in the extension."
    );
  }

  const stylePath = vscode.Uri.joinPath(extensionUri, "webview", "style.css");
  const styleUri = webview.asWebviewUri(stylePath);

  const scriptPath = vscode.Uri.joinPath(
    extensionUri,
    "webview",
    "script.js"
  );
  const scriptUri = webview.asWebviewUri(scriptPath);

  const codiconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "node_modules",
      "@vscode",
      "codicons",
      "dist",
      "codicon.css"
    )
  );

  const cspSource = webview.cspSource;
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; font-src ${cspSource}; script-src ${cspSource};">`;

  return htmlContent
    .replace(
      "<head>",
      `<head>\n${cspTag}\n<link rel="stylesheet" href="${styleUri}">\n<link rel="stylesheet" href="${codiconUri}">`
    )
    .replace("</body>", `\n<script src="${scriptUri}"></script>\n</body>`);
}

export { getWebviewContent };
