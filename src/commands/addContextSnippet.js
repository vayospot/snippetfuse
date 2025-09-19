const { addSnippetToWebview } = require("./addSnippet");

function addContextSnippet() {
  addSnippetToWebview("context");
}

module.exports = { addContextSnippet };
