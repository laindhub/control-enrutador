import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { db, ready, respaldoErrorMessage } from './storage.js';
// Login CSRF is validated by a cryptographically random form nonce and
// a matching HttpOnly, SameSite=Strict cookie. Comparing browser Origin with
// reverse-proxy headers is redundant and can block legitimate Hostinger logins.

const CSRF_COOKIE = 'respaldo_login_csrf';
const PREFIX = 'respaldo:';
const digest = value => createHash('sha256').update(value).digest('hex');
const secure = () => process.env.NODE_ENV === 'production';

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }).filter(([name]) => name));
}

function equal(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function prepareRespaldoLogin(req, res, next) {
  const token = randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: secure(),
    path: '/login',
    maxAge: 30 * 60 * 1000,
  });
  res.locals.respaldoLoginCsrf = token;
  next();
}

// The SAME main login page is accessible even when the main app's MySQL session store
// cannot start. Only backup credentials work in this degraded mode.
export function loginWhenPrimaryOffline(state) {
  return (_req, res, next) => {
    if (state() === 'ready') return next();
    return res.render('login', { title: 'Ingresar', error: null, csrfToken: '' });
  };
}

const limiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Demasiados intentos. Esperá unos minutos para volver a ingresar.',
});

const renderError = (req, res, status, error) => {
  return res.status(status).render('login', {
    title: 'Ingresar', error, csrfToken: '',
    respaldoLoginCsrf: String(req.body?._backup_csrf || ''),
  });
};

export function tryRespaldoLogin(req, res, next) {
  const username = String(req.body?.username || '').trim();
  const adminName = String(process.env.RESPALDO_USERNAME || '').trim();
  const backupLogin = Boolean(adminName && username === adminName);
  if (!backupLogin) return next();

  return limiter(req, res, async () => {
    const token = String(req.body?._backup_csrf || '');
    const cookie = cookies(req)[CSRF_COOKIE];
    if (!/^[a-f0-9]{64}$/.test(token) || !equal(token, cookie)) {
      return renderError(req, res, 403, 'La página de ingreso venció. Recargala y volvé a intentar.');
    }
    // The nonce + Strict cookie above authenticates a same-browser form submission.
    // Do not reconstruct HTTPS origin from the hosting provider's internal proxy.
    const password = String(req.body?.password || '');
    if (!password || password.length > 80 || username.length > 180) {
      return renderError(req, res, 401, 'Usuario o contraseña incorrectos.');
    }

    try {
      await ready();
      let user;
      if (username === adminName) {
        [[user]] = await db.execute(
          "SELECT id,name,role,pin_hash FROM respaldo_users WHERE role='admin' AND name=? AND active=1 LIMIT 1",
          [username],
        );
      } else {
        const operatorName = username.slice(PREFIX.length).trim();
        if (operatorName.length < 1 || operatorName.length > 160) {
          return renderError(req, res, 401, 'Usuario o contraseña incorrectos.');
        }
        [[user]] = await db.execute(
          "SELECT id,name,role,pin_hash FROM respaldo_users WHERE role<>'admin' AND name=? AND active=1 LIMIT 1",
          [operatorName],
        );
      }
      const fallbackHash = '$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const valid = await bcrypt.compare(password, user?.pin_hash || fallbackHash);
      if (!valid) return renderError(req, res, 401, 'Usuario o contraseña incorrectos.');

      const sessionToken = randomBytes(32).toString('hex');
      await db.execute(
        'INSERT INTO respaldo_sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 HOUR))',
        [digest(sessionToken), user.id],
      );
      res.cookie('respaldo_sid', sessionToken, {
        httpOnly: true, sameSite: 'strict', secure: secure(),
        path: '/respaldo', maxAge: 12 * 60 * 60 * 1000,
      });
      return res.redirect(303, '/respaldo');
    } catch (error) {
      console.error('[respaldo:login]', error?.code || error?.message || 'unknown');
      return renderError(req, res, 503, respaldoErrorMessage(error));
    }
  });
}
