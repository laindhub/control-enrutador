import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url));

test('presenter theme uses local Liniers design tokens and complete font assets', () => {
  const css = read('public/css/presenter.css').toString();
  for (const token of ['--background: #fff', '--brand-deep: #d6271d', '--border: #e6e6e6', '--radius-control: 5px']) {
    assert.ok(css.includes(token), token);
  }
  assert.ok(css.includes('@media (max-width: 700px)'));
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('[hidden] { display: none !important; }'));
  assert.ok(!css.includes('@import'));
  for (const [, font] of css.matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)) {
    const data = read('public/fonts/' + font);
    assert.equal(data.subarray(0, 4).toString(), 'wOF2');
    assert.ok(data.length > 10000);
  }
  const manifest = JSON.parse(read('public/presentador.webmanifest'));
  assert.equal(manifest.theme_color, '#ffffff');
  assert.equal(manifest.background_color, '#ffffff');
  assert.equal(manifest.scope, '/presentador');
});
