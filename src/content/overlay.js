import { findVideoLayoutHost } from "./video-target.js";

function createOverlay(video, trace) {
  const host = findVideoLayoutHost(video) || document.body;
  const previousInlinePosition = host.style.position;
  const changedPosition = getComputedStyle(host).position === "static";
  if (changedPosition) {
    // Absolute overlays need a positioning container. We restore this inline
    // style during cleanup if the page did not already define one.
    host.style.position = "relative";
  }

  const root = document.createElement("div");
  root.className = "ass-subtitle-loader-overlay";
  root.setAttribute("aria-hidden", "true");


  const domLayer = document.createElement("div");
  domLayer.className = "ass-subtitle-loader-dom-layer";
  root.append(domLayer);
  host.appendChild(root);

  if (typeof trace === "function") {
    trace("overlay:create", {
      host: describeElement(host),
      changedPosition
    });
  }

  return {
    host,
    root,
    domLayer,
    previousInlinePosition,
    changedPosition,
    width: 0,
    height: 0,
  };
}

function describeElement(element) {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const id = element.id ? `#${element.id}` : "";
  const className = typeof element.className === "string" && element.className.trim()
    ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
    : "";
  return `${element.tagName.toLowerCase()}${id}${className} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function removeOverlay(overlay, trace) {
  if (!overlay) {
    return;
  }

  if (typeof trace === "function") {
    trace("overlay:remove", {
      host: describeElement(overlay.host)
    });
  }
  if (overlay.root) {
    overlay.root.remove();
  }
  // Some video hosts are statically positioned, so the overlay temporarily
  // makes them positioning containers. Restore only the inline style changed.
  if (overlay.changedPosition && overlay.host) {
    overlay.host.style.position = overlay.previousInlinePosition;
  }
}

export {
  createOverlay,
  describeElement,
  removeOverlay
};
