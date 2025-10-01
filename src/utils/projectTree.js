const vscode = require("vscode");
const path = require("path");
const ignore = require("ignore");

// Hardcoded directories to always exclude
const HEAVY_DIRS = [
  "node_modules/",
  "dist/",
  ".git/",
  "build/",
  "out/",
  "coverage/",
];

async function getIgnoreFilter(rootUri) {
  const ig = ignore();

  ig.add(HEAVY_DIRS);

  const gitignoreUri = vscode.Uri.joinPath(rootUri, ".gitignore");

  try {
    const content = await vscode.workspace.fs.readFile(gitignoreUri);
    const gitignoreContent = Buffer.from(content).toString("utf8");

    ig.add(gitignoreContent);
  } catch (error) {
    console.log(
      "No .gitignore found or failed to read. Using only default exclusions."
    );
  }

  const filesExclude =
    vscode.workspace.getConfiguration("files").get("exclude") || {};
  const searchExclude =
    vscode.workspace.getConfiguration("search").get("exclude") || {};
  const vsCodePatterns = [
    ...Object.keys(filesExclude),
    ...Object.keys(searchExclude),
  ].filter((key) => filesExclude[key] || searchExclude[key]);

  ig.add(vsCodePatterns);

  return ig;
}

async function collectFilePaths(
  uri,
  ignoreFilter,
  filePaths,
  relativeDir = ""
) {
  const entries = await vscode.workspace.fs.readDirectory(uri);

  for (const [name, type] of entries) {
    const relativePath = path.join(relativeDir, name);
    const pathToCheck =
      type === vscode.FileType.Directory ? `${relativePath}/` : relativePath;

    if (ignoreFilter.ignores(pathToCheck)) {
      if (type === vscode.FileType.Directory) {
        continue;
      } 
      // Files that are ignored also continue/skip, because we only want 
      // non-ignored files in the Quick Pick list.
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

async function getProjectFilePaths(rootUri) {
  if (!rootUri) return [];
  const ignoreFilter = await getIgnoreFilter(rootUri);
  const filePaths = [];
  await collectFilePaths(rootUri, ignoreFilter, filePaths);
  return filePaths;
}

async function generateProjectTree(
  uri,
  ignoreFilter,
  workspaceRoot,
  relativeDir = "",
  prefix = ""
) {
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
      type === vscode.FileType.Directory ? `${relativePath}/` : relativePath;

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

async function getProjectTree(rootUri) {
  if (!rootUri) return "";

  const ignoreFilter = await getIgnoreFilter(rootUri);

  return generateProjectTree(
    rootUri,
    ignoreFilter,
    vscode.workspace.asRelativePath(rootUri, true)
  );
}

module.exports = { generateProjectTree: getProjectTree, getProjectFilePaths };
