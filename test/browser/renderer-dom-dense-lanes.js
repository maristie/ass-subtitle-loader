const done = arguments[arguments.length - 1];

(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const listener = await waitFor("harness listener", () => {
    return typeof window.__assSubtitleHarnessListener === "function"
      ? window.__assSubtitleHarnessListener
      : null;
  }, 5000);
  const cases = [];

  for (const [label, adjustments] of [
    ["nominal", adjustment(1, 0.5)],
    ["gap-zero", adjustment(1, 0)],
    ["gap-wide", adjustment(1, 0.75)],
    ["scale-up", adjustment(1.5, 0.5)],
    ["scale-down", adjustment(0.65, 0.5)],
    ["scale-up-gap-zero", adjustment(1.5, 0)],
    ["scale-down-gap-wide", adjustment(0.65, 0.75)],
    ["scale-min-gap-max", adjustment(0.5, 1)],
    ["scale-max-gap-zero", adjustment(2, 0)]
  ]) {
    const setResponse = await listener({
      type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
      adjustments
    });
    const ready = await waitFor(label, async () => {
      const response = await listener({ type: "ASS_SUBTITLE_PING" });
      const status = response && response.status ? response.status : {};
      const applied = status.subtitleAdjustments || {};
      const active = document.querySelectorAll(".ass-subtitle-loader-dom-comment").length;
      if (
        response && response.ok &&
        status.rendererBackend === "dom" &&
        status.rendererReady &&
        status.subtitleName === "dom-dense-lanes.ass" &&
        applied.fontScale === adjustments.fontScale &&
        applied.laneGap === adjustments.laneGap &&
        active === 8
      ) {
        return response;
      }
      return null;
    }, 15000);
    await nextFrames(2);
    cases.push({
      label,
      setOk: Boolean(setResponse && setResponse.ok),
      status: summarizeStatus(ready),
      metrics: readMetrics()
    });
  }

  done(JSON.parse(JSON.stringify({ cases })));

  function adjustment(fontScale, laneGap) {
    return {
      fontScale,
      opacity: 1,
      marginTop: 0,
      marginBottom: 0,
      laneGap
    };
  }

  function summarizeStatus(response) {
    const status = response && response.status ? response.status : {};
    return {
      ok: Boolean(response && response.ok),
      subtitleName: status.subtitleName || null,
      rendererBackend: status.rendererBackend || null,
      rendererReady: Boolean(status.rendererReady),
      subtitleAdjustments: status.subtitleAdjustments || null,
      renderStats: status.renderStats || null
    };
  }

  function readMetrics() {
    const layer = document.querySelector(".ass-subtitle-loader-dom-layer");
    const layerRect = layer.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"))
      .map((element) => {
        const match = element.textContent.match(/dense lane (\d+) font (\d+)/);
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return match ? {
          slot: Number(match[1]),
          sourceFontSize: Number(match[2]),
          fontSize: round(parseFloat(style.fontSize)),
          startY: round(parseFloat(element.style.getPropertyValue("--ass-start-y"))),
          top: round(rect.top - layerRect.top),
          bottom: round(rect.bottom - layerRect.top),
          height: round(rect.height),
          insideLayer: rect.top >= layerRect.top - 0.1 && rect.bottom <= layerRect.bottom + 0.1
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.slot - b.slot);
    const gaps = [];
    for (let index = 1; index < rows.length; index += 1) {
      gaps.push({
        from: rows[index - 1].slot,
        to: rows[index].slot,
        slotSpan: rows[index].slot - rows[index - 1].slot,
        clearGap: round(rows[index].top - rows[index - 1].bottom)
      });
    }
    return {
      layerHeight: round(layerRect.height),
      rows,
      gaps
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
