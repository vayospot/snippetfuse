/**
 * Centralized type definitions for SnippetFuse
 */

// ============= Snippet Types =============

export interface SnippetPayload {
  type: "code";
  fileName: string;
  text: string;
  startLine: number;
  endLine: number;
  isMain: boolean;
  addedBy: string;
  isFullFile?: boolean;
}

export interface AddSnippetOptions {
  isMain?: boolean;
  source?: "editor" | "editor-title-context";
}

export interface ImportPathData {
  path: string;
  index: number;
}

// ============= Webview Message Types =============

export type WebviewMessage =
  | { type: "webview-ready" }
  | { type: "show-notification"; payload: { text: string } }
  | { type: "add-files"; payload: { command: string } }
  | { type: "get-smart-suggestions"; payload: { snippets: SnippetPayload[] } }
  | {
      type: "add-full-files-from-suggestions";
      payload: { filePaths: string[] };
    }
  | {
      type: "jump-to-file";
      payload: { fileName: string; startLine: number; endLine: number };
    }
  | { type: "main-snippet-removed" }
  | { type: "export-content"; payload: ExportPayload };

// ============= Export Types =============

export interface ExportPayload {
  promptText: string;
  snippets: Array<{
    fileInfo: string;
    code: string;
    note?: string;
    type: string;
  }>;
  includeProjectTree: boolean;
  format: string;
  requestFullCode?: boolean;
}

// ============= Git Types =============

export interface GitExtensionAPI {
  getAPI(version: 1): GitAPI;
}

export interface GitAPI {
  repositories: GitRepository[];
}

export interface GitRepository {
  diff(staged: boolean): Promise<string>;
  state: {
    indexChanges: unknown[];
    mergeChanges: unknown[];
  };
}

// ============= Commit Context Types =============

export interface CommitContextResult {
  fileCount: number;
  lineCount: number;
  binaryFileCount: number;
  hardExcludedFileCount: number;
  snippetFileCount: number;
  omittedFileCount: number;
  contextOverflow: boolean;
}

export interface ProcessedDiffResult {
  finalContext: string;
  binaryFileCount: number;
  hardExcludedFileCount: number;
  snippetFileCount: number;
  omittedFileCount: number;
  contextOverflow: boolean;
}

// ============= UI Types =============

export interface ModelLimits {
  [key: string]: number;
}

export interface TokenEstimate {
  total: number;
  exceedsLimit: boolean;
  byModel: {
    model: string;
    limit: number;
    exceeds: boolean;
    percentage: number;
  }[];
}
