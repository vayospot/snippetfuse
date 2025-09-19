const { addSnippetToWebview } = require("./addSnippet");

function addMainSnippet() {
  addSnippetToWebview("main");
}

module.exports = { addMainSnippet };
