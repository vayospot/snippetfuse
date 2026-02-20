import * as vscode from "vscode";
import * as path from "path";
import { getProjectFilePaths } from "../utils/projectTree";
import { addFullFileToWebview } from "./addSnippet";

/**
 * Command handler to quickly add multiple files from the project.
 * Shows a quick pick with all project files (respecting .gitignore).
 */
async function addFilesSnippet(): Promise<void> {
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage(
      "No workspace folder open. Cannot list project files."
    );
    return;
  }

  const rootUri = vscode.workspace.workspaceFolders[0].uri;

  let filePaths: string[] = [];

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

  const quickPickItems: vscode.QuickPickItem[] = filePaths.map(
    (relativePath) => {
      return {
        label: path.basename(relativePath),
        description: relativePath,
        picked: false,
      };
    }
  );

  const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
    title: "Select files to add as full context snippets",
    canPickMany: true,
    matchOnDescription: true,
    placeHolder:
      "Type to filter by files or folders (e.g., 'api' or 'src/utils')",
  });

  if (selectedItems && selectedItems.length > 0) {
    const selectedPaths = selectedItems.map((item) => item.description!);
    await addFullFileToWebview(selectedPaths, "user");
  }
}

export { addFilesSnippet };
