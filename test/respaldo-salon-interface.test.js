import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('single site login links to public salon backup',()=>{
 const login=read('views/login.ejs');
 const staff=read('public/respaldo/app.js');
 assert.match(login,/href="\/respaldo"/);
 assert.ok(staff.includes('¿Quién sos?'));
 assert.ok(staff.includes('Buscá tu nombre'));
 assert.ok(staff.includes("await api('/enter'"));
 assert.ok(!staff.includes('Ingresá tu PIN'));
 assert.ok(!staff.includes('data-action="role-'));
});
test('admin dashboard separated from operator views',()=>{
 const ui=read('public/respaldo/app.js');
 assert.ok(ui.includes("if(state.view==='admin'){renderAdmin();return;}"));
 assert.ok(ui.includes("state.view=state.user.role;"));
 assert.ok(ui.includes('Administración del respaldo'));
 assert.ok(ui.includes('Personal habilitado'));
 assert.ok(!ui.includes('admin-login-form'));
});
test('public salon selector never exposes admin identity',()=>{
 const api=read('src/respaldo/router.js');
 assert.ok(api.includes("router.get('/api/people'"));
 assert.ok(api.includes("role<>'admin'"));
 assert.ok(api.includes("router.post('/api/enter'"));
 assert.ok(api.includes('respaldo_entry'));
 assert.ok(api.includes('timingSafeEqual'));
 assert.ok(api.includes('operator_selected'));
});
test('production original stylesheet is local and linked',()=>{
 const css=read('public/respaldo/original.css');
 const api=read('src/respaldo/router.js');
 assert.equal(css.length,133941);
 assert.ok(css.includes('--brand'));
 assert.ok(api.includes('/respaldo/static/original.css'));
});
test('operator creation is role-scoped without PIN',()=>{
 const api=read('src/respaldo/router.js');
 assert.ok(api.includes("router.post('/api/users', requireLogin, allow('admin')"));
 assert.ok(api.includes('Nombre o puesto inválido.'));
 assert.ok(!api.includes('Completá nombre y teléfono.'));
});
