import { getFontFaceCss } from "../core/font-resolver.js";
import { DOM_COMMENT_LINE_HEIGHT } from "../renderers/dom/layout.js";

function ensurePageStyle(state) {
  if (state.styleElement && state.styleElement.isConnected) {
    return;
  }

  state.styleElement = document.createElement("style");
  const fontCss = getFontFaceCss(state.fontConfig);
  state.styleElement.textContent = `
      ${fontCss}

      .ass-subtitle-loader-overlay {
        position: absolute !important;
        overflow: hidden !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        contain: layout size style paint !important;
      }

      .ass-subtitle-loader-dom-layer {
        position: absolute !important;
        inset: 0 !important;
        display: block !important;
        overflow: hidden !important;
        pointer-events: none !important;
        contain: paint !important;
      }

      .ass-subtitle-loader-dom-comment {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        white-space: pre !important;
        line-height: ${DOM_COMMENT_LINE_HEIGHT} !important;
        /* Paint the fill over the centered stroke so only its ASS-sized outer half remains. */
        paint-order: stroke fill !important;
        pointer-events: none !important;
        user-select: none !important;
        will-change: transform, opacity !important;
        animation-name: ass-subtitle-loader-dom-move !important;
        animation-timing-function: linear !important;
        animation-fill-mode: both !important;
      }

      .ass-subtitle-loader-dom-comment.ass-subtitle-loader-dom-fixed-wrap {
        width: max-content !important;
        max-width: var(--ass-wrap-width) !important;
        white-space: pre-wrap !important;
        overflow-wrap: anywhere !important;
        text-align: var(--ass-text-align) !important;
      }

      @keyframes ass-subtitle-loader-dom-move {
        from {
          transform: translate3d(var(--ass-start-x), var(--ass-start-y), 0) translate(var(--ass-anchor-x), var(--ass-anchor-y));
        }
        to {
          transform: translate3d(var(--ass-end-x), var(--ass-end-y), 0) translate(var(--ass-anchor-x), var(--ass-anchor-y));
        }
      }

      .ass-subtitle-loader-picker {
        position: fixed !important;
        top: 16px !important;
        right: 16px !important;
        box-sizing: border-box !important;
        width: min(360px, calc(100vw - 32px)) !important;
        display: grid !important;
        gap: 12px !important;
        padding: 14px !important;
        border: 1px solid #c8d0d8 !important;
        border-radius: 8px !important;
        color: #15191f !important;
        background: #ffffff !important;
        box-shadow: 0 18px 44px rgba(15, 23, 42, 0.24) !important;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        font-size: 13px !important;
        line-height: 1.35 !important;
        z-index: 2147483647 !important;
      }

      .ass-subtitle-loader-picker,
      .ass-subtitle-loader-picker * {
        box-sizing: border-box !important;
      }

      .ass-subtitle-loader-picker-dragging {
        border-color: #165dff !important;
        box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.18), 0 18px 44px rgba(15, 23, 42, 0.24) !important;
      }

      .ass-subtitle-loader-picker-header {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
      }

      .ass-subtitle-loader-picker h2 {
        margin: 0 !important;
        color: #15191f !important;
        font: 650 15px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .ass-subtitle-loader-picker-status {
        min-height: 18px !important;
        margin: 0 !important;
        color: #425161 !important;
        overflow-wrap: anywhere !important;
      }

      .ass-subtitle-loader-picker-status[data-state="error"] {
        color: #b42318 !important;
      }

      .ass-subtitle-loader-picker-field {
        display: grid !important;
        gap: 6px !important;
        margin: 0 !important;
        color: #354250 !important;
        font: 650 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .ass-subtitle-loader-picker input,
      .ass-subtitle-loader-picker select {
        width: 100% !important;
        min-height: 34px !important;
        margin: 0 !important;
        padding: 6px 8px !important;
        border: 1px solid #b8c1ca !important;
        border-radius: 6px !important;
        color: #15191f !important;
        background: #ffffff !important;
        font: 400 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .ass-subtitle-loader-picker-button {
        min-height: 32px !important;
        margin: 0 !important;
        padding: 0 10px !important;
        border: 1px solid #165dff !important;
        border-radius: 6px !important;
        color: #ffffff !important;
        background: #165dff !important;
        font: 650 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important;
      }

      .ass-subtitle-loader-picker-button.secondary {
        color: #15191f !important;
        background: #ffffff !important;
        border-color: #b8c1ca !important;
      }

      @media (prefers-color-scheme: dark) {
        .ass-subtitle-loader-picker {
          color: #edf1f5 !important;
          background: #20262d !important;
          border-color: #3d4752 !important;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.46) !important;
        }

        .ass-subtitle-loader-picker h2 {
          color: #edf1f5 !important;
        }

        .ass-subtitle-loader-picker-status {
          color: #b8c3ce !important;
        }

        .ass-subtitle-loader-picker-status[data-state="error"] {
          color: #ffb4ab !important;
        }

        .ass-subtitle-loader-picker-field {
          color: #c7d0d9 !important;
        }

        .ass-subtitle-loader-picker input,
        .ass-subtitle-loader-picker select,
        .ass-subtitle-loader-picker-button.secondary {
          color: #edf1f5 !important;
          background: #15191f !important;
          border-color: #46515d !important;
        }
      }
    `;
  document.documentElement.appendChild(state.styleElement);
}

export { ensurePageStyle };
