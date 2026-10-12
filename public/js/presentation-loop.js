/**
 * Enable the viewer's native PowerPoint "Loop continuously until Esc" option
 * for this presentation session only, without altering the PPTX on disk.
 * The pinned vanilla engine reads presentationProperties.loopContinuously
 * across all of its navigation paths (arrows, wheel, tap, and slideshow UI).
 *
 * The vanilla API does not expose a setter for presentation show properties,
 * so this adapter is limited to its checked, in-memory state store. Never
 * silently start a non-looping slideshow when that contract is unavailable.
 */
export function enablePresentationLoop(viewer) {
  const store = viewer?.store;
  if (typeof store?.get !== 'function' || typeof store?.set !== 'function') return null;
  const state = store.get();
  const original = state?.presentationProperties;
  if (!original || typeof original !== 'object') return null;

  const existed = Object.hasOwn(original, 'loopContinuously');
  const previousValue = original.loopContinuously;
  store.set({
    presentationProperties: {...original, loopContinuously: true},
    endOfShow: false,
  });

  // Avoid retaining a stale whole properties object: other presentation
  // settings may be changed while this show is open.
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    const current = store.get()?.presentationProperties;
    if (!current) return;
    const next = {...current};
    if (existed) next.loopContinuously = previousValue;
    else delete next.loopContinuously;
    store.set({presentationProperties: next, endOfShow: false});
  };
}
