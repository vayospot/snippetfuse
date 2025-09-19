function simpleGlobMatch(filePath, pattern) {
  if (!simpleGlobMatch.cache) {
    simpleGlobMatch.cache = new Map();
  }
  if (simpleGlobMatch.cache.has(pattern)) {
    return simpleGlobMatch.cache.get(pattern).test(filePath);
  }

  let escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  escapedPattern = escapedPattern.replace(/\*\*/g, "(.+)");
  escapedPattern = escapedPattern.replace(/\*/g, "[^/]+");

  const regex = new RegExp(`^${escapedPattern}$`);
  simpleGlobMatch.cache.set(pattern, regex);
  return regex.test(filePath);
}

module.exports = { simpleGlobMatch };
