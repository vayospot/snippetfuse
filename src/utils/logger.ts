/**
 * Centralized logging utility for SnippetFuse
 */

import * as vscode from "vscode";

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

/**
 * Current log level (can be configured via VS Code settings)
 */
let currentLogLevel = LogLevel.INFO;

/**
 * Initialize logger with VS Code configuration
 */
export function initializeLogger(): void {
  const config = vscode.workspace.getConfiguration("snippetfuse");
  const levelSetting = config.get<string>("logLevel", "info");

  switch (levelSetting.toLowerCase()) {
    case "debug":
      currentLogLevel = LogLevel.DEBUG;
      break;
    case "info":
      currentLogLevel = LogLevel.INFO;
      break;
    case "warning":
      currentLogLevel = LogLevel.WARNING;
      break;
    case "error":
      currentLogLevel = LogLevel.ERROR;
      break;
    default:
      currentLogLevel = LogLevel.INFO;
  }
}

/**
 * Log a debug message
 */
export function logDebug(message: string, ...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, ...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.INFO) {
    console.log(`[INFO] ${message}`, ...args);
  }
}

/**
 * Log a warning message
 */
export function logWarning(message: string, ...args: unknown[]): void {
  if (currentLogLevel <= LogLevel.WARNING) {
    console.warn(`[WARNING] ${message}`, ...args);
  }
}

/**
 * Log an error message
 */
export function logError(
  message: string,
  error?: Error | unknown,
  ...args: unknown[]
): void {
  if (currentLogLevel <= LogLevel.ERROR) {
    console.error(`[ERROR] ${message}`, error, ...args);
  }
}

/**
 * Log an error with VS Code notification to user
 */
export function logErrorWithNotification(
  message: string,
  error?: Error | unknown,
  showToUser = false
): void {
  logError(message, error);

  if (showToUser) {
    vscode.window.showErrorMessage(message);
  }
}

// Default export with all logging functions
export default {
  initializeLogger,
  debug: logDebug,
  info: logInfo,
  warning: logWarning,
  error: logError,
  logErrorWithNotification,
};
