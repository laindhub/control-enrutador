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
    assert.ok(client.messages.length >= 5);
    assert.doesNotMatch(client.messages.map(({ text }) => text).join(' '), /buscás .* su (familia|pareja|futuro)/i);
    assert.ok(client.messages
      .filter(({ role }) => role === 'client')
      .every(({ text }) => !/\btu (familia|pareja|futuro)\b/i.test(text)));
    assert.ok(client.messages
      .filter(({ role }) => role === 'client')
      .every(({ text }) => !/^(Le preocupa|Quiere entender|Necesita acompañamiento|Está motivado|Consulta seguido|Tuvo un mes difícil|Valora recibir|Quiere saber)/.test(text)));
  }
  const distinctClientHistories = new Set(snapshot.clients.map((client) => client.messages
    .filter(({ role }) => role === 'client')
    .map(({ text }) => text)
    .join('|')));
  assert.ok(distinctClientHistories.size >= 8);
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

test('actualiza historiales iniciales antiguos sin pisar conversaciones del tester', () => {
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000 });
  const legacy = store.snapshot().clients[2];
  legacy.historyVersion = 1;
  legacy.messages = legacy.messages.filter(({ role }) => role !== 'time').slice(0, 3);
  store.restore([legacy]);
  const upgraded = store.snapshot().clients[0];
  assert.equal(upgraded.historyVersion, 2);
  assert.ok(upgraded.messages.length >= 5);

  const manual = structuredClone(upgraded);
  manual.historyVersion = 1;
  manual.messages.push({
    id: 'tester-message',
    role: 'client',
    text: 'Este mensaje lo escribió el tester.',
    clientRequestId: 'keep-me',
    createdAt: 1_800_000_000_001,
  });
  store.restore([manual]);
  assert.ok(store.snapshot().clients[0].messages.some(({ clientRequestId }) => clientRequestId === 'keep-me'));
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
      generatedBy: null,
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
    generatedBy: null,
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

test('Bienvenida puede elegir y enviar un video contextual al chat', async () => {
  const requests = [];
  const generate = async (request) => {
    requests.push(request);
    return {
      message: 'Te comparto esta historia porque conecta con el esfuerzo que venís haciendo. Cada proceso es distinto y primero necesitás completar el anticipo. ¿Qué te genera verla?',
      note: 'Se eligió el testimonio de la enfermera por su contexto.',
      selectedVideoId: 'nurse-home-v3',
      generatedBy: null,
    };
  };
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000, generate });
  const id = store.clients[0].id;
  const updated = await store.sendVideo(id);
  const videoMessage = updated.messages.at(-1);
  assert.equal(requests[0].kind, 'video');
  assert.equal(requests[0].videos.length, 3);
  assert.equal(videoMessage.video.id, 'nurse-home-v3');
  assert.equal(videoMessage.video.src, '/assets/demo-ai/videos/enfermera-hogar-propio.mp4');
  assert.match(videoMessage.text, /completar el anticipo/);
  assert.match(updated.notes[0].title, /Video compartido/);
});

test('regenerar reemplaza la muestra manteniendo veinte clientes', () => {
  const store = new WelcomeDemoStore({ now: () => 1_800_000_000_000 });
  const previousIds = new Set(store.clients.map(({ id }) => id));
  const snapshot = store.reset();
  assert.equal(snapshot.clients.length, 20);
  assert.ok(snapshot.clients.every(({ id }) => !previousIds.has(id)));
});
