import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateAdvisorCounts } from '../src/metrics.js';

test('ordena por menor cantidad y luego alfabéticamente', () => {
  const result = decorateAdvisorCounts([
    { id: 1, name: 'Zoe', count: 2 },
    { id: 2, name: 'Ana', count: 0 },
    { id: 3, name: 'Bruno', count: 2 },
  ]);
  assert.deepEqual(result.advisors.map(({ name }) => name), ['Ana', 'Bruno', 'Zoe']);
});

test('usa alerta global únicamente con diferencia de tres o más', () => {
  const result = decorateAdvisorCounts([
    { id: 1, name: 'Ana', count: 5 },
    { id: 2, name: 'Bruno', count: 3 },
    { id: 3, name: 'Carla', count: 2 },
  ]);
  assert.equal(result.advisors.find(({ name }) => name === 'Bruno').level, 'red');
  assert.deepEqual(result.priorityNames, ['Carla']);
  assert.equal(result.spread, 3);
});
