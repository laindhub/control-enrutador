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

test('embedded salon presenter preserves horizontal gutters and full-width month input on mobile', () => {
  const css = read('public/css/presenter.css').toString();
  assert.match(css, /\.embedded \.shell\s*\{[^}]*padding:0 18px 20px;/);
  assert.match(css, /@media \(max-width: 360px\)\s*\{\s*\.embedded \.shell\s*\{\s*padding-inline:14px;/);
  assert.match(css, /\.embedded #panel-leads > \.section-head:first-child\s*\{[^}]*flex-direction:column;/);
  assert.match(css, /\.embedded #panel-leads > \.section-head:first-child input\s*\{[^}]*width:100%;[^}]*max-width:100%;/);
});

test('weekly folder sale rows reuse the exact sale detail dialog from Resumen', () => {
  const script = read('public/js/presenter.js').toString();
  const css = read('public/css/presenter.css').toString();
  // Both the Resumen tiles and the folder rows use the delegated handler.
  assert.match(script, /class="sale-tile" data-sale-view="\$\{s\.id\}"/);
  assert.match(script, /class="mini-row folder-sale-row" data-sale-view="\$\{s\.id\}"/);
  assert.match(script, /if\(button\.dataset\.saleView\)\{const item=state\.sales\.find\(/);
  assert.match(script, /\$\('#sale-detail-content'\)\.innerHTML=saleDetail\(item\)/);
  assert.match(script, /\$\('#sale-detail-dialog'\)\.showModal\(\)/);
  assert.match(css, /\.folder-sale-row\s*\{[^}]*min-height:48px/);
  assert.match(css, /\.folder-sale-row:hover, \.folder-sale-row:focus-visible/);
});

test('personal monthly target shows a live projected earnings preview',()=>{
 const html=read('views/presenter.ejs').toString();
 const script=read('public/js/presenter-leads.js').toString();
 const css=read('public/css/presenter.css').toString();
 assert.match(html,/Con esta meta tu ganancia sería de:/);
 assert.match(html,/id="lead-goal-projection-value"/);
 assert.match(script,/goal>=p\.elite\?p\.eliteRate:goal>=p\.unlock\?p\.baseRate:0/);
 assert.match(script,/addEventListener\('input',renderGoalProjection\)/);
 assert.match(script,/renderGoalProjection\(\);/);
 assert.match(css,/\.lead-goal-projection strong/);
});
