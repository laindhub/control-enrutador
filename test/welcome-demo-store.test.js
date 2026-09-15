import test from 'node:test';
import assert from 'node:assert/strict';
import { WelcomeDemoStore } from '../src/welcome-demo-store.js';

test('Bienvenida genera 20 clientes ficticios con contacto, contexto y avance del plan', () => {
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000 });
  const snapshot = store.snapshot();
  assert.equal(snapshot.clients.length, 20);
  assert.equal(new Set(snapshot.clients.map(({ id }) => id)).size, 20);
  for (const client of snapshot.clients) {
    assert.match(client.name, /\S+ \S+/);
    assert.match(client.phone, /^\+54 9 11/);
    assert.match(client.email, /@demo\.com$/);
    assert.ok(client.context.length > 30);
    assert.ok(client.objective.length > 10);
    assert.ok(client.plan.totalPaidArs > 0);
    assert.ok(client.plan.contributionCount >= 1);
    assert.ok(client.plan.progressPercent >= 1 && client.plan.progressPercent <= 96);
    assert.equal(client.plan.targetDownPaymentUsd, 10_000);
    assert.equal(client.plan.usdReferenceArs, 1530);
    assert.equal(client.plan.targetDownPaymentArs, 15_300_000);
    assert.equal(
      client.plan.progressPercent,
      Math.round((client.plan.totalPaidArs / client.plan.targetDownPaymentArs) * 100),
    );
    assert.equal(client.plan.monthlyBaseArs, 200_000);
    assert.ok(client.messages.length >= 3);
    assert.ok(client.messages
      .filter(({ role }) => role === 'client')
      .every(({ text }) => !/^(Le preocupa|Quiere entender|Necesita acompañamiento|Está motivado|Consulta seguido|Tuvo un mes difícil|Valora recibir|Quiere saber)/.test(text)));
  }
  assert.ok(snapshot.metrics.retentionAverage >= 20 && snapshot.metrics.retentionAverage <= 99);
  assert.equal(snapshot.metrics.activePlans, 20);
});

test('migra el contexto interno heredado fuera del chat del cliente', () => {
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000 });
  const legacy = store.snapshot().clients[0];
  legacy.plan.progressPercent = 80;
  legacy.plan.totalPaidArs = 1_977_210;
  legacy.messages.push({
    id: 'legacy-context-message',
    role: 'client',
    text: 'Necesita acompañamiento para mantener la constancia sin sentirse presionado.',
    createdAt: 1_800_000_000_000,
  });
  store.restore([legacy]);
  const restored = store.snapshot().clients[0];
  assert.equal(restored.messages.some(({ id }) => id === 'legacy-context-message'), false);
  assert.equal(restored.plan.targetDownPaymentArs, 15_300_000);
  assert.equal(restored.plan.progressPercent, 13);
  assert.match(restored.context, /Necesita acompañamiento|Busca/);
  assert.ok(restored.notes.some(({ title }) => title === 'Contexto inicial'));
});

test('el chat de retención registra el mensaje una sola vez y actualiza la ficha', async () => {
  let calls = 0;
  const generate = async () => {
    calls += 1;
    return {
      message: 'Gracias por contármelo. Voy a acompañarte para revisar tu situación sin prometer cambios de condiciones. ¿Querés que lo vea una persona del equipo?',
      note: 'El cliente expresó una dificultad y se recomendó acompañamiento personal.',
      requiresHuman: true,
      retentionDelta: -6,
      intent: 'dificultad de pago',
      nextAction: 'Contactar personalmente al cliente',
      generatedBy: 'Generado por IA',
    };
  };
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000, generate });
  const id = store.clients[0].id;
  const first = await store.receiveClientMessage(id, 'Este mes se me complicó el aporte.', 'welcome-request-1');
  const replay = await store.receiveClientMessage(id, 'Este mes se me complicó el aporte.', 'welcome-request-1');

  assert.equal(calls, 1);
  assert.equal(first.messages.filter(({ clientRequestId }) => clientRequestId === 'welcome-request-1').length, 1);
  assert.equal(replay.messages.filter(({ replyToRequestId }) => replyToRequestId === 'welcome-request-1').length, 1);
  assert.equal(replay.status, 'attention');
  assert.equal(replay.requiresHuman, true);
  assert.equal(replay.nextAction, 'Contactar personalmente al cliente');
});

test('simular una semana genera seguimiento y la intervención personal toma el caso', async () => {
  const generate = async ({ kind }) => ({
    message: kind === 'followup'
      ? 'Hola, quería saber cómo venís con el plan y si necesitás revisar algo.'
      : 'Gracias por escribir.',
    note: 'Seguimiento preventivo.',
    requiresHuman: false,
    retentionDelta: 1,
    intent: 'seguimiento preventivo',
    nextAction: 'Esperar respuesta',
    generatedBy: 'Generado por IA',
  });
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000, generate });
  const id = store.clients[1].id;
  const result = await store.advanceTime(id, 7);
  assert.equal(result.outcome, 'followup');
  assert.match(result.client.messages.at(-1).text, /cómo venís con el plan/);
  assert.ok(result.client.messages.some(({ role }) => role === 'time'));

  const handled = store.markHandled(id);
  assert.equal(handled.status, 'human');
  assert.match(handled.nextAction, /Seguimiento personal asignado/);
  assert.match(handled.notes[0].title, /Intervención personal/);
});

test('regenerar reemplaza la muestra manteniendo veinte clientes', () => {
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000 });
  const previousIds = new Set(store.clients.map(({ id }) => id));
  const snapshot = store.reset();
  assert.equal(snapshot.clients.length, 20);
  assert.ok(snapshot.clients.every(({ id }) => !previousIds.has(id)));
});
