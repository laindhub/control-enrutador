// The work presentation uses a PowerPoint media click-effect within slide 21.
// Respect that build: first show the paused frame; next advance starts playback.
// This is scoped by the original file checksum, not by filename alone.
const KNOWN_DECK_SHA256 = 'bdb35bfa366b7c2570a36a0d5b1172836765d50796a8e772345b5a5ccf6f25c7';
const KNOWN_DECK_BYTES = 34796967;
const KNOWN_VIDEO_SLIDE_INDEX = 20;
// Exact user-approved 39-slide deck with the $200.000 slide removed.
// Geraldine remains on slide 21 because the removed slide was number 32.
const CURATED_DECK_SHA256 = '175c2002b3b2f7f5d9c42412bfb770514f1c03fc924b5833cc49bb63e1d53f12';
const CURATED_DECK_BYTES = 35735002;

export function videoStepForHash(size, sha256) {
  if(size === CURATED_DECK_BYTES && sha256 === CURATED_DECK_SHA256)
    return KNOWN_VIDEO_SLIDE_INDEX;
  return size === KNOWN_DECK_BYTES && sha256 === KNOWN_DECK_SHA256 ? KNOWN_VIDEO_SLIDE_INDEX : null;
}

export function isForwardInput(event) {
  if (event.type === 'wheel') return event.deltaY > 0 || (event.deltaY === 0 && event.deltaX > 0);
  if (event.type === 'keydown') return ['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'].includes(event.key);
  if (event.type === 'click') return event.button === 0;
  if (event.type === 'touchend') return event.deltaY > 0;
  return false;
}

export async function getTimedVideoSlide(file) {
  if (!file || ![KNOWN_DECK_BYTES,CURATED_DECK_BYTES].includes(file.size) ||
      !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const hex = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return videoStepForHash(file.size, hex);
}
