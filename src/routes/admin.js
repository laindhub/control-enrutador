import { Router } from 'express';
import ExcelJS from 'exceljs';
import { DateTime } from 'luxon';
import { requireAuth, requireRole } from '../auth.js';
import { pool, withTransaction } from '../db.js';
import { writeAudit } from '../audit.js';
import { eachDayOfWeek, weekMonday } from '../time.js';
import { getReportData, normalizeReportRange } from '../services/reporting.js';

export function createAdminRouter(io) {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/people', async (_req, res) => {
    const [advisors, operators] = await Promise.all([
      pool.query('SELECT id, name, team, active FROM advisors ORDER BY active DESC, sort_order, name'),
      pool.query('SELECT id, name, active FROM operators ORDER BY active DESC, sort_order, name'),
    ]);
    res.json({ advisors: advisors[0], operators: operators[0] });
  });

  router.post('/people/:kind', async (req, res, next) => {
    try {
      const table = tableForKind(req.params.kind);
      const name = cleanName(req.body.name);
      const team = req.params.kind === 'advisors' ? cleanTeam(req.body.team) : null;
      if (!name) return res.status(400).json({ error: 'Ingresá un nombre.' });
      const result = await withTransaction(async (connection) => {
        const [insert] =
          table === 'advisors'
            ? await connection.execute('INSERT INTO advisors (name, team) VALUES (?, ?)', [name, team])
            : await connection.execute('INSERT INTO operators (name) VALUES (?)', [name]);
        await writeAudit(connection, {
          userId: req.session.user.id,
          action: `${table}.created`,
          entityType: table,
          entityId: insert.insertId,
          details: { name, team },
        });
        return { id: insert.insertId, name, team, active: 1 };
      });
      io.emit('dashboard:changed', { reason: 'people-created' });
      res.status(201).json(result);
    } catch (error) {
      next(mapDuplicateError(error));
    }
  });

  router.patch('/people/:kind/:id', async (req, res, next) => {
    try {
      const table = tableForKind(req.params.kind);
      const id = positiveInteger(req.params.id);
      const name = cleanName(req.body.name);
      const active = req.body.active === true || req.body.active === 1;
      const team = table === 'advisors' ? cleanTeam(req.body.team) : null;
      if (!id || !name) return res.status(400).json({ error: 'Datos inválidos.' });
      await withTransaction(async (connection) => {
        const [beforeRows] = await connection.execute(`SELECT * FROM ${table} WHERE id = ? FOR UPDATE`, [id]);
        if (!beforeRows.length) {
          const error = new Error('Registro inexistente.');
          error.status = 404;
          throw error;
        }
        if (table === 'advisors') {
          await connection.execute('UPDATE advisors SET name = ?, team = ?, active = ? WHERE id = ?', [
            name,
            team,
            active,
            id,
          ]);
        } else {
          await connection.execute('UPDATE operators SET name = ?, active = ? WHERE id = ?', [name, active, id]);
        }
        await writeAudit(connection, {
          userId: req.session.user.id,
          action: `${table}.updated`,
          entityType: table,
          entityId: id,
          details: { before: beforeRows[0], after: { name, team, active } },
        });
      });
      io.emit('dashboard:changed', { reason: 'people-updated' });
      res.json({ id, name, team, active });
    } catch (error) {
      next(mapDuplicateError(error));
    }
  });

  router.get('/schedule', async (req, res, next) => {
    try {
      const monday = weekMonday(req.query.week || DateTime.now().toISODate());
      const days = eachDayOfWeek(monday);
      const [advisors, rows] = await Promise.all([
        pool.query('SELECT id, name, team FROM advisors WHERE active = TRUE ORDER BY sort_order, name'),
        pool.execute(
          `SELECT advisor_id, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
                  TIME_FORMAT(start_time, '%H:%i') AS start_time,
                  TIME_FORMAT(end_time, '%H:%i') AS end_time
           FROM advisor_schedules WHERE work_date BETWEEN ? AND ?`,
          [days[0], days[6]],
        ),
      ]);
      res.json({ monday, days, advisors: advisors[0], entries: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.put('/schedule', async (req, res, next) => {
    try {
      const monday = weekMonday(req.body.monday);
      const days = eachDayOfWeek(monday);
      const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
      if (entries.length > 200) return res.status(400).json({ error: 'Hay demasiados horarios.' });
      const normalized = entries.map((entry) => validateScheduleEntry(entry, days));

      await withTransaction(async (connection) => {
        await connection.execute('DELETE FROM advisor_schedules WHERE work_date BETWEEN ? AND ?', [
          days[0],
          days[6],
        ]);
        for (const entry of normalized) {
          await connection.execute(
            `INSERT INTO advisor_schedules
              (advisor_id, work_date, start_time, end_time, created_by)
             SELECT id, ?, ?, ?, ? FROM advisors WHERE id = ? AND active = TRUE`,
            [entry.date, entry.start, entry.end, req.session.user.id, entry.advisorId],
          );
        }
        await writeAudit(connection, {
          userId: req.session.user.id,
          action: 'schedule.week_replaced',
          entityType: 'schedule',
          details: { monday, entries: normalized.length },
        });
      });
      io.emit('dashboard:changed', { reason: 'schedule-updated' });
      res.json({ monday, saved: normalized.length });
    } catch (error) {
      next(mapScheduleSaveError(error));
    }
  });

  router.get('/reports', async (req, res, next) => {
    try {
      const range = normalizeReportRange(req.query.from, req.query.to);
      const report = await getReportData(range);
      res.json({
        ...report,
        details: undefined,
        recentDetails: report.details.slice(-200).reverse(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/attentions/:id/void', async (req, res, next) => {
    try {
      const attentionId = positiveInteger(req.params.id);
      if (!attentionId) return res.status(400).json({ error: 'Atención inválida.' });
      await withTransaction(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT t.id, t.created_at, t.voided_at, t.advisor_id, t.operator_id,
                  a.name AS advisor_name, o.name AS operator_name
           FROM attentions t
           INNER JOIN advisors a ON a.id = t.advisor_id
           INNER JOIN operators o ON o.id = t.operator_id
           WHERE t.id = ? LIMIT 1 FOR UPDATE`,
          [attentionId],
        );
        const attention = rows[0];
        if (!attention) {
          const error = new Error('La atención no existe.');
          error.status = 404;
          throw error;
        }
        if (attention.voided_at) {
          const error = new Error('La atención ya fue corregida.');
          error.status = 409;
          throw error;
        }
        await connection.execute(
          'UPDATE attentions SET voided_at = UTC_TIMESTAMP(3), voided_by_user_id = ? WHERE id = ?',
          [req.session.user.id, attentionId],
        );
        await writeAudit(connection, {
          userId: req.session.user.id,
          action: 'attention.admin_voided',
          entityType: 'attention',
          entityId: attentionId,
          details: {
            advisorId: attention.advisor_id,
            advisorName: attention.advisor_name,
            originalOperatorId: attention.operator_id,
            originalOperatorName: attention.operator_name,
            originalCreatedAt: attention.created_at,
          },
        });
      });
      io.emit('dashboard:changed', { reason: 'attention-admin-voided' });
      res.json({ voidedId: attentionId });
    } catch (error) {
      next(error);
    }
  });

  router.get('/audit', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 50;
    const offset = (page - 1) * pageSize;
    const [rows] = await pool.execute(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.created_at,
              u.username, o.name AS operator_name
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       LEFT JOIN operators o ON o.id = l.operator_id
       ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [pageSize, offset],
    );
    res.json({ page, rows: rows.map(normalizeAuditRow) });
  });

  router.get('/export.xlsx', async (req, res, next) => {
    try {
      const range = normalizeReportRange(req.query.from, req.query.to);
      const report = await getReportData(range);
      const workbook = buildWorkbook(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="control-enrutador_${range.from}_${range.to}.xlsx"`,
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function buildWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Control Enrutador — Más Dueños';
  workbook.created = new Date();

  addSheet(
    workbook,
    'Resumen por asesor',
    ['Asesor', 'Equipo', 'Días programados', 'Atenciones', 'Promedio por día programado'],
    report.advisors.map((item) => [
      item.name,
      item.team,
      item.scheduledDays,
      item.count,
      item.scheduledDays ? Number((item.count / item.scheduledDays).toFixed(2)) : 0,
    ]),
  );
  addSheet(
    workbook,
    'Por enrutador',
    ['Enrutador', 'Atenciones registradas'],
    report.operators.map((item) => [item.name, item.count]),
  );
  addSheet(
    workbook,
    'Detalle',
    ['ID', 'Fecha y hora', 'Asesor', 'Equipo', 'Enrutador', 'Estado'],
    report.details.map((item) => [
      item.id,
      formatLocalDate(item.created_at_local),
      item.advisor_name,
      item.team,
      item.operator_name,
      item.voided_at ? 'Corregida' : 'Válida',
    ]),
  );
  addSheet(
    workbook,
    'Correcciones',
    ['ID', 'Registro original', 'Asesor', 'Enrutador original', 'Corregido por', 'Fecha corrección'],
    report.details
      .filter((item) => item.voided_at)
      .map((item) => [
        item.id,
        formatLocalDate(item.created_at_local),
        item.advisor_name,
        item.operator_name,
        item.voided_by_operator_name || '',
        formatLocalDate(item.voided_at_local),
      ]),
  );
  return workbook;
}

function addSheet(workbook, name, headers, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C2B' } };
  sheet.autoFilter = { from: 'A1', to: `${columnLetter(headers.length)}1` };
  sheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      width = Math.max(width, String(cell.value ?? '').length + 2);
    });
    column.width = Math.min(width, 42);
  });
}

function columnLetter(number) {
  let value = number;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function formatLocalDate(value) {
  return value ? DateTime.fromISO(value).toFormat('dd/LL/yyyy HH:mm:ss') : '';
}

function tableForKind(kind) {
  if (kind === 'advisors') return 'advisors';
  if (kind === 'operators') return 'operators';
  const error = new Error('Tipo de persona inválido.');
  error.status = 400;
  throw error;
}

function validateScheduleEntry(entry, validDays) {
  const advisorId = positiveInteger(entry.advisorId);
  const date = String(entry.date || '');
  const start = normalizeTime(entry.start);
  const end = normalizeTime(entry.end);
  if (!advisorId || !validDays.includes(date) || !start || !end || start >= end) {
    const error = new Error('Uno de los horarios es inválido.');
    error.status = 400;
    throw error;
  }
  return { advisorId, date, start, end };
}

function normalizeTime(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}:00` : null;
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function cleanTeam(value) {
  return String(value || 'Ventas').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Ventas';
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function mapScheduleSaveError(error) {
  if (error?.status && error.status < 500) return error;

  const code = String(error?.code || 'SCHEDULE_SAVE_FAILED');
  const messages = {
    ER_LOCK_DEADLOCK: 'La base estaba ocupada al guardar los horarios. Reintentá ahora.',
    ER_LOCK_WAIT_TIMEOUT: 'La base demoró demasiado en liberar los horarios. Reintentá ahora.',
    ER_NO_REFERENCED_ROW_2: 'Uno de los asesores o la sesión de administración cambió. Recargá Personal y volvé a importar.',
    ER_DUP_ENTRY: 'Se detectó un horario duplicado. Recargá la página y volvé a importar.',
    ER_TRUNCATED_WRONG_VALUE: 'La base rechazó uno de los horarios. Revisá el formato e intentá de nuevo.',
    ER_DATA_TOO_LONG: 'La base rechazó un dato de los horarios.',
    ER_BAD_NULL_ERROR: 'Falta un dato requerido para guardar los horarios.',
    ECONNRESET: 'La conexión con la base se interrumpió. Reintentá ahora.',
    ETIMEDOUT: 'La conexión con la base demoró demasiado. Reintentá ahora.',
    PROTOCOL_CONNECTION_LOST: 'La conexión con la base se interrumpió. Reintentá ahora.',
  };
  const safeCode = /^[A-Z0-9_]{2,80}$/.test(code) ? code : 'SCHEDULE_SAVE_FAILED';
  const mapped = new Error(
    messages[safeCode] || `No se pudo guardar la semana. Código de diagnóstico: ${safeCode}.`,
  );
  mapped.status = ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(safeCode) ? 409 : 503;
  mapped.publicMessage = mapped.message;
  return mapped;
}

function mapDuplicateError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    const mapped = new Error('Ya existe una persona con ese nombre.');
    mapped.status = 409;
    return mapped;
  }
  return error;
}

function normalizeAuditRow(row) {
  let details = row.details;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      details = null;
    }
  }
  return { ...row, details };
}
