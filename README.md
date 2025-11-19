# SnippetFuse - AI Context Builder

SnippetFuse is a smart context packaging tool that helps you package code snippets, terminal logs, project structures, and other information into a single, context format for AI assistants like ChatGPT, Claude, and Gemini.

It acts like a staging area for gathering and structuring context before sending it to any AI.

## Demo

<p align="center">
  <img src="https://raw.githubusercontent.com/vayospot/snippetfuse/main/assets/snippetfuse-demo.gif" alt="SnippetFuse Demo" />
  <br/>
  <em><strong>Note:</strong> The UI has been updated since this demo was recorded.</em>
</p>

## Features

- **Unified Context View**: A single, intuitive list for all your context. Drag and drop to reorder, and use the Star icon (★) to highlight your "Main Issue".
- **Intelligent Suggestions**: Snippetfuse engine automatically analyzes your added snippets and suggests relevant files to add to the context with one click.
- **Multiple Context Types**: Add not just code, but also Terminal Logs and External Info (like documentation or web solutions) as context snippets.
- **Full Customization**: Define your own default prompts (Bug Report, Code Review, etc.) in VS Code settings.
- **Git Integration**: Automatically generate AI context based on your staged Git changes to draft commit messages easily.
- **Project Structure**: Include an ASCII-style tree of your codebase (respecting `.gitignore`) to give the AI architectural context.
- **Flexible Export**: Copy the complete, formatted context to your clipboard, or export it as a Markdown or text file.

## How to Use

### 1. Open the SnippetFuse View

Click the SnippetFuse icon in the SideBar to open the main panel.

### 2. Add Your Context

- **Add Snippet**: Select a code block,and press `Alt+C` (or right-click, and choose Add Snippet (SnippetFuse)). This adds it as a regular context card. You can promote any card to the Main Issue by clicking its hollow star (☆).
- **Set Main Issue**: Select a code block, and press `Alt+M` (or right-click, and choose Set Main Issue (SnippetFuse)). This marks it as the primary focus.
- **Add Terminal Logs or External Info**: Use the Terminal (❯\_) or Globe (🌐) icons at the top of the context list to add special text cards for logs or documentation.

### 3. Organize & Refine

- **Drag & Drop**: Grab the handle on the left of any card to reorder snippets. The order in the list is the order the AI will read them.
- **Add Terminal Logs or External Info**: Use the Terminal (❯\_) or Globe (🌐) icons at the top of the context list to add special text cards for logs or documentation.

### 4. Enhance with Additional Context

- **Smart Suggestions**: After adding at least two code snippets, expand the "Smart Suggestions" section to see file recommendations.
- **Add Files from Project**: Use the Files (📄) icon to open a quick-pick menu and add multiple full files from your project at once.
- **Include Project Tree**: Check the "Include Project Tree" box to automatically generate and include a `.gitignore`-aware summary of your project's structure.
- **Request Full Code**: Check "Request full code from AI" to append instructions preventing the AI from returning lazy summaries (e.g., `// ... rest of code`).

### 5. Export

- **Copy to Clipboard**: The primary button copies the entire formatted context to your clipboard.
- **Export to File**: The dropdown menu lets you save the context as a `.md` or `.txt` file.

## Configuration

You can customize Snippetfuse in your editor's settings (`Ctrl+,` → search "SnippetFuse"):

- `snippetfuse.prompts.default`: The default template selected when opening the panel (e.g., "bug-report").
- `snippetfuse.prompts.bugReport`: Edit the text template for Bug Reports.
- `snippetfuse.prompts.codeReview`: Edit the text template for Code Reviews.
- `snippetfuse.prompts.gitCommit`: Edit the prompt template for generating Git commit messages.
- `snippetfuse.prompts.requestFullCodePrompt`: Edit the instruction appended when "Request full code" is checked.

## Contributing

SnippetFuse is open-source. Contributions, issues, and feature requests are welcome!

- **Source Code**: [https://github.com/vayospot/snippetfuse](https://github.com/vayospot/snippetfuse)
- **Issues**: [https://github.com/vayospot/snippetfuse/issues](https://github.com/vayospot/snippetfuse/issues)
- **Twitter**: [@vayospot](https://x.com/vayospot)

## License

MIT
