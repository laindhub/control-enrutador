import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreFullTest } from '../src/respaldo/scoring.js';

test('PDF reference: 61 points and qualifies at ARS 200000', () => {
  const result = scoreFullTest({
    age: 22, urgencia: 'Me gustaría pero no es urgente',
    miedo_estafas: 'Sí, aunque nunca fui estafado',
    conoce_spazios: 'No', conoce_tapiola: 'Sí',
    situacion_laboral: 'Relación de dependencia',
    tipo_propiedad: 'Departamento',
    ubicaciones: [], tiene_ahorros: 'No', cuota_posible_ars: 200000,
    quien_decide: 'Yo solo',
  });
  assert.equal(result.points, 61);
  assert.equal(result.qualifies, true);
});
test('verdict uses quota 170000, not profile score', () => {
  assert.equal(scoreFullTest({ cuota_posible_ars: 169999 }).qualifies, false);
  assert.equal(scoreFullTest({ cuota_posible_ars: 170000 }).qualifies, true);
});
test('low-scoring results preserve unanswered fields distinctly', () => {
  const result = scoreFullTest({});
  assert.equal(result.points, 18);
  assert.equal(result.qualifies, false);
});
