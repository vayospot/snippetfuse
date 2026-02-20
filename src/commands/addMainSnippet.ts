import { addSnippetToWebview } from "./addSnippet";

/**
 * Command handler to add the selected code as the main snippet (main issue).
 * This marks the selected snippet as the primary context for AI analysis.
 */
function addMainSnippet(): void {
  addSnippetToWebview({ isMain: true });
}

export { addMainSnippet };
