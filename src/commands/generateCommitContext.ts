import * as vscode from "vscode";
import {
  MAX_DIFF_CHAR_LIMIT,
  FILE_DIFF_HARD_LIMIT,
  FILE_DIFF_SNIPPET_LIMIT,
  SNIPPET_SIZE,
  HEAVY_EXCLUSION_PATTERNS,
} from "../utils/constants";
import type {
  GitExtensionAPI,
  GitAPI,
  GitRepository,
  CommitContextResult,
  ProcessedDiffResult,
} from "../types";

// Git API Helpers

/**
 * Gets the VS Code Git API.
 */
function getGitApi(): GitAPI | null {
  const gitExtension =
    vscode.extensions.getExtension<GitExtensionAPI>("vscode.git");
  if (!gitExtension?.exports) {
    return null;
  }
  const gitApi = gitExtension.exports;
  if (typeof gitApi.getAPI === "function") {
    return gitApi.getAPI(1);
  }
  return null;
}

// Diff Processing

/**
 * Counts added and removed lines from a diff block.
 */
function getDiffStats(diffBlock: string): { added: number; removed: number } {
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
 */
function processStagedDiff(
  rawDiff: string,
  useSmartLimits: boolean,
): ProcessedDiffResult {
  // Split diff into blocks
  const diffBlocks = rawDiff
    .split(/(?=^diff --git)/gm)
    .filter((block) => block.trim() !== "");

  let finalContext = "";
  let binaryFileCount = 0;
  let hardExcludedFileCount = 0;
  let snippetFileCount = 0;
  let omittedFileCount = 0;
  let contextLength = 0;
  let contextOverflow = false;

  for (const block of diffBlocks) {
    if (contextOverflow) {
      omittedFileCount++;
      continue;
    }

    // 1. Determine file path from diff header
    const pathMatch = /^diff --git a\/(.+) b\/(.+)/m.exec(block);
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

    // 2. Check for heavy file exclusion (ALWAYS ACTIVE)
    const isHeavy = HEAVY_EXCLUSION_PATTERNS.some((pattern) =>
      pattern.test(filePath),
    );

    if (isHeavy) {
      hardExcludedFileCount++;
      const stats = getDiffStats(block);

      processedBlock =
        `### File: ${filePath}\n\n` +
        `[Heavy File Excluded: Changes (+${stats.added} / -${stats.removed}). Content omitted by SnippetFuse.]`;
    }

    // 3. Check for binary file exclusion (ALWAYS ACTIVE)
    else if (/^Binary files a\/.+ and b\/.+ differ$/m.test(block)) {
      binaryFileCount++;
      processedBlock =
        `### File: ${filePath}\n\n` +
        `[Binary File Change: ${filePath} - Content omitted for brevity]`;
    }

    // 4. Apply Smart Truncation/Summarization (CONDITIONAL)
    else if (useSmartLimits && block.length > FILE_DIFF_HARD_LIMIT) {
      hardExcludedFileCount++;
      const stats = getDiffStats(block);
      processedBlock =
        `### File: ${filePath}\n\n` +
        `[File Too Large: Changes (+${stats.added} / -${stats.removed}). Diff content omitted for full context.]`;
    }

    // 5. Apply Smart Head/Tail Snippet (CONDITIONAL)
    else if (useSmartLimits && block.length > FILE_DIFF_SNIPPET_LIMIT) {
      snippetFileCount++;

      const diffHeaderEndIndex = block.indexOf("@@");
      const header = block.substring(
        0,
        diffHeaderEndIndex > 0 ? diffHeaderEndIndex : 0,
      );
      const content = block.substring(
        diffHeaderEndIndex > 0 ? diffHeaderEndIndex : 0,
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

    // 6. Full Diff
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

  return {
    finalContext,
    binaryFileCount,
    hardExcludedFileCount,
    snippetFileCount,
    omittedFileCount,
    contextOverflow,
  };
}

/**
 * Calculates raw context length for determining smart limits.
 */
function calculateRawContextLength(stagedDiff: string): number {
  let rawContextLength = 0;
  const diffBlocks = stagedDiff
    .split(/(?=^diff --git)/gm)
    .filter((block: string) => block.trim() !== "");

  for (const block of diffBlocks) {
    const pathMatch = /^diff --git a\/(.+) b\/(.+)/m.exec(block);
    const filePath = pathMatch ? pathMatch[1] : null;
    if (
      filePath &&
      (HEAVY_EXCLUSION_PATTERNS.some((pattern) => pattern.test(filePath)) ||
        (block.includes("Binary files a/") && block.includes(" and b/")))
    ) {
      continue;
    }
    rawContextLength += block.length;
  }

  return rawContextLength;
}

/**
 * Formats the processed diff context for output.
 */
function formatDiffContext(
  processed: ProcessedDiffResult,
  gitCommitPrompt: string,
): string {
  const finalPromptHeader = `${gitCommitPrompt}\n\n`;
  let finalOutput = finalPromptHeader;
  const context = processed.finalContext.trim();

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
      const headerMatch = /^(### File: [^\n]+\n\n)/.exec(section);
      if (headerMatch) {
        const header = headerMatch[0].trim();
        const content = section.substring(headerMatch[0].length).trim();
        formattedContext += `\n\n---\n\n${header}\n\n\`\`\`diff\n${content}\n\`\`\``;
      } else {
        // Fallback for non-standard blocks
        formattedContext += "\n\n" + section.trim() + "\n";
      }
    }
  }

  finalOutput += formattedContext.trim();
  finalOutput = finalOutput.replace(/\n\n---\n\n\n\n---/, "\n\n---\n");
  finalOutput = finalOutput.trim();

  // Add notes about excluded/sampled files
  let note = "";
  const totalExcluded =
    processed.hardExcludedFileCount + processed.binaryFileCount;
  if (totalExcluded > 0) {
    note += `Note: ${totalExcluded} file(s) were summarized/excluded (Heavy/Large/Binary).`;
  }
  if (processed.snippetFileCount > 0) {
    if (note.length > 0) note += " ";
    note += `${processed.snippetFileCount} file(s) were sampled (Head/Tail snippet).`;
  }
  if (processed.omittedFileCount > 0) {
    if (note.length > 0) note += " ";
    note += `${processed.omittedFileCount} file(s) were omitted due to overall token budget.`;
  }

  if (note.length > 0) {
    finalOutput += `\n\n${note}`;
  }

  return finalOutput;
}

/**
 * Processes staged diff and returns the final result.
 */
async function processAndFormatDiff(
  repository: GitRepository,
  stagedFiles: unknown[],
): Promise<CommitContextResult | "no_changes"> {
  const stagedDiff = await repository.diff(true);
  if (!stagedDiff.trim()) {
    return "no_changes";
  }

  // PASS 1: Determine if Smart Limits are needed
  const rawContextLength = calculateRawContextLength(stagedDiff);
  const requiresSmartLimits = rawContextLength >= MAX_DIFF_CHAR_LIMIT;

  // PASS 2: Process the Diff
  const processed = processStagedDiff(stagedDiff, requiresSmartLimits);

  // Get config
  const config = vscode.workspace.getConfiguration("snippetfuse.prompts");
  const gitCommitPrompt = config.get<string>("gitCommit") || "";

  // Format and copy to clipboard
  const finalOutput = formatDiffContext(processed, gitCommitPrompt);
  await vscode.env.clipboard.writeText(finalOutput);

  return {
    fileCount: stagedFiles.length,
    lineCount: finalOutput.split("\n").length,
    binaryFileCount: processed.binaryFileCount,
    hardExcludedFileCount: processed.hardExcludedFileCount,
    snippetFileCount: processed.snippetFileCount,
    omittedFileCount: processed.omittedFileCount,
    contextOverflow: processed.contextOverflow,
  };
}

// Main Command Handler

/**
 * Executes the core logic:
 * - fetches staged diff
 * - formats for AI context
 * - copies to clipboard.
 */
async function generateCommitContext(): Promise<void> {
  const gitApi = getGitApi();
  if (!gitApi) {
    vscode.window.showErrorMessage(
      "The Git extension is required for this feature.",
    );
    return;
  }

  const repository = gitApi.repositories[0];
  if (!repository) {
    vscode.window.showInformationMessage(
      "No active Git repository found in the current workspace.",
    );
    return;
  }

  // Check for conflicted state
  if (repository.state.mergeChanges.length > 0) {
    vscode.window.showWarningMessage(
      "Repository is in a conflicted state. Please resolve conflicts before generating a commit message.",
    );
    return;
  }

  // Use indexChanges for staged files
  const stagedFiles = repository.state.indexChanges;
  if (stagedFiles.length === 0) {
    vscode.window.showInformationMessage(
      "No staged changes found. Stage files in Source Control first.",
    );
    return;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Compiling Git changes with SnippetFuse...",
        cancellable: false,
      },
      async (): Promise<CommitContextResult | "no_changes"> => {
        return await processAndFormatDiff(repository, stagedFiles);
      },
    );

    if (result === "no_changes") {
      vscode.window.showInformationMessage(
        "No staged changes found. Stage files in Source Control first.",
      );
      return;
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
      "Failed to generate Git context. Check VS Code developer console for details.",
    );
  }
}

export { generateCommitContext };
