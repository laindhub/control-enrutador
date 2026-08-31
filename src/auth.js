import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import { config } from './config.js';
import { pool } from './db.js';

const MySQLStore = MySQLStoreFactory(session);

export const sessionStore = new MySQLStore(
  {
    createDatabaseTable: true,
    expiration: 1000 * 60 * 60 * 24 * 365,
    clearExpired: true,
    checkExpirationInterval: 1000 * 60 * 15,
    schema: { tableName: 'user_sessions' },
  },
  pool,
);

export const sessionMiddleware = session({
  name: 'control_enrutador_sid',
  secret: config.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 365,
  },
});

export async function authenticate(username, password) {
  const [rows] = await pool.execute(
    'SELECT id, username, password_hash, role FROM users WHERE username = ? AND active = TRUE LIMIT 1',
    [username],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
  return { id: user.id, username: user.username, role: user.role };
}

export function attachLocals(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.user = req.session.user || null;
  res.locals.operator = req.session.operator || null;
  next();
}

export function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const supplied = req.get('x-csrf-token') || req.body?._csrf;
  const suppliedBuffer = Buffer.from(String(supplied || ''));
  const expectedBuffer = Buffer.from(req.session.csrfToken);
  if (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return next();
  }
  return res.status(403).json({ error: 'La sesión de seguridad venció. Recargá la página.' });
}

export function requireAuth(req, res, next) {
  if (req.session.user) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Sesión requerida.' });
  return res.redirect('/login');
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.session.user?.role === role) return next();
    if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: 'Acceso no autorizado.' });
    return res.redirect(req.session.user?.role === 'admin' ? '/admin' : '/');
  };
}

export async function requireOperator(req, res, next) {
  try {
    if (req.session.operator) {
      const [rows] = await pool.execute('SELECT id, name FROM operators WHERE id = ? AND active = TRUE', [
        req.session.operator.id,
      ]);
      if (rows.length) {
        req.session.operator = rows[0];
        return next();
      }
      delete req.session.operator;
    }
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(409).json({ error: 'Seleccioná quién está operando.' });
    }
    return res.redirect('/operator');
  } catch (error) {
    return next(error);
  }
}
