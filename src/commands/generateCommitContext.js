const vscode = require("vscode");

const MAX_DIFF_CHAR_LIMIT = 50000; // Total context budget (The AI model limit)
const FILE_DIFF_HARD_LIMIT = 5000; // If a single file diff is over this, summarize it.
const FILE_DIFF_SNIPPET_LIMIT = 1000; // If a single file diff is over this, use a head/tail snippet.
const SNIPPET_SIZE = 500; // Size of head and tail snippets when splicing.

const PROMPT_HEADER =
  "Write a commit message (max 72 chars for the subject) for the following changes, strictly adhering to the Conventional Commits specification. The tone should be formal and objective:\n\n---\n\n";

// Hardcoded files/directories to exclude diff content for
const HEAVY_EXCLUSION_PATTERNS = [
  /node_modules\//,
  /dist\//,
  /.git\//,
  /build\//,
  /out\//,
  /coverage\//,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /vendor\//,
];

function getGitApi() {
  const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
  return gitExtension?.getAPI(1) || null;
}

/**
 * Counts added and removed lines from a diff block.
 * @param {string} diffBlock The diff string for a single file.
 * @returns {{added: number, removed: number}}
 */
function getDiffStats(diffBlock) {
  const added = diffBlock
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diffBlock
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  return { added, removed };
}

/**
 * Processes the raw staged diff file-by-file
 * - applying exclusion rules
 * - handling binary files
 * - applies smart summarization IF useSmartLimits is true.
 *
 * @param {string} rawDiff The raw staged diff string.
 * @param {boolean} useSmartLimits If true, applies FILE_DIFF_HARD_LIMIT and FILE_DIFF_SNIPPET_LIMIT.
 */
function processStagedDiff(rawDiff, useSmartLimits) {
  // Split diff into blocks
  const diffBlocks = rawDiff
    .split(/(?=^diff --git)/gm)
    .filter((block) => block.trim() !== "");

  let finalContext = "";
  let binaryFileCount = 0;
  let hardExcludedFileCount = 0; // files over HARD limit
  let snippetFileCount = 0; // files using head/tail snippet
  let omittedFileCount = 0; // files omitted due to MAX_DIFF_CHAR_LIMIT
  let contextLength = 0;
  let contextOverflow = false;

  for (const block of diffBlocks) {
    if (contextOverflow) {
      omittedFileCount++;
      continue;
    }

    // 1. Determine file path from diff header
    const pathMatch = block.match(/^diff --git a\/(.+) b\/(.+)/m);
    const filePath = pathMatch ? pathMatch[1] : null;

    // Use raw block if path cannot be determined
    if (!filePath) {
      if (contextLength + block.length < MAX_DIFF_CHAR_LIMIT) {
        finalContext += block + "\n";
        contextLength += block.length + 1;
      } else {
        contextOverflow = true;
      }
      continue;
    }

    let processedBlock = block;
    let fileTreatment = "full"; // Default is full

    // 2. Check for heavy file exclusion (ALWAYS ACTIVE)
    const isHeavy = HEAVY_EXCLUSION_PATTERNS.some((pattern) =>
      pattern.test(filePath)
    );

    if (isHeavy) {
      hardExcludedFileCount++;
      fileTreatment = "excluded";
      const stats = getDiffStats(block);

      processedBlock =
        `### File: ${filePath}\n\n` +
        `[Heavy File Excluded: Changes (+${stats.added} / -${stats.removed}). Content omitted by SnippetFuse.]`;
    }

    // 3. Check for binary file exclusion (ALWAYS ACTIVE)
    else if (/^Binary files a\/.+ and b\/.+ differ$/m.test(block)) {
      binaryFileCount++;
      fileTreatment = "binary";
      processedBlock =
        `### File: ${filePath}\n\n` +
        `[Binary File Change: ${filePath} - Content omitted for brevity]`;
    }

    // 4. Apply Smart Truncation/Summarization (CONDITIONAL)
    else if (useSmartLimits && block.length > FILE_DIFF_HARD_LIMIT) {
      hardExcludedFileCount++;
      fileTreatment = "summarized";
      const stats = getDiffStats(block);
      processedBlock =
        `### File: ${filePath}\n\n` +
        `[File Too Large: Changes (+${stats.added} / -${stats.removed}). Diff content omitted for full context.]`;
    }

    // 5. Apply Smart Head/Tail Snippet (CONDITIONAL)
    else if (useSmartLimits && block.length > FILE_DIFF_SNIPPET_LIMIT) {
      snippetFileCount++;
      fileTreatment = "snippet";

      const diffHeaderEndIndex = block.indexOf("@@");
      const header = block.substring(
        0,
        diffHeaderEndIndex > 0 ? diffHeaderEndIndex : 0
      );
      const content = block.substring(
        diffHeaderEndIndex > 0 ? diffHeaderEndIndex : 0
      );

      const contentStart = content.substring(0, SNIPPET_SIZE);
      const contentEnd = content.substring(content.length - SNIPPET_SIZE);

      processedBlock =
        `### File: ${filePath}\n\n` +
        header +
        contentStart +
        "\n\n... [DIFF TRUNCATED FOR BREVITY] ...\n\n" +
        contentEnd;
    }

    // 6. Full Diff (NO smart limits or exclusions). Use the full block
    else {
      processedBlock = `### File: ${filePath}\n\n` + block;
    }

    const blockToAppend = processedBlock + "\n";

    if (contextLength + blockToAppend.length < MAX_DIFF_CHAR_LIMIT) {
      finalContext += blockToAppend;
      contextLength += blockToAppend.length;
    } else {
      contextOverflow = true;
      omittedFileCount++;
      finalContext += `\n\n--- DIFF TRUNCATED (Content limit reached before file: ${filePath}) ---\n`;
    }
  }

  const lineCount = finalContext.split("\n").length;

  return {
    finalContext,
    lineCount,
    binaryFileCount,
    hardExcludedFileCount,
    snippetFileCount,
    omittedFileCount,
    contextOverflow,
  };
}

/**
 * Executes the core logic:
 * - fetches staged diff
 * - formats for AI context
 * - copies to clipboard.
 */
async function generateCommitContext() {
  const gitApi = getGitApi();
  if (!gitApi) {
    return vscode.window.showErrorMessage(
      "The Git extension is required for this feature."
    );
  }

  const repository = gitApi.repositories[0];
  if (!repository) {
    return vscode.window.showInformationMessage(
      "No active Git repository found in the current workspace."
    );
  }

  // Check for conflicted state
  if (repository.state.mergeChanges.length > 0) {
    return vscode.window.showWarningMessage(
      "Repository is in a conflicted state. Please resolve conflicts before generating a commit message."
    );
  }

  // Use indexChanges for staged files
  const stagedFiles = repository.state.indexChanges;
  if (stagedFiles.length === 0) {
    return vscode.window.showInformationMessage(
      "No staged changes found. Stage files in Source Control first."
    );
  }

  let progressNotification;
  try {
    progressNotification = vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Compiling Git changes with SnippetFuse...",
        cancellable: false,
      },
      async () => {
        const stagedDiff = await repository.diff(true);
        if (!stagedDiff.trim()) {
          return "no_changes";
        }

        // PASS 1: Determine if Smart Limits are needed
        let rawContextLength = 0;
        let requiresSmartLimits = false;

        // Simple estimation pass: remove heavy/binary files and check total length
        const diffBlocks = stagedDiff
          .split(/(?=^diff --git)/gm)
          .filter((block) => block.trim() !== "");

        for (const block of diffBlocks) {
          const pathMatch = block.match(/^diff --git a\/(.+) b\/(.+)/m);
          const filePath = pathMatch ? pathMatch[1] : null;

          if (
            filePath &&
            (HEAVY_EXCLUSION_PATTERNS.some((pattern) =>
              pattern.test(filePath)
            ) ||
              (block.includes("Binary files a/") && block.includes(" and b/")))
          ) {
            continue;
          }
          rawContextLength += block.length;
        }

        if (rawContextLength >= MAX_DIFF_CHAR_LIMIT) {
          requiresSmartLimits = true;
        }

        // PASS 2: Process the Diff
        const {
          finalContext,
          lineCount,
          binaryFileCount,
          hardExcludedFileCount,
          snippetFileCount,
          omittedFileCount,
          contextOverflow,
        } = processStagedDiff(stagedDiff, requiresSmartLimits);

        let finalOutput = PROMPT_HEADER;
        let context = finalContext.trim();

        // Process context to separate files
        const fileSections = context.split(/(?=^### File: )/gm);
        let formattedContext = "";

        for (const section of fileSections) {
          if (section.trim().length === 0) continue;

          const isSummary = !section.includes("diff --git");

          if (isSummary) {
            formattedContext += "\n\n---\n\n" + section.trim() + "\n";
          } else {
            // Full or Snippet Diff Block
            const headerMatch = section.match(/^(### File: [^\n]+\n\n)/);
            if (headerMatch) {
              const header = headerMatch[0].trim();
              const content = section.substring(headerMatch[0].length).trim();
              formattedContext += `\n\n---\n\n${header}\n\n\`\`\`diff\n${content}\n\`\`\``;
            } else {
              // Fallback for non-standard blocks (like the final TRUNCATED warning)
              formattedContext += "\n\n" + section.trim() + "\n";
            }
          }
        }

        finalOutput += formattedContext.trim();

        finalOutput = finalOutput.replace(/\n\n---\n\n\n\n---/, "\n\n---\n");

        finalOutput = finalOutput.trim();

        // Add a hint about the excluded files
        let note = "";
        const totalExcluded = hardExcludedFileCount + binaryFileCount;
        if (totalExcluded > 0) {
          note += `Note: ${totalExcluded} file(s) were summarized/excluded (Heavy/Large/Binary).`;
        }
        if (snippetFileCount > 0) {
          if (note.length > 0) note += " ";
          note += `${snippetFileCount} file(s) were sampled (Head/Tail snippet).`;
        }
        if (omittedFileCount > 0) {
          if (note.length > 0) note += " ";
          note += `${omittedFileCount} file(s) were omitted due to overall token budget.`;
        }

        if (note.length > 0) {
          finalOutput += `\n\n${note}`;
        }

        await vscode.env.clipboard.writeText(finalOutput);
        return {
          fileCount: stagedFiles.length,
          lineCount: finalOutput.split("\n").length,
          binaryFileCount,
          hardExcludedFileCount,
          snippetFileCount,
          omittedFileCount,
          contextOverflow,
        };
      }
    );

    const result = await progressNotification;

    if (result === "no_changes") {
      return vscode.window.showInformationMessage(
        "No staged changes found. Stage files in Source Control first."
      );
    }

    const {
      fileCount,
      lineCount,
      binaryFileCount,
      hardExcludedFileCount,
      snippetFileCount,
      omittedFileCount,
      contextOverflow,
    } = result;

    let message = `Generated AI Commit context (Files: ${fileCount}, Diff Lines: ${lineCount.toLocaleString()}).`;

    const totalExcluded =
      hardExcludedFileCount + binaryFileCount + omittedFileCount;
    if (totalExcluded > 0) {
      message += ` ${totalExcluded} file(s) ${
        omittedFileCount > 0 ? "omitted/" : ""
      }summarized.`;
    } else if (snippetFileCount > 0) {
      message += ` ${snippetFileCount} file(s) sampled.`;
    }

    if (contextOverflow) {
      message += " ⚠️ Context budget exceeded, subsequent files were omitted.";
    }

    vscode.window.showInformationMessage(message);
  } catch (error) {
    console.error("SnippetFuse Git Context Error:", error);
    vscode.window.showErrorMessage(
      "Failed to generate Git context. Check VS Code developer console for details."
    );
  }
}

module.exports = { generateCommitContext };
