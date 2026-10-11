export const salonOrigin = 'https://liniers.xn--somosmasdueos-skb.com';

// Opt in only when connecting Android; ordinary web sessions keep their current cookie policy.
export function enableSalonSession(req, _res, next) {
  if (req.query.salon === '1') {
    req.session.cookie.sameSite = 'none';
    req.session.cookie.secure = true;
  }
  next();
}

export function allowSalonFrame(_req, res, next) {
  res.removeHeader('X-Frame-Options');
  const csp = String(res.getHeader('Content-Security-Policy') || "default-src 'self'");
  const ancestors = `frame-ancestors 'self' ${salonOrigin}`;
  res.setHeader('Content-Security-Policy', /frame-ancestors[^;]*/.test(csp)
    ? csp.replace(/frame-ancestors[^;]*/, ancestors) : csp + '; ' + ancestors);
  next();
}
