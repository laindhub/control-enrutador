import { DateTime } from 'luxon';
import { config } from './config.js';

export function nowLocal() {
  return DateTime.now().setZone(config.timezone);
}

export function localDayContext(at = nowLocal()) {
  const local = at.setZone(config.timezone);
  return {
    date: local.toISODate(),
    time: local.toFormat('HH:mm:ss'),
    startUtc: local.startOf('day').toUTC().toSQL({ includeOffset: false }),
    endUtc: local.plus({ days: 1 }).startOf('day').toUTC().toSQL({ includeOffset: false }),
  };
}

export function dateRangeUtc(from, to) {
  const start = DateTime.fromISO(from, { zone: config.timezone }).startOf('day');
  const end = DateTime.fromISO(to, { zone: config.timezone }).plus({ days: 1 }).startOf('day');
  if (!start.isValid || !end.isValid || end <= start) throw new Error('Rango de fechas inválido.');
  return {
    startUtc: start.toUTC().toSQL({ includeOffset: false }),
    endUtc: end.toUTC().toSQL({ includeOffset: false }),
  };
}

export function toLocalIso(utcSql) {
  if (!utcSql) return null;
  return DateTime.fromSQL(utcSql, { zone: 'utc' }).setZone(config.timezone).toISO();
}

export function weekMonday(isoDate) {
  const value = DateTime.fromISO(isoDate, { zone: config.timezone });
  if (!value.isValid) throw new Error('Fecha inválida.');
  return value.startOf('week').toISODate();
}

export function eachDayOfWeek(monday) {
  const start = DateTime.fromISO(monday, { zone: config.timezone });
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }).toISODate());
}
