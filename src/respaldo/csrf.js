import { createHash, timingSafeEqual } from 'node:crypto';

// Per-session CSRF token. The 32-byte session secret is only present in the
// HttpOnly cookie and server storage. It is never embedded in a public page.
export function csrfForRespaldoSession(sessionToken) {
  if (typeof sessionToken !== 'string' || !/^[a-f0-9]{64}$/.test(sessionToken)) return null;
  return createHash('sha256').update('respaldo:csrf:v1:' + sessionToken).digest('hex');
}

export function validRespaldoCsrf(sessionToken, requestToken) {
  const expected = csrfForRespaldoSession(sessionToken);
  if (!expected || typeof requestToken !== 'string' || !/^[a-f0-9]{64}$/.test(requestToken)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(requestToken, 'hex'));
}
