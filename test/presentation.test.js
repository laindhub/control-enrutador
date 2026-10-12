import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ejs from 'ejs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('presentation route is isolated and available without the CRM session', () => {
  const server = read('src/server.js');
  const presentation = server.indexOf("app.get('/presentacion'");
  const startupGate = server.indexOf("app.use((req, res, next) => {\n  if (startupState === 'starting')");
  const session = server.indexOf('app.use(sessionMiddleware);');
  assert.ok(presentation > 0, 'presentation route exists');
  assert.ok(presentation > startupGate, 'viewer follows normal service readiness checks');
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

test('all static assets referenced by presentation EJS exist and render', () => {
  const html = read('views/presentation.ejs');
  const assets = [...html.matchAll(/assetUrl\('([^']+)'\)/g)].map(match => match[1]);
  assert.ok(assets.length >= 4, 'icons, CSS and JS are resolved through the asset helper');
  for (const asset of assets) {
    const file = new URL('../public/' + asset, import.meta.url);
    assert.ok(readFileSync(file).length > 0, asset + ' must exist in the deployed public directory');
  }
  const rendered = ejs.render(html, {
    assetUrl: relativePath => {
      const file = new URL('../public/' + relativePath, import.meta.url);
      readFileSync(file); // Same fail-fast behavior as the production assetUrl.
      return '/assets/' + relativePath;
    },
  }, {filename: 'views/presentation.ejs'});
  assert.match(rendered, /<title>Presentación \| Salón Más Dueños<\/title>/);
  assert.match(rendered, /src="\/assets\/js\/presentation.js"/);
  assert.match(rendered, /href="\/assets\/assets\/favicon-red.svg"/);
});

test('error page and main login use the current system name', () => {
  for (const path of ['views/error.ejs', 'views/login.ejs', 'views/warming.ejs', 'views/operator.ejs', 'views/app.ejs', 'views/admin.ejs']) {
    assert.doesNotMatch(read(path), /Control Enrutador|CONTROL ENRUTADOR/, path);
  }
  assert.match(read('views/error.ejs'), /SALÓN MÁS DUEÑOS/);
});
