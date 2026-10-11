const numericKeys = new Set(["frames", "active", "events", "pooled", "delay", "subtitleDelay", "currentTime", "subtitleTime", "width", "height", "contentLength", "version", "ready", "pending", "force", "hasGlobal", "hasSite"]);
function redactLogDetails(details) {
  const safe = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (numericKeys.has(key) && (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)))) safe[key] = value;
  }
  return safe;
}
function createRuntimeLogger(options = {}) {
  return (event, details, level = "log") => {
    if (!options.enabled?.() || options.privateContext?.()) return;
    // Event identifiers are internal constants; derived identifiers are limited to this alphabet.
    if (typeof event !== "string" || !/^[a-z][a-z0-9:-]{0,80}$/.test(event)) return;
    const method = ["error", "warn", "info"].includes(level) ? level : "log";
    try { console[method]("[ASS Subtitle Loader]", event, redactLogDetails(details)); } catch (_) {}
  };
}
function describeError(error) { return {message: typeof error === "string" ? error : error?.message || "Subtitle operation failed."}; }
export {createRuntimeLogger, describeError, redactLogDetails};
