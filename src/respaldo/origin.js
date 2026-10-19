// Trusted browser origin for Respaldo. Hostinger proxies may terminate HTTPS and
// forward an internal HTTP origin, so req.protocol/req.host are not authority
// for comparing the Origin sent by the browser.
const DEFAULT_PUBLIC_ORIGIN = 'https://masduenos.laind.io';

function canonicalOrigin(raw) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function trustedRespaldoOrigin(req, { allowMissing = false } = {}) {
  const origin = req.get('origin');
  const site = req.get('sec-fetch-site');

  // Other origins, including different subdomains on the same parent site,
  // cannot submit login or change Respaldo data.
  if (site && !['same-origin', 'none'].includes(site)) return false;

  if (!origin) return allowMissing && (!site || site === 'same-origin' || site === 'none');

  const browserOrigin = canonicalOrigin(origin);
  if (!browserOrigin) return false;

  if (process.env.NODE_ENV === 'production') {
    const configured = process.env.RESPALDO_PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN;
    const expected = canonicalOrigin(configured);
    // Fail closed if an override has an invalid URL or uses plain HTTP in production.
    return Boolean(expected) && expected.startsWith('https://') && browserOrigin === expected;
  }

  // For local development, compare the actual dev server's Host (not the
  // production proxy's internal scheme), still retaining same-origin protection.
  const host = req.get('host');
  if (!host) return false;
  const expectedDevHost = canonicalOrigin('http://' + host);
  if (!expectedDevHost) return false;
  return new URL(browserOrigin).host === new URL(expectedDevHost).host;
}
