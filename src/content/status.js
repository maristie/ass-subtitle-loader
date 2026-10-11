import { describeSubtitleAdjustments } from "../shared/settings.js";
import {
  collectVideos,
  describeVideo,
  getVideoCandidates
} from "./video-target.js";

function createStatusSnapshot(options) {
  const {
    state,
    version
  } = options;

  const rawVideos = collectVideos(document);
  const candidates = getVideoCandidates(rawVideos);
  const session = state.session;
  const video = session && session.video && session.video.isConnected
    ? session.video
    : (candidates[0] && candidates[0].video) || null;
  const renderStats = getRenderStats(state);
  return {
    version,
    pageTitle: document.title || null,
    hasRenderer: Boolean(session && session.hasRenderer),
    rendererReady: Boolean(session && session.ready),
    rendererBackend: session ? session.backend : "none",
    hasSubtitle: Boolean(state.subtitleContent),
    subtitleName: state.subtitleName,
    subtitleStats: state.subtitleStats,
    fontInfo: state.fontInfo || null,
    subtitleDelay: roundTime(state.subtitleDelay),
    subtitleAdjustments: describeSubtitleAdjustments(state.subtitleAdjustments),
    diagnosticsEnabled: state.diagnosticsEnabled,
    privateContext: state.privateContext,
    settingsDefaults: state.settingsDefaults || null,
    subtitleTime: video ? roundTime((video.currentTime || 0) - state.subtitleDelay) : null,
    hasVideo: Boolean(video),
    rawVideoCount: rawVideos.length,
    videoCount: candidates.length,
    videoLabel: video ? describeVideo(video) : null,
    currentTime: video ? Math.round((video.currentTime || 0) * 10) / 10 : null,
    overlaySize: session ? session.overlaySize : null,
    overlayConnected: Boolean(session && session.overlayConnected),
    renderStats,
    lastError: state.lastError
  };
}

function roundTime(value) { return Math.round(Number(value || 0) * 10) / 10; }
function getRenderStats(state) { return state.session ? state.session.getStats() : null; }
export {createStatusSnapshot, roundTime};
