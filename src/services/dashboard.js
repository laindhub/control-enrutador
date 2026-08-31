import { pool } from '../db.js';
import { decorateAdvisorCounts } from '../metrics.js';
import { localDayContext, toLocalIso } from '../time.js';

export async function getDashboard({ includeFinished = false } = {}) {
  const day = localDayContext();
  const timeClause = includeFinished
    ? 's.start_time <= ?'
    : 's.start_time <= ? AND s.end_time > ?';
  const timeValues = includeFinished ? [day.time] : [day.time, day.time];

  const [rows] = await pool.execute(
    `SELECT
      a.id,
      a.name,
      a.team,
      TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
      TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
      COUNT(t.id) AS count,
      MAX(t.created_at) AS last_at
    FROM advisor_schedules s
    INNER JOIN advisors a ON a.id = s.advisor_id AND a.active = TRUE
    LEFT JOIN attentions t
      ON t.advisor_id = a.id
      AND t.created_at >= ?
      AND t.created_at < ?
      AND t.voided_at IS NULL
    WHERE s.work_date = ? AND ${timeClause}
    GROUP BY a.id, a.name, a.team, s.start_time, s.end_time`,
    [day.startUtc, day.endUtc, day.date, ...timeValues],
  );

  const normalized = rows.map((row) => ({
    ...row,
    last_at: toLocalIso(row.last_at),
  }));
  return { ...decorateAdvisorCounts(normalized), localDate: day.date };
}

export async function advisorIsWorkingNow(advisorId, connection = pool) {
  const day = localDayContext();
  const [rows] = await connection.execute(
    `SELECT s.id
     FROM advisor_schedules s
     INNER JOIN advisors a ON a.id = s.advisor_id AND a.active = TRUE
     WHERE s.advisor_id = ? AND s.work_date = ?
       AND s.start_time <= ? AND s.end_time > ?
     LIMIT 1`,
    [advisorId, day.date, day.time, day.time],
  );
  return rows.length > 0;
}
