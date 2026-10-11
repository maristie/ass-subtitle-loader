const done = arguments[arguments.length - 1];

(async () => {
  const FILE_NAME = "dom-synthetic-lane-matrix.ass";
  const PLAY_RES_Y = 486;
  const GRID_ORIGIN = 19;
  const GRID_PITCH = 31;
  const OUTLINE_RESERVE = 3;
  const FONT_FACTOR = 0.7;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const listener = await waitFor("harness listener", () => {
    return typeof window.__assSubtitleHarnessListener === "function"
      ? window.__assSubtitleHarnessListener
      : null;
  }, 5000);
  const fixture = parseFixture(await fetch(FILE_NAME).then((response) => response.text()));

  await listener({ type: "ASS_SUBTITLE_SET_DELAY", delay: 0 });
  await listener({
    type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
    adjustments: adjustment(1, 0.5)
  });
  await waitFor("synthetic events before future event", () => {
    return activeCount() > 0;
  }, 15000);
  const beforeFuture = readStartPositions(fixture);

  await listener({ type: "ASS_SUBTITLE_SET_DELAY", delay: -18 });
  await waitFor("synthetic future event", () => {
    return activeCount() > 0;
  }, 15000);
  await nextFrames(2);
  const afterFuture = readStartPositions(fixture);
  const persistentDeltas = Array.from(beforeFuture, ([token, startY]) => (
    afterFuture.has(token) ? Math.abs(afterFuture.get(token) - startY) : 0
  ));
  const futureLayoutDelta = Math.max(0, ...persistentDeltas);

  const cases = [];
  for (const [label, fontScale, laneGap] of [
    ["baseline", 1, 0],
    ["nominal", 1, 0.5],
    ["large-zero", 1.5, 0],
    ["large-mid", 1.5, 0.5],
    ["small-wide", 0.65, 0.75],
    ["maximum-zero", 2, 0]
  ]) {
    const setResponse = await listener({
      type: "ASS_SUBTITLE_SET_ADJUSTMENTS",
      adjustments: adjustment(fontScale, laneGap)
    });
    const ready = await waitFor(label, async () => {
      const response = await listener({ type: "ASS_SUBTITLE_PING" });
      const status = response && response.status ? response.status : {};
      const applied = status.subtitleAdjustments || {};
      if (
        response && response.ok &&
        status.rendererBackend === "dom" &&
        status.rendererReady &&
        status.subtitleName === FILE_NAME &&
        applied.fontScale === fontScale &&
        applied.laneGap === laneGap &&
        activeCount() > 0
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
      metrics: readMetrics(fixture, fontScale, laneGap)
    });
  }

  await listener({ type: "ASS_SUBTITLE_SET_DELAY", delay: 0 });
  done(JSON.parse(JSON.stringify({
    fixture: {
      events: fixture.events.length,
      movingEvents: fixture.movingEvents.length,
      fixedEvents: fixture.fixedEvents.length,
      maxFontSize: fixture.maxFontSize
    },
    beforeFutureActive: beforeFuture.size,
    afterFutureActive: afterFuture.size,
    persistentEvents: persistentDeltas.length,
    futureLayoutDelta: round(futureLayoutDelta),
    cases
  })));

  function adjustment(fontScale, laneGap) {
    return {
      fontScale,
      opacity: 1,
      marginTop: 0,
      marginBottom: 0,
      laneGap
    };
  }

  function activeCount() {
    return document.querySelectorAll(".ass-subtitle-loader-dom-comment").length;
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

  function readStartPositions(source) {
    return new Map(Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"))
      .map((element) => {
        const event = source.byText.get(element.textContent);
        if (!event || event.kind !== "move") {
          return null;
        }
        return [event.text, parseFloat(element.style.getPropertyValue("--ass-start-y"))];
      })
      .filter(Boolean));
  }

  function readMetrics(source, fontScale, laneGap) {
    const layer = document.querySelector(".ass-subtitle-loader-dom-layer");
    const layerRect = layer.getBoundingClientRect();
    const scaleY = layerRect.height / PLAY_RES_Y;
    const paintReserve = OUTLINE_RESERVE * scaleY * fontScale;
    const rows = Array.from(document.querySelectorAll(".ass-subtitle-loader-dom-comment"))
      .map((element) => {
        const event = source.byText.get(element.textContent);
        if (!event) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        const top = rect.top - layerRect.top;
        const bottom = rect.bottom - layerRect.top;
        const startY = parseFloat(element.style.getPropertyValue("--ass-start-y"));
        const vertical = Math.ceil(event.alignment / 3);
        const blockHeight = event.fontSize * FONT_FACTOR * 1.125 * event.lineCount;
        const paintAbove = (vertical === 1 ? blockHeight : vertical === 2 ? blockHeight / 2 : 0)
          + OUTLINE_RESERVE;
        const scheduledTop = startY - (paintAbove * fontScale * scaleY);
        const anchorDelta = vertical === 3
          ? Math.abs(top - startY)
          : vertical === 2
            ? Math.abs(((top + bottom) / 2) - startY)
            : Math.abs(bottom - startY);
        return {
          token: event.text,
          kind: event.kind,
          slot: event.slot,
          sourceFontSize: event.fontSize,
          authoredY: event.y,
          fontSize: round(parseFloat(getComputedStyle(element).fontSize)),
          startY: round(startY),
          scheduledTop: round(scheduledTop),
          anchorDelta: round(anchorDelta),
          paintTop: round(top - paintReserve),
          paintBottom: round(bottom + paintReserve),
          insideLayer: top - paintReserve >= -0.1 && bottom + paintReserve <= layerRect.height + 0.1
        };
      })
      .filter(Boolean);
    const movingRows = rows.filter((row) => row.kind === "move");
    const scheduled = fontScale !== 1 || laneGap !== 0;
    const groupMap = new Map();
    movingRows.forEach((row) => {
      const groupKey = scheduled ? round(row.scheduledTop, 1) : row.slot;
      const group = groupMap.get(groupKey) || {
        key: groupKey,
        paintTop: Infinity,
        paintBottom: -Infinity
      };
      group.paintTop = Math.min(group.paintTop, row.paintTop);
      group.paintBottom = Math.max(group.paintBottom, row.paintBottom);
      groupMap.set(groupKey, group);
    });
    const groups = Array.from(groupMap.values())
      .sort((left, right) => left.key - right.key)
      .map((group, slot) => ({
        slot,
        paintTop: round(group.paintTop),
        paintBottom: round(group.paintBottom),
        insideLayer: group.paintTop >= -0.1 && group.paintBottom <= layerRect.height + 0.1
      }));
    const gaps = [];
    for (let index = 1; index < groups.length; index += 1) {
      gaps.push(round(groups[index].paintTop - groups[index - 1].paintBottom));
    }
    return {
      layerHeight: round(layerRect.height),
      paintGapUnit: round(source.maxFontSize * FONT_FACTOR * fontScale * scaleY),
      rows,
      groups,
      gaps
    };
  }

  function parseFixture(content) {
    const events = content.split(/\r?\n/)
      .filter((line) => line.startsWith("Dialogue:"))
      .map((line) => parseDialogue(line));
    const byText = new Map(events.map((event) => [event.text, event]));
    if (byText.size !== events.length) {
      throw new Error("Synthetic fixture tokens must be unique.");
    }
    const movingEvents = events.filter((event) => event.kind === "move");
    const fixedEvents = events.filter((event) => event.kind === "position");
    return {
      events,
      movingEvents,
      fixedEvents,
      byText,
      maxFontSize: Math.max(...movingEvents.map((event) => event.fontSize))
    };
  }

  function parseDialogue(line) {
    const fields = splitFields(line.slice("Dialogue:".length), 10);
    const taggedText = fields[9];
    const tagMatch = taggedText.match(/^\{([^}]*)\}/);
    if (!tagMatch) {
      throw new Error("Synthetic fixture event is missing its leading override block.");
    }
    const tags = tagMatch[1];
    const text = taggedText.slice(tagMatch[0].length).replace(/\\N/g, "\n");
    if (!text.split("\n").every((part) => /^[A-Z][0-9](?:-[A-Z][0-9]){3}$/.test(part))) {
      throw new Error("Synthetic fixture contains a non-token payload.");
    }
    const fontMatch = tags.match(/\\fs([\d.]+)/);
    const alignmentMatch = tags.match(/\\an([1-9])/);
    const moveMatch = tags.match(
      /\\move\(\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)/
    );
    const positionMatch = tags.match(/\\pos\(\s*(-?[\d.]+),\s*(-?[\d.]+)/);
    if (!fontMatch || !alignmentMatch || (!moveMatch && !positionMatch)) {
      throw new Error("Synthetic fixture event is missing required geometry.");
    }
    const fontSize = Number(fontMatch[1]);
    const alignment = Number(alignmentMatch[1]);
    const y = Number((moveMatch || positionMatch)[2]);
    const lineCount = text.split("\n").length;
    const vertical = Math.ceil(alignment / 3);
    const nominalAbove = vertical === 1
      ? fontSize * lineCount
      : vertical === 2
        ? fontSize * lineCount / 2
        : 0;
    const laneKey = Math.round((y - nominalAbove) * 10) / 10;
    return {
      text,
      kind: moveMatch ? "move" : "position",
      fontSize,
      alignment,
      y,
      lineCount,
      slot: moveMatch ? Math.round((laneKey - GRID_ORIGIN) / GRID_PITCH) : null
    };
  }

  function splitFields(value, fieldCount) {
    const fields = [];
    let rest = value;
    for (let index = 1; index < fieldCount; index += 1) {
      const comma = rest.indexOf(",");
      if (comma < 0) {
        throw new Error("Malformed synthetic fixture event.");
      }
      fields.push(rest.slice(0, comma).trim());
      rest = rest.slice(comma + 1);
    }
    fields.push(rest.trim());
    return fields;
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
