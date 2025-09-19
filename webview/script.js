const vscode = acquireVsCodeApi();

function updateCounters() {
  const mainCount = document.querySelectorAll(
    ".main-snippet-container .snippet-card"
  ).length;
  const contextCount = document.querySelectorAll(
    ".context-snippets-container .snippet-card"
  ).length;

  document.querySelector(".main-count").textContent = mainCount;
  document.querySelector(".context-count").textContent = contextCount;

  // Show/hide empty states
  const mainEmpty = document.querySelector(
    ".main-snippet-container .empty-state"
  );
  const contextEmpty = document.querySelector(
    ".context-snippets-container .empty-state"
  );

  if (mainEmpty) mainEmpty.style.display = mainCount > 0 ? "none" : "block";
  if (contextEmpty)
    contextEmpty.style.display = contextCount > 0 ? "none" : "block";
}

function renderSnippetCard(snippet, destination) {
  let container;
  let isMain = destination === "main";

  if (isMain) {
    container = document.querySelector(".main-snippet-container");
    container.innerHTML = "";
  } else {
    container = document.querySelector(".context-snippets-container");
  }

  const snippetCard = document.createElement("div");
  snippetCard.className = `snippet-card ${isMain ? "main-snippet" : ""}`;

  const fileName = snippet.fileName.split("/").pop();

  snippetCard.innerHTML = `
  <div class="card-header">
    <div
      class="file-info"
      title="${snippet.fileName}:${snippet.startLine}-${snippet.endLine}"
    >
      ${snippet.fileName}:${snippet.startLine}-${snippet.endLine}
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
    <textarea
      class="note-input"
      placeholder="Add note for this snipet..."
    ></textarea>
  </div>
`;

  const codeContainer = snippetCard.querySelector(".code-preview-container");
  const codePreview = snippetCard.querySelector(".code-preview");
  codePreview.textContent = snippet.text.trim();

  const showMoreButton = snippetCard.querySelector(".show-more-button");

  container.appendChild(snippetCard);

  // Check if content is truncated
  if (codePreview.scrollHeight > 200) {
    codeContainer.classList.add("truncated");
  } else {
    codeContainer.classList.remove("truncated");
  }

  showMoreButton.addEventListener("click", () => {
    vscode.postMessage({
      type: "jump-to-file",
      payload: {
        fileName: snippet.fileName,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
      },
    });
  });

  const fileNameElement = snippetCard.querySelector(".file-info");
  fileNameElement.addEventListener("click", () => {
    vscode.postMessage({
      type: "jump-to-file",
      payload: {
        fileName: snippet.fileName,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
      },
    });
  });

  const removeButton = snippetCard.querySelector(".remove-snippet");
  removeButton.addEventListener("click", () => {
    if (snippetCard.classList.contains("main-snippet")) {
      vscode.postMessage({
        type: "main-snippet-removed",
      });
    }
    snippetCard.remove();
    updateCounters();
    updateTokenCounter();
  });

  const addNoteButton = snippetCard.querySelector(".add-note");
  const noteSection = snippetCard.querySelector(".note-section");
  addNoteButton.addEventListener("click", () => {
    noteSection.classList.toggle("hidden");
    if (!noteSection.classList.contains("hidden")) {
      noteSection.querySelector(".note-input").focus();
    }
  });

  if (!isMain) {
    const moveUpButton = snippetCard.querySelector(".move-up");
    const moveDownButton = snippetCard.querySelector(".move-down");

    moveUpButton.addEventListener("click", () => {
      const previousCard = snippetCard.previousElementSibling;
      if (previousCard && !previousCard.classList.contains("empty-state")) {
        container.insertBefore(snippetCard, previousCard);
      }
    });

    moveDownButton.addEventListener("click", () => {
      const nextCard = snippetCard.nextElementSibling;
      if (nextCard && !nextCard.classList.contains("empty-state")) {
        container.insertBefore(nextCard, snippetCard);
      }
    });
  }

  updateCounters();
}

// Listen for messages from the extension
window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.type === "add-snippet") {
    renderSnippetCard(message.payload, message.payload.destination);
  }
});

// === Prompt Creation Logic ===
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
    promptSelectDisplay.querySelector("span").textContent =
      selectedLi.textContent;
    promptSelectOptions.classList.add("hidden");

    if (selectedPromptValue === "custom") {
      customPromptInput.classList.remove("hidden");
      customPromptInput.focus();
    } else {
      customPromptInput.classList.add("hidden");
    }
  }
});

const terminalLogDetails = document.querySelector(".collapsible-section");

// === Finalizing & Exporting Logic ===
const copyButton = document.getElementById("copy-to-clipboard-button");
const exportDropdownButton = document.getElementById("export-dropdown-button");
const exportDropdownContent = document.getElementById(
  "export-dropdown-content"
);
const addProjectTreeCheckbox = document.getElementById(
  "add-project-tree-checkbox"
);
const terminalLogInput = document.getElementById("terminal-log-input");

exportDropdownButton.addEventListener("click", (e) => {
  e.stopPropagation();
  exportDropdownContent.classList.toggle("hidden");
});

// Close export dropdown when clicking outside
document.addEventListener("click", () => {
  exportDropdownContent.classList.add("hidden");
});

function getFullContext() {
  const snippets = [];
  document.querySelectorAll(".snippet-card").forEach((card) => {
    const fileInfo = card.querySelector(".file-info")?.textContent.trim();
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

// Handle Export as .md/.txt
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
        format: format,
      },
    });
    exportDropdownContent.classList.add("hidden");
  }
});

// == Reset Logic ==
const resetButton = document.querySelector(".reset-button");
const mainSnippetContainer = document.querySelector(".main-snippet-container");
const contextSnippetContainer = document.querySelector(
  ".context-snippets-container"
);

resetButton.addEventListener("click", () => {
  // Clear all snippets
  mainSnippetContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📍</div>
                    <div class="empty-title">No main snippet yet</div>
                    <div class="empty-description">
                        Right-click on code and select "Add as Main Snippet" to highlight the primary issue
                    </div>
                </div>
            `;
  contextSnippetContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔗</div>
                    <div class="empty-title">No context snippets</div>
                    <div class="empty-description">
                        Add related code snippets to provide context for your main issue
                    </div>
                </div>
            `;

  // Reset prompt to default and hide custom input
  selectedPromptValue = "bug-report";
  promptSelectDisplay.querySelector("span").textContent = "Bug Report";
  customPromptInput.value = "";
  customPromptInput.classList.add("hidden");

  // Uncheck project tree
  addProjectTreeCheckbox.checked = false;

  // Collapse terminal log and clear input
  terminalLogInput.value = "";
  terminalLogDetails.removeAttribute("open");

  updateCounters();
  updateTokenCounter();
});

// === Token Counter Logic ===
const tokenCounterFooter = document.querySelector(".token-counter-footer");
const tokenInfoIcon = tokenCounterFooter.querySelector(".info-icon");
const tokenText = tokenCounterFooter.querySelector(".token-text");

const MODEL_LIMITS = {
  ChatGPT: 128000,
  Claude: 100000,
  Grok: 98000,
  Gemini: 52760,
};

function countTokens(text) {
  const words = text.trim().split(/\s+/).length;
  // A common heuristic: 100 words ≈ 75 tokens
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

  // Find the lowest model limit
  const lowestLimit = Math.min(...Object.values(MODEL_LIMITS));

  if (totalTokens >= lowestLimit) {
    tokenCounterFooter.classList.remove("hidden");
  } else {
    tokenCounterFooter.classList.add("hidden");
  }

  // Build the detailed hover text
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
        element.addEventListener("input", updateTokenCounter);
        element.addEventListener("change", updateTokenCounter);
      } else {
        // MutationObserver for dynamically added/removed snippet cards
        const observer = new MutationObserver(updateTokenCounter);
        observer.observe(element, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }
  });

  // Also observe the details element for terminal log
  terminalLogDetails.addEventListener("toggle", updateTokenCounter);
}

// Initialize
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
