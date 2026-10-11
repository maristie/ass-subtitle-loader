const done = arguments[arguments.length - 1];

(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const listener = await waitFor("harness listener", () => {
    return typeof window.__assSubtitleHarnessListener === "function"
      ? window.__assSubtitleHarnessListener
      : null;
  }, 5000);

  const ready = await waitFor("fixed DOM subtitles", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const comments = Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"));
    const status = response && response.status ? response.status : {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.hasSubtitle &&
      [
        "TOP WRAP",
        "BOTTOM WRAP",
        "TOP INWARD",
        "BOTTOM INWARD",
        "TOP SHORT CONTROL",
        "BOTTOM SHORT CONTROL",
        "TOP EXPLICIT CONTROL",
        "BOTTOM EXPLICIT CONTROL",
        "MIDDLE CONTROL",
        "MOVING CONTROL"
      ].every((prefix) => {
        return comments.some((element) => element.textContent.startsWith(prefix));
      })
    ) {
      return { response, comments };
    }
    return null;
  }, 15000);

  const layer = document.querySelector(".ass-subtitle-loader-dom-layer");
  const layerRect = layer.getBoundingClientRect();
  const metrics = Object.fromEntries([
    ["top", "TOP WRAP"],
    ["bottom", "BOTTOM WRAP"],
    ["topInward", "TOP INWARD"],
    ["bottomInward", "BOTTOM INWARD"],
    ["topShort", "TOP SHORT CONTROL"],
    ["bottomShort", "BOTTOM SHORT CONTROL"],
    ["topExplicit", "TOP EXPLICIT CONTROL"],
    ["bottomExplicit", "BOTTOM EXPLICIT CONTROL"],
    ["middle", "MIDDLE CONTROL"],
    ["moving", "MOVING CONTROL"]
  ].map(([name, prefix]) => {
    const element = ready.comments.find((candidate) => candidate.textContent.startsWith(prefix));
    return [name, readCommentMetrics(element, layerRect)];
  }));

  done(JSON.parse(JSON.stringify({
    status: summarizeStatus(ready.response),
    layer: {
      width: round(layerRect.width),
      height: round(layerRect.height)
    },
    metrics
  })));

  async function waitFor(label, callback, timeoutMs) {
    const start = performance.now();
    let lastValue = null;
    while (performance.now() - start < timeoutMs) {
      lastValue = await callback();
      if (lastValue) {
        return lastValue;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(lastValue)}`);
  }

  function summarizeStatus(response) {
    const status = response && response.status ? response.status : {};
    return {
      ok: Boolean(response && response.ok),
      subtitleName: status.subtitleName || null,
      rendererBackend: status.rendererBackend || null,
      rendererReady: Boolean(status.rendererReady),
      hasSubtitle: Boolean(status.hasSubtitle),
      lastError: status.lastError || null
    };
  }

  function readCommentMetrics(element, layerBounds) {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const fragmentBounds = range.getBoundingClientRect();
    const lineTops = [];
    for (const rect of range.getClientRects()) {
      if (!lineTops.some((top) => Math.abs(top - rect.top) <= 0.5)) {
        lineTops.push(rect.top);
      }
    }
    const anchorX = layerBounds.left + parseFloat(element.style.getPropertyValue("--ass-start-x"));
    const anchorY = layerBounds.top + parseFloat(element.style.getPropertyValue("--ass-start-y"));
    const strokeOutset = (parseFloat(style.webkitTextStrokeWidth) || 0) / 2;
    const paintBounds = {
      left: fragmentBounds.left - layerBounds.left - strokeOutset,
      top: fragmentBounds.top - layerBounds.top - strokeOutset,
      right: fragmentBounds.right - layerBounds.left + strokeOutset,
      bottom: fragmentBounds.bottom - layerBounds.top + strokeOutset
    };
    return {
      className: element.className,
      lineCount: lineTops.length,
      width: round(bounds.width),
      height: round(bounds.height),
      lineHeight: round(parseFloat(style.lineHeight)),
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      textAlign: style.textAlign,
      textShadow: style.textShadow,
      strokeWidth: round(parseFloat(style.webkitTextStrokeWidth)),
      paintOrder: style.paintOrder,
      insideLayer: bounds.left >= layerBounds.left - 1 && bounds.right <= layerBounds.right + 1,
      paintInsideLayer: paintBounds.left >= -3 && paintBounds.top >= -3 &&
        paintBounds.right <= layerBounds.width + 3 && paintBounds.bottom <= layerBounds.height + 3,
      paintBounds: Object.fromEntries(Object.entries(paintBounds).map(([name, value]) => [name, round(value)])),
      centerXDelta: round((bounds.left + bounds.width / 2) - anchorX),
      topAnchorDelta: round(bounds.top - anchorY),
      bottomAnchorDelta: round(bounds.bottom - anchorY)
    };
  }

  function round(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
  }
})().catch((error) => {
  done({
    error: {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : null
    }
  });
});
