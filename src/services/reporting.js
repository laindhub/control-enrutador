import { DateTime } from 'luxon';
import { pool } from '../db.js';
import { config } from '../config.js';
import { dateRangeUtc, nowLocal, toLocalIso } from '../time.js';

export function normalizeReportRange(fromValue, toValue) {
  const today = nowLocal().toISODate();
  const from = fromValue || today;
  const to = toValue || today;
  const start = DateTime.fromISO(from, { zone: config.timezone });
  const end = DateTime.fromISO(to, { zone: config.timezone });
  if (!start.isValid || !end.isValid || end < start) throw rangeError();
  const days = Math.floor(end.startOf('day').diff(start.startOf('day'), 'days').days) + 1;
  if (days > 366) throw rangeError('El rango máximo es de 366 días.');
  return { from, to, days, ...dateRangeUtc(from, to) };
}

export async function getReportData(range) {
  const [scheduledRows] = await pool.execute(
    `SELECT a.id, a.name, a.team, COUNT(DISTINCT s.work_date) AS scheduled_days
     FROM advisor_schedules s
     INNER JOIN advisors a ON a.id = s.advisor_id
     WHERE s.work_date BETWEEN ? AND ?
     GROUP BY a.id, a.name, a.team
     ORDER BY a.name`,
    [range.from, range.to],
  );

  const [attentionRows] = await pool.execute(
    `SELECT
       t.id,
       t.created_at,
       t.voided_at,
       a.id AS advisor_id,
       a.name AS advisor_name,
       a.team,
       o.id AS operator_id,
       o.name AS operator_name,
       vo.name AS voided_by_operator_name
     FROM attentions t
     INNER JOIN advisors a ON a.id = t.advisor_id
     INNER JOIN operators o ON o.id = t.operator_id
     LEFT JOIN operators vo ON vo.id = t.voided_by_operator_id
     WHERE t.created_at >= ? AND t.created_at < ?
     ORDER BY t.created_at ASC`,
    [range.startUtc, range.endUtc],
  );

  const active = attentionRows.filter((row) => !row.voided_at);
  const countsByAdvisor = new Map();
  const countsByOperator = new Map();
  const hourly = new Map(Array.from({ length: 12 }, (_, index) => [index + 10, 0]));

  for (const row of active) {
    countsByAdvisor.set(row.advisor_id, (countsByAdvisor.get(row.advisor_id) || 0) + 1);
    const operator = countsByOperator.get(row.operator_id) || {
      id: row.operator_id,
      name: row.operator_name,
      count: 0,
    };
    operator.count += 1;
    countsByOperator.set(row.operator_id, operator);
    const local = DateTime.fromSQL(row.created_at, { zone: 'utc' }).setZone(config.timezone);
    hourly.set(local.hour, (hourly.get(local.hour) || 0) + 1);
  }

  const advisors = scheduledRows.map((row) => ({
    id: row.id,
    name: row.name,
    team: row.team,
    scheduledDays: Number(row.scheduled_days),
    count: countsByAdvisor.get(row.id) || 0,
  }));
  const includedAdvisorIds = new Set(advisors.map(({ id }) => Number(id)));
  for (const row of active) {
    if (includedAdvisorIds.has(Number(row.advisor_id))) continue;
    includedAdvisorIds.add(Number(row.advisor_id));
    advisors.push({
      id: row.advisor_id,
      name: row.advisor_name,
      team: row.team,
      scheduledDays: 0,
      count: countsByAdvisor.get(row.advisor_id) || 0,
    });
  }
  const advisorCounts = advisors.map(({ count }) => count);
  const total = active.length;

  return {
    range,
    stats: {
      total,
      averageDaily: Number((total / range.days).toFixed(1)),
      highest: advisorCounts.length ? Math.max(...advisorCounts) : 0,
      lowest: advisorCounts.length ? Math.min(...advisorCounts) : 0,
      spread: advisorCounts.length ? Math.max(...advisorCounts) - Math.min(...advisorCounts) : 0,
      corrections: attentionRows.length - active.length,
    },
    advisors: advisors.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')),
    operators: [...countsByOperator.values()].sort((a, b) => b.count - a.count),
    hourly: [...hourly.entries()].map(([hour, count]) => ({ hour, count })),
    details: attentionRows.map((row) => ({
      ...row,
      created_at_local: toLocalIso(row.created_at),
      voided_at_local: toLocalIso(row.voided_at),
    })),
  };
}

function rangeError(message = 'El rango de fechas es inválido.') {
  const error = new Error(message);
  error.status = 400;
  return error;
}
