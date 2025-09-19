const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function getWebviewContent(webview, extensionUri) {
  const htmlPath = path.join(extensionUri.fsPath, "webview", "index.html");
  let htmlContent = fs.readFileSync(htmlPath, "utf8");

  const stylePath = vscode.Uri.joinPath(extensionUri, "webview", "style.css");
  const styleUri = webview.asWebviewUri(stylePath);

  const scriptPath = vscode.Uri.joinPath(extensionUri, "webview", "script.js");
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

module.exports = { getWebviewContent };
