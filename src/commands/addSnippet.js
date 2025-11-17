const vscode = require("vscode");
const path = require("path");

let webviewView;
let hasMainSnippet = false;
const MAX_SUGGESTIONS = 4;

function setWebview(view) {
  webviewView = view;
}

function hasMain() {
  return hasMainSnippet;
}

function resetMain() {
  hasMainSnippet = false;
}

/**
 * Extracts all import paths from code.
 * Returns an array of objects: { path: string, index: number }
 * The index is the starting position of the path string in the code.
 */
function extractImportPaths(code) {
  const importPaths = new Map(); // Use Map to auto-deduplicate by path string

  // Match various import patterns
  const patterns = [
    // ES6 imports: import X from "path" or import "path"
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
    // require: require("path") or require('path')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // Dynamic imports: import("path")
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const importPath = match[1];
      // Get the index of the path string itself within the full match
      const pathIndex = match.index + match[0].indexOf(importPath);
      // Only add the first occurrence of a unique path string
      if (!importPaths.has(importPath)) {
        importPaths.set(importPath, { path: importPath, index: pathIndex });
      }
    }
  });

  return Array.from(importPaths.values());
}

function isProjectSpecificImport(importPath) {
  // Keep relative paths: ./ ../
  if (importPath.startsWith(".")) return true;

  // Keep absolute paths starting with /
  if (importPath.startsWith("/")) return true;

  // Keep common alias patterns: @/ ~/ $/ #/
  if (/^[@~$#]\//.test(importPath)) return true;

  // Discard pure package names (no path separator)
  if (!importPath.includes("/")) return false;

  // Discard scoped packages: @scope/package
  if (/^@[\w-]+\/[\w-]+$/.test(importPath)) return false;

  // Discard node built-ins
  const nodeBuiltins = [
    "fs",
    "path",
    "http",
    "https",
    "crypto",
    "util",
    "events",
    "stream",
  ];
  if (nodeBuiltins.includes(importPath)) return false;

  // If it has a path separator but isn't scoped, might be project-specific
  // e.g., "utils/helpers" could be from tsconfig paths
  return true;
}

/**
 * Resolves an import path to an actual file using VS Code's definition provider.
 * Now uses a precise index for reliability.
 */
async function resolveImportToFile(
  importPath,
  importStartIndex,
  sourceFilePath,
  workspaceRoot
) {
  try {
    const sourceFileUri = vscode.Uri.file(
      path.join(workspaceRoot.fsPath, sourceFilePath)
    );

    let document;
    try {
      document = await vscode.workspace.openTextDocument(sourceFileUri);
    } catch (err) {
      console.warn(`Could not open source file: ${sourceFilePath}`);
      return null;
    }

    // Use the precise index to get the position, avoiding faulty string searches
    const position = document.positionAt(importStartIndex);
    const definitions = await vscode.commands.executeCommand(
      "vscode.executeDefinitionProvider",
      document.uri,
      position
    );

    if (definitions && definitions.length > 0) {
      // Handle both Location and LocationLink[] return types
      const targetUri = definitions[0].targetUri || definitions[0].uri;
      if (targetUri) {
        return targetUri.fsPath;
      }
    }

    return null;
  } catch (err) {
    console.error(
      `Failed to resolve import "${importPath}" via DefinitionProvider:`,
      err
    );
    return null;
  }
}

/**
 * Fallback: Manual resolution when VS Code's definition provider fails.
 * Handles common patterns like tsconfig paths and relative imports.
 */
async function manualResolveImport(importPath, sourceFilePath, workspaceRoot) {
  try {
    let resolvedPath = null;

    // Handle relative imports
    if (importPath.startsWith(".")) {
      const sourceDir = path.dirname(sourceFilePath);
      resolvedPath = path.join(sourceDir, importPath);
    }
    // Handle alias imports - try to find tsconfig/jsconfig
    else if (/^[@~$#]\//.test(importPath)) {
      // Strip the alias prefix
      const withoutAlias = importPath.replace(/^[@~$#]\//, "");

      // Try common alias mappings
      const commonRoots = ["src", "lib", "app", ""];
      for (const root of commonRoots) {
        const testPath = root ? path.join(root, withoutAlias) : withoutAlias;
        resolvedPath = testPath;

        // Try to find the file with this path
        const found = await findFileWithExtensions(resolvedPath, workspaceRoot);
        if (found) return found;
      }
      return null;
    }
    // Handle absolute imports from root
    else if (importPath.startsWith("/")) {
      resolvedPath = importPath.substring(1);
    }
    // Other patterns - might be tsconfig paths
    else {
      resolvedPath = importPath;
    }

    if (resolvedPath) {
      return await findFileWithExtensions(resolvedPath, workspaceRoot);
    }

    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Tries to find a file with common extensions (.js, .jsx, .ts, .tsx, etc.)
 * Also handles index.js patterns.
 */
async function findFileWithExtensions(relativePath, workspaceRoot) {
  // First, check if the path as-is resolves. This handles paths that already include an extension.
  const filesAsIs = await vscode.workspace.findFiles(
    relativePath,
    "**/node_modules/**",
    1
  );
  if (filesAsIs.length > 0) {
    return path
      .relative(workspaceRoot.fsPath, filesAsIs[0].fsPath)
      .replace(/\\/g, "/");
  }

  // If not, proceed assuming the path is extension-less (for suggestions).
  const extensions = [".js", ".jsx", ".ts", ".tsx", ".json", ".mjs", ".cjs"];

  // Try exact path with extensions
  for (const ext of extensions) {
    const pattern = `${relativePath}${ext}`;
    const files = await vscode.workspace.findFiles(
      pattern,
      "**/node_modules/**",
      1
    );
    if (files.length > 0) {
      return path
        .relative(workspaceRoot.fsPath, files[0].fsPath)
        .replace(/\\/g, "/");
    }
  }

  // Try as directory with index file
  for (const ext of extensions) {
    const pattern = `${relativePath}/index${ext}`;
    const files = await vscode.workspace.findFiles(
      pattern,
      "**/node_modules/**",
      1
    );
    if (files.length > 0) {
      return path
        .relative(workspaceRoot.fsPath, files[0].fsPath)
        .replace(/\\/g, "/");
    }
  }

  return null;
}

/**
 * Main function: analyzes code snippet and returns resolved file paths.
 */
async function getSuggestionsFromCode(code, currentFilePath, startLine) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) return [];

  // Step 1: Extract import paths and their exact locations
  const importData = extractImportPaths(code);

  // Step 2: Filter to only project-specific imports
  const projectImports = importData.filter((data) =>
    isProjectSpecificImport(data.path)
  );

  if (projectImports.length === 0) return [];

  // Step 3: Resolve each import to an actual file
  const resolvedFiles = new Set();

  for (const { path: importPath, index } of projectImports) {
    // Try VS Code's definition provider first (most accurate)
    let resolved = await resolveImportToFile(
      importPath,
      index, // Pass the precise index
      currentFilePath,
      workspaceRoot
    );

    // If resolved via API, it's an absolute path. Convert to relative.
    if (resolved) {
      resolved = path
        .relative(workspaceRoot.fsPath, resolved)
        .replace(/\\/g, "/");
    }

    // Fallback to manual resolution (already returns relative path)
    if (!resolved) {
      resolved = await manualResolveImport(
        importPath,
        currentFilePath,
        workspaceRoot
      );
    }

    if (resolved) {
      // Ensure it's not in node_modules
      if (!resolved.includes("node_modules")) {
        // Strip extension for consistent matching
        const withoutExt = resolved.replace(/\.(jsx?|tsx?|json|mjs|cjs)$/i, "");
        resolvedFiles.add(withoutExt);
      }
    }
  }

  return Array.from(resolvedFiles);
}

/**
 * Holistic analysis: gets top suggestions from all snippets.
 */
async function getSuggestionsFromActiveSnippets(allSnippets) {
  try {
    const suggestionCounts = new Map();
    const alreadyAddedPaths = new Set();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceRoot) return;

    // Step 1: Collect already-added files (normalized) from ALL snippets
    for (const snippet of allSnippets) {
      if (snippet.fileName) {
        // Ensure fileName is relative for comparison
        const relativeFileName = path.isAbsolute(snippet.fileName)
          ? path.relative(workspaceRoot.uri.fsPath, snippet.fileName)
          : snippet.fileName;

        const normalized = relativeFileName
          .replace(/\\/g, "/")
          .replace(/\.(jsx?|tsx?|json|mjs|cjs)$/i, "");
        alreadyAddedPaths.add(normalized);
      }
    }

    // Step 2: Extract suggestions from PRIMARY snippets only, to prevent feedback loop
    const primarySnippets = allSnippets.filter((s) => s.addedBy === "user");

    for (const snippet of primarySnippets) {
      if (!snippet.fileName || !snippet.text) continue;

      const suggestions = await getSuggestionsFromCode(
        snippet.text,
        snippet.fileName,
        snippet.startLine || 1
      );

      // Count occurrences
      for (const suggestion of suggestions) {
        const count = suggestionCounts.get(suggestion) || 0;
        suggestionCounts.set(suggestion, count + 1);
      }
    }

    // Step 3: Sort by frequency, filter out already-added, take top N
    const topSuggestions = Array.from(suggestionCounts.entries())
      .filter(([filePath]) => !alreadyAddedPaths.has(filePath))
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .slice(0, MAX_SUGGESTIONS)
      .map(([filePath]) => filePath);

    // Step 4: Send to webview
    if (webviewView) {
      webviewView.webview.postMessage({
        type: "render-smart-suggestions",
        payload: {
          suggestions: topSuggestions,
        },
      });
    }
  } catch (err) {
    console.error("Smart suggestions failed:", err);
    if (webviewView) {
      webviewView.webview.postMessage({
        type: "render-smart-suggestions",
        payload: { suggestions: [] },
      });
    }
  }
}

function addSnippetToWebview(destination, source) {
  vscode.commands.executeCommand("snippetfuse.mainView.focus");

  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage(
      "No active editor found. Please open a file first."
    );
    return;
  }

  let text;
  let rangeToUse;

  if (source === "editor-title-context") {
    rangeToUse = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(editor.document.getText().length)
    );
    text = editor.document.getText(rangeToUse);
  } else if (!editor.selection.isEmpty) {
    rangeToUse = editor.selection;
    text = editor.document.getText(rangeToUse);
  } else {
    vscode.window.showInformationMessage(
      "Please make a selection to add a snippet to Context."
    );
    return;
  }

  const fullPath = editor.document.fileName;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    editor.document.uri
  );
  const relativePath = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, fullPath).replace(/\\/g, "/")
    : fullPath;

  const startLine = rangeToUse.start.line + 1;
  const endLine = rangeToUse.end.line + 1;

  if (text && webviewView) {
    const snippet = {
      type: "add-snippet",
      payload: {
        fileName: relativePath,
        text,
        startLine,
        endLine,
        destination,
        addedBy: "user", // Mark as a primary, user-added snippet
      },
    };

    if (destination === "main") hasMainSnippet = true;

    webviewView.webview.postMessage(snippet);
    vscode.window.showInformationMessage(
      `Added snippet to ${destination === "main" ? "Main Issue" : "Context"}!`
    );
  }
}

async function addFullFileToWebview(relativeFilePaths, addedBy = "suggestion") {
  vscode.commands.executeCommand("snippetfuse.mainView.focus");

  if (!webviewView || !relativeFilePaths || relativeFilePaths.length === 0) {
    return;
  }

  const rootUri = vscode.workspace.workspaceFolders[0].uri;
  const destination = "context";
  let addedCount = 0;

  for (const relativePath of relativeFilePaths) {
    try {
      // This function now handles paths with and without extensions
      const resolvedPath = await findFileWithExtensions(relativePath, rootUri);

      if (!resolvedPath) {
        console.warn(`Could not resolve file path: ${relativePath}`);
        vscode.window.showWarningMessage(
          `Could not find file: ${relativePath}`
        );
        continue;
      }

      const fileUri = vscode.Uri.joinPath(rootUri, resolvedPath);
      const content = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(content).toString("utf8");

      if (!text) continue;

      const endLine = text.split(/\r\n|\r|\n/).length;

      const snippet = {
        type: "add-snippet",
        payload: {
          fileName: resolvedPath, // use the path with extension
          text,
          startLine: 1,
          endLine: endLine,
          destination,
          isFullFile: true,
          addedBy,
        },
      };

      webviewView.webview.postMessage(snippet);
      addedCount++;
    } catch (e) {
      console.error(`Failed to read file ${relativePath}:`, e);
    }
  }

  if (addedCount > 0) {
    vscode.window.showInformationMessage(
      `Added ${addedCount} file(s) to Context snippets!`
    );
  }
}

module.exports = {
  addSnippetToWebview,
  setWebview,
  hasMain,
  resetMain,
  addFullFileToWebview,
  getSuggestionsFromActiveSnippets,
};
