const vscode = acquireVsCodeApi();

const TRUNCATION_HEIGHT = 200;
const DEBOUNCE_SAVE_DELAY = 500;
const DEBOUNCE_TOKEN_DELAY = 300;

const MODEL_LIMITS = {
  ChatGPT: 128000,
  Claude: 100000,
  Grok: 98000,
  Gemini: 52760,
};

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

function createMainEmptyState() {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.innerHTML = `
    <span class="empty-icon">📍</span>
    <div class="empty-content">
      <h3>Set the Main Issue</h3>
      <p>Select code, right-click → Set Main Issue</p>
    </div>
  `;
  return div;
}

function createContextEmptyState() {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.innerHTML = `
    <span class="empty-icon">🔗</span>
    <div class="empty-content">
      <h3>Add Related Context</h3>
      <p>Select code, right-click → Add Snippet</p>
    </div>
  `;
  return div;
}

function getContainer(destination) {
  if (destination === "main") {
    return {
      container: document.querySelector(".main-snippet-container"),
      isMain: true,
    };
  } else {
    return {
      container: document.querySelector(".context-snippets-container"),
      isMain: false,
    };
  }
}

// State Management
function saveState() {
  const state = {
    mainSnippet: null,
    contextSnippets: [],
    selectedPromptValue,
    customPromptValue: customPromptInput.value,
    terminalLogValue: terminalLogInput.value,
    terminalLogOpen: terminalLogDetails.hasAttribute("open"),
    includeProjectTree: addProjectTreeCheckbox.checked,
    smartSuggestionsOpen: smartSuggestionsDetails.hasAttribute("open"),
  };

  const mainCard = document.querySelector(
    ".main-snippet-container .snippet-card"
  );
  if (mainCard) {
    state.mainSnippet = extractSnippetData(mainCard);
  }

  document
    .querySelectorAll(".context-snippets-container .snippet-card")
    .forEach((card) => {
      state.contextSnippets.push(extractSnippetData(card));
    });

  vscode.setState(state);
}

function extractSnippetData(card) {
  const fileInfo =
    card.dataset.fileInfo || card.querySelector(".file-info")?.title.trim();
  const code = card.querySelector(".code-preview").textContent;
  const noteInput = card.querySelector(".note-input");
  const note = noteInput ? noteInput.value || "" : "";
  const noteVisible = !card
    .querySelector(".note-section")
    .classList.contains("hidden");
  const isFullFile = card.classList.contains("full-file");
  const addedBy = card.dataset.addedBy || "user";

  let fileName, startLine, endLine;
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

  return {
    fileName,
    startLine,
    endLine,
    text: code,
    note,
    noteVisible,
    isFullFile,
    addedBy,
  };
}

let shouldRecalculateSuggestions = false;

function restoreState() {
  const state = vscode.getState();
  if (!state) return;

  const contextContainer = document.querySelector(
    ".context-snippets-container"
  );

  if (state.mainSnippet) {
    renderSnippetCard(state.mainSnippet, "main");
    const mainCard = document.querySelector(
      ".main-snippet-container .snippet-card"
    );
    if (mainCard && state.mainSnippet.note) {
      const noteInput = mainCard.querySelector(".note-input");
      const noteSection = mainCard.querySelector(".note-section");
      noteInput.value = state.mainSnippet.note;
      if (state.mainSnippet.noteVisible) {
        noteSection.classList.remove("hidden");
      }
    }
  }

  contextContainer.innerHTML = "";

  state.contextSnippets.forEach((snippet) => {
    renderSnippetCard(snippet, "context");
    const cards = document.querySelectorAll(
      ".context-snippets-container .snippet-card"
    );
    const lastCard = cards[cards.length - 1];
    if (lastCard && snippet.note) {
      const noteInput = lastCard.querySelector(".note-input");
      const noteSection = lastCard.querySelector(".note-section");
      noteInput.value = snippet.note;
      if (snippet.noteVisible) {
        noteSection.classList.remove("hidden");
      }
    }
  });

  selectedPromptValue = state.selectedPromptValue || "bug-report";
  const promptOptions = document.querySelectorAll("#prompt-select-options li");
  promptOptions.forEach((option) => {
    if (option.dataset.value === selectedPromptValue) {
      promptSelectDisplay.querySelector(".selected-prompt").textContent =
        option.textContent;
    }
  });

  customPromptInput.value = state.customPromptValue || "";
  if (selectedPromptValue === "custom") {
    customPromptInput.classList.remove("hidden");
  }

  terminalLogInput.value = state.terminalLogValue || "";
  if (state.terminalLogOpen) {
    terminalLogDetails.setAttribute("open", "");
  } else {
    terminalLogDetails.removeAttribute("open");
  }

  addProjectTreeCheckbox.checked = state.includeProjectTree || false;

  if (state.smartSuggestionsOpen) {
    smartSuggestionsDetails.setAttribute("open", "");
    recalculateSuggestions();
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
  const mainCard = document.querySelector(
    ".main-snippet-container .snippet-card"
  );
  if (mainCard) {
    allSnippets.push(extractSnippetData(mainCard));
  }

  document
    .querySelectorAll(".context-snippets-container .snippet-card")
    .forEach((card) => {
      allSnippets.push(extractSnippetData(card));
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
function updateCounters() {
  const mainContainer = document.querySelector(".main-snippet-container");
  const contextContainer = document.querySelector(
    ".context-snippets-container"
  );

  const mainCount = mainContainer.querySelectorAll(".snippet-card").length;
  const contextCount =
    contextContainer.querySelectorAll(".snippet-card").length;

  document.querySelector(".main-count").textContent = mainCount;
  document.querySelector(".context-count").textContent = contextCount;

  let mainEmpty = mainContainer.querySelector(".empty-state");
  if (mainCount === 0) {
    if (!mainEmpty) {
      mainEmpty = createMainEmptyState();
      mainContainer.appendChild(mainEmpty);
    }
    mainEmpty.style.display = "flex";
  } else if (mainEmpty) {
    mainEmpty.style.display = "none";
  }

  let contextEmpty = contextContainer.querySelector(".empty-state");
  if (contextCount === 0) {
    if (!contextEmpty) {
      contextEmpty = createContextEmptyState();
      contextContainer.appendChild(contextEmpty);
    }
    contextEmpty.style.display = "flex";
  } else if (contextEmpty) {
    contextEmpty.style.display = "none";
  }

  if (smartSuggestionsDetails.hasAttribute("open")) {
    recalculateSuggestions();
  } else {
    shouldRecalculateSuggestions = true;
  }
}

function renderSnippetCard(snippet, destination) {
  const { container, isMain } = getContainer(destination);
  if (isMain) {
    container.innerHTML = "";
  }

  const card = createSnippetCardElement(snippet, isMain);
  setupTruncation(card, snippet.isFullFile || false);
  attachEventListeners(card, snippet, isMain, container);

  container.appendChild(card);
}

function createSnippetCardElement(snippet, isMain) {
  const isFullFile = snippet.isFullFile || false;
  const baseFileName = snippet.fileName.split(/[/\\]/).pop();
  const displayFileName = isFullFile
    ? baseFileName
    : `${baseFileName}:${snippet.startLine}-${snippet.endLine}`;
  const tooltipTitle = isFullFile
    ? snippet.fileName
    : `${snippet.fileName}:${snippet.startLine}-${snippet.endLine}`;
  const fileIcon = isFullFile ? "codicon-file-code" : "codicon-code";

  const card = document.createElement("div");
  card.className = `snippet-card ${isMain ? "main-snippet" : ""} ${
    isFullFile ? "full-file" : ""
  }`;
  card.dataset.fileInfo = tooltipTitle;
  card.dataset.addedBy = snippet.addedBy || "user";

  card.innerHTML = `
    <div class="card-header">
      <div class="file-info" title="${tooltipTitle}">
        <span class="codicon ${fileIcon}"></span>
        ${displayFileName}
      </div>
      <div class="card-actions">
        ${
          !isMain
            ? '<button class="action-button move-up" title="Move up"><span class="codicon codicon-arrow-up"></span></button>'
            : ""
        }
        ${
          !isMain
            ? '<button class="action-button move-down" title="Move down"><span class="codicon codicon-arrow-down"></span></button>'
            : ""
        }
        <button class="action-button add-note" title="Add note">
          <span class="codicon codicon-note"></span>
        </button>
        <button class="action-button danger remove-snippet" title="Remove">
          <span class="codicon codicon-trash"></span>
        </button>
      </div>
    </div>
    <div class="code-preview-container truncated"><pre class="code-preview"></pre></div>
    <div class="expand-actions">
      <button class="show-more-button">Show full</button>
    </div>
    <div class="note-section hidden">
      <textarea class="note-input" placeholder="Add note for this snippet..."></textarea>
    </div>
  `;

  const codePreview = card.querySelector(".code-preview");
  codePreview.textContent = snippet.text.trim();

  return card;
}

function setupTruncation(card, isFullFile) {
  const codeContainer = card.querySelector(".code-preview-container");
  const codePreview = card.querySelector(".code-preview");

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

function attachEventListeners(card, snippet, isMain, container) {
  const showMoreButton = card.querySelector(".show-more-button");
  const fileNameElement = card.querySelector(".file-info");
  const removeButton = card.querySelector(".remove-snippet");
  const addNoteButton = card.querySelector(".add-note");
  const noteSection = card.querySelector(".note-section");
  const noteInput = noteSection.querySelector(".note-input");
  const isFullFile = snippet.isFullFile || false;

  const jumpPayload = {
    fileName: snippet.fileName,
    startLine: isFullFile ? 1 : snippet.startLine,
    endLine: isFullFile ? 1 : snippet.endLine,
  };

  showMoreButton.addEventListener("click", () => {
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

  removeButton.addEventListener("click", () => {
    if (card.classList.contains("main-snippet")) {
      vscode.postMessage({
        type: "main-snippet-removed",
      });
    }
    card.remove();
    updateCounters();
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

  if (!isMain) {
    const moveUpButton = card.querySelector(".move-up");
    const moveDownButton = card.querySelector(".move-down");

    moveUpButton.addEventListener("click", () => {
      const previousCard = card.previousElementSibling;
      if (previousCard && !previousCard.classList.contains("empty-state")) {
        container.insertBefore(card, previousCard);
        saveState();
      }
    });

    moveDownButton.addEventListener("click", () => {
      const nextCard = card.nextElementSibling;
      if (nextCard && !nextCard.classList.contains("empty-state")) {
        container.insertBefore(nextCard, card);
        saveState();
      }
    });
  }
}

// Message Handling
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "add-snippet") {
    renderSnippetCard(message.payload, message.payload.destination);
    updateCounters();
    updateTokenCounter();
    saveState();
  } else if (message.type === "render-smart-suggestions") {
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
  }
});

// Prompt Creation Logic
const promptSelectDisplay = document.getElementById("prompt-select-display");
const promptSelectOptions = document.getElementById("prompt-select-options");
const customPromptInput = document.getElementById("custom-prompt-input");

let selectedPromptValue = "bug-report";

promptSelectDisplay.addEventListener("click", () => {
  promptSelectOptions.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".prompt-dropdown-container")) {
    promptSelectOptions.classList.add("hidden");
  }
});

promptSelectOptions.addEventListener("click", (event) => {
  const selectedLi = event.target;
  if (selectedLi.tagName === "LI") {
    selectedPromptValue = selectedLi.dataset.value;
    promptSelectDisplay.querySelector(".selected-prompt").textContent =
      selectedLi.textContent;
    promptSelectOptions.classList.add("hidden");

    if (selectedPromptValue === "custom") {
      customPromptInput.classList.remove("hidden");
      customPromptInput.focus();
    } else {
      customPromptInput.classList.add("hidden");
    }
    saveState();
  }
});

customPromptInput.addEventListener("input", debouncedSaveState);

const terminalLogDetails = document.getElementById("terminal-log-details");
const terminalLogInput = document.getElementById("terminal-log-input");

terminalLogInput.addEventListener("input", debouncedSaveState);
terminalLogDetails.addEventListener("toggle", () => {
  saveState();
});

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

const quickAddFilesButton = document.getElementById("quick-add-files-button");
quickAddFilesButton.addEventListener("click", () => {
  vscode.postMessage({
    type: "add-files",
    payload: { command: "snippetfuse.addFilesSnippet" },
  });
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
    const fileInfo =
      card.dataset.fileInfo || card.querySelector(".file-info")?.title.trim();
    const code = card.querySelector(".code-preview").textContent;
    const noteInput = card.querySelector(".note-input");
    const note = noteInput ? noteInput.value || "" : "";
    snippets.push({ fileInfo, code, note });
  });

  const promptType = selectedPromptValue;
  const promptText =
    promptType === "custom" ? customPromptInput.value : promptType;
  const terminalLog = {
    include:
      terminalLogInput.value.trim().length > 0 &&
      terminalLogDetails.hasAttribute("open"),
    text: terminalLogInput.value.trim(),
  };
  const includeProjectTree = addProjectTreeCheckbox.checked;

  return {
    promptText,
    snippets,
    terminalLog,
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
const mainSnippetContainer = document.querySelector(".main-snippet-container");
const contextSnippetContainer = document.querySelector(
  ".context-snippets-container"
);

resetButton.addEventListener("click", () => {
  mainSnippetContainer.innerHTML = "";
  contextSnippetContainer.innerHTML = "";

  selectedPromptValue = "bug-report";
  promptSelectDisplay.querySelector(".selected-prompt").textContent =
    "Bug Report";
  customPromptInput.value = "";
  customPromptInput.classList.add("hidden");

  addProjectTreeCheckbox.checked = false;

  terminalLogInput.value = "";
  terminalLogDetails.removeAttribute("open");

  updateCounters();
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
    (fullContext.terminalLog.include ? fullContext.terminalLog.text : "") +
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
    document.querySelector(".main-snippet-container"),
    document.querySelector(".context-snippets-container"),
    document.getElementById("custom-prompt-input"),
    document.getElementById("terminal-log-input"),
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

  terminalLogDetails.addEventListener("toggle", updateTokenCounter);
}

// Initialize
restoreState();
updateCounters();
updateTokenCounter();
subscribeToContentChanges();

// Help button functionality
const helpButton = document.querySelector(".help-button");
helpButton.addEventListener("click", () => {
  vscode.postMessage({
    type: "show-help",
  });
});
