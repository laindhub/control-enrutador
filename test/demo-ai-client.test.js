import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../public/js/demo-ai.js', import.meta.url), 'utf8');

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
