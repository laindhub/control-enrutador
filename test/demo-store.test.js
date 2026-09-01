import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoStore, DemoStoreError } from '../src/demo-store.js';

const advisors = [
  { id: 1, name: 'Samuel Lee', team: 'Ventas', sort_order: 8 },
  { id: 2, name: 'Matías Gomez', team: 'Ventas', sort_order: 2 },
  { id: 3, name: 'Otra Asesora', team: 'Ventas', sort_order: 1 },
];

test('la demo recomienda a Samuel para potabilidad 64 o superior', () => {
  const store = new DemoStore({ now: () => Date.UTC(2026, 8, 1, 15, 0) });
  const snapshot = store.routerSnapshot({ room: 'charla1', advisors });
  const highLead = snapshot.leads.find((lead) => lead.potability >= 64);
  assert.equal(highLead.recommendation.name, 'Samuel Lee');
});

test('derivar suma y rechazar como N/A descuenta el contador demo', () => {
  let now = Date.UTC(2026, 8, 1, 15, 0);
  const store = new DemoStore({ now: () => now });
  store.routerSnapshot({ room: 'charla1', advisors });
  const before = store.countForAdvisor('Samuel Lee');

  store.derive({ leadId: 'demo-1', advisorName: 'Samuel Lee', operatorName: 'Nicole', advisors });
  assert.equal(store.countForAdvisor('Samuel Lee'), before + 1);

  now += 60_000;
  store.answerAssignment({ leadId: 'demo-1', advisorName: 'Samuel Lee', confirmed: false });
  assert.equal(store.countForAdvisor('Samuel Lee'), before);
  assert.equal(store.requireLead('demo-1').status, 'na');
});

test('corregir N/A a confirmada vuelve a sumar sin duplicar registros', () => {
  const store = new DemoStore({ now: () => Date.UTC(2026, 8, 1, 15, 0) });
  store.routerSnapshot({ room: 'charla1', advisors });
  store.derive({ leadId: 'demo-2', advisorName: 'Matías Gomez', operatorName: 'Keren', advisors });
  store.answerAssignment({ leadId: 'demo-2', advisorName: 'Matías Gomez', confirmed: false });
  const rejectedCount = store.countForAdvisor('Matías Gomez');

  store.correctAssignment({ leadId: 'demo-2', advisorName: 'Matías Gomez', confirmed: true });
  assert.equal(store.countForAdvisor('Matías Gomez'), rejectedCount + 1);
  assert.equal(store.requireLead('demo-2').status, 'confirmed');
});

test('impide que otro asesor responda una derivación ajena', () => {
  const store = new DemoStore({ now: () => Date.UTC(2026, 8, 1, 15, 0) });
  store.routerSnapshot({ room: 'charla1', advisors });
  store.derive({ leadId: 'demo-1', advisorName: 'Samuel Lee', operatorName: 'Nicole', advisors });
  assert.throws(
    () => store.answerAssignment({ leadId: 'demo-1', advisorName: 'Matías Gomez', confirmed: true }),
    DemoStoreError,
  );
});

test('permite cerrar una persona como retirada sin afectar contadores', () => {
  const store = new DemoStore({ now: () => Date.UTC(2026, 8, 1, 15, 0) });
  store.routerSnapshot({ room: 'charla2', advisors });
  const before = store.adminSnapshot({ advisors }).advisors.map(({ name, count }) => [name, count]);
  store.markDeparted({ leadId: 'demo-3', operatorName: 'Nicole', moment: 'during' });
  assert.equal(store.requireLead('demo-3').status, 'left_during');
  assert.deepEqual(store.adminSnapshot({ advisors }).advisors.map(({ name, count }) => [name, count]), before);
});
