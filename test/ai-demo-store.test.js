import test from 'node:test';
import assert from 'node:assert/strict';
import { AiDemoStore } from '../src/ai-demo-store.js';

test('registra un lead y programa el primer seguimiento', () => {
  const now = 1_800_000_000_000;
  const store = new AiDemoStore({ now: () => now });
  const lead = store.createLead({ name: 'Martín Sosa', delaySeconds: 8, advisorName: 'Nuria Pereyra' });
  assert.equal(lead.status, 'scheduled');
  assert.equal(lead.nextActionAt, now + 8_000);
  assert.equal(lead.notes.length, 1);
});

test('cada mensaje del agente crea una nota dentro de la oportunidad', async () => {
  let clock = 1_800_000_000_000;
  const generate = async ({ kind }) => kind === 'initial'
    ? { message: '¿Querés conocer el proyecto?', note: 'Se propuso una visita.', generatedBy: 'Qwen vía Groq' }
    : { message: 'Te contacto con el asesor.', note: 'El lead pidió avanzar.', requiresHuman: true, handoffReason: 'Solicitó una visita.' };
  const store = new AiDemoStore({ now: () => clock, generate });
  const created = store.createLead({ name: 'Martín Sosa', delaySeconds: 5 });
  clock += 5_000;
  await store.processDue();
  let lead = store.getLead(created.id);
  assert.equal(lead.messages.length, 1);
  assert.equal(lead.messages[0].generatedBy, 'Qwen vía Groq');
  assert.match(lead.notes[0].text, /visita/i);
  clock += 1_000;
  lead = await store.receiveLeadMessage(created.id, 'Quiero verlo el sábado');
  assert.equal(lead.status, 'handoff');
  assert.equal(lead.humanHandoff, true);
  assert.equal(lead.messages.length, 3);
  assert.ok(lead.notes.length >= 4);
});
