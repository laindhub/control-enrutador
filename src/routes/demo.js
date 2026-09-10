import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { invalidateSession, requireAuth } from '../auth.js';
import { destinationForUser } from '../navigation.js';
import { demoStore } from '../demo-store.js';

const ALPHA_ROLES = new Set(['admin', 'router', 'advisor']);
const DEMO_ROLES = new Set([...ALPHA_ROLES, 'ai']);

export function canAccessAlpha(req) {
  if (req.session.user?.role === 'demo') return true;
  if (req.session.user?.role === 'ai_demo') return true;
  return config.alphaProductionEnabled && ALPHA_ROLES.has(req.session.user?.role);
}

export function alphaRoleFor(req) {
  if (req.session.user?.role === 'ai_demo') return 'ai';
  if (req.session.user?.role === 'demo') {
    return DEMO_ROLES.has(req.session.demoRole) ? req.session.demoRole : null;
  }
  return config.alphaProductionEnabled && ALPHA_ROLES.has(req.session.user?.role)
    ? req.session.user.role
    : null;
}

export function requireAlphaAccess(req, res, next) {
  if (canAccessAlpha(req)) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(403).json({ error: 'La versión alfa no está habilitada.' });
  const destination = destinationForUser(req.session.user, { hasOperator: Boolean(req.session.operator) });
  if (destination === '/login') return invalidateSession(req, res, next);
  if (destination === req.path) return invalidateSession(req, res, next);
  return res.redirect(destination);
}

export function requireAlphaRole(role) {
  return (req, res, next) => {
    if (alphaRoleFor(req) === role) return next();
    return res.status(403).json({ error: 'El perfil demo seleccionado no permite esta acción.' });
  };
}

function requireAlphaIdentity(kind) {
  return (req, res, next) => {
    if (req.session.demoIdentity?.kind === kind) return next();
    return res.status(409).json({ error: `Seleccioná qué ${kind === 'router' ? 'enrutador' : 'asesor'} está operando.` });
  };
}

export async function listAlphaPeople(kind) {
  if (kind === 'router') {
    const [rows] = await pool.query(
      'SELECT id, name FROM operators WHERE active = TRUE ORDER BY sort_order, name',
    );
    return rows;
  }
  const [rows] = await pool.query(
    'SELECT id, name, team, sort_order FROM advisors WHERE active = TRUE ORDER BY sort_order, name',
  );
  return rows;
}

export function createDemoRouter(io) {
  const router = Router();
  router.use(requireAuth, requireAlphaAccess);

  router.get('/snapshot', async (req, res, next) => {
    try {
      const role = alphaRoleFor(req);
      if (!role) return res.status(409).json({ error: 'Seleccioná un perfil demo.' });
      const advisors = await listAlphaPeople('advisor');
      if (role === 'admin') return res.json(demoStore.adminSnapshot({ advisors }));

      const identity = req.session.demoIdentity;
      if (!identity || identity.kind !== role) {
        return res.status(409).json({ error: `Seleccioná qué ${role === 'router' ? 'enrutador' : 'asesor'} está operando.` });
      }
      if (role === 'router') {
        const presenters = await listAlphaPeople('router');
        return res.json({ ...demoStore.routerSnapshot({ room: req.query.room, advisors }), presenters });
      }
      return res.json(demoStore.advisorSnapshot({ advisorName: identity.name, advisors }));
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/leads/:id/appearance', requireAlphaRole('router'), requireAlphaIdentity('router'), (req, res, next) => {
    try {
      const lead = demoStore.updateAppearance({
        leadId: req.params.id,
        appearance: req.body.appearance,
        operatorName: req.session.demoIdentity.name,
      });
      emitChange(io, 'appearance');
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/derive', requireAlphaRole('router'), requireAlphaIdentity('router'), async (req, res, next) => {
    try {
      const [advisors, presenters] = await Promise.all([
        listAlphaPeople('advisor'),
        listAlphaPeople('router'),
      ]);
      const lead = demoStore.derive({
        leadId: req.params.id,
        advisorName: String(req.body.advisorName || ''),
        presenterName: String(req.body.presenterName || ''),
        operatorName: req.session.demoIdentity.name,
        advisors,
        presenters,
      });
      emitChange(io, 'derived');
      return res.status(201).json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/depart', requireAlphaRole('router'), requireAlphaIdentity('router'), (req, res, next) => {
    try {
      const lead = demoStore.markDeparted({
        leadId: req.params.id,
        operatorName: req.session.demoIdentity.name,
        moment: req.body.moment,
      });
      emitChange(io, 'departed');
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/answer', requireAlphaRole('advisor'), requireAlphaIdentity('advisor'), (req, res, next) => {
    try {
      const lead = demoStore.answerAssignment({
        leadId: req.params.id,
        advisorName: req.session.demoIdentity.name,
        confirmed: req.body.confirmed === true,
        reason: req.body.reason,
      });
      emitChange(io, 'answered');
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/correct', requireAlphaRole('advisor'), requireAlphaIdentity('advisor'), (req, res, next) => {
    try {
      const lead = demoStore.correctAssignment({
        leadId: req.params.id,
        advisorName: req.session.demoIdentity.name,
        confirmed: req.body.confirmed === true,
        reason: req.body.reason,
      });
      emitChange(io, 'corrected');
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/leads/:id/reason', requireAlphaRole('advisor'), requireAlphaIdentity('advisor'), (req, res, next) => {
    try {
      const lead = demoStore.updateRejectionReason({
        leadId: req.params.id,
        advisorName: req.session.demoIdentity.name,
        reason: req.body.reason,
      });
      emitChange(io, 'reason');
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/reset', requireAlphaRole('admin'), (req, res) => {
    demoStore.reset('Administración demo');
    emitChange(io, 'reset');
    return res.status(204).end();
  });

  return router;
}

function emitChange(io, reason) {
  io.emit('demo:changed', { reason });
}
