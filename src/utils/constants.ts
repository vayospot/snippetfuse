/**
 * Centralized constants for SnippetFuse
 */

/** Maximum number of smart suggestions to show */
export const MAX_SUGGESTIONS = 4;

/** Total context budget (AI model limit) */
export const MAX_DIFF_CHAR_LIMIT = 50000;

/** If a single file diff is over this, summarize it */
export const FILE_DIFF_HARD_LIMIT = 5000;

/** If a single file diff is over this, use a head/tail snippet */
export const FILE_DIFF_SNIPPET_LIMIT = 1000;

/** Size of head and tail snippets when splicing */
export const SNIPPET_SIZE = 500;

/** Directories to always exclude from scanning */
export const HEAVY_DIRS = [
  "node_modules/",
  "dist/",
  ".git/",
  "build/",
  "out/",
  "coverage/",
] as const;

/** Hardcoded files/directories to exclude diff content for */
export const HEAVY_EXCLUSION_PATTERNS: RegExp[] = [
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

/** Common file extensions to try when resolving imports */
export const FILE_EXTENSIONS = [
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

/** Common import path alias prefixes */
export const IMPORT_ALIAS_PREFIXES = ["@", "~", "$", "#"];

// Common alias root mappings
export const COMMON_ALIAS_ROOTS = ["src", "lib", "app", ""];

/** Token limits for various AI models (for estimation display) */
export const MODEL_LIMITS: Record<string, number> = {
  ChatGPT: 128000,
  Claude: 100000,
  Grok: 98000,
  Gemini: 52760,
  // Add more models as needed
};

/** Default prompt templates */
export const DEFAULT_PROMPTS = {
  default: "bug-report",
  bugReport: "bug-report",
  featureRequest: "feature-request",
  codeReview: "code-review",
} as const;

/** Height at which code snippets are truncated in the UI */
export const TRUNCATION_HEIGHT = 200;

/** Debounce delay for saving state */
export const DEBOUNCE_SAVE_DELAY = 500;

/** Debounce delay for token counter updates */
export const DEBOUNCE_TOKEN_DELAY = 300;

/** Scroll zone height for drag-and-drop auto-scroll */
export const SCROLL_ZONE_HEIGHT = 60;

/** Auto-scroll speed */
export const SCROLL_SPEED = 10;

// Messages to display
export const MESSAGES = {
  noActiveEditor: "No active editor found. Please open a file first.",
  noSelection: "Please make a selection to add a snippet.",
  snippetAdded: "Added snippet to Context!",
  filesAdded: (count: number) => `Added ${count} file(s) to Context!`,
  fileNotFound: (fileName: string) => `File not found: ${fileName}`,
  noWorkspace: "No workspace folder open. Cannot list project files.",
  noGitRepo: "No active Git repository found in the current workspace.",
  noStagedChanges:
    "No staged changes found. Stage files in Source Control first.",
  mergeConflict:
    "Repository is in a conflicted state. Please resolve conflicts before generating a commit message.",
  gitExtensionRequired: "The Git extension is required for this feature.",
  contextCopied: "AI Context copied to clipboard.",
  contextExported: (fileName: string) => `AI Context exported to ${fileName}.`,
  scanningFiles: "Scanning project files...",
  compilingContext: "Compiling Git changes with SnippetFuse...",
} as const;
