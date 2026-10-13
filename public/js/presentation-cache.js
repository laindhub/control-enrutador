import {
  OFFICIAL_DECK_MIME,
  OFFICIAL_DECK_SHA256,
  OFFICIAL_DECK_SIZE,
  isOfficialDeckResponse,
  readVerifiedOfficialDeck,
} from './presentation-source.js';

// Explicit Cache Storage persists across reloads and browser restarts.
// The checksum in the cache name automatically invalidates old presentations.
const CACHE_PREFIX = 'salon-mas-duenos-official-pptx-';
const cacheName = sha256 => CACHE_PREFIX + sha256;

export async function hasCachedOfficialDeck({
  url,
  cacheStorage = globalThis.caches,
  verification = {},
} = {}) {
  if (!url || !cacheStorage?.open) return false;
  const sha256 = verification.sha256 || OFFICIAL_DECK_SHA256;
  const size = verification.size ?? OFFICIAL_DECK_SIZE;
  try {
    const cache = await cacheStorage.open(cacheName(sha256));
    const response = await cache.match(url);
    return Boolean(response &&
      response.headers.get('x-laind-pptx-sha256') === sha256 &&
      isOfficialDeckResponse(response, size));
  } catch {
    // Private browsing or storage restrictions must not prevent opening the deck.
    return false;
  }
}

export async function loadOfficialDeck({
  url,
  fetcher = globalThis.fetch,
  cacheStorage = globalThis.caches,
  verification = {},
  onSource = () => {},
} = {}) {
  if (!url) throw Error('No se indicó la dirección de la presentación.');
  const sha256 = verification.sha256 || OFFICIAL_DECK_SHA256;
  const size = verification.size ?? OFFICIAL_DECK_SIZE;
  const checks = {...verification, sha256, size};
  const name = cacheName(sha256);
  let cache = null;

  if (cacheStorage?.open) {
    try {
      cache = await cacheStorage.open(name);
      const response = await cache.match(url);
      if (response) {
        try {
          const blob = await readVerifiedOfficialDeck(response, checks);
          onSource('cache');
          return {blob, fromCache:true, saved:true};
        } catch {
          // Corrupt/partial cached bytes: remove them, then fetch the original.
          try { await cache.delete(url); } catch { /* Ignore storage failures. */ }
        }
      }
    } catch {
      cache = null;
    }
  }

  onSource('network');
  const response = await fetcher(url, {cache:'no-store'});
  const blob = await readVerifiedOfficialDeck(response, checks);
  let saved = false;
  if (cacheStorage?.open) {
    try {
      cache ||= await cacheStorage.open(name);
      await cache.put(url, new Response(blob, {
        status:200,
        headers:{
          'content-type':OFFICIAL_DECK_MIME,
          'content-length':String(size),
          'x-laind-pptx-sha256':sha256,
        },
      }));
      saved = true;
      // Keep only the current official version, never other site assets.
      if (typeof cacheStorage.keys === 'function' && typeof cacheStorage.delete === 'function') {
        try {
          for (const oldName of await cacheStorage.keys()) {
            if (oldName.startsWith(CACHE_PREFIX) && oldName !== name) {
              await cacheStorage.delete(oldName);
            }
          }
        } catch { /* Cleanup is best effort. */ }
      }
    } catch {
      // Browsers can reject a 35 MB Cache Storage write (quota/private mode).
      // In that case, the presentation still opens from the verified download.
    }
  }
  return {blob, fromCache:false, saved};
}
