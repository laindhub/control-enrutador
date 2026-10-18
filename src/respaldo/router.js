import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db, ready, audit, json, parseJson, newVisitId, respaldoErrorMessage } from './storage.js';

const router = express.Router();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/respaldo');
const roles = ['recepcion', 'pretest', 'fulltest', 'enrutador', 'asesor'];
const hash = value => createHash('sha256').update(value).digest('hex');

router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use('/static', express.static(root, { index: false, etag: true }));
router.get('/login', (_req, res) => res.redirect('/login'));
router.get('/', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Respaldo · Salón Más Dueños</title>
<link rel="stylesheet" href="/respaldo/static/ui.css"></head>
<body><main id="app"><p>Preparando Respaldo…</p></main>
<script defer src="/respaldo/static/app.js"></script></body></html>`));

async function init(_req, _res, next) {
  try { await ready(); next(); }
  catch (error) { next(error); }
}
router.use('/api', init);
router.get('/api/health', (_req, res) => res.json({ ok: true, ready: true, service: 'respaldo', storage: 'independent-mysql' }));

// A cookie is backed by a persisted, hashed token in the separate database.
async function session(req, _res, next) {
  try {
    const raw = (req.headers.cookie || '').split(';').map(s => s.trim())
      .find(s => s.startsWith('respaldo_sid='));
    const token = raw?.slice('respaldo_sid='.length);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const [rows] = await db.execute(`SELECT u.id,u.name,u.role FROM respaldo_sessions s
        JOIN respaldo_users u ON s.user_id=u.id
        WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.active=1 LIMIT 1`, [hash(token)]);
      req.backupUser = rows[0] || null;
      req.backupToken = token;
    }
    next();
  } catch (error) { next(error); }
}
router.use('/api', session);
const requireLogin = (req, res, next) =>
  req.backupUser ? next() : res.status(401).json({ error: 'Iniciá sesión.' });
const allow = (...accepted) => (req, res, next) =>
  accepted.includes(req.backupUser.role) || req.backupUser.role === 'admin'
    ? next() : res.status(403).json({ error: 'Tu puesto no tiene permiso para esta operación.' });

// Only same-origin browser requests may mutate data.
router.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin !== expected) return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
  next();
});

router.get('/api/users', async (_req, res, next) => {
  try {
    const [rows] = await db.query("SELECT id,name,role FROM respaldo_users WHERE active=1 AND role<>'admin' ORDER BY name");
    res.json(rows);
  } catch (error) { next(error); }
});
router.get('/api/me', requireLogin, (req, res) => res.json(req.backupUser));
router.post('/api/logout', requireLogin, async (req, res, next) => {
  try {
    await db.execute('DELETE FROM respaldo_sessions WHERE token_hash=?', [hash(req.backupToken)]);
    res.clearCookie('respaldo_sid', { path: '/respaldo', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.post('/api/users', requireLogin, allow('admin'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const role = String(req.body.role || '');
    const pin = String(req.body.pin || '');
    if (!name || name.length > 160 || !roles.includes(role) || pin.length < 4 || pin.length > 80)
      return res.status(400).json({ error: 'Nombre, rol o PIN inválidos.' });
    const [r] = await db.execute('INSERT INTO respaldo_users (name,role,pin_hash) VALUES (?,?,?)', [name, role, await bcrypt.hash(pin, 12)]);
    await audit(req.backupUser.id, 'user_created', null, { id: r.insertId, name, role });
    res.status(201).json({ id: r.insertId, name, role });
  } catch (error) { next(error); }
});

router.get('/api/visits', requireLogin, async (req, res, next) => {
  try {
    const actor = req.backupUser;
    const where = [];
    const args = [];
    if (actor.role === 'asesor') { where.push('v.assigned_advisor_id=?'); args.push(actor.id); }
    else if (actor.role === 'pretest') where.push("v.phase='pretest'");
    else if (actor.role === 'fulltest') where.push("v.phase='fulltest'");
    else if (actor.role === 'enrutador') where.push("v.phase='enrutacion'");
    else if (actor.role === 'recepcion') where.push("v.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)");
    const search = String(req.query.search || '').trim().slice(0, 90);
    if (search) { where.push('(v.visitor_name LIKE ? OR v.phone LIKE ?)'); args.push('%' + search + '%', '%' + search + '%'); }
    if (actor.role === 'admin' && ['pendiente', 'cargado', 'no_cargar'].includes(req.query.crm)) {
      where.push('v.crm_status=?'); args.push(req.query.crm);
    }
    const [rows] = await db.execute(`SELECT v.id,v.visitor_name,v.source,v.created_at,v.phase,
      v.crm_status,v.assigned_advisor_id,v.seated${actor.role === 'asesor' ? '' : ',v.phone,v.promoter,v.exit_reason'}
      FROM respaldo_visits v ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY v.created_at DESC LIMIT 200`, args);
    res.json(rows);
  } catch (error) { next(error); }
});
async function visitFor(req, res) {
  const [rows] = await db.execute('SELECT * FROM respaldo_visits WHERE id=? LIMIT 1', [req.params.id]);
  const visit = rows[0];
  if (!visit) { res.status(404).json({ error: 'Visita inexistente.' }); return null; }
  if (req.backupUser.role === 'asesor' && Number(visit.assigned_advisor_id) !== Number(req.backupUser.id)) {
    res.status(403).json({ error: 'La visita no está asignada a tu usuario.' }); return null;
  }
  if (req.method === 'GET' && !['admin', 'asesor'].includes(req.backupUser.role)) {
    const rolePhase = { pretest: 'pretest', fulltest: 'fulltest', enrutador: 'enrutacion' };
    const phase = rolePhase[req.backupUser.role];
    if ((phase && visit.phase !== phase) ||
        (req.backupUser.role === 'recepcion' && Number(visit.created_by) !== Number(req.backupUser.id))) {
      res.status(403).json({ error: 'La visita no corresponde a tu puesto.' });
      return null;
    }
  }
  return visit;
}
router.get('/api/visits/:id', requireLogin, async (req, res, next) => {
  try {
    const v = await visitFor(req, res); if (!v) return;
    if (req.backupUser.role === 'asesor') {
      return res.json({ id: v.id, visitor_name: v.visitor_name, phase: v.phase, seated: v.seated, assigned_advisor_id: v.assigned_advisor_id });
    }
    res.json({ ...v, pretest_json: parseJson(v.pretest_json), fulltest_json: parseJson(v.fulltest_json),
      routing_json: parseJson(v.routing_json) });
  } catch (error) { next(error); }
});
router.post('/api/visits', requireLogin, allow('recepcion'), async (req, res, next) => {
  try {
    const name = String(req.body.visitor_name || '').trim().slice(0, 200);
    const source = String(req.body.source || '').slice(0, 120);
    const promoter = String(req.body.promoter || '').slice(0, 160);
    const phone = String(req.body.phone || '').slice(0, 50);
    const continues = req.body.continues === true;
    const exitReason = continues ? '' : String(req.body.exit_reason || '').slice(0, 180);
    if (!name || !source || (!continues && !exitReason))
      return res.status(400).json({ error: 'Completá nombre, procedencia y continuidad.' });
    const id = newVisitId();
    await db.execute(`INSERT INTO respaldo_visits
      (id,visitor_name,phone,source,promoter,continues,exit_reason,created_by,phase)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, name, phone, source, promoter, Number(continues), exitReason, req.backupUser.id, continues ? 'pretest' : 'cerrada']);
    await audit(req.backupUser.id, 'check_in', id, { continues, source, exitReason });
    res.status(201).json({ id, phase: continues ? 'pretest' : 'cerrada' });
  } catch (error) { next(error); }
});
router.put('/api/visits/:id/pretest', requireLogin, allow('pretest'), async (req, res, next) => {
  try {
    const v = await visitFor(req, res); if (!v) return;
    if (v.phase !== 'pretest') return res.status(409).json({ error: 'La visita no está pendiente de Pre-test.' });
    const answers = req.body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers))
      return res.status(400).json({ error: 'Respuestas inválidas.' });
    const name = String(req.body.visitor_name || v.visitor_name).trim().slice(0, 200);
    const phone = String(req.body.phone || v.phone || '').slice(0, 50);
    if (!name || !phone) return res.status(400).json({ error: 'Completá nombre y teléfono.' });
    await db.execute("UPDATE respaldo_visits SET visitor_name=?,phone=?,pretest_json=?,phase='fulltest' WHERE id=?",
      [name, phone, json(answers), v.id]);
    await audit(req.backupUser.id, 'pretest_completed', v.id);
    res.json({ ok: true, phase: 'fulltest' });
  } catch (error) { next(error); }
});
router.put('/api/visits/:id/fulltest', requireLogin, allow('fulltest'), async (req, res, next) => {
  try {
    const v = await visitFor(req, res); if (!v) return;
    if (v.phase !== 'fulltest') return res.status(409).json({ error: 'La visita no está pendiente de Full-test.' });
    const answers = req.body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers))
      return res.status(400).json({ error: 'Respuestas inválidas.' });
    const merged = { ...parseJson(v.fulltest_json), ...answers };
    const complete = req.body.complete === true;
    await db.execute('UPDATE respaldo_visits SET fulltest_json=?,phase=? WHERE id=?',
      [json(merged), complete ? 'enrutacion' : 'fulltest', v.id]);
    await audit(req.backupUser.id, complete ? 'fulltest_completed' : 'fulltest_saved', v.id);
    res.json({ ok: true, phase: complete ? 'enrutacion' : 'fulltest' });
  } catch (error) { next(error); }
});
router.put('/api/visits/:id/route', requireLogin, allow('enrutador'), async (req, res, next) => {
  try {
    const v = await visitFor(req, res); if (!v) return;
    if (v.phase !== 'enrutacion') return res.status(409).json({ error: 'La visita no está pendiente de derivación.' });
    const data = req.body;
    const outcome = String(data.outcome || '');
    if (!['entera', 'entera_no_deriva', 'se_fue', 'no_se_quedo'].includes(outcome))
      return res.status(400).json({ error: 'Resultado de charla inválido.' });
    let advisorId = data.advisor_id ? Number(data.advisor_id) : null;
    if (advisorId) {
      const [[advisor]] = await db.execute("SELECT id FROM respaldo_users WHERE id=? AND role='asesor' AND active=1", [advisorId]);
      if (!advisor) return res.status(400).json({ error: 'Asesor inválido.' });
    }
    if (outcome === 'entera' && !advisorId) return res.status(400).json({ error: 'Seleccioná un asesor.' });
    const routing = { outcome, speaker: String(data.speaker || '').slice(0, 160),
      product: String(data.product || '').slice(0, 30), reason: String(data.reason || '').slice(0, 180) };
    await db.execute('UPDATE respaldo_visits SET routing_json=?,assigned_advisor_id=?,phase=? WHERE id=?',
      [json(routing), advisorId, advisorId ? 'asesor' : 'cerrada', v.id]);
    await audit(req.backupUser.id, 'routed', v.id, { advisor_id: advisorId, outcome });
    res.json({ ok: true, phase: advisorId ? 'asesor' : 'cerrada' });
  } catch (error) { next(error); }
});
router.put('/api/visits/:id/conversion', requireLogin, allow('asesor'), async (req, res, next) => {
  try {
    const v = await visitFor(req, res); if (!v) return;
    if (v.phase !== 'asesor') return res.status(409).json({ error: 'La conversión ya se registró o no corresponde.' });
    if (typeof req.body.seated !== 'boolean') return res.status(400).json({ error: 'Indicá si se sentó o no.' });
    await db.execute("UPDATE respaldo_visits SET seated=?,conversion_by=?,conversion_at=UTC_TIMESTAMP(),phase='cerrada' WHERE id=? AND phase='asesor'",
      [Number(req.body.seated), req.backupUser.id, v.id]);
    await audit(req.backupUser.id, 'conversion_recorded', v.id, { seated: req.body.seated });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.put('/api/visits/:id/crm', requireLogin, allow('admin'), async (req, res, next) => {
  try {
    const v = await visitFor(req, res); if (!v) return;
    const status = String(req.body.status || '');
    const note = String(req.body.note || '').slice(0, 3000);
    if (!['pendiente', 'cargado', 'no_cargar'].includes(status))
      return res.status(400).json({ error: 'Estado de CRM inválido.' });
    await db.execute('UPDATE respaldo_visits SET crm_status=?,crm_note=?,crm_updated_by=?,crm_updated_at=UTC_TIMESTAMP() WHERE id=?',
      [status, note, req.backupUser.id, v.id]);
    await audit(req.backupUser.id, 'crm_manual_status', v.id, { status });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
router.get('/api/export', requireLogin, allow('admin'), async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM respaldo_visits ORDER BY created_at DESC LIMIT 10000');
    res.setHeader('Content-Disposition', 'attachment; filename="respaldo-export.json"');
    res.type('json').send(JSON.stringify({
      exported_at: new Date().toISOString(), rows: rows.map(v => ({
        ...v, pretest_json: parseJson(v.pretest_json), fulltest_json: parseJson(v.fulltest_json),
        routing_json: parseJson(v.routing_json),
      })),
    }));
  } catch (error) { next(error); }
});
router.use('/api', (error, _req, res, _next) => {
  console.error('[respaldo]', error?.code || error?.message);
  if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un usuario con ese nombre.' });
  res.status(error?.status || 503).json({ error: respaldoErrorMessage(error) });
});

export function createRespaldoRouter() { return router; }
