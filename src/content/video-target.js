const MIN_VIDEO_AREA = 80 * 45;

function findBestVideo(root, trace) {
  const candidates = getVideoCandidates(collectVideos(root));
  const selected = candidates.map((entry) => entry.video)[0] || null;
  if (typeof trace === "function") {
    trace("video:candidates", {
      count: candidates.length,
      selected: selected ? describeVideo(selected) : null,
      topScore: candidates[0] ? Math.round(candidates[0].score) : 0
    });
  }
  return selected;
}

function getVideoCandidates(videos) {
  return videos
    .map((video) => ({
      video,
      score: scoreVideo(video)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

function collectVideos(root) {
  const videos = [];
  if (!root) {
    return videos;
  }

  if (root instanceof HTMLVideoElement) {
    videos.push(root);
  }

  if (typeof root.querySelectorAll === "function") {
    root.querySelectorAll("video").forEach((video) => videos.push(video));
    root.querySelectorAll("*").forEach((node) => {
      if (node.shadowRoot) {
        videos.push(...collectVideos(node.shadowRoot));
      }
    });
  }

  return videos;
}

function scoreVideo(video) {
  if (!video || !video.isConnected) {
    return 0;
  }

  // Pages such as YouTube can keep hidden or zero-size video elements around.
  // Score only visible, usable candidates so we do not attach to a stale player.
  const rect = getVideoDisplayRect(video);
  if (!rect) {
    return 0;
  }

  const area = rectArea(rect);
  const visibleArea = getVisibleArea(rect);

  const playbackBonus = video.paused ? 0 : area * 0.25;
  const metadataBonus = video.videoWidth && video.videoHeight ? area * 0.15 : 0;
  return area + visibleArea + playbackBonus + metadataBonus;
}

function describeVideo(video) {
  const rect = getVideoDisplayRect(video) || video.getBoundingClientRect();
  const width = video.videoWidth || Math.round(rect.width);
  const height = video.videoHeight || Math.round(rect.height);
  if (width && height) {
    return `${width}x${height}`;
  }
  return "HTML5 video";
}

function getVideoDisplayRect(video, preferredHost) {
  if (!video || !video.isConnected) {
    return null;
  }

  const videoStyle = getComputedStyle(video);
  if (videoStyle.display === "none" || videoStyle.visibility === "hidden") {
    return null;
  }

  const videoRect = video.getBoundingClientRect();
  if (isUsableRect(videoRect) && Number(videoStyle.opacity) !== 0) {
    return videoRect;
  }

  const host = preferredHost || findVideoLayoutHost(video);
  if (!host || !host.isConnected) {
    return null;
  }

  const hostStyle = getComputedStyle(host);
  if (hostStyle.display === "none" || hostStyle.visibility === "hidden" || Number(hostStyle.opacity) === 0) {
    return null;
  }

  const hostRect = host.getBoundingClientRect();
  return isUsableRect(hostRect) ? hostRect : null;
}

function findVideoLayoutHost(video) {
  const selectors = [
    "#movie_player",
    ".html5-video-player",
    ".html5-video-container",
    "ytd-player",
    ".player-api"
  ];

  let fallback = null;
  let node = video;
  while (node) {
    if (node instanceof Element) {
      for (const selector of selectors) {
        if (node.matches(selector)) {
          return node;
        }
      }

      if (!fallback && node !== video && isUsableRect(node.getBoundingClientRect())) {
        fallback = node;
      }
    }

    node = getComposedParent(node);
  }

  return fallback || video.parentElement || null;
}

function getComposedParent(node) {
  if (node.parentElement) {
    return node.parentElement;
  }

  const root = typeof node.getRootNode === "function" ? node.getRootNode() : null;
  return root && root.host instanceof Element ? root.host : null;
}

function isUsableRect(rect) {
  return rectArea(rect) >= MIN_VIDEO_AREA && getVisibleArea(rect) > 0;
}

function rectArea(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getVisibleArea(rect) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
  return visibleWidth * visibleHeight;
}

function getVideoPlaybackQuality(video) {
  if (video && typeof video.getVideoPlaybackQuality === "function") {
    try {
      const quality = video.getVideoPlaybackQuality() || {};
      return {
        droppedVideoFrames: Number(quality.droppedVideoFrames) || 0,
        totalVideoFrames: Number(quality.totalVideoFrames) || 0
      };
    } catch (_error) {
      // Some pages wrap media elements; callers can still use zeroed metrics.
    }
  }

  return {
    droppedVideoFrames: 0,
    totalVideoFrames: 0
  };
}

export {
  collectVideos,
  describeVideo,
  findBestVideo,
  findVideoLayoutHost,
  getVideoDisplayRect,
  getVideoCandidates,
  getVideoPlaybackQuality
};
