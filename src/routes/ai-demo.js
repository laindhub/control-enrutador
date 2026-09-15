import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { AiDemoStore } from '../ai-demo-store.js';
import { WelcomeDemoStore } from '../welcome-demo-store.js';
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
      const lead = await withSessionStore(req, (store) => store.receiveLeadMessage(req.params.id, req.body?.text, req.body?.requestId));
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/share-project', async (req, res, next) => {
    try {
      const lead = await withSessionStore(req, (store) => store.shareProject(
        req.params.id,
        req.body?.projectName,
        req.body?.text,
      ));
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/advance-time', async (req, res, next) => {
    try {
      const result = await withSessionStore(req, (store) => store.advanceTime(req.params.id, req.body?.hours));
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/send-welcome-video', async (req, res, next) => {
    try {
      const lead = await withSessionStore(req, (store) => store.sendWelcomeVideo(req.params.id));
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/welcome/snapshot', async (req, res, next) => {
    try {
      const initialized = Array.isArray(req.session.welcomeDemoClients) && req.session.welcomeDemoClients.length > 0;
      const store = welcomeStoreFromSession(req);
      if (!initialized) await persistWelcomeStore(req, store);
      return res.json(store.snapshot());
    } catch (error) {
      return next(error);
    }
  });

  router.post('/welcome/clients/:id/reply', async (req, res, next) => {
    try {
      const client = await withWelcomeSessionStore(req, (store) => store.receiveClientMessage(
        req.params.id,
        req.body?.text,
        req.body?.requestId,
      ));
      return res.json({ client });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/welcome/clients/:id/advance-time', async (req, res, next) => {
    try {
      const result = await withWelcomeSessionStore(req, (store) => store.advanceTime(req.params.id, req.body?.days));
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/welcome/clients/:id/handle', async (req, res, next) => {
    try {
      const client = await withWelcomeSessionStore(req, (store) => store.markHandled(req.params.id));
      return res.json({ client });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/welcome/reset', async (req, res, next) => {
    try {
      const snapshot = await withWelcomeSessionStore(req, (store) => store.reset());
      return res.json(snapshot);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/advisor-style', async (req, res, next) => {
    try {
      const result = await withSessionStore(req, (store) => store.updateAdvisorStyle(
        req.body?.advisorName,
        req.body || {},
      ));
      return res.json(result);
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
    store.restore(req.session.aiDemoLeads);
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

function welcomeStoreFromSession(req) {
  const store = new WelcomeDemoStore();
  if (Array.isArray(req.session.welcomeDemoClients)) {
    store.restore(req.session.welcomeDemoClients);
  }
  return store;
}

async function withWelcomeSessionStore(req, task) {
  const store = welcomeStoreFromSession(req);
  try {
    return await task(store);
  } finally {
    await persistWelcomeStore(req, store);
  }
}

async function persistWelcomeStore(req, store) {
  req.session.welcomeDemoClients = structuredClone(store.clients);
  await saveSession(req);
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
