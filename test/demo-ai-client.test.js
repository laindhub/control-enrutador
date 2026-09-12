import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../public/js/demo-ai.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../views/demo-ai.ejs', import.meta.url), 'utf8');
const customSelect = readFileSync(new URL('../public/js/custom-select.js', import.meta.url), 'utf8');

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
