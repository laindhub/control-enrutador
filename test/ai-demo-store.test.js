import test from 'node:test';
import assert from 'node:assert/strict';
import { AiDemoStore } from '../src/ai-demo-store.js';
import { PROJECT_CATALOG, promptKnowledgeText } from '../src/ai-demo-knowledge.js';

test('incluye por escrito los 39 proyectos del PDF en el prompt de sistema', () => {
  const prompt = promptKnowledgeText();
  assert.equal(PROJECT_CATALOG.length, 39);
  assert.match(prompt, /CONOCIMIENTO COMERCIAL CONFIRMADO/);
  assert.match(prompt, /GREEN I \| Fischetti 4943 \| Caseros \| Estado: Terminado \| Entrega\/modalidad: Semi-contado/);
  assert.match(prompt, /HUSER \| Mercedes 2346 \| Monte Castro \| Estado: Pozo \| Entrega\/modalidad: 2033/);
  assert.match(prompt, /cuota base informada para la demo es de ARS 200\.000/);
  assert.match(prompt, /puede entregar antes, pero no después/);
  assert.doesNotMatch(prompt, /la fecha o la modalidad siguen vigentes/);
});

test('cruza 31 proyectos con Spazios y conserva el PDF como respaldo', () => {
  assert.equal(PROJECT_CATALOG.filter(({ source }) => source === 'spazios.com.ar').length, 31);
  assert.equal(PROJECT_CATALOG.filter(({ source }) => source === 'PDF').length, 8);
  const soderia = PROJECT_CATALOG.find(({ name }) => name === 'SODERIA');
  assert.equal(soderia.address, 'La Plata 3986');
  assert.equal(soderia.pdfAddress, 'Av. La Plata 3976');
  assert.equal(soderia.sourceUrl, 'https://spazios.com.ar/proyecto/spazio-la-soderia/');
  assert.match(soderia.mapsUrl, /^https:\/\/www\.google\.com\/maps\/search\//);
  const green = PROJECT_CATALOG.find(({ name }) => name === 'GREEN I');
  assert.equal(green.source, 'PDF');
  assert.equal(green.sourceUrl, '');
});

test('registra un lead y programa el primer seguimiento', () => {
  const now = 1_800_000_000_000;
  const store = new AiDemoStore({ now: () => now });
  const lead = store.createLead({ name: 'Martín Sosa', delaySeconds: 8, advisorName: 'Nuria Pereyra' });
  assert.equal(lead.status, 'scheduled');
  assert.equal(lead.nextActionAt, now + 8_000);
  assert.equal(lead.notes.length, 1);
});

test('el servidor resuelve proyecto, ubicación y Maps desde el catálogo', () => {
  const store = new AiDemoStore({ now: () => 1_800_000_000_000 });
  const lead = store.createLead({
    name: 'Martín Sosa',
    buildingName: 'SODERIA',
    buildingAddress: 'Dirección manipulada',
    mapsUrl: 'https://example.com/mapa-falso',
  });
  assert.equal(lead.buildingName, 'SODERIA');
  assert.equal(lead.buildingAddress, 'La Plata 3986, Santos Lugares');
  assert.match(lead.mapsUrl, /google\.com\/maps\/search/);
  assert.equal(lead.projectUrl, 'https://spazios.com.ar/proyecto/spazio-la-soderia/');
  assert.throws(
    () => store.createLead({ name: 'Otro', buildingName: 'Proyecto inventado' }),
    /Elegí un proyecto válido/,
  );
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

  lead = (await store.advanceTime(created.id, 24)).lead;
  assert.equal(lead.status, 'handoff');
  assert.equal(lead.humanHandoff, true);
  assert.equal(lead.messages.filter((item) => item.role === 'advisor').length, 3);
});

test('simula espera, respeta la cadencia y cierra después de tres seguimientos', async () => {
  let clock = 1_800_000_000_000;
  const generate = async ({ kind }) => ({
    message: kind === 'initial' ? 'Mensaje inicial.' : 'Seguimiento personalizado.',
    note: kind === 'initial' ? 'Inicio.' : 'Seguimiento por falta de respuesta.',
    requiresHuman: false,
    handoffReason: '',
    generatedBy: 'Qwen vía Groq',
  });
  const store = new AiDemoStore({ now: () => clock, generate });
  const created = store.createLead({ name: 'Mariano', delaySeconds: 5 });
  clock += 5_000;
  await store.processDue();

  let result = await store.advanceTime(created.id, 6);
  assert.equal(result.outcome, 'waiting');
  assert.equal(result.lead.messages.filter((item) => item.role === 'advisor').length, 1);

  result = await store.advanceTime(created.id, 18);
  assert.equal(result.outcome, 'followup');
  assert.equal(result.lead.followUpCount, 1);

  result = await store.advanceTime(created.id, 48);
  assert.equal(result.outcome, 'followup');
  result = await store.advanceTime(created.id, 96);
  assert.equal(result.outcome, 'closed');
  assert.equal(result.lead.status, 'cold');
  assert.equal(result.lead.followUpCount, 3);
  assert.equal(result.lead.messages.filter((item) => item.role === 'advisor').length, 4);
});

test('detiene el seguimiento cuando el lead pide no recibir más mensajes', async () => {
  let clock = 1_800_000_000_000;
  const generate = async () => ({
    message: 'Entiendo, no vuelvo a escribirte.',
    note: 'El lead pidió finalizar el contacto.',
    requiresHuman: false,
    stopFollowUp: true,
    interestDelta: -25,
    intent: 'rechazo',
  });
  const store = new AiDemoStore({ now: () => clock, generate });
  const created = store.createLead({ name: 'Mariano', delaySeconds: 5 });
  clock += 5_000;
  await store.processDue();
  const lead = await store.receiveLeadMessage(created.id, 'No me interesa, no me escriban más');
  assert.equal(lead.status, 'cold');
  assert.equal(lead.humanHandoff, false);
  assert.equal(lead.nextActionAt, null);
  assert.equal(lead.lastIntent, 'rechazo');
});
