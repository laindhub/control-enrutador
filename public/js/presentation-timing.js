// The work presentation uses a PowerPoint media click-effect within slide 21.
// Respect that build: first show the paused frame; next advance starts playback.
// This is scoped by the original file checksum, not by filename alone.
const KNOWN_DECK_SHA256 = 'bdb35bfa366b7c2570a36a0d5b1172836765d50796a8e772345b5a5ccf6f25c7';
const KNOWN_DECK_BYTES = 34796967;
const KNOWN_VIDEO_SLIDE_INDEX = 20;

export function videoStepForHash(size, sha256) {
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
  if (!file || file.size !== KNOWN_DECK_BYTES || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const hex = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return videoStepForHash(file.size, hex);
}
