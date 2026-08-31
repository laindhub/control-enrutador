import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { eachDayOfWeek, localDayContext, weekMonday } from '../src/time.js';
import { normalizeReportRange } from '../src/services/reporting.js';

test('convierte el día local de Buenos Aires a límites UTC', () => {
  const context = localDayContext(DateTime.fromISO('2026-08-31T10:30:00', { zone: 'America/Argentina/Buenos_Aires' }));
  assert.equal(context.date, '2026-08-31');
  assert.equal(context.time, '10:30:00');
  assert.match(context.startUtc, /^2026-08-31 03:00:00/);
  assert.match(context.endUtc, /^2026-09-01 03:00:00/);
});

test('calcula una semana completa de lunes a domingo', () => {
  const monday = weekMonday('2026-09-03');
  assert.equal(monday, '2026-08-31');
  assert.deepEqual(eachDayOfWeek(monday), [
    '2026-08-31',
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-04',
    '2026-09-05',
    '2026-09-06',
  ]);
});

test('limita los reportes a un año', () => {
  assert.throws(() => normalizeReportRange('2025-01-01', '2026-08-31'), /366 días/);
  const range = normalizeReportRange('2026-08-01', '2026-08-31');
  assert.equal(range.days, 31);
});
