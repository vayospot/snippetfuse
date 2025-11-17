const vscode = require("vscode");
const path = require("path");
const { getProjectFilePaths } = require("../utils/projectTree");
const { addFullFileToWebview } = require("./addSnippet");

async function addFilesSnippet() {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage(
      "No workspace folder open. Cannot list project files."
    );
    return;
  }

  const rootUri = vscode.workspace.workspaceFolders[0].uri;

  let filePaths = [];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Scanning project files...",
      cancellable: false,
    },
    async () => {
      filePaths = await getProjectFilePaths(rootUri);
    }
  );

  const quickPickItems = filePaths.map((relativePath) => {
    return {
      label: path.basename(relativePath),
      description: relativePath,
      picked: false,
      value: relativePath,
    };
  });

  const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
    title: "Select files to add as full context snippets",
    canPickMany: true,
    matchOnDescription: true,
    placeHolder: "Type to filter by files or folders (e.g., 'api' or 'src/utils')",
  });

  if (selectedItems && selectedItems.length > 0) {
    const selectedPaths = selectedItems.map((item) => item.value);
    await addFullFileToWebview(selectedPaths, "user");
  }
}

module.exports = { addFilesSnippet };
