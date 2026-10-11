const done = arguments[arguments.length - 1];

(async () => {
  const FILE_NAME = "dom-lane-scheduler.ass";
  const FONT_SCALE = 2;
  const EXPECTED_TEXTS = ["1", "2", "B", "D", "M", "OVERSIZED", "Q", "T"];
  const FIXED_TEXTS = new Set(["B", "OVERSIZED", "Q", "T"]);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const listener = await waitFor("harness listener", () => {
    return typeof window.__assSubtitleHarnessListener === "function"
      ? window.__assSubtitleHarnessListener
      : null;
  }, 5000);
  const video = document.querySelector("video");
  const player = document.querySelector("#movie_player");

  const setResponse = await listener({
    type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
    adjustments: {
      fontScale: FONT_SCALE,
      opacity: 1,
      marginTop: 0,
      marginBottom: 0,
      laneGap: 0
    }
  });
  const ready = await waitFor("scheduled DOM renderer", async () => {
    const response = await listener({ type: "ASS_SUBTITLE_PING" });
    const status = response && response.status ? response.status : {};
    const adjustments = status.subtitleAdjustments || {};
    if (
      response && response.ok &&
      status.rendererBackend === "dom" &&
      status.rendererReady &&
      status.subtitleName === FILE_NAME &&
      adjustments.fontScale === FONT_SCALE
    ) {
      return response;
    }
    return null;
  }, 15000);
  video.pause();
  await nextFrames(1);

  const firstEarly = await seekTo(1.5, "first early scheduler state");
  const firstLate = await seekTo(6, "first delayed scheduler state");
  const backward = await seekTo(1.5, "backward scheduler seek");
  const forward = await seekTo(6, "forward scheduler seek");
  const beforeZero = await seekTo(-5, "negative subtitle timestamp");
  const firstFutureOne = await seekTo(20.5, "first future moving cue");
  const firstFutureTwo = await seekTo(22.5, "second future moving cue");
  const firstOversized = await seekTo(31, "oversized middle-position cue");
  const liveFontResize = await verifyLiveFontResize(31, "OVERSIZED");
  const firstDiagonalStart = await seekTo(34.1, "diagonal cue near its start edge");
  const firstDiagonalEnd = await seekTo(35.9, "diagonal cue near its end edge");
  const initialCoverage = assertCompleteCoverage("initial geometry", [
    firstEarly,
    firstLate,
    firstFutureOne,
    firstFutureTwo,
    firstOversized,
    firstDiagonalStart,
    firstDiagonalEnd
  ]);

  const originalPlayerWidth = player.style.width;
  const originalVideoAspectRatio = video.style.aspectRatio;
  const resized = [];
  try {
    for (const geometry of [
      { label: "compact-4-by-3", width: 480, aspectRatio: "4 / 3", ratio: 4 / 3 },
      { label: "wide-21-by-9", width: 720, aspectRatio: "21 / 9", ratio: 21 / 9 }
    ]) {
      const layer = await resizeVideo(geometry);
      const samples = [
        await seekTo(1.5, `${geometry.label} early scheduler state`),
        await seekTo(6, `${geometry.label} delayed scheduler state`),
        await seekTo(20.5, `${geometry.label} first future moving cue`),
        await seekTo(22.5, `${geometry.label} second future moving cue`),
        await seekTo(31, `${geometry.label} oversized middle-position cue`),
        await seekTo(34.1, `${geometry.label} diagonal cue near its start edge`),
        await seekTo(35.9, `${geometry.label} diagonal cue near its end edge`)
      ];
      resized.push({
        label: geometry.label,
        layer,
        coverage: assertCompleteCoverage(geometry.label, samples),
        samples
      });
    }
  } finally {
    player.style.width = originalPlayerWidth;
    video.style.aspectRatio = originalVideoAspectRatio;
    window.dispatchEvent(new Event("resize"));
    await nextFrames(2);
  }
  await listener({ type: "ASS_SUBTITLE_SET_DELAY", delay: 0 });

  done(JSON.parse(JSON.stringify({
    setOk: Boolean(setResponse && setResponse.ok),
    readyStatus: summarizeStatus(ready),
    firstEarly,
    firstLate,
    backward,
    forward,
    beforeZero,
    firstFutureOne,
    firstFutureTwo,
    firstOversized,
    liveFontResize,
    firstDiagonalStart,
    firstDiagonalEnd,
    initialCoverage,
    resized
  })));

  async function resizeVideo(geometry) {
    player.style.width = `${geometry.width}px`;
    video.style.aspectRatio = geometry.aspectRatio;
    window.dispatchEvent(new Event("resize"));
    const size = await waitFor(`${geometry.label} video resize`, () => {
      const layer = document.querySelector(".ass-subtitle-loader-dom-layer");
      const rect = layer && layer.getBoundingClientRect();
      if (
        rect &&
        Math.abs(rect.width - geometry.width) <= 1 &&
        Math.abs((rect.width / rect.height) - geometry.ratio) <= 0.02
      ) {
        return {
          width: round(rect.width),
          height: round(rect.height),
          aspectRatio: round(rect.width / rect.height)
        };
      }
      return null;
    }, 5000);
    await nextFrames(2);
    return size;
  }

  async function verifyLiveFontResize(targetTime, expectedText) {
    const cases = [];
    for (const fontScale of [1, FONT_SCALE]) {
      const setResponse = await listener({
        type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
        adjustments: {
          fontScale,
          opacity: 1,
          marginTop: 0,
          marginBottom: 0,
          laneGap: 0
        }
      });
      const readyResponse = await waitFor(`live ${fontScale}x oversized cue resize`, async () => {
        const ping = await listener({ type: "ASS_SUBTITLE_PING" });
        const status = ping && ping.status ? ping.status : {};
        const adjustments = status.subtitleAdjustments || {};
        const visible = Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"))
          .some((element) => element.textContent === expectedText);
        if (
          ping && ping.ok &&
          status.rendererBackend === "dom" &&
          status.rendererReady &&
          Math.abs(Number(status.subtitleTime) - targetTime) <= 0.01 &&
          adjustments.fontScale === fontScale &&
          visible
        ) {
          return ping;
        }
        return null;
      }, 5000);
      await nextFrames(2);
      const snapshot = readSnapshot();
      const row = snapshot.rows.find((candidate) => candidate.text === expectedText);
      if (!setResponse || !setResponse.ok || !row || !row.paintInside) {
        throw new Error(`Oversized cue disappeared or escaped after live ${fontScale}x resize: ${JSON.stringify({
          setOk: Boolean(setResponse && setResponse.ok),
          targetTime,
          snapshot
        })}`);
      }
      cases.push({
        fontScale,
        setOk: true,
        status: summarizeStatus(readyResponse),
        row
      });
    }
    return {
      targetTime,
      expectedText,
      cases
    };
  }

  async function seekTo(targetTime, label) {
    const delay = (Number(video.currentTime) || 0) - targetTime;
    const response = await listener({ type: "ASS_SUBTITLE_SET_DELAY", delay });
    const readyResponse = await waitFor(label, async () => {
      const ping = await listener({ type: "ASS_SUBTITLE_PING" });
      const status = ping && ping.status ? ping.status : {};
      if (
        ping && ping.ok &&
        Math.abs(Number(status.subtitleTime) - targetTime) <= 0.01
      ) {
        return ping;
      }
      return null;
    }, 5000);
    await nextFrames(2);
    return {
      targetTime,
      delaySetOk: Boolean(response && response.ok),
      status: summarizeStatus(readyResponse),
      snapshot: readSnapshot()
    };
  }

  function readSnapshot() {
    const layer = document.querySelector(".ass-subtitle-loader-dom-layer");
    const layerRect = layer.getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"))
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const strokeWidth = parseFloat(style.webkitTextStrokeWidth) || 0;
        const strokeRadius = strokeWidth / 2;
        const shadowOffset = readShadowOffset(style.textShadow);
        const paintLeft = rect.left - layerRect.left - strokeRadius - 0.5;
        const paintTop = rect.top - layerRect.top - strokeRadius - 0.5;
        const paintRight = rect.right - layerRect.left + strokeRadius + Math.max(0, shadowOffset.x) + 0.5;
        const paintBottom = rect.bottom - layerRect.top + strokeRadius + Math.max(0, shadowOffset.y) + 0.5;
        const verticalPaintInside = paintTop >= -0.1 && paintBottom <= layerRect.height + 0.1;
        const horizontalPaintInside = !FIXED_TEXTS.has(element.textContent) || (
          paintLeft >= -0.1 && paintRight <= layerRect.width + 0.1
        );
        return {
          text: element.textContent,
          startY: round(parseFloat(element.style.getPropertyValue("--ass-start-y"))),
          fontSize: round(parseFloat(style.fontSize)),
          paintLeft: round(paintLeft),
          paintTop: round(paintTop),
          paintRight: round(paintRight),
          paintBottom: round(paintBottom),
          verticalPaintInside,
          horizontalPaintInside,
          paintInside: verticalPaintInside && horizontalPaintInside
        };
      })
      .sort((left, right) => left.text.localeCompare(right.text));
    return {
      layerHeight: round(layerRect.height),
      texts: rows.map((row) => row.text),
      allPaintInside: rows.length > 0 && rows.every((row) => row.paintInside),
      rows
    };
  }

  function assertCompleteCoverage(label, samples) {
    const visibleTexts = Array.from(new Set(samples.flatMap((sample) => sample.snapshot.texts))).sort();
    const emptySamples = samples.filter((sample) => sample.snapshot.rows.length === 0);
    const escapedRows = samples.flatMap((sample) => sample.snapshot.rows
      .filter((row) => !row.paintInside)
      .map((row) => ({ targetTime: sample.targetTime, ...row })));
    if (
      JSON.stringify(visibleTexts) !== JSON.stringify(EXPECTED_TEXTS) ||
      emptySamples.length ||
      escapedRows.length
    ) {
      throw new Error(`Incomplete or out-of-bounds danmaku coverage for ${label}: ${JSON.stringify({
        expectedTexts: EXPECTED_TEXTS,
        visibleTexts,
        emptyTimes: emptySamples.map((sample) => sample.targetTime),
        escapedRows
      })}`);
    }
    return {
      expectedTexts: EXPECTED_TEXTS,
      visibleTexts,
      sampledTimes: samples.map((sample) => sample.targetTime),
      allPaintInside: true
    };
  }

  function summarizeStatus(response) {
    const status = response && response.status ? response.status : {};
    return {
      ok: Boolean(response && response.ok),
      subtitleName: status.subtitleName || null,
      rendererBackend: status.rendererBackend || null,
      rendererReady: Boolean(status.rendererReady),
      subtitleTime: Number.isFinite(Number(status.subtitleTime)) ? Number(status.subtitleTime) : null,
      subtitleAdjustments: status.subtitleAdjustments || null,
      renderStats: status.renderStats || null
    };
  }

  function readShadowOffset(value) {
    if (!value || value === "none") {
      return { x: 0, y: 0 };
    }
    const lengths = Array.from(value.matchAll(/(-?(?:\d+(?:\.\d+)?|\.\d+))px/g), (match) => Number(match[1]));
    return lengths.length >= 2 ? { x: lengths[0], y: lengths[1] } : { x: 0, y: 0 };
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
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify({ lastValue })}`);
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
