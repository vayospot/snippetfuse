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
    // Language-agnostic additions for common includes
    /^\s*#include\s*["<]([^"<>]+)[">]/gm, // C/C++
    /^\s*use\s+([\w\\]+);/gm, // PHP/Rust
    /^\s*from\s+([\w.]+)\s+import/gm, // Python
    /^\s*import\s+([\w.]+)/gm, // Python/Java/Go
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
  if (importPath.startsWith(".") || importPath.startsWith("/")) return true;
  // Keep common alias patterns: @/ ~/ $/ #/
  if (/^[@~$#]\//.test(importPath)) return true;
  // This is a basic check. For Python `from . import X` becomes `.` which we want to ignore.
  if (importPath === ".") return false;
  // A path that contains a separator is likely a project file.
  if (/[/\\]/.test(importPath)) return true;
  // If none of the above, it's likely a library or built-in, so we discard it.
  return false;
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
      resolvedPath = importPath.replace(/\./g, "/"); // For python/java paths
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
  const extensions = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".mjs",
    ".cjs",
    ".py",
    ".java",
    ".go",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".php",
    ".rs",
  ];

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

  // For Python __init__.py
  const pyInitPattern = `${relativePath}/__init__.py`;
  const pyInitFiles = await vscode.workspace.findFiles(
    pyInitPattern,
    "**/node_modules/**",
    1
  );
  if (pyInitFiles.length > 0) {
    return path
      .relative(workspaceRoot.fsPath, pyInitFiles[0].fsPath)
      .replace(/\\/g, "/");
  }

  return null;
}

/**
 * Main function: analyzes code snippet and returns resolved file paths.
 */
async function getSuggestionsFromCode(code, currentFilePath) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) return [];

  const importData = extractImportPaths(code);
  const projectImports = importData.filter((data) =>
    isProjectSpecificImport(data.path)
  );

  if (projectImports.length === 0) return [];

  const resolvedFiles = new Set();
  for (const { path: importPath, index } of projectImports) {
    let resolved = await resolveImportToFile(
      importPath,
      index,
      currentFilePath,
      workspaceRoot
    );

    if (resolved) {
      resolved = path
        .relative(workspaceRoot.fsPath, resolved)
        .replace(/\\/g, "/");
    } else {
      resolved = await manualResolveImport(
        importPath,
        currentFilePath,
        workspaceRoot
      );
    }

    if (resolved && !resolved.includes("node_modules")) {
      const withoutExt = resolved.replace(/\.[^/.]+$/, "");
      resolvedFiles.add(withoutExt);
    }
  }

  return Array.from(resolvedFiles);
}

/**
 * Calculates the "Hub Score" for a given file by counting its local imports.
 * This is a lightweight, non-recursive scan.
 */
async function getHubScore(filePath, workspaceRoot) {
  try {
    const resolvedPathWithExt = await findFileWithExtensions(
      filePath,
      workspaceRoot.uri
    );
    if (!resolvedPathWithExt) return 0;

    const fileUri = vscode.Uri.joinPath(workspaceRoot.uri, resolvedPathWithExt);
    const content = await vscode.workspace.fs.readFile(fileUri);
    const text = Buffer.from(content).toString("utf8");

    const importData = extractImportPaths(text);
    const projectImportsCount = importData.filter((data) =>
      isProjectSpecificImport(data.path)
    ).length;

    return projectImportsCount;
  } catch (err) {
    console.warn(`Could not calculate hub score for ${filePath}:`, err.message);
    return 0;
  }
}

/**
 * Agnostic Ranking Engine: Gets top suggestions from all snippets.
 */
async function getSuggestionsFromActiveSnippets(allSnippets) {
  try {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceRoot) return;

    // --- PREPARATION: Collect all files already in context ---
    const alreadyAddedPaths = new Set();
    for (const snippet of allSnippets) {
      if (snippet.fileName) {
        const relativeFileName = path.isAbsolute(snippet.fileName)
          ? path.relative(workspaceRoot.uri.fsPath, snippet.fileName)
          : snippet.fileName;
        const normalized = relativeFileName
          .replace(/\\/g, "/")
          .replace(/\.[^/.]+$/, "");
        alreadyAddedPaths.add(normalized);
      }
    }

    // --- STEP 1: Frequency Score Calculation (Fast Pass) ---
    const suggestionFrequency = new Map();
    const primarySnippets = allSnippets.filter((s) => s.addedBy === "user");

    if (primarySnippets.length === 0) {
      webviewView?.webview.postMessage({
        type: "render-smart-suggestions",
        payload: { suggestions: [] },
      });
      return;
    }

    for (const snippet of primarySnippets) {
      if (!snippet.fileName || !snippet.text) continue;
      const suggestions = await getSuggestionsFromCode(
        snippet.text,
        snippet.fileName
      );
      for (const suggestion of suggestions) {
        if (!alreadyAddedPaths.has(suggestion)) {
          const count = suggestionFrequency.get(suggestion) || 0;
          suggestionFrequency.set(suggestion, count + 1);
        }
      }
    }

    const highSignalSuggestions = new Map();
    for (const [filePath, frequency] of suggestionFrequency.entries()) {
      // Only keep suggestions imported by 2+ primary files
      if (frequency > 1) {
        highSignalSuggestions.set(filePath, frequency);
      }
    }

    if (highSignalSuggestions.size === 0) {
      webviewView?.webview.postMessage({
        type: "render-smart-suggestions",
        payload: { suggestions: [] },
      });
      return; // Stop if no high-signal files are found
    }

    // --- STEP 2: Hub Analysis (Smart Pass on HIGH-SIGNAL files only) ---
    const topCandidatesByFreq = Array.from(highSignalSuggestions.keys())
      .sort(
        (a, b) => highSignalSuggestions.get(b) - highSignalSuggestions.get(a)
      )
      .slice(0, 7);

    const hubScores = new Map();
    for (const filePath of topCandidatesByFreq) {
      const score = await getHubScore(filePath, workspaceRoot);
      hubScores.set(filePath, score);
    }

    // --- STEP 3: Final Ranking (on HIGH-SIGNAL files only) ---
    const rankedSuggestions = Array.from(highSignalSuggestions.entries()).map(
      ([filePath, frequency]) => {
        const frequencyScore = frequency * 10;
        const hubScore = hubScores.get(filePath) || 0;
        return { filePath, score: frequencyScore + hubScore };
      }
    );

    const topSuggestions = rankedSuggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS)
      .map((item) => item.filePath);

    // --- STEP 4: Send to Webview ---
    webviewView?.webview.postMessage({
      type: "render-smart-suggestions",
      payload: { suggestions: topSuggestions },
    });
  } catch (err) {
    console.error("Smart suggestions failed:", err);
    webviewView?.webview.postMessage({
      type: "render-smart-suggestions",
      payload: { suggestions: [] },
    });
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
  if (!webviewView || !relativeFilePaths || relativeFilePaths.length === 0)
    return;

  const rootUri = vscode.workspace.workspaceFolders[0].uri;
  let addedCount = 0;

  for (const relativePath of relativeFilePaths) {
    try {
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
          fileName: resolvedPath,
          text,
          startLine: 1,
          endLine,
          destination: "context",
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
