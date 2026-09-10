import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { AiDemoStore } from '../ai-demo-store.js';
import { alphaRoleFor, listAlphaPeople, requireAlphaAccess, requireAlphaRole } from './demo.js';

export function createAiDemoRouter() {
  const router = Router();
  router.use(requireAuth, requireAlphaAccess, requireAlphaRole('ai'));

  router.get('/snapshot', async (req, res, next) => {
    try {
      const advisors = await listAlphaPeople('advisor');
      const store = storeFromSession(req);
      const beforeProcessing = JSON.stringify(store.leads);
      await store.processDue();

      // Un GET no debe reescribir la sesión salvo que realmente haya procesado
      // un mensaje pendiente. En despliegues con más de una instancia, guardar
      // siempre desde el polling podía pisar el POST que acababa de crear un lead.
      if (JSON.stringify(store.leads) !== beforeProcessing) {
        await persistStore(req, store);
      }

      const snapshot = store.snapshot({ advisors });
      return res.json(snapshot);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads', async (req, res, next) => {
    try {
      const lead = await withSessionStore(req, (store) => store.createLead(req.body || {}));
      return res.status(201).json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/send-now', async (req, res, next) => {
    try {
      const lead = await withSessionStore(req, (store) => store.sendInitial(req.params.id, { force: true }));
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/reply', async (req, res, next) => {
    try {
      const lead = await withSessionStore(req, (store) => store.receiveLeadMessage(req.params.id, req.body?.text));
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/handle', async (req, res, next) => {
    try {
      const lead = await withSessionStore(req, (store) => store.markHandled(req.params.id));
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/reset', async (req, res, next) => {
    try {
      await withSessionStore(req, (store) => store.reset());
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

function storeFromSession(req) {
  const store = new AiDemoStore();
  if (Array.isArray(req.session.aiDemoLeads)) {
    store.leads = structuredClone(req.session.aiDemoLeads);
  }
  return store;
}

async function withSessionStore(req, task) {
  const store = storeFromSession(req);
  try {
    return await task(store);
  } finally {
    await persistStore(req, store);
  }
}

async function persistStore(req, store) {
  req.session.aiDemoLeads = structuredClone(store.leads);
  await saveSession(req);
}

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));
}

export function requireAiDemoPage(req, res, next) {
  if (alphaRoleFor(req) === 'ai') return next();
  return res.redirect('/demo');
}
