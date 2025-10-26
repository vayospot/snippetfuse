# Changelog

All notable changes to SnippetFuse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
