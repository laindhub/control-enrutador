import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { csrfForRespaldoSession, validRespaldoCsrf } from '../src/respaldo/csrf.js';

const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('session-bound CSRF validates only its own session token', () => {
  const a=randomBytes(32).toString('hex'), b=randomBytes(32).toString('hex');
  const csrf=csrfForRespaldoSession(a);
  assert.match(csrf,/^[a-f0-9]{64}$/);
  assert.equal(validRespaldoCsrf(a,csrf),true);
  assert.equal(validRespaldoCsrf(b,csrf),false);
  assert.equal(validRespaldoCsrf(a,csrf.toUpperCase()),false);
  assert.equal(validRespaldoCsrf(a,'not-a-token'),false);
  assert.equal(validRespaldoCsrf(a,null),false);
  assert.equal(validRespaldoCsrf(null,csrf),false);
});

test('main login no longer rejects valid Chrome/Hostinger origin before password check', () => {
  const login=read('src/respaldo/login.js');
  assert.ok(login.includes("const cookie = cookies(req)[CSRF_COOKIE]"));
  assert.ok(login.includes('equal(token, cookie)'));
  assert.ok(login.includes("sameSite: 'strict'"));
  assert.ok(!login.includes("trustedRespaldoOrigin("));
  assert.ok(!login.includes('Origen de ingreso no permitido.'));
  assert.ok(login.includes("res.redirect(303, '/respaldo')"));
});

test('backup API requires valid session-bound CSRF token instead of proxy origin', () => {
  const router=read('src/respaldo/router.js');
  const client=read('public/respaldo/app.js');
  assert.ok(router.includes("req.get('x-respaldo-csrf')"));
  assert.ok(router.includes("csrfForRespaldoSession(req.backupToken)"));
  assert.ok(!router.includes('trustedRespaldoOrigin('));
  assert.ok(client.includes("headers['X-Respaldo-CSRF'] = state.user.csrf"));
});
