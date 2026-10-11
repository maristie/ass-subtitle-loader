import {formatSignedSeconds, formatSubtitleAdjustments} from "./shared/settings.js";
function renderEmpty(options, message) { renderState(null, {...options, fallbackMessage: message}); if(options.statusEl) options.statusEl.textContent = message || "Ready"; }
function renderResponse(response, options) { renderState(response?.status, options); if(options.statusEl) options.statusEl.textContent = response?.error || response?.message || (response?.status?.hasSubtitle ? "Subtitles loaded" : "Ready"); }
function renderState(status, options) {
 const rows = status ? [
  ["ASS file", status.subtitleName || "None"],
  ["Renderer", status.rendererReady ? "CSS ready" : status.hasSubtitle ? "Waiting for video" : "Not attached"],
  ["Delay", formatSignedSeconds(status.subtitleDelay || 0)],
  ["Adjustments", formatSubtitleAdjustments(status.subtitleAdjustments)],
  ["Draw", `${status.renderStats?.frames || 0} ticks, ${status.renderStats?.active || 0} active / ${status.renderStats?.events || 0} events`],
  ["Bounds", status.overlaySize || "None"],
  ["Video time", status.currentTime ?? "None"],
  ["Last error", status.lastError || "None"]
 ] : [["ASS file", "None"], ["Status", options.fallbackMessage || "Ready"]];
 if(!options.stateEl) return;
 options.stateEl.replaceChildren(...rows.map(([key,value]) => { const row=document.createElement("div"), dt=document.createElement("dt"), dd=document.createElement("dd"); dt.textContent=key; dd.textContent=String(value); row.append(dt,dd); return row; }));
}
export {renderEmpty, renderResponse, renderState};
