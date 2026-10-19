import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('el login principal no tiene botón de presentación, mantiene acceso a Respaldo', () => {
  const login = source('views/login.ejs');
  assert.match(login,/href="\/respaldo"/);
  assert.doesNotMatch(login,/href="\/presentacion"/);
  assert.doesNotMatch(login,/Abrir presentaciones del salón/);
});

test('la interfaz aplica las mismas utilidades originales de Liniers a sus controles', () => {
  const ui = source('public/respaldo/app.js');
  const server = source('src/respaldo/router.js');
  assert.match(ui,/rounded-card-mobile bg-surface border shadow-card active:bg-pressed/);
  assert.match(ui,/rounded-field-mobile flex cursor-pointer items-center border transition-colors/);
  assert.match(ui,/text-salon-option/);
  assert.match(ui,/mx-auto flex min-h-screen w-full max-w-lg/);
  assert.match(ui,/text-3xl leading-tight font-medium tracking-tight/);
  assert.match(ui,/data-action="previous-step"/);
  assert.match(ui,/data-action="next-step"/);
  assert.match(ui,/salon-bottomnav/);
  assert.match(server,/\/respaldo\/static\/original.css/);
  assert.equal(source('public/respaldo/original.css').length,133941);
});

test('cada puesto tiene una vista distinta y Administración sigue aislada', () => {
  const ui = source('public/respaldo/app.js');
  for(const name of ['¿Quién sos?','Ingreso','Pre-test','Full-test','Charla y derivación','Conversión','Administración del respaldo']) {
    assert.ok(ui.includes(name), name);
  }
  assert.match(ui,/if\(state.view==='admin'\)\{renderAdmin\(\);return;\}/);
  assert.match(ui,/if\(state.view==='recepcion'\)\{renderReception\(\);return;\}/);
  assert.match(ui,/function renderToday\(/);
  assert.match(ui,/function renderActivity\(/);
});

test('se restauraron ubicaciones por CABA/GBA y condiciones del formulario', () => {
  const ui = source('public/respaldo/app.js');
  for(const location of ['Villa Urquiza','La Matanza','Ramos Mejía','Lomas de Zamora','Berazategui']) {
    assert.ok(ui.includes(location), location);
  }
  assert.match(ui,/ubicacion_sonada/);
  assert.match(ui,/state.locationFilter/);
  assert.match(ui,/fulltest_contact_corrected|\/contact/);
  assert.match(ui,/input\[name="ubicacion_sonada"\]/);
  assert.match(ui,/route-speaker/);
  assert.match(ui,/route-advisor/);
});

test('los estilos complementarios no definen de nuevo paleta de colores y radios', () => {
  const css=source('public/respaldo/ui.css');
  assert.ok(!css.includes(':root{--brand:'));
  assert.ok(!css.includes(':root {--brand:'));
  assert.match(css,/var\(--brand-deep\)/);
  assert.match(css,/var\(--selected\)/);
  assert.match(css,/salon-choice:has\(input:checked\)/);
});
