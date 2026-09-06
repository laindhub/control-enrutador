import { pool } from './db.js';

export const bundledSchedulePresets = [
  {
    key: 'schedule_preset_2026_09_07_v1',
    monday: '2026-09-07',
    entries: [
      shift('Camila Gonzalez', '2026-09-07', '10:00', '19:00'),
      shift('Camila Gonzalez', '2026-09-08', '10:00', '19:00'),
      shift('Camila Gonzalez', '2026-09-11', '10:00', '19:00'),

      shift('Diana Florentin', '2026-09-07', '10:00', '19:00'),
      shift('Diana Florentin', '2026-09-08', '12:00', '21:00'),
      shift('Diana Florentin', '2026-09-10', '10:00', '19:00'),

      shift('Federico Correa', '2026-09-07', '12:00', '21:00'),
      shift('Federico Correa', '2026-09-09', '10:00', '19:00'),
      shift('Federico Correa', '2026-09-10', '10:00', '19:00'),

      shift('Matías Fernandez', '2026-09-07', '11:00', '20:00'),
      shift('Matías Fernandez', '2026-09-08', '11:00', '20:00'),
      shift('Matías Fernandez', '2026-09-10', '12:00', '21:00'),

      shift('Melina Zorondo', '2026-09-07', '10:00', '19:00'),
      shift('Melina Zorondo', '2026-09-09', '10:00', '19:00'),
      shift('Melina Zorondo', '2026-09-10', '10:00', '19:00'),

      shift('Milena Lezcano', '2026-09-07', '10:00', '19:00'),
      shift('Milena Lezcano', '2026-09-08', '10:00', '19:00'),
      shift('Milena Lezcano', '2026-09-10', '10:00', '19:00'),

      shift('Nicolas Espinosa', '2026-09-07', '10:00', '19:00'),
      shift('Nicolas Espinosa', '2026-09-08', '10:00', '19:00'),
      shift('Nicolas Espinosa', '2026-09-10', '10:00', '19:00'),

      shift('Samuel Lee', '2026-09-07', '11:00', '20:00'),
      shift('Samuel Lee', '2026-09-09', '11:00', '20:00'),
      shift('Samuel Lee', '2026-09-10', '11:00', '20:00'),
      shift('Samuel Lee', '2026-09-11', '11:00', '20:00'),

      shift('Sebastián Paglia', '2026-09-07', '10:00', '19:00'),
      shift('Sebastián Paglia', '2026-09-08', '10:00', '19:00'),
      shift('Sebastián Paglia', '2026-09-11', '11:00', '20:00'),
    ],
  },
];

export async function applyBundledSchedulePresets() {
  const connection = await pool.getConnection();
  try {
    for (const preset of bundledSchedulePresets) {
      await applyPreset(connection, preset);
    }
  } finally {
    connection.release();
  }
}

async function applyPreset(connection, preset) {
  await connection.beginTransaction();
  try {
    await connection.query("INSERT IGNORE INTO app_locks (lock_name) VALUES ('schedule_presets')");
    await connection.query("SELECT lock_name FROM app_locks WHERE lock_name = 'schedule_presets' FOR UPDATE");

    const [metaRows] = await connection.execute(
      'SELECT meta_value FROM system_meta WHERE meta_key = ? LIMIT 1',
      [preset.key],
    );
    if (metaRows[0]?.meta_value === 'applied') {
      await connection.commit();
      return;
    }

    const [advisorRows] = await connection.query('SELECT id, name FROM advisors');
    const advisorIds = new Map(advisorRows.map((advisor) => [normalizeName(advisor.name), advisor.id]));
    const missingNames = [...new Set(
      preset.entries
        .filter((entry) => !advisorIds.has(normalizeName(entry.advisor)))
        .map((entry) => entry.advisor),
    )];
    if (missingNames.length) {
      throw new Error(`No se pudo cargar el cronograma: faltan asesores (${missingNames.join(', ')}).`);
    }

    const sunday = addDays(preset.monday, 6);
    await connection.execute(
      'DELETE FROM advisor_schedules WHERE work_date BETWEEN ? AND ?',
      [preset.monday, sunday],
    );
    for (const entry of preset.entries) {
      await connection.execute(
        `INSERT INTO advisor_schedules
          (advisor_id, work_date, start_time, end_time, created_by)
         VALUES (?, ?, ?, ?, NULL)`,
        [advisorIds.get(normalizeName(entry.advisor)), entry.date, entry.start, entry.end],
      );
    }

    await connection.execute(
      `INSERT INTO system_meta (meta_key, meta_value) VALUES (?, 'applied')
       ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
      [preset.key],
    );
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, operator_id, action, entity_type, details)
       VALUES (NULL, NULL, 'schedule.week_preset_imported', 'schedule', ?)`,
      [JSON.stringify({ monday: preset.monday, entries: preset.entries.length, source: 'weekly-image' })],
    );
    await connection.commit();
    console.log(`Cronograma ${preset.monday} cargado (${preset.entries.length} turnos).`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function shift(advisor, date, start, end) {
  return { advisor, date, start, end };
}

function normalizeName(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-AR');
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
