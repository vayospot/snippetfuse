const vscode = require("vscode");
const path = require("path");
const { simpleGlobMatch } = require("./glob");

async function generateProjectTree(uri, prefix = "") {
  const filesExclude =
    vscode.workspace.getConfiguration("files").get("exclude") || {};
  const searchExclude =
    vscode.workspace.getConfiguration("search").get("exclude") || {};
  const excludedPatterns = { ...filesExclude, ...searchExclude };
  const workspaceRoot = vscode.workspace.asRelativePath(uri, true);

  const HEAVY_DIRS = ["node_modules", "dist", ".git", "build", "out"];

  function shouldCollapse(name, relativePath, type) {
    if (type === vscode.FileType.Directory && HEAVY_DIRS.includes(name)) {
      return true;
    }

    return Object.keys(excludedPatterns).some(
      (pattern) =>
        excludedPatterns[pattern] && simpleGlobMatch(relativePath, pattern)
    );
  }

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
    const relativePath = path.join(workspaceRoot, name);

    if (
      type === vscode.FileType.Directory &&
      shouldCollapse(name, relativePath, type)
    ) {
      tree += `${prefix}${isLast ? "└── " : "├── "}${name}/...\n`;
      continue;
    }

    tree += `${prefix}${isLast ? "└── " : "├── "}${name}\n`;

    if (type === vscode.FileType.Directory) {
      const subUri = vscode.Uri.joinPath(uri, name);
      tree += await generateProjectTree(subUri, newPrefix);
    }
  }

  return tree;
}

module.exports = { generateProjectTree };
