const { addSnippetToWebview } = require("./addSnippet");

function addMainSnippet() {
  addSnippetToWebview({ isMain: true });
}

module.exports = { addMainSnippet };
