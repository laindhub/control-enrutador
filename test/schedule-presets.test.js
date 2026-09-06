import test from 'node:test';
import assert from 'node:assert/strict';
import { bundledSchedulePresets } from '../src/schedule-presets.js';

test('la semana del 7 de septiembre contiene los 28 turnos de la imagen', () => {
  const [preset] = bundledSchedulePresets;

  assert.equal(preset.monday, '2026-09-07');
  assert.equal(preset.entries.length, 28);
  assert.deepEqual(
    [...new Set(preset.entries.map((entry) => entry.advisor))].sort(),
    [
      'Camila Gonzalez',
      'Diana Florentin',
      'Federico Correa',
      'Matías Fernandez',
      'Melina Zorondo',
      'Milena Lezcano',
      'Nicolas Espinosa',
      'Samuel Lee',
      'Sebastián Paglia',
    ].sort(),
  );
});

test('LIBRE, ACADEMIA y el fin de semana no crean turnos', () => {
  const [preset] = bundledSchedulePresets;
  const cells = new Set(preset.entries.map((entry) => `${entry.advisor}|${entry.date}`));

  assert.equal(cells.has('Camila Gonzalez|2026-09-10'), false);
  assert.equal(cells.has('Federico Correa|2026-09-08'), false);
  assert.equal(cells.has('Sebastián Paglia|2026-09-10'), false);
  assert.equal(preset.entries.some((entry) => entry.date >= '2026-09-12'), false);
});
