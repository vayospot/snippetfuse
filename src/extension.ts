import * as vscode from "vscode";
import { createSnippetViewProvider } from "./providers/snippetViewProvider";
import { addSnippetToWebview, setWebview } from "./commands/addSnippet";
import { addMainSnippet } from "./commands/addMainSnippet";
import { addFilesSnippet } from "./commands/addFilesSnippet";
import { generateCommitContext } from "./commands/generateCommitContext";

// Store disposables for cleanup
const disposables: vscode.Disposable[] = [];

/**
 * Called when the extension is activated.
 * Registers the webview provider and all commands.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('The extension "snippetfuse" is now active!');

  // Register the webview view provider
  const viewProvider = createSnippetViewProvider(context);
  const disposable = vscode.window.registerWebviewViewProvider(
    "snippetfuse.mainView",
    viewProvider
  );
  context.subscriptions.push(disposable);
  disposables.push(disposable);

  // Register all commands
  const commands = [
    vscode.commands.registerCommand("snippetfuse.addSnippet", () => {
      addSnippetToWebview({ isMain: false });
    }),
    vscode.commands.registerCommand(
      "snippetfuse.addMainSnippet",
      addMainSnippet
    ),
    vscode.commands.registerCommand(
      "snippetfuse.addTitleContextSnippet",
      () => {
        addSnippetToWebview({ isMain: false, source: "editor-title-context" });
      }
    ),
    vscode.commands.registerCommand(
      "snippetfuse.addFilesSnippet",
      addFilesSnippet
    ),
    vscode.commands.registerCommand(
      "snippetfuse.generateCommitContext",
      generateCommitContext
    ),
  ];

  // Add all command disposables to context
  commands.forEach((cmd) => {
    context.subscriptions.push(cmd);
    disposables.push(cmd);
  });
}

/**
 * Called when the extension is deactivated.
 * Cleans up all registered disposables.
 */
export function deactivate(): void {
  // Clear the webview reference
  setWebview(undefined as unknown as vscode.WebviewView);

  // Dispose all tracked disposables
  for (const disposable of disposables) {
    try {
      disposable.dispose();
    } catch (error) {
      console.warn("Error disposing resource:", error);
    }
  }
  disposables.length = 0;
}
