const done = arguments[arguments.length - 1];

(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const serialize = (value) => JSON.parse(JSON.stringify(value));
  const listener = await waitFor("harness listener", () => {
    return typeof window.__assSubtitleHarnessListener === "function"
      ? window.__assSubtitleHarnessListener
      : null;
  }, 5000);

  const defaultReady = await waitFor("default DOM renderer", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const metrics = readDomMetrics();
    const status = response && response.status ? response.status : {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.hasSubtitle &&
      metrics.active >= 3 &&
      metrics.rowGapToFont
    ) {
      return { response, metrics };
    }
    return null;
  }, 15000);

  const requestedAdjustments = {
    fontScale: 1,
    opacity: 1,
    marginTop: 0,
    marginBottom: 0,
    laneGap: 0.75
  };
  const setResponse = await listener({
    type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
    adjustments: requestedAdjustments
  });

  const adjustedReady = await waitFor("adjusted DOM renderer", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const metrics = readDomMetrics();
    const status = response && response.status ? response.status : {};
    const adjustments = status.subtitleAdjustments || {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.hasSubtitle &&
      adjustments.laneGap === requestedAdjustments.laneGap &&
      metrics.active >= 3 &&
      metrics.rowGapToFont
    ) {
      return { response, metrics };
    }
    return null;
  }, 15000);

  const scaledFontAdjustments = {
    fontScale: 1.5,
    opacity: 1,
    marginTop: 0,
    marginBottom: 0,
    laneGap: 0.75
  };
  const scaledFontSetResponse = await listener({
    type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
    adjustments: scaledFontAdjustments
  });

  const scaledFontReady = await waitFor("font-scaled DOM renderer", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const metrics = readDomMetrics();
    const status = response && response.status ? response.status : {};
    const adjustments = status.subtitleAdjustments || {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.hasSubtitle &&
      adjustments.fontScale === scaledFontAdjustments.fontScale &&
      adjustments.laneGap === scaledFontAdjustments.laneGap &&
      metrics.active >= 3 &&
      metrics.rowGapToFont
    ) {
      return { response, metrics };
    }
    return null;
  }, 15000);

  const compactFontAdjustments = {
    fontScale: 0.65,
    opacity: 1,
    marginTop: 0,
    marginBottom: 0,
    laneGap: 0.75
  };
  const compactFontSetResponse = await listener({
    type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
    adjustments: compactFontAdjustments
  });

  const compactFontReady = await waitFor("compact-font DOM renderer", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const metrics = readDomMetrics();
    const status = response && response.status ? response.status : {};
    const adjustments = status.subtitleAdjustments || {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.hasSubtitle &&
      adjustments.fontScale === compactFontAdjustments.fontScale &&
      adjustments.laneGap === compactFontAdjustments.laneGap &&
      metrics.active >= 3 &&
      metrics.rowGapToFont
    ) {
      return { response, metrics };
    }
    return null;
  }, 15000);

  const video = document.querySelector("video");
  video.pause();
  await nextFrames(1);

  const boundaryTargetSubtitleTime = 14;
  const boundaryDelay = round((Number(video.currentTime) || 0) - boundaryTargetSubtitleTime);
  const boundaryDelayResponse = await listener({
    type: "ASS_SUBTITLE_SET_DELAY",
    delay: boundaryDelay
  });
  const boundaryBaselineAdjustments = {
    fontScale: 1,
    opacity: 1,
    marginTop: 0,
    marginBottom: 0,
    laneGap: 0
  };
  const boundaryBaselineSetResponse = await listener({
    type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
    adjustments: boundaryBaselineAdjustments
  });
  const boundaryBaselineReady = await waitFor("boundary baseline DOM renderer", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const metrics = readDomBoundaryMetrics();
    const status = response && response.status ? response.status : {};
    const adjustments = status.subtitleAdjustments || {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.hasSubtitle &&
      Math.abs(Number(status.subtitleTime) - boundaryTargetSubtitleTime) <= 0.01 &&
      adjustments.fontScale === boundaryBaselineAdjustments.fontScale &&
      adjustments.laneGap === boundaryBaselineAdjustments.laneGap &&
      metrics.active >= 20
    ) {
      return { response, metrics };
    }
    return null;
  }, 15000);
  await nextFrames(2);
  const boundaryBaselineMetrics = readDomBoundaryMetrics();

  const boundaryScaledAdjustments = {
    ...boundaryBaselineAdjustments,
    fontScale: 2
  };
  const boundaryScaledSetResponse = await listener({
    type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
    adjustments: boundaryScaledAdjustments
  });
  const boundaryScaledReady = await waitFor("boundary scaled DOM renderer", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const metrics = readDomBoundaryMetrics();
    const status = response && response.status ? response.status : {};
    const adjustments = status.subtitleAdjustments || {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.hasSubtitle &&
      Math.abs(Number(status.subtitleTime) - boundaryTargetSubtitleTime) <= 0.01 &&
      adjustments.fontScale === boundaryScaledAdjustments.fontScale &&
      adjustments.laneGap === boundaryScaledAdjustments.laneGap &&
      metrics.active > 0
    ) {
      return { response, metrics };
    }
    return null;
  }, 15000);
  await nextFrames(2);
  const boundaryScaledMetrics = readDomBoundaryMetrics();

  await listener({ type: "ASS_SUBTITLE_SET_DELAY", delay: 0 });

  done(serialize({
    page: location.href,
    defaultStatus: summarizeStatus(defaultReady.response),
    defaultMetrics: defaultReady.metrics,
    setStatus: summarizeStatus(setResponse),
    adjustedStatus: summarizeStatus(adjustedReady.response),
    adjustedMetrics: adjustedReady.metrics,
    scaledFontSetStatus: summarizeStatus(scaledFontSetResponse),
    scaledFontStatus: summarizeStatus(scaledFontReady.response),
    scaledFontMetrics: scaledFontReady.metrics,
    compactFontSetStatus: summarizeStatus(compactFontSetResponse),
    compactFontStatus: summarizeStatus(compactFontReady.response),
    compactFontMetrics: compactFontReady.metrics,
    boundary: {
      targetSubtitleTime: boundaryTargetSubtitleTime,
      delay: boundaryDelay,
      delayStatus: summarizeStatus(boundaryDelayResponse),
      baseline: {
        setStatus: summarizeStatus(boundaryBaselineSetResponse),
        status: summarizeStatus(boundaryBaselineReady.response),
        metrics: boundaryBaselineMetrics
      },
      scaled: {
        setStatus: summarizeStatus(boundaryScaledSetResponse),
        status: summarizeStatus(boundaryScaledReady.response),
        metrics: boundaryScaledMetrics
      }
    }
  }));

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
      hasSubtitle: Boolean(status.hasSubtitle),
      subtitleName: status.subtitleName || null,
      rendererBackend: status.rendererBackend || null,
      rendererReady: Boolean(status.rendererReady),
      subtitleDelay: Number.isFinite(Number(status.subtitleDelay)) ? Number(status.subtitleDelay) : null,
      subtitleTime: Number.isFinite(Number(status.subtitleTime)) ? Number(status.subtitleTime) : null,
      subtitleAdjustments: status.subtitleAdjustments || null,
      renderStats: status.renderStats || null,
      lastError: status.lastError || null
    };
  }

  function readDomMetrics() {
    const comments = Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"));
    const rows = comments
      .map((element) => {
        const style = getComputedStyle(element);
        const startY = parseFloat(element.style.getPropertyValue("--ass-start-y"));
        const startX = parseFloat(element.style.getPropertyValue("--ass-start-x"));
        const fontSize = parseFloat(style.fontSize);
        const opacity = parseFloat(style.opacity);
        const strokeWidth = parseFloat(style.webkitTextStrokeWidth);
        const shadow = readTextShadow(style.textShadow);
        return {
          text: element.textContent,
          startX: round(startX),
          y: round(startY),
          fontSize: round(fontSize),
          opacity: round(opacity),
          textShadow: style.textShadow,
          textShadowLayerCount: countCssListItems(style.textShadow),
          shadowOffsetX: shadow ? shadow.x : null,
          shadowOffsetY: shadow ? shadow.y : null,
          shadowBlur: shadow ? shadow.blur : null,
          strokeWidth: round(strokeWidth),
          paintOrder: style.paintOrder
        };
      })
      .filter((row) => Number.isFinite(row.y) && Number.isFinite(row.fontSize))
      .sort((a, b) => a.y - b.y);

    const distinctRows = [];
    for (const row of rows) {
      const previous = distinctRows[distinctRows.length - 1];
      if (!previous || Math.abs(row.y - previous.y) > 0.5) {
        distinctRows.push(row);
      }
    }

    const gaps = [];
    for (let index = 1; index < distinctRows.length; index += 1) {
      const gap = distinctRows[index].y - distinctRows[index - 1].y;
      if (gap > 0.5) {
        gaps.push(gap);
      }
    }

    const rowGap = gaps.length ? gaps[0] : null;
    const fontSize = distinctRows.length ? distinctRows[0].fontSize : null;
    const strokeWidth = distinctRows.length ? distinctRows[0].strokeWidth : null;
    const firstRow = distinctRows.length ? distinctRows[0] : null;
    return {
      active: comments.length,
      firstText: rows.length ? rows[0].text : null,
      firstY: rows.length ? rows[0].y : null,
      rowGap: rowGap === null ? null : round(rowGap),
      fontSize: fontSize === null ? null : round(fontSize),
      strokeWidth: strokeWidth === null ? null : round(strokeWidth),
      strokeToFont: strokeWidth && fontSize ? round(strokeWidth / fontSize, 4) : null,
      shadowOffsetX: firstRow ? firstRow.shadowOffsetX : null,
      shadowOffsetY: firstRow ? firstRow.shadowOffsetY : null,
      shadowBlur: firstRow ? firstRow.shadowBlur : null,
      rowGapToFont: rowGap && fontSize ? round(rowGap / fontSize, 4) : null,
      sampleRows: distinctRows.slice(0, 5)
    };
  }

  function readDomBoundaryMetrics() {
    const layer = document.querySelector(".ass-subtitle-loader-dom-layer");
    const layerRect = layer.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"))
      .map((element) => {
        const indexMatch = element.textContent.match(/flowing comment (\d+)/);
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const strokeWidth = parseFloat(style.webkitTextStrokeWidth) || 0;
        const strokeRadius = strokeWidth / 2;
        const shadow = readTextShadow(style.textShadow);
        const shadowOffsetY = shadow ? shadow.y : 0;
        const top = rect.top - layerRect.top;
        const bottom = rect.bottom - layerRect.top;
        const paintTop = top - strokeRadius - 0.5;
        const paintBottom = bottom + strokeRadius + Math.max(0, shadowOffsetY) + 0.5;
        const sourceIndex = indexMatch ? Number(indexMatch[1]) : null;
        return {
          text: element.textContent,
          sourceIndex,
          sourceLane: Number.isFinite(sourceIndex) ? sourceIndex % 28 : null,
          startY: round(parseFloat(element.style.getPropertyValue("--ass-start-y"))),
          fontSize: round(parseFloat(style.fontSize)),
          top: round(top),
          bottom: round(bottom),
          paintTop: round(paintTop),
          paintBottom: round(paintBottom),
          insideLayer: paintTop >= -0.1 && paintBottom <= layerRect.height + 0.1
        };
      })
      .filter((row) => Number.isFinite(row.startY) && Number.isFinite(row.fontSize))
      .sort((left, right) => left.startY - right.startY || left.sourceIndex - right.sourceIndex);
    const distinctStartYs = [];
    rows.forEach((row) => {
      const previous = distinctStartYs[distinctStartYs.length - 1];
      if (previous === undefined || Math.abs(row.startY - previous) > 0.5) {
        distinctStartYs.push(row.startY);
      }
    });
    return {
      active: rows.length,
      layerHeight: round(layerRect.height),
      fontSize: rows.length ? rows[0].fontSize : null,
      sourceLaneCount: new Set(rows.map((row) => row.sourceLane).filter(Number.isFinite)).size,
      distinctRows: distinctStartYs.length,
      minPaintTop: rows.length ? round(Math.min(...rows.map((row) => row.paintTop))) : null,
      maxPaintBottom: rows.length ? round(Math.max(...rows.map((row) => row.paintBottom))) : null,
      allInside: rows.length > 0 && rows.every((row) => row.insideLayer),
      rows
    };
  }

  function nextFrames(count) {
    return new Promise((resolve) => {
      const next = () => {
        if (count <= 0) {
          resolve();
          return;
        }
        count -= 1;
        requestAnimationFrame(next);
      };
      next();
    });
  }

  function countCssListItems(value) {
    if (!value || value === "none") {
      return 0;
    }
    let depth = 0;
    let count = 1;
    for (const character of value) {
      if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth = Math.max(0, depth - 1);
      } else if (character === "," && depth === 0) {
        count += 1;
      }
    }
    return count;
  }

  function readTextShadow(value) {
    if (countCssListItems(value) !== 1) {
      return null;
    }
    const lengths = Array.from(value.matchAll(/(-?(?:\d+(?:\.\d+)?|\.\d+))px/g), (match) => Number(match[1]));
    return lengths.length >= 3
      ? { x: round(lengths[0]), y: round(lengths[1]), blur: round(lengths[2]) }
      : null;
  }

  function round(value, digits = 3) {
    if (!Number.isFinite(value)) {
      return null;
    }
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
})().catch((error) => {
  done({
    error: {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : null
    }
  });
});
