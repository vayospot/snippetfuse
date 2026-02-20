import * as vscode from "vscode";
import * as path from "path";
import ignore, { Ignore } from "ignore";

// Hardcoded directories to always exclude
const HEAVY_DIRS = [
  "node_modules/",
  "dist/",
  ".git/",
  "build/",
  "out/",
  "coverage/",
] as const;

/**
 * Creates an ignore filter that respects .gitignore and VS Code settings.
 */
async function getIgnoreFilter(rootUri: vscode.Uri): Promise<Ignore> {
  const ig = ignore();

  ig.add([...HEAVY_DIRS]);

  const gitignoreUri = vscode.Uri.joinPath(rootUri, ".gitignore");

  try {
    const content = await vscode.workspace.fs.readFile(gitignoreUri);
    const gitignoreContent = Buffer.from(content).toString("utf8");
    ig.add(gitignoreContent);
  } catch {
    console.log(
      "No .gitignore found or failed to read. Using only default exclusions."
    );
  }

  const filesExclude = vscode.workspace
    .getConfiguration("files")
    .get<Record<string, boolean>>("exclude") ?? {};
  const searchExclude = vscode.workspace
    .getConfiguration("search")
    .get<Record<string, boolean>>("exclude") ?? {};

  const vsCodePatterns = [
    ...Object.keys(filesExclude),
    ...Object.keys(searchExclude),
  ].filter((key) => filesExclude[key] || searchExclude[key]);

  ig.add(vsCodePatterns);

  return ig;
}

/**
 * Recursively collects all file paths in the workspace, respecting ignore rules.
 */
async function collectFilePaths(
  uri: vscode.Uri,
  ignoreFilter: Ignore,
  filePaths: string[],
  relativeDir = ""
): Promise<void> {
  const entries = await vscode.workspace.fs.readDirectory(uri);

  for (const [name, type] of entries) {
    const relativePath = path.join(relativeDir, name);
    const pathToCheck =
      type === vscode.FileType.Directory
        ? `${relativePath}/`
        : relativePath;

    if (ignoreFilter.ignores(pathToCheck)) {
      continue;
    }

    if (type === vscode.FileType.File) {
      filePaths.push(relativePath);
    } else if (type === vscode.FileType.Directory) {
      const subUri = vscode.Uri.joinPath(uri, name);
      await collectFilePaths(subUri, ignoreFilter, filePaths, relativePath);
    }
  }
}

/**
 * Gets all file paths in the project, respecting ignore rules.
 */
async function getProjectFilePaths(rootUri: vscode.Uri): Promise<string[]> {
  if (!rootUri) return [];
  const ignoreFilter = await getIgnoreFilter(rootUri);
  const filePaths: string[] = [];
  await collectFilePaths(rootUri, ignoreFilter, filePaths);
  return filePaths;
}

/**
 * Recursively generates a tree representation of the project.
 */
async function generateProjectTree(
  uri: vscode.Uri,
  ignoreFilter: Ignore,
  workspaceRoot: string,
  relativeDir = "",
  prefix = ""
): Promise<string> {
  let tree = "";
  const entries = await vscode.workspace.fs.readDirectory(uri);

  entries.sort((a, b) => {
    if (a[1] === b[1]) return a[0].localeCompare(b[0]);
    return a[1] === vscode.FileType.Directory ? -1 : 1;
  });

  for (let i = 0; i < entries.length; i++) {
    const [name, type] = entries[i];
    const isLast = i === entries.length - 1;
    const newPrefix = prefix + (isLast ? "    " : "│   ");

    const relativePath = path.join(relativeDir, name);

    const pathToCheck =
      type === vscode.FileType.Directory
        ? `${relativePath}/`
        : relativePath;

    // Check for exclusion BEFORE recursion
    if (ignoreFilter.ignores(pathToCheck)) {
      if (type === vscode.FileType.Directory) {
        tree += `${prefix}${isLast ? "└── " : "├── "}${name}/...\n`;
        continue;
      }
    }

    tree += `${prefix}${isLast ? "└── " : "├── "}${name}\n`;

    // Recurse into directory
    if (type === vscode.FileType.Directory) {
      const subUri = vscode.Uri.joinPath(uri, name);
      tree += await generateProjectTree(
        subUri,
        ignoreFilter,
        workspaceRoot,
        relativePath,
        newPrefix
      );
    }
  }

  return tree;
}

/**
 * Gets the project tree as a string, respecting ignore rules.
 */
async function getProjectTree(rootUri: vscode.Uri): Promise<string> {
  if (!rootUri) return "";

  const ignoreFilter = await getIgnoreFilter(rootUri);

  return generateProjectTree(
    rootUri,
    ignoreFilter,
    vscode.workspace.asRelativePath(rootUri, true)
  );
}

export { getProjectTree, getProjectFilePaths };
