import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('presentation route is isolated and available without the CRM session', () => {
  const server = read('src/server.js');
  const presentation = server.indexOf("app.get('/presentacion'");
  const startupGate = server.indexOf("app.use((req, res, next) => {\n  if (startupState === 'starting')");
  const session = server.indexOf('app.use(sessionMiddleware);');
  assert.ok(presentation > 0, 'presentation route exists');
  assert.ok(presentation < startupGate, 'viewer survives database startup problems');
  assert.ok(presentation < session, 'local-only viewer does not require login');
  assert.match(server, /res\.render\('presentation'/);
  assert.match(server, /https:\/\/esm\.sh/);
});

test('PPTX client loads locally, supports presentation and optional editing', () => {
  const html = read('views/presentation.ejs');
  const js = read('public/js/presentation.js');
  assert.match(html, /type="file"/);
  assert.match(html, /id="start"/);
  assert.match(html, /id="edit-mode"/);
  assert.match(html, /id="download"/);
  assert.match(js, /viewer\.loadFile\(file\)/);
  assert.match(js, /viewer\.enterPresentation\(\)/);
  assert.match(js, /viewer\.downloadPptx\(currentFile\.name\)/);
  assert.match(js, /autosave: false/);
  assert.match(js, /onPresentationChange/);
  assert.match(js, /onSlideChange/);
  assert.match(js, /media\.play\(\)/);
  assert.doesNotMatch(js, /fetch\([^)]*file|FormData\(|XMLHttpRequest/);
});

test('presentation page uses its own isolated mobile styling and no unsafe inline scripts', () => {
  const html = read('views/presentation.ejs');
  const css = read('public/css/presentation.css');
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.match(html, /assetUrl\('js\/presentation\.js'\)/);
});