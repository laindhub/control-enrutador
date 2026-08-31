import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAuth, requireOperator, requireRole } from '../auth.js';
import { writeAudit } from '../audit.js';
import { advisorIsWorkingNow, getDashboard } from '../services/dashboard.js';
import { localDayContext } from '../time.js';

class RecentAttentionError extends Error {
  constructor(lastAttention) {
    super('Hay una atención reciente.');
    this.lastAttention = lastAttention;
  }
}

export function createApiRouter(io) {
  const router = Router();

  router.use(requireAuth);

  router.get('/operators', requireRole('router'), async (_req, res) => {
    const [rows] = await pool.query(
      'SELECT id, name FROM operators WHERE active = TRUE ORDER BY sort_order, name',
    );
    res.json({ operators: rows });
  });

  router.post('/operator', requireRole('router'), async (req, res) => {
    const operatorId = positiveInteger(req.body.operatorId);
    if (!operatorId) return res.status(400).json({ error: 'Seleccioná un enrutador válido.' });
    const [rows] = await pool.execute('SELECT id, name FROM operators WHERE id = ? AND active = TRUE', [
      operatorId,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'El enrutador no está disponible.' });
    req.session.operator = rows[0];
    await saveSession(req);
    return res.json({ operator: rows[0] });
  });

  router.delete('/operator', requireRole('router'), (req, res, next) => {
    delete req.session.operator;
    req.session.save((error) => (error ? next(error) : res.status(204).end()));
  });

  router.get(
    '/dashboard',
    requireRole('router'),
    requireOperator,
    async (req, res) => {
      const [current, started] = await Promise.all([
        getDashboard(),
        req.query.edit === '1' ? getDashboard({ includeFinished: true }) : Promise.resolve(null),
      ]);
      res.json({
        ...current,
        correctionAdvisors: started?.advisors || [],
        operator: req.session.operator,
      });
    },
  );

  router.post(
    '/attentions',
    requireRole('router'),
    requireOperator,
    async (req, res, next) => {
      const advisorId = positiveInteger(req.body.advisorId);
      const acknowledgeRecent = req.body.acknowledgeRecent === true;
      if (!advisorId) return res.status(400).json({ error: 'Asesor inválido.' });

      try {
        const result = await withTransaction(async (connection) => {
          await connection.query(
            "SELECT lock_name FROM app_locks WHERE lock_name = 'attention_create' FOR UPDATE",
          );
          if (!(await advisorIsWorkingNow(advisorId, connection))) {
            const error = new Error('El asesor no se encuentra dentro de su horario actual.');
            error.status = 409;
            throw error;
          }

          const day = localDayContext();
          const [recentRows] = await connection.execute(
            `SELECT t.id, t.created_at, a.name AS advisor_name
             FROM attentions t
             INNER JOIN advisors a ON a.id = t.advisor_id
             WHERE t.created_at >= ? AND t.created_at < ? AND t.voided_at IS NULL
             ORDER BY t.created_at DESC LIMIT 1`,
            [day.startUtc, day.endUtc],
          );
          const recent = recentRows[0];
          if (recent && !acknowledgeRecent) {
            const [ageRows] = await connection.execute(
              'SELECT TIMESTAMPDIFF(SECOND, ?, UTC_TIMESTAMP(3)) AS age_seconds',
              [recent.created_at],
            );
            if (Number(ageRows[0].age_seconds) < 180) {
              throw new RecentAttentionError({
                advisorName: recent.advisor_name,
                secondsAgo: Math.max(0, Number(ageRows[0].age_seconds)),
              });
            }
          }

          const [insert] = await connection.execute(
            `INSERT INTO attentions (advisor_id, operator_id, created_by_user_id)
             VALUES (?, ?, ?)`,
            [advisorId, req.session.operator.id, req.session.user.id],
          );
          await writeAudit(connection, {
            userId: req.session.user.id,
            operatorId: req.session.operator.id,
            action: 'attention.created',
            entityType: 'attention',
            entityId: insert.insertId,
            details: { advisorId },
          });
          return { id: insert.insertId };
        });
        io.emit('dashboard:changed', { reason: 'attention-created' });
        return res.status(201).json(result);
      } catch (error) {
        if (error instanceof RecentAttentionError) {
          return res.status(409).json({
            error: 'Se registró otra atención hace menos de 3 minutos.',
            requiresRecentConfirmation: true,
            lastAttention: error.lastAttention,
          });
        }
        return next(error);
      }
    },
  );

  router.post(
    '/attentions/decrement',
    requireRole('router'),
    requireOperator,
    async (req, res, next) => {
      const advisorId = positiveInteger(req.body.advisorId);
      if (!advisorId) return res.status(400).json({ error: 'Asesor inválido.' });
      try {
        const result = await withTransaction(async (connection) => {
          const day = localDayContext();
          const [rows] = await connection.execute(
            `SELECT t.id, t.created_at, t.operator_id, o.name AS original_operator_name
             FROM attentions t
             INNER JOIN operators o ON o.id = t.operator_id
             WHERE t.advisor_id = ?
               AND t.created_at >= ? AND t.created_at < ?
               AND t.voided_at IS NULL
             ORDER BY t.created_at DESC LIMIT 1 FOR UPDATE`,
            [advisorId, day.startUtc, day.endUtc],
          );
          const attention = rows[0];
          if (!attention) {
            const error = new Error('Ese asesor no tiene atenciones activas para corregir hoy.');
            error.status = 409;
            throw error;
          }
          await connection.execute(
            `UPDATE attentions
             SET voided_at = UTC_TIMESTAMP(3), voided_by_operator_id = ?, voided_by_user_id = ?
             WHERE id = ?`,
            [req.session.operator.id, req.session.user.id, attention.id],
          );
          await writeAudit(connection, {
            userId: req.session.user.id,
            operatorId: req.session.operator.id,
            action: 'attention.voided',
            entityType: 'attention',
            entityId: attention.id,
            details: {
              advisorId,
              originalOperatorId: attention.operator_id,
              originalOperatorName: attention.original_operator_name,
              originalCreatedAt: attention.created_at,
            },
          });
          return { voidedId: attention.id };
        });
        io.emit('dashboard:changed', { reason: 'attention-voided' });
        return res.json(result);
      } catch (error) {
        return next(error);
      }
    },
  );

  return router;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));
}
