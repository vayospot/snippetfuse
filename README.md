# SnippetFuse - Context Packaging For AI

SnippetFuse is a context packaging tool that helps package code snippets, terminal logs, and project structures from different files into a single context format for AI assistants like ChatGPT, Claude, and Gemini.

## Demo

<p align="center">
  <img src="https://raw.githubusercontent.com/vayospot/snippetfuse/main/assets/snippetfuse-demo.gif" alt="SnippetFuse Demo" />
</p>

## Features

- **Quick Snippet Capture**: Easily capture code from your active editor. Use a simple command to add selected code to the AI context.
- **Smart Snippet Management**: Organize your snippets with a clear distinction between the "Main Issue" and "Context" to guide the AI's focus.
- **Git Integration for Commit Messages**: Automatically generate AI context based on staged Git changes to draft descriptive commit messages.
- A sidebar panel for managing snippets.
- Choice to include a project tree to give the AI a complete overview of your codebase's structure.
- Terminal Log Capture: Add relevant terminal output to provide a full picture of the problem.
- Customizable Output: Simply copy it to your clipboard for instant pasting or export it as a Markdown file or a text file

## How to Use

### 1\. Open the SnippetFuse View

Open the SnippetFuse view by clicking on the extension icon in the Activity Bar on the side of VS Code.

### 2\. Capture Code Snippets

- **Add to AI Context**: Select a code block in your editor, right-click, and choose **Add Snippet**. If it's your first snippet, it will be added as the "Main Issue." Subsequent snippets will be added as "Context."
- **Set as Main Issue**: To explicitly set a snippet as the primary focus, select the code, right-click and choose **Set Main Issue**.
- **Add to Context Field**: To add a supporting snippet, select the code, right-click and choose **Append to Context Field**.

### 3\. Add More Context

- **Git Commit Context**: In the Source Control panel, click the SnippetFuse icon to generate a full context report of your staged changes, ready to be used for an AI-generated commit message.
- **Terminal Log**: Expand the "Terminal Log" section and paste any relevant terminal output.
- **Add Files from Project**: Click to select and import multiple files from your project simultaneously via a file picker as context.
- **Project Tree**: Check the "Add Project Tree" box to automatically generate and include a summary of your project's file structure. It respects your **`.gitignore`** file for faster scanning.

### 4\. Export Your Context

- **Copy to Clipboard**: Click the copy icon to copy the entire formatted context to your clipboard.
- **Export to File**: Use the dropdown menu to export your context as a `.md` or `.txt` file directly into your workspace.

## Contributing

SnippetFuse is an open-source project. Contributions, issues, and feature requests are welcome\!

- **Source Code**: [https://github.com/vayospot/snippetfuse](https://www.google.com/search?q=https://github.com/vayospot/snippetfuse)
- **Issues**: [https://github.com/vayospot/snippetfuse/issues](https://www.google.com/search?q=https://github.com/vayospot/snippetfuse/issues)
- **Twitter**: [@vayospot](https://x.com/vayospot)

## License

This project is licensed under the MIT License.
