function createSubtitleLoadCoordinator(options = {}) {
  let currentRevision = 0;
  let pendingRevision = null;

  function begin() {
    cancelPending();
    currentRevision += 1;
    return currentRevision;
  }

  function start(revision) {
    if (revision !== currentRevision || pendingRevision !== null) {
      return false;
    }
    pendingRevision = revision;
    return true;
  }

  function complete(revision) {
    if (pendingRevision === revision) {
      pendingRevision = null;
    }
  }

  function cancel(revision = currentRevision) {
    if (revision !== currentRevision) {
      return false;
    }
    currentRevision += 1;
    cancelPending();
    return true;
  }

  function cancelPending() {
    if (pendingRevision === null) {
      return;
    }
    const revision = pendingRevision;
    pendingRevision = null;
    if (typeof options.onCancelPending === "function") {
      options.onCancelPending(revision);
    }
  }

  function isCurrent(revision) {
    return revision === currentRevision;
  }

  return {
    begin,
    cancel,
    complete,
    isCurrent,
    start
  };
}

export { createSubtitleLoadCoordinator };
