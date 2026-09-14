import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../public/js/demo-ai.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../views/demo-ai.ejs', import.meta.url), 'utf8');
const areaView = readFileSync(new URL('../views/demo-ai-area.ejs', import.meta.url), 'utf8');
const welcomeView = readFileSync(new URL('../views/demo-welcome.ejs', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const customSelect = readFileSync(new URL('../public/js/custom-select.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/css/demo-ai.css', import.meta.url), 'utf8');

test('la Demo IA se reconecta al volver a la página o recuperar Internet', () => {
  assert.match(client, /addEventListener\('pageshow', \(\) => reconnectNow\(\)\)/);
  assert.match(client, /addEventListener\('online', \(\) => reconnectNow\(\)\)/);
  assert.match(client, /visibilityState === 'visible'/);
  assert.match(client, /Conexión restablecida\. La demo ya está sincronizada\./);
});

test('las peticiones tienen timeout y los POST no se reintentan automáticamente', () => {
  assert.match(client, /timeoutMs \|\| 25_000/);
  assert.doesNotMatch(client, /method: options\.method[\s\S]{0,400}retry/);
});

test('el selector completa la ubicación y Maps automáticamente', () => {
  assert.match(client, /buildingSelect\.addEventListener\('change', applySelectedProject\)/);
  assert.match(client, /buildingAddress\.value = option\.dataset\.address/);
  assert.match(client, /mapsUrl\.value = option\.dataset\.mapsUrl/);
});

test('la Demo IA reemplaza los selectores nativos por el componente propio', () => {
  assert.match(view, /assetUrl\('css\/custom-select\.css'\)/);
  assert.match(view, /assetUrl\('js\/custom-select\.js'\)/);
  assert.match(customSelect, /menu\.classList\.add\('ai-custom-select-menu'\)/);
});

test('el chat muestra la foto asignada al proyecto y no una imagen genérica', () => {
  assert.match(client, /item\.card\?\.imageUrl/);
  assert.match(client, /ai-building-placeholder/);
  assert.doesNotMatch(client, /edificio-demo\.webp/);
});

test('el chat permite adjuntar otro proyecto desde un selector propio', () => {
  assert.match(view, /id="projectShareSelect"/);
  assert.match(view, /data-delivery="<%= project\.delivery %>"/);
  assert.match(client, /\/share-project/);
  assert.match(client, /item\.card\.delivery/);
  assert.match(customSelect, /select\.closest\('\.ai-project-share'\)/);
});

test('el simulador ofrece el video de bienvenida y el chat lo reproduce en línea', () => {
  assert.match(view, /id="sendWelcomeVideo"/);
  assert.match(view, /agente elija el mejor video/);
  assert.match(client, /send-welcome-video/);
  assert.match(client, /ai-video-card/);
  assert.match(client, /videoFollowUpCount/);
  assert.match(client, /El agente eligió y personalizó/);
});

test('el polling conserva el elemento de video y se pausa durante la reproducción', () => {
  assert.match(client, /renderedChatSignature/);
  assert.match(client, /signature === state\.renderedChatSignature/);
  assert.match(client, /!state\.mediaActive/);
  assert.match(client, /addEventListener\('play', updateVideoPlaybackState, true\)/);
  assert.match(client, /event\.type === 'play' \|\| event\.type === 'playing'/);
});

test('los reenvíos del lead conservan una identidad y esperan los reintentos internos', () => {
  assert.match(client, /pendingReply/);
  assert.match(client, /body: \{ text, requestId \}/);
  assert.match(client, /timeoutMs: 50_000/);
  assert.match(client, /createClientRequestId/);
  assert.match(client, /no se duplicará/);
});

test('la oportunidad permite personalizar la voz de cada asesor', () => {
  assert.match(view, /id="advisorTone"/);
  assert.match(view, /id="advisorEmojiUsage"/);
  assert.match(view, /id="advisorParagraphSpacing"/);
  assert.match(view, /Se aplica a todos los seguimientos de este asesor/);
  assert.match(client, /\/api\/demo-ai\/advisor-style/);
  assert.match(client, /renderAdvisorStylePreview/);
  assert.match(client, /Personalidad guardada para/);
  assert.match(client, /state\.styleDirty && state\.styleEditingAdvisor/);
  assert.match(client, /syncingStyleControls/);
});

test('la Demo IA separa asesoramiento de leads y seguimiento de bienvenida', () => {
  assert.match(server, /if \(area === 'leads'\)/);
  assert.match(server, /if \(area === 'welcome'\)/);
  assert.match(server, /res\.render\('demo-ai-area'/);
  assert.match(areaView, /Asesorar leads/);
  assert.match(areaView, /Equipo de bienvenida/);
  assert.match(areaView, /Los historiales y criterios de la IA se mantienen separados/);
  assert.match(welcomeView, /RETENCIÓN PROMEDIO/);
  assert.match(welcomeView, /RIESGO DE BAJA/);
  assert.match(welcomeView, /Personas que ya forman parte del plan de ahorro/);
  assert.doesNotMatch(welcomeView, /porcentaje de oportunidad/i);
  assert.match(view, /Cambiar área/);
  assert.match(areaView, /<html lang="es" class="ai-scroll-page">/);
  assert.match(welcomeView, /<html lang="es" class="ai-scroll-page">/);
  assert.match(styles, /html\.ai-scroll-page body[\s\S]{0,180}overflow-y: auto/);
});
