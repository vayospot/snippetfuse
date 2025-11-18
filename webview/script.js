const vscode = acquireVsCodeApi();

const TRUNCATION_HEIGHT = 200;
const DEBOUNCE_SAVE_DELAY = 500;
const DEBOUNCE_TOKEN_DELAY = 300;
const SCROLL_ZONE_HEIGHT = 60;
const SCROLL_SPEED = 10;

const MODEL_LIMITS = {
  ChatGPT: 128000,
  Claude: 100000,
  Grok: 98000,
  Gemini: 52760,
};

let promptTemplates = {};
let defaultPrompt = "bug-report";
let isStateRestored = false;
let draggedElement = null;

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

const debouncedSaveState = debounce(saveState, DEBOUNCE_SAVE_DELAY);
const debouncedUpdateTokenCounter = debounce(
  updateTokenCounter,
  DEBOUNCE_TOKEN_DELAY
);

function createEmptyState() {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.innerHTML = `
    <span class="empty-icon">🔗</span>
    <div class="empty-content">
      <h3>Add Code Context</h3>
      <p>Select code, right-click → Set Main Issue or Add Snippet</p>
    </div>
  `;
  return div;
}

function getContainer() {
  return document.querySelector(".unified-context-container");
}

// State Management
function saveState() {
  const state = {
    snippets: [],
    selectedPromptValue,
    customPromptValue: customPromptInput.value,
    includeProjectTree: addProjectTreeCheckbox.checked,
    smartSuggestionsOpen: smartSuggestionsDetails.hasAttribute("open"),
  };

  document
    .querySelectorAll(".unified-context-container .snippet-card")
    .forEach((card) => {
      state.snippets.push(extractSnippetData(card));
    });

  vscode.setState(state);
}

function extractSnippetData(card) {
  // Determine Type
  let type = "code";
  if (card.dataset.type) {
    type = card.dataset.type;
  }

  // Common Data
  const noteInput = card.querySelector(".note-input");
  const note = noteInput ? noteInput.value || "" : "";
  const noteVisible = !card
    .querySelector(".note-section")
    .classList.contains("hidden");
  const addedBy = card.dataset.addedBy || "user";
  const isMain = card.classList.contains("main-snippet");

  // Specific Data based on Type
  let text, fileName, startLine, endLine, isFullFile;

  if (type === "code") {
    const fileInfo =
      card.dataset.fileInfo || card.querySelector(".file-info")?.title.trim();
    text = card.querySelector(".code-preview").textContent;
    isFullFile = card.classList.contains("full-file");

    if (isFullFile) {
      fileName = fileInfo;
      startLine = 1;
      endLine = 1;
    } else {
      const match = fileInfo.match(/^(.+):(\d+)-(\d+)$/);
      if (match) {
        fileName = match[1];
        startLine = parseInt(match[2]);
        endLine = parseInt(match[3]);
      } else {
        fileName = fileInfo;
        startLine = 1;
        endLine = 1;
      }
    }
  } else {
    // Terminal or External
    text = card.querySelector(".card-text-content").value;
    fileName = type === "terminal" ? "Terminal Log" : "External Info";
    startLine = 0;
    endLine = 0;
    isFullFile = false;
  }

  return {
    type,
    fileName,
    startLine,
    endLine,
    text,
    note,
    noteVisible,
    isFullFile,
    addedBy,
    isMain,
  };
}

let shouldRecalculateSuggestions = false;

function restoreState() {
  const state = vscode.getState();
  isStateRestored = true;

  if (!state) {
    applyPromptTemplate(defaultPrompt);
    updateCounters();
    updateTokenCounter();
    return;
  }

  const container = getContainer();
  container.innerHTML = "";

  if (state.snippets) {
    state.snippets.forEach((snippet) => {
      renderSnippetCard(snippet);
      const cards = document.querySelectorAll(
        ".unified-context-container .snippet-card"
      );
      const lastCard = cards[cards.length - 1];

      if (lastCard) {
        // Restore note
        if (snippet.note) {
          const noteInput = lastCard.querySelector(".note-input");
          const noteSection = lastCard.querySelector(".note-section");
          noteInput.value = snippet.note;
          if (snippet.noteVisible) {
            noteSection.classList.remove("hidden");
          }
        }
      }
    });
  }

  if (state.selectedPromptValue === "custom" && state.customPromptValue) {
    customPromptInput.value = state.customPromptValue;
    applyPromptTemplate("custom");
  } else {
    applyPromptTemplate(defaultPrompt);
    customPromptInput.value = "";
  }

  addProjectTreeCheckbox.checked = state.includeProjectTree || false;

  if (state.smartSuggestionsOpen) {
    smartSuggestionsDetails.setAttribute("open", "");
    setTimeout(recalculateSuggestions, 0);
  } else {
    smartSuggestionsDetails.removeAttribute("open");
  }

  updateCounters();
  updateTokenCounter();
}

// Smart Suggestions Logic
const smartSuggestionsDetails = document.getElementById(
  "smart-suggestions-details"
);
const smartSuggestionsLoading = document.getElementById(
  "smart-suggestions-loading"
);
const smartSuggestionsPills = document.getElementById(
  "smart-suggestions-pills"
);
const smartSuggestionsEmpty = document.getElementById(
  "smart-suggestions-empty"
);

function getActiveSnippetsForSuggestionAnalysis() {
  const allSnippets = [];
  document
    .querySelectorAll(".unified-context-container .snippet-card")
    .forEach((card) => {
      const data = extractSnippetData(card);
      if (data.type === "code") {
        allSnippets.push(data);
      }
    });
  return allSnippets;
}

function recalculateSuggestions() {
  const allSnippets = getActiveSnippetsForSuggestionAnalysis();
  const hasPrimarySnippets = allSnippets.some((s) => s.addedBy === "user");

  if (!hasPrimarySnippets) {
    smartSuggestionsLoading.classList.add("hidden");
    smartSuggestionsPills.innerHTML = "";
    smartSuggestionsEmpty.classList.remove("hidden");
    return;
  }

  smartSuggestionsPills.innerHTML = "";
  smartSuggestionsEmpty.classList.add("hidden");
  smartSuggestionsLoading.classList.remove("hidden");

  vscode.postMessage({
    type: "get-smart-suggestions",
    payload: {
      snippets: allSnippets,
    },
  });

  shouldRecalculateSuggestions = false;
}

smartSuggestionsDetails.addEventListener("toggle", () => {
  saveState();
  if (smartSuggestionsDetails.hasAttribute("open")) {
    if (
      shouldRecalculateSuggestions ||
      (smartSuggestionsPills.children.length === 0 &&
        !smartSuggestionsEmpty.classList.contains("hidden"))
    ) {
      recalculateSuggestions();
    }
  }
});

smartSuggestionsPills.addEventListener("click", (e) => {
  if (e.target.classList.contains("suggestion-pill")) {
    const filePath = e.target.dataset.filePath;
    vscode.postMessage({
      type: "add-full-files-from-suggestions",
      payload: {
        filePaths: [filePath],
      },
    });

    e.target.remove();
    if (smartSuggestionsPills.children.length === 0) {
      smartSuggestionsEmpty.classList.remove("hidden");
    }
  }
});

// UI Update Functions
function updateCounters(options = {}) {
  const { sourceOfChange = "init" } = options;

  const container = getContainer();
  const totalCount = container.querySelectorAll(".snippet-card").length;

  document.querySelector(".unified-count").textContent = totalCount;

  let emptyState = container.querySelector(".empty-state");
  if (totalCount === 0) {
    if (!emptyState) {
      emptyState = createEmptyState();
      container.appendChild(emptyState);
    }
    emptyState.style.display = "flex";
  } else if (emptyState) {
    emptyState.style.display = "none";
  }

  const isPrimaryChange = sourceOfChange === "user";

  if (isPrimaryChange) {
    if (smartSuggestionsDetails.hasAttribute("open")) {
      recalculateSuggestions();
    } else {
      shouldRecalculateSuggestions = true;
    }
  }
}

function renderSnippetCard(snippet) {
  const container = getContainer();
  // Note: Logic changed, existing cards don't force "Main" status unless user sets it.
  const isMain = snippet.isMain || false;

  const card = createSnippetCardElement(snippet, isMain);

  if (snippet.type === "code") {
    setupTruncation(card, snippet.isFullFile || false);
  }

  attachEventListeners(card, snippet);

  if (isMain) {
    container.insertBefore(card, container.firstChild);
  } else {
    container.appendChild(card);
  }
}

function createSnippetCardElement(snippet, isMain) {
  const type = snippet.type || "code"; // code, terminal, external
  const isFullFile = snippet.isFullFile || false;

  let displayFileName = snippet.fileName;
  let tooltipTitle = snippet.fileName;

  if (type === "code") {
    const baseFileName = snippet.fileName.split(/[/\\]/).pop();
    displayFileName = isFullFile
      ? baseFileName
      : `${baseFileName}:${snippet.startLine}-${snippet.endLine}`;
    tooltipTitle = isFullFile
      ? snippet.fileName
      : `${snippet.fileName}:${snippet.startLine}-${snippet.endLine}`;
  }

  const card = document.createElement("div");
  card.className = `snippet-card ${isMain ? "main-snippet" : ""} ${
    isFullFile ? "full-file" : ""
  } ${type !== "code" ? "text-card" : ""}`;

  card.dataset.fileInfo = tooltipTitle;
  card.dataset.addedBy = snippet.addedBy || "user";
  card.dataset.type = type;
  card.setAttribute("draggable", "false");

  // Content construction based on type
  let contentHtml = "";
  if (type === "code") {
    contentHtml = `<div class="code-preview-container truncated"><pre class="code-preview"></pre></div>`;
  } else {
    const placeholder =
      type === "terminal"
        ? "Paste terminal logs here..."
        : "Paste docs, articles, or other text here...";
    contentHtml = `<textarea class="card-text-content" placeholder="${placeholder}"></textarea>`;
  }

  // Go to file button only for code
  const goToFileBtn =
    type === "code"
      ? `<button class="action-button go-to-file" title="Go to file"><span class="codicon codicon-go-to-file"></span></button>`
      : "";

  card.innerHTML = `
    <div class="card-header">
      <span class="drag-handle codicon codicon-gripper" title="Drag to reorder"></span>
      <span class="star-indicator ${isMain ? "filled" : "hollow"}" title="${
    isMain ? "Unset Main" : "Set as Main Snippet"
  }">
        ${isMain ? "★" : "☆"}
      </span>
      <div class="file-info" title="${tooltipTitle}">
        ${displayFileName}
      </div>
      <div class="card-actions">
        <button class="action-button add-note" title="Add note">
          <span class="codicon codicon-note"></span>
        </button>
        ${goToFileBtn}
        <button class="action-button danger remove-snippet" title="Remove">
          <span class="codicon codicon-trash"></span>
        </button>
      </div>
    </div>
    ${contentHtml}
    <div class="note-section hidden">
      <textarea class="note-input" placeholder="Add note for this context..."></textarea>
    </div>
  `;

  if (type === "code") {
    const codePreview = card.querySelector(".code-preview");
    codePreview.textContent = snippet.text.trim();
  } else {
    const textarea = card.querySelector(".card-text-content");
    textarea.value = snippet.text || "";
    // Auto-focus if it's a new blank card
    if (!snippet.text && !isStateRestored) {
      setTimeout(() => textarea.focus(), 50);
    }
  }

  return card;
}

function setupTruncation(card, isFullFile) {
  const codeContainer = card.querySelector(".code-preview-container");
  const codePreview = card.querySelector(".code-preview");

  if (!codeContainer) return; // Safety check for text cards

  if (isFullFile) {
    codeContainer.style.display = "none";
    return;
  }

  if (codePreview.scrollHeight > TRUNCATION_HEIGHT) {
    codeContainer.classList.add("truncated");
  } else {
    codeContainer.classList.remove("truncated");
  }
}

function toggleMainStatus(card) {
  const container = getContainer();
  const currentMain = container.querySelector(".snippet-card.main-snippet");
  const isCurrentlyMain = card.classList.contains("main-snippet");

  // 1. Remove existing main status from anywhere
  if (currentMain) {
    currentMain.classList.remove("main-snippet");
    const oldStar = currentMain.querySelector(".star-indicator");
    oldStar.classList.remove("filled");
    oldStar.classList.add("hollow");
    oldStar.textContent = "☆";
    oldStar.title = "Set as Main Snippet";
  }

  // 2. If it wasn't main before, make it main now (Toggle ON)
  if (!isCurrentlyMain) {
    card.classList.add("main-snippet", "promoting");
    const newStar = card.querySelector(".star-indicator");
    newStar.classList.remove("hollow");
    newStar.classList.add("filled");
    newStar.textContent = "★";
    newStar.title = "Unset Main";

    // Move to top with animation
    if (container.firstChild !== card) {
      container.insertBefore(card, container.firstChild);
    }

    setTimeout(() => {
      card.classList.remove("promoting");
    }, 300);

    vscode.postMessage({
      type: "main-snippet-changed",
      payload: extractSnippetData(card),
    });
  } else {
    // Toggle OFF -> Notify that there is no main snippet
    vscode.postMessage({
      type: "main-snippet-removed",
    });
  }

  saveState();
}

function attachEventListeners(card, snippet) {
  const fileNameElement = card.querySelector(".file-info");
  const removeButton = card.querySelector(".remove-snippet");
  const addNoteButton = card.querySelector(".add-note");
  const goToFileButton = card.querySelector(".go-to-file");
  const noteSection = card.querySelector(".note-section");
  const noteInput = noteSection.querySelector(".note-input");
  const starIndicator = card.querySelector(".star-indicator");
  const textContentInput = card.querySelector(".card-text-content");
  const dragHandle = card.querySelector(".drag-handle");

  const isFullFile = snippet.isFullFile || false;

  // --- DRAG HANDLE LOGIC ---
  // Enable draggable ONLY when interacting with the handle.

  dragHandle.addEventListener("mouseenter", () => {
    card.setAttribute("draggable", "true");
  });

  dragHandle.addEventListener("mouseleave", () => {
    // Only disable if we aren't actively dragging this card
    if (!card.classList.contains("dragging")) {
      card.setAttribute("draggable", "false");
    }
  });

  // Ensure logic also works for touch/click hybrid scenarios
  dragHandle.addEventListener("mousedown", () => {
    card.setAttribute("draggable", "true");
  });

  // Star click handler
  starIndicator.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMainStatus(card);
  });

  // Go to file handler (Code only)
  if (goToFileButton) {
    const jumpPayload = {
      fileName: snippet.fileName,
      startLine: isFullFile ? 1 : snippet.startLine,
      endLine: isFullFile ? 1 : snippet.endLine,
    };

    goToFileButton.addEventListener("click", () => {
      vscode.postMessage({
        type: "jump-to-file",
        payload: jumpPayload,
      });
    });

    fileNameElement.addEventListener("click", () => {
      vscode.postMessage({
        type: "jump-to-file",
        payload: jumpPayload,
      });
    });
  }

  removeButton.addEventListener("click", () => {
    const wasMain = card.classList.contains("main-snippet");
    const wasPrimary = card.dataset.addedBy === "user";

    card.remove();

    if (wasMain) {
      vscode.postMessage({
        type: "main-snippet-removed",
      });
    }

    updateCounters({ sourceOfChange: wasPrimary ? "user" : "suggestion" });
    updateTokenCounter();
    saveState();
  });

  addNoteButton.addEventListener("click", () => {
    noteSection.classList.toggle("hidden");
    if (!noteSection.classList.contains("hidden")) {
      noteInput.focus();
    }
    saveState();
  });

  noteInput.addEventListener("input", debouncedSaveState);

  if (textContentInput) {
    textContentInput.addEventListener("input", () => {
      debouncedSaveState();
      debouncedUpdateTokenCounter();
    });
  }

  // Drag and drop event listeners
  card.addEventListener("dragstart", handleDragStart);
  card.addEventListener("dragend", handleDragEnd);
  card.addEventListener("dragover", handleDragOver);
  card.addEventListener("drop", handleDrop);
  card.addEventListener("dragenter", handleDragEnter);
  card.addEventListener("dragleave", handleDragLeave);
}

// Drag and Drop Handlers
function handleDragStart(e) {

  draggedElement = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove("dragging");

  // Reset draggable to false after drag finishes
  this.setAttribute("draggable", "false");

  document.querySelectorAll(".snippet-card").forEach((card) => {
    card.classList.remove("drop-target-top", "drop-target-bottom");
  });

  draggedElement = null;
  saveState();
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = "move";

  // Auto Scroll Logic
  const mainContent = document.getElementById("main-scroll-container");
  const containerRect = mainContent.getBoundingClientRect();

  if (e.clientY < containerRect.top + SCROLL_ZONE_HEIGHT) {
    mainContent.scrollTop -= SCROLL_SPEED;
  } else if (e.clientY > containerRect.bottom - SCROLL_ZONE_HEIGHT) {
    mainContent.scrollTop += SCROLL_SPEED;
  }

  // Divider Logic
  if (this !== draggedElement) {
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;

    this.classList.remove("drop-target-top", "drop-target-bottom");

    if (e.clientY < midpoint) {
      this.classList.add("drop-target-top");
    } else {
      this.classList.add("drop-target-bottom");
    }
  }

  return false;
}

function handleDragEnter(e) {
  // handled in dragOver usually for divider logic
}

function handleDragLeave(e) {
  // Only remove class if we are leaving the card element, not entering a child
  if (
    e.relatedTarget &&
    !this.contains(e.relatedTarget) &&
    e.relatedTarget !== this
  ) {
    this.classList.remove("drop-target-top", "drop-target-bottom");
  }
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  // Clean up classes
  document
    .querySelectorAll(".snippet-card")
    .forEach((c) =>
      c.classList.remove("drop-target-top", "drop-target-bottom")
    );

  if (draggedElement !== this) {
    const rect = this.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midpoint;

    if (insertBefore) {
      this.parentNode.insertBefore(draggedElement, this);
    } else {
      this.parentNode.insertBefore(draggedElement, this.nextSibling);
    }
  }

  return false;
}

// Message Handling
window.addEventListener("message", (event) => {
  const message = event.data;
  switch (message.type) {
    case "add-snippet":
      renderSnippetCard(message.payload);
      updateCounters({ sourceOfChange: message.payload.addedBy });
      updateTokenCounter();
      saveState();
      break;
    case "render-smart-suggestions":
      smartSuggestionsLoading.classList.add("hidden");
      const suggestions = message.payload.suggestions;
      smartSuggestionsPills.innerHTML = "";
      if (suggestions.length === 0) {
        smartSuggestionsEmpty.classList.remove("hidden");
      } else {
        smartSuggestionsEmpty.classList.add("hidden");
        suggestions.forEach((filePath) => {
          const baseFileName = filePath.split(/[/\\]/).pop();
          const button = document.createElement("button");
          button.className = "suggestion-pill";
          button.title = filePath;
          button.textContent = `+ ${baseFileName}`;
          button.dataset.filePath = filePath;
          smartSuggestionsPills.appendChild(button);
        });
      }
      break;
    case "initialize-settings":
      promptTemplates = {
        "bug-report": message.payload.bugReport,
        "feature-request": message.payload.featureRequest,
        "code-review": message.payload.codeReview,
      };
      const newDefault = message.payload.default;

      if (isStateRestored && newDefault !== defaultPrompt) {
        defaultPrompt = newDefault;
        if (selectedPromptValue !== "custom") {
          applyPromptTemplate(newDefault);
          saveState();
        }
      } else {
        defaultPrompt = newDefault;
        if (!isStateRestored) {
          restoreState();
        }
      }
      break;
  }
});

// Prompt Creation Logic
const promptSelectDisplay = document.getElementById("prompt-select-display");
const promptSelectOptions = document.getElementById("prompt-select-options");
const customPromptInput = document.getElementById("custom-prompt-input");

let selectedPromptValue = "bug-report";

function applyPromptTemplate(value) {
  selectedPromptValue = value;
  const option = promptSelectOptions.querySelector(`[data-value="${value}"]`);
  if (option) {
    promptSelectDisplay.querySelector(".selected-prompt").textContent =
      option.textContent;
  }

  if (value === "custom") {
    customPromptInput.classList.remove("hidden");
    customPromptInput.focus();
  } else {
    customPromptInput.classList.add("hidden");
  }
}

promptSelectDisplay.addEventListener("click", () => {
  promptSelectOptions.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".prompt-dropdown-container")) {
    promptSelectOptions.classList.add("hidden");
  }
});

promptSelectOptions.addEventListener("click", (event) => {
  const selectedLi = event.target.closest("li");
  if (selectedLi) {
    const value = selectedLi.dataset.value;
    applyPromptTemplate(value);
    promptSelectOptions.classList.add("hidden");
    saveState();
  }
});

customPromptInput.addEventListener("input", debouncedSaveState);

// Finalizing & Exporting Logic
const copyButton = document.getElementById("copy-to-clipboard-button");
const exportDropdownButton = document.getElementById("export-dropdown-button");
const exportDropdownContent = document.getElementById(
  "export-dropdown-content"
);
const addProjectTreeCheckbox = document.getElementById(
  "add-project-tree-checkbox"
);

addProjectTreeCheckbox.addEventListener("change", () => {
  saveState();
});

// Icon Action Buttons (Header)
const quickAddFilesButton = document.getElementById("quick-add-files-btn");
const addExternalInfoButton = document.getElementById("add-external-info-btn");
const addTerminalLogButton = document.getElementById("add-terminal-log-btn");

quickAddFilesButton.addEventListener("click", () => {
  vscode.postMessage({
    type: "add-files",
    payload: { command: "snippetfuse.addFilesSnippet" },
  });
});

addTerminalLogButton.addEventListener("click", () => {
  renderSnippetCard({
    type: "terminal",
    fileName: "Terminal Log",
    text: "",
    addedBy: "user",
  });
  updateCounters({ sourceOfChange: "user" });
  updateTokenCounter();
  saveState();
});

addExternalInfoButton.addEventListener("click", () => {
  renderSnippetCard({
    type: "external",
    fileName: "External Info",
    text: "",
    addedBy: "user",
  });
  updateCounters({ sourceOfChange: "user" });
  updateTokenCounter();
  saveState();
});

exportDropdownButton.addEventListener("click", (e) => {
  e.stopPropagation();
  exportDropdownContent.classList.toggle("hidden");
});

document.addEventListener("click", () => {
  exportDropdownContent.classList.add("hidden");
});

function getFullContext() {
  const snippets = [];
  document.querySelectorAll(".snippet-card").forEach((card) => {
    const data = extractSnippetData(card);

    let codeOrText = "";
    if (data.type === "code") {
      codeOrText = data.text; // extracted from preview
    } else {
      codeOrText = data.text; // extracted from textarea
    }

    snippets.push({
      fileInfo: data.fileName,
      code: codeOrText,
      note: data.note,
      type: data.type,
    });
  });

  const promptText =
    selectedPromptValue === "custom"
      ? customPromptInput.value
      : promptTemplates[selectedPromptValue] || "";

  const includeProjectTree = addProjectTreeCheckbox.checked;

  // Legacy Support (Extension expects terminal/external separated, but now they are in snippets array)
  // We send empty objects for legacy handlers to avoid errors, but content is in snippets now.
  const terminalLog = { include: false, text: "" };
  const externalInfo = { include: false, text: "" };

  return {
    promptText,
    snippets,
    terminalLog,
    externalInfo,
    includeProjectTree,
  };
}

copyButton.addEventListener("click", () => {
  const context = getFullContext();
  vscode.postMessage({
    type: "export-content",
    payload: {
      ...context,
      format: "copy",
    },
  });
});

exportDropdownContent.addEventListener("click", (event) => {
  if (event.target.tagName === "A") {
    event.preventDefault();
    event.stopPropagation();
    const format = event.target.dataset.format;
    const context = getFullContext();
    vscode.postMessage({
      type: "export-content",
      payload: {
        ...context,
        format,
      },
    });
    exportDropdownContent.classList.add("hidden");
  }
});

// Reset Logic
const resetButton = document.querySelector(".reset-button");

resetButton.addEventListener("click", () => {
  const container = getContainer();
  container.innerHTML = "";

  customPromptInput.value = "";
  applyPromptTemplate(defaultPrompt);

  addProjectTreeCheckbox.checked = false;
  smartSuggestionsDetails.removeAttribute("open");

  updateCounters({ sourceOfChange: "user" });
  updateTokenCounter();
  saveState();
});

// Token Counter Logic
const tokenCounterFooter = document.querySelector(".token-warning");
const tokenInfoIcon = tokenCounterFooter.querySelector(".codicon");

function countTokens(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words * 0.75);
}

function updateTokenCounter() {
  const fullContext = getFullContext();
  const allText =
    fullContext.promptText +
    fullContext.snippets.map((s) => s.fileInfo + s.code + s.note).join(" ") +
    (fullContext.includeProjectTree ? "project tree placeholder" : "");

  const totalTokens = countTokens(allText);
  const lowestLimit = Math.min(...Object.values(MODEL_LIMITS));

  if (totalTokens >= lowestLimit) {
    tokenCounterFooter.classList.remove("hidden");
  } else {
    tokenCounterFooter.classList.add("hidden");
  }

  let hoverText = `Estimated tokens: ${totalTokens.toLocaleString()}\n\nModel Limits:\n`;
  for (const [model, limit] of Object.entries(MODEL_LIMITS)) {
    const exceeds = totalTokens > limit;
    hoverText += `• ${model}: ${limit.toLocaleString()}`;
    if (exceeds) {
      hoverText += " (⚠️ exceeded)";
    }
    hoverText += "\n";
  }
  hoverText +=
    "\nTip: Consider exporting to file instead of copying for better handling.";

  tokenInfoIcon.title = hoverText;
}

function subscribeToContentChanges() {
  const containers = [
    getContainer(),
    document.getElementById("custom-prompt-input"),
    document.getElementById("add-project-tree-checkbox"),
  ];

  containers.forEach((element) => {
    if (element) {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.addEventListener("input", debouncedUpdateTokenCounter);
        element.addEventListener("change", updateTokenCounter);
      } else {
        const observer = new MutationObserver(debouncedUpdateTokenCounter);
        observer.observe(element, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }
  });
}

// Initialize
subscribeToContentChanges();

// Help button functionality
const helpButton = document.querySelector(".help-button");
helpButton.addEventListener("click", () => {
  vscode.postMessage({
    type: "show-help",
  });
});
