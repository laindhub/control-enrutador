import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = filename => readFileSync(new URL('../' + filename, import.meta.url), 'utf8');

test('existing login is the only entry for backup accounts', () => {
  const server = source('src/server.js');
  const auth = source('src/respaldo/login.js');
  const ui = source('public/respaldo/app.js');
  const form = source('views/login.ejs');

  assert.ok(server.includes("app.get('/login', prepareRespaldoLogin"));
  assert.ok(server.includes("app.post('/login', tryRespaldoLogin)"));
  assert.ok(server.indexOf("app.post('/login', tryRespaldoLogin)") < server.indexOf("app.use((req, res, next) => {\n  if (startupState === 'starting')"));
  assert.ok(auth.includes("res.redirect(303, '/respaldo')"));
  assert.ok(form.includes('name="_backup_csrf"'));
  assert.ok(ui.includes("location.replace('/login?respaldo=1')"));
  assert.ok(!ui.includes('function renderLogin()'));
  assert.ok(!source('src/respaldo/router.js').includes("router.post('/api/login'"));
});

test('admin credential minimum is 8 characters, backed by the independent DB', () => {
  const storage = source('src/respaldo/storage.js');
  assert.ok(storage.includes('password.length < 8'));
  assert.ok(storage.includes('RESPALDO_DB_USER'));
  assert.ok(storage.includes('RESPALDO_USERNAME'));
  assert.ok(storage.includes('RESPALDO_PASSWORD'));
  assert.ok(source('src/respaldo/login.js').includes("role='admin'"));
});
