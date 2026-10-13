// Keep a fullscreen presentation awake on supported browsers without
// affecting the device's normal sleep behavior outside the slideshow.
// The browser/OS may refuse or revoke a wake lock (battery saving, policies).
export function createPresentationWakeLock({
  doc = globalThis.document,
  nav = globalThis.navigator,
  onUnavailable = () => {},
} = {}) {
  let active = false;
  let lock = null;
  let pending = null;
  let generation = 0;
  let disposed = false;

  const eligible = () => active && !disposed && Boolean(doc?.fullscreenElement) &&
    doc.visibilityState !== 'hidden' && typeof nav?.wakeLock?.request === 'function';

  const released = () => {
    lock = null; // Browsers revoke locks on tab backgrounding or power changes.
    // Retry on the next visibility/fullscreen transition, not in a tight loop.
  };

  const releaseHeld = () => {
    if (!lock) return;
    const previous = lock;
    lock = null;
    previous.removeEventListener?.('release', released);
    try { Promise.resolve(previous.release()).catch(() => {}); }
    catch { /* Release must never stop the presentation. */ }
  };

  const sync = () => {
    if (!eligible()) {
      generation++;
      releaseHeld();
      return Promise.resolve(false);
    }
    if (lock) return Promise.resolve(true);
    if (pending) return pending;
    const requestGeneration = ++generation;
    pending = Promise.resolve()
      .then(() => nav.wakeLock.request('screen'))
      .then(sentinel => {
        if (!sentinel) return false;
        if (requestGeneration !== generation || !eligible()) {
          try { Promise.resolve(sentinel.release()).catch(() => {}); }
          catch { /* A request can complete after fullscreen was exited. */ }
          return false;
        }
        lock = sentinel;
        sentinel.addEventListener?.('release', released);
        return true;
      })
      .catch(error => {
        onUnavailable(error); // Unsupported/denied request is a graceful fallback.
        return false;
      })
      .finally(() => { pending = null; });
    return pending;
  };

  const onEnvironmentChange = () => { void sync(); };
  doc?.addEventListener?.('fullscreenchange', onEnvironmentChange);
  doc?.addEventListener?.('visibilitychange', onEnvironmentChange);

  return {
    activate() { active = true; return sync(); },
    deactivate() { active = false; return sync(); },
    sync,
    dispose() {
      disposed = true;
      active = false;
      doc?.removeEventListener?.('fullscreenchange', onEnvironmentChange);
      doc?.removeEventListener?.('visibilitychange', onEnvironmentChange);
      return sync();
    },
  };
}
