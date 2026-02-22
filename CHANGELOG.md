# Changelog

All notable changes to SnippetFuse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.0] - 2026-02-21

### Added

- **TypeScript Migration**: Complete migration from JavaScript to TypeScript with strict type checking for improved code quality and maintainability.
- **Centralized Type Definitions**: New `src/types/index.ts` with comprehensive TypeScript interfaces for webview messages, snippets, exports, Git operations, and commit context.
- **Centralized Logging**: New `src/utils/logger.ts` with configurable log levels (DEBUG, INFO, WARNING, ERROR) for better debugging and diagnostics.
- **PDF Export**: Export context as PDF files with proper formatting, including page breaks, text wrapping, and styled output.
- **Modern ESLint Configuration**: Updated to ESLint flat config with TypeScript support via typescript-eslint, with separate configurations for extension code and webview code.

### Changed

- **Build System**: Replaced `jsconfig.json` with strict `tsconfig.json` for TypeScript compilation.
- **Webview Communication**: Implemented type-safe message handling using discriminated unions for better reliability.
- **Extension Lifecycle**: Added proper disposal management for extension resources to prevent memory leaks.

### Fixed

- **Markdown Export**: Fixed export to Markdown not working correctly.
- **Prompt Template Persistence**: Fixed issue where prompt template selection was not being saved and restored when the panel was closed and reopened.

---

## [0.4.0] - 2024-05-22

### Added

- **Smart Suggestions Engine**: A powerful suggestion engine that uses a "Frequency Score + Hub Score" algorithm to rank and suggest context files.
- **Full Prompt Customization**: All prompt templates (Bug Report, Feature Request, Code Review, Git Commit) are now editable in `settings.json`.
- **"Request Full Code" Feature**: A new checkbox that appends a configurable instruction to the prompt, asking the AI for complete code files instead of diffs.
- **Non-Code Cards**: Added dedicated UI buttons for creating "Terminal Log" and "External Info" text cards.
- **Drag-and-Drop Reordering**: All context cards in the panel can now be reordered via drag-and-drop.

### Changed

- **UI Redesign**: Complete redesign of the sidepanel to match modern VS Code native styling (colors, buttons, input fields).
- **Navigation**: "Add Files" and "Terminal" options moved to icon buttons in the section header for cleaner access.
- **Unified Context UI**: Merged the "Main Issue" and "Context" sections into a single, unified list. The main issue is now designated with a star icon (★) and can be toggled on any card.
- **Import Resolution**: Improved logic for resolving file paths, now supporting better handling of local imports vs. node_modules.

### Removed

- **`Add to Context Field` Command**: Removed the redundant `snippetfuse.addContextSnippet` command and its associated keybinding to simplify the workflow.
- **Separate "Main Issue" and "Context" Sections**: The UI no longer has two distinct lists, opting for the unified view.

---

## [0.3.0] - 2025-10-26

### Added

- **Git Integration**: New command `Generate AI Commit Context` available in the Source Control panel. It generates a full context report based on your currently staged Git changes, ready for use with LLMs to draft commit messages.

---

## [0.2.0] - 2025-10-01

### Added

- **New Feature**: Added a **`Add Files from Project`** button to the Additional context section, allowing to select multiple project files at once via a quick-pick list.
- **UX Improvement**: Webview state is now **persistent**. Snippets, notes, prompt choices, and input fields are preserved when the side panel is closed or the views is switched.

### Fixed

- **Performance**: The project file scanner now **respects `.gitignore`** rules, significantly speeding up file discovery and excluding large, unnecessary directories like `node_modules`.

---

## [0.1.0] - 2025-09-19

### Added

- Initial Release of SnippetFuse.
- A side panel to collect, manage, and organize code snippets.
- Command: `Add to AI Context` — default action that adds first snippet to _Main Issue_ and subsequent snippets to _Context_.
- Command: `Add to Main Issue` — upsert behavior, replaces or adds a snippet directly into the main issue section.
- Command: `Add to Context` — always appends snippets to the context section.
- Support for adding a full file to the context via the editor tab's right-click menu.
