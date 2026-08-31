import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config, validateConfig } from './config.js';
import { pool } from './db.js';
import { cleanupExpiredRecords, initializeDatabase } from './schema.js';
import {
  attachLocals,
  authenticate,
  requireAuth,
  requireOperator,
  requireRole,
  sessionMiddleware,
  verifyCsrf,
} from './auth.js';
import { createApiRouter } from './routes/api.js';
import { createAdminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let startupState = 'starting';
let startupError = null;
let cleanupTimer = null;
let startupPromise = null;

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  serveClient: true,
  transports: ['polling'],
  pingInterval: 20_000,
  pingTimeout: 15_000,
});

if (config.env === 'production') app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
      },
    },
  }),
);
app.use(compression());
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.get('/health', async (_req, res) => {
  if (startupState === 'starting') {
    return res.json({
      ok: true,
      ready: false,
      service: 'control-enrutador',
      stage: 'startup',
    });
  }

  if (startupState === 'failed') {
    return res.status(503).json({
      ok: false,
      service: 'control-enrutador',
      stage: 'startup',
      error: publicStartupError(startupError),
    });
  }

  try {
    await pool.query('SELECT 1');
    return res.json({ ok: true, service: 'control-enrutador' });
  } catch (error) {
    console.error('Healthcheck MySQL falló:', error);
    return res.status(503).json({
      ok: false,
      service: 'control-enrutador',
      stage: 'database',
      error: publicStartupError(error),
    });
  }
});

app.use(async (req, res, next) => {
  // Durante un arranque normal mantenemos abierta la solicitud hasta que la
  // instancia esté lista. Así nunca se entrega una pantalla STARTING.
  if (startupState === 'starting' && startupPromise) await startupPromise;
  if (startupState === 'ready') return next();

  const details = publicStartupError(startupError);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(503).json({ error: 'La aplicación no pudo inicializarse.', details });
  }
  return res.status(503).render('error', {
    title: 'Servicio no disponible',
    message: `No se pudo inicializar la aplicación (${details.code}). Revisá /health para el diagnóstico.`,
  });
});

app.use(sessionMiddleware);
app.use(attachLocals);
app.use('/assets', express.static(path.join(root, 'public'), {
  maxAge: 0,
  etag: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, must-revalidate'),
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.',
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/');
  return res.render('login', { title: 'Ingresar', error: null });
});

app.post('/login', loginLimiter, verifyCsrf, async (req, res, next) => {
  try {
    const user = await authenticate(String(req.body.username || ''), String(req.body.password || ''));
    if (!user) return res.status(401).render('login', { title: 'Ingresar', error: 'Usuario o contraseña incorrectos.' });
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = user;
      req.session.csrfToken = cryptoToken();
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.redirect(user.role === 'admin' ? '/admin' : '/operator');
      });
    });
  } catch (error) {
    next(error);
  }
});

app.post('/logout', verifyCsrf, requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('control_enrutador_sid');
    return res.redirect('/login');
  });
});

app.get('/operator', requireAuth, requireRole('router'), async (_req, res) => {
  const [operators] = await pool.query(
    'SELECT id, name FROM operators WHERE active = TRUE ORDER BY sort_order, name',
  );
  res.render('operator', { title: '¿Quién está operando?', operators });
});

app.post('/operator', verifyCsrf, requireAuth, requireRole('router'), async (req, res, next) => {
  try {
    const operatorId = Number(req.body.operatorId);
    const [rows] = await pool.execute('SELECT id, name FROM operators WHERE id = ? AND active = TRUE', [operatorId]);
    if (!rows.length) return res.status(400).render('operator', { title: '¿Quién está operando?', operators: [], error: 'Selección inválida.' });
    req.session.operator = rows[0];
    req.session.save((error) => (error ? next(error) : res.redirect('/')));
  } catch (error) {
    next(error);
  }
});

app.get('/', requireAuth, requireRole('router'), requireOperator, (req, res) => {
  res.render('app', { title: 'Control Enrutador', operator: req.session.operator });
});

app.get('/admin', requireAuth, requireRole('admin'), (_req, res) => {
  res.render('admin', { title: 'Panel de administración' });
});

app.use('/api', verifyCsrf, createApiRouter(io));
app.use('/api/admin', verifyCsrf, createAdminRouter(io));

app.use((_req, res) => res.status(404).render('error', { title: 'No encontrado', message: 'La página solicitada no existe.' }));
app.use((error, req, res, _next) => {
  console.error(error);
  const status = error.status || 500;
  const message = status >= 500 ? 'Ocurrió un error inesperado.' : error.message;
  if (req.originalUrl.startsWith('/api/')) return res.status(status).json({ error: message });
  return res.status(status).render('error', { title: 'Error', message });
});

io.engine.use(sessionMiddleware);
io.use((socket, next) => {
  if (startupState !== 'ready') return next(new Error('service unavailable'));
  return socket.request.session?.user ? next() : next(new Error('unauthorized'));
});
io.on('connection', (socket) => {
  socket.emit('socket:ready', { connected: true });
});

startupPromise = initializeApplication();
server.listen(config.port, '0.0.0.0', () => {
  console.log(`Control Enrutador disponible en el puerto ${config.port}`);
});

async function initializeApplication() {
  try {
    validateConfig();
    await initializeWithRetry(async () => {
      await initializeDatabase();
      await cleanupExpiredRecords();
    });
    startupState = 'ready';
    console.log('Control Enrutador inicializado correctamente.');

    cleanupTimer = setInterval(() => {
      cleanupExpiredRecords().catch((error) => console.error('No se pudo ejecutar la retención:', error));
    }, 24 * 60 * 60 * 1000);
    cleanupTimer.unref();
  } catch (error) {
    startupError = error;
    startupState = 'failed';
    console.error('Error durante el arranque de Control Enrutador:', error);
  }
}
async function initializeWithRetry(task, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = Math.min(1000 * (2 ** (attempt - 1)), 8000);
      console.error(`Inicialización fallida (intento ${attempt}/${attempts}). Reintentando en ${delayMs} ms.`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function cryptoToken() {
  return randomBytes(32).toString('hex');
}

function publicStartupError(error) {
  const message = String(error?.message || 'Error desconocido');
  const code = String(error?.code || inferStartupCode(message));

  return {
    code,
    message: sanitizeStartupMessage(error, message),
  };
}

function inferStartupCode(message) {
  if (message.startsWith('Faltan variables de entorno obligatorias:')) return 'CONFIG_MISSING';
  if (message.startsWith('SESSION_SECRET')) return 'CONFIG_SESSION_SECRET';
  if (message.startsWith('ROUTER_PASSWORD')) return 'CONFIG_ROUTER_PASSWORD';
  if (message.startsWith('ADMIN_PASSWORD')) return 'CONFIG_ADMIN_PASSWORD';
  return 'STARTUP_FAILED';
}

function sanitizeStartupMessage(error, message) {
  if (message.startsWith('Faltan variables de entorno obligatorias:')) return message;
  if (message.startsWith('SESSION_SECRET')) return message;
  if (message.startsWith('ROUTER_PASSWORD')) return message;
  if (message.startsWith('ADMIN_PASSWORD')) return message;

  const mysqlCodes = {
    ER_ACCESS_DENIED_ERROR: 'MySQL rechazó el usuario o la contraseña configurados.',
    ER_BAD_DB_ERROR: 'La base indicada en DB_NAME no existe o no es accesible.',
    ECONNREFUSED: 'No se pudo conectar con MySQL en DB_HOST/DB_PORT.',
    ENOTFOUND: 'No se pudo resolver el host configurado en DB_HOST.',
    ETIMEDOUT: 'La conexión con MySQL agotó el tiempo de espera.',
  };

  return mysqlCodes[error?.code] || 'Falló la inicialización. Revisá las variables de base de datos y los logs del despliegue.';
}
