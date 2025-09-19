const vscode = require("vscode");
const {
  createSnippetViewProvider,
} = require("./providers/snippetViewProvider");
const { addSnippetToWebview, hasMain } = require("./commands/addSnippet");
const { addMainSnippet } = require("./commands/addMainSnippet");
const { addContextSnippet } = require("./commands/addContextSnippet");

function activate(context) {
  console.log('The extension "snippetfuse" is now active!');

  const viewProvider = createSnippetViewProvider(context);
  const disposable = vscode.window.registerWebviewViewProvider(
    "snippetfuse.mainView",
    viewProvider
  );
  context.subscriptions.push(disposable);

  context.subscriptions.push(
    vscode.commands.registerCommand("snippetfuse.addSnippet", () => {
      const destination = hasMain() ? "context" : "main";
      addSnippetToWebview(destination);
    }),
    vscode.commands.registerCommand(
      "snippetfuse.addMainSnippet",
      addMainSnippet
    ),
    vscode.commands.registerCommand(
      "snippetfuse.addContextSnippet",
      addContextSnippet
    ),
    vscode.commands.registerCommand(
      "snippetfuse.addTitleContextSnippet",
      () => {
        const destination = hasMain() ? "context" : "main";
        addSnippetToWebview(destination, "editor-title-context");
      }
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
