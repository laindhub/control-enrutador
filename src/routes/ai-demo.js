import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { aiDemoStore } from '../ai-demo-store.js';
import { alphaRoleFor, listAlphaPeople, requireAlphaAccess, requireAlphaRole } from './demo.js';

export function createAiDemoRouter(io) {
  const router = Router();
  router.use(requireAuth, requireAlphaAccess, requireAlphaRole('ai'));

  aiDemoStore.setEmitter((event) => io.emit('demo-ai:changed', event));
  const timer = setInterval(() => {
    aiDemoStore.processDue().catch((error) => console.error('Demo IA: no se pudo procesar el seguimiento:', error));
  }, 1_500);
  timer.unref();

  router.get('/snapshot', async (_req, res, next) => {
    try {
      const advisors = await listAlphaPeople('advisor');
      return res.json(aiDemoStore.snapshot({ advisors }));
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads', (req, res, next) => {
    try {
      const lead = aiDemoStore.createLead(req.body || {});
      return res.status(201).json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/send-now', async (req, res, next) => {
    try {
      const lead = await aiDemoStore.sendInitial(req.params.id, { force: true });
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/reply', async (req, res, next) => {
    try {
      const lead = await aiDemoStore.receiveLeadMessage(req.params.id, req.body?.text);
      return res.json({ lead });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/leads/:id/handle', (req, res, next) => {
    try {
      return res.json({ lead: aiDemoStore.markHandled(req.params.id) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/reset', (_req, res) => {
    aiDemoStore.reset();
    return res.status(204).end();
  });

  return router;
}

export function requireAiDemoPage(req, res, next) {
  if (alphaRoleFor(req) === 'ai') return next();
  return res.redirect('/demo');
}
