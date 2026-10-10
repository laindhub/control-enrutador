import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import ejs from 'ejs';
import { pool } from '../src/db.js';
import { authenticate, sessionStore, verifyCsrf } from '../src/auth.js';
import { createPresenterRouter } from '../src/routes/presenters.js';
import { destinationForUser } from '../src/navigation.js';

test('presenter routes isolate accounts and reject unauthorized writes', async () => {
  const calls = [];
  const originalExecute = pool.execute;
  const originalQuery = pool.query;
  pool.execute = async (sql, params) => {
    calls.push({sql, params});
    return sql.startsWith('UPDATE') ? [{affectedRows:0}] : [[]];
  };
  pool.query = async sql => {calls.push({sql}); return [[]];};
  const app = express();
  app.use(express.json());
  app.use((req,res,next) => {
    req.session = {csrfToken:'test-token',user:req.get('role') ? {id:7,role:req.get('role'),username:'test'} : null};
    next();
  });
  app.use('/api/presenters',verifyCsrf,createPresenterRouter());
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const request = (path, method='GET', role='presenter', body, csrf='test-token') => fetch(`http://127.0.0.1:${server.address().port}/api/presenters${path}`, {method,headers:{role,'Content-Type':'application/json','x-csrf-token':csrf},body:body ? JSON.stringify(body) : undefined});
  try {
    assert.equal((await request('/state','GET','')).status,401);
    assert.equal((await request('/state','GET','admin')).status,403);
    assert.equal((await request('/rates','POST','presenter',{date:'2026-10-10',amount:50000})).status,403);
    assert.equal(calls.length,0);
    assert.equal((await request('/payments','POST','presenter',{},'wrong')).status,403);
    const state = await request('/state');
    assert.equal(state.status,200);
    assert.ok(calls.filter(c => c.sql.includes('presenter_sales') || c.sql.includes('presenter_payments')).every(c => c.params[0] === 7 && c.sql.includes('user_id = ?')));
    calls.length=0;
    assert.equal((await request('/sales/99','DELETE')).status,404);
    assert.equal((await request('/payments/99','DELETE')).status,404);
    assert.equal((await request('/sales/99/lead')).status,404);
    assert.ok(calls.every(c => c.params[1]===7 && c.sql.includes('user_id=?')));
    calls.length=0;
    await request('/leads?phone=5491165721929&name=Sandra%20Mabel&date=2026-10-10&advisor=Diana');
    assert.equal(calls.length,1);
    assert.ok(calls[0].sql.includes('AND advisor LIKE ?'));
    assert.deepEqual(calls[0].params,['1165721929','Sandra%','2026-10-10','Diana%']);
    calls.length=0;
    await request('/leads?name=Sandra&date=2026-10-10&advisor=Diana');
    assert.deepEqual(calls[0].params,['Sandra%','2026-10-10','Diana%']);
    for (const password of ['', '123', '1234567']) {
      calls.length=0;
      const response=await request('/users','POST','presenter_admin',{username:'nicole',password});
      assert.equal(response.status,201);
      const hash=calls[0].params[1];
      assert.ok(await bcrypt.compare(password,hash));
      pool.execute=async()=>[[{id:9,username:'nicole',role:'presenter',password_hash:hash}]];
      assert.equal((await authenticate('nicole',password)).id,9);
      assert.equal(await authenticate('nicole',password+'wrong'),null);
      pool.execute=async(sql,params)=>{calls.push({sql,params});return [[]];};
    }
    assert.equal(destinationForUser({role:'presenter'}),'/presentador');
    assert.equal(destinationForUser({role:'presenter_admin'}),'/presentador');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.execute=originalExecute;
    pool.query=originalQuery;
    await sessionStore.onReady();
    await sessionStore.close();
    await pool.end();
  }
});

test('presenter template renders both roles and escapes usernames',async()=>{
  for(const role of ['presenter','presenter_admin']) {
    const html=await ejs.renderFile(new URL('../views/presenter.ejs',import.meta.url).pathname,{title:'Ventas',user:{role,username:'<script>bad</script>'},csrfToken:'test-token',assetUrl:path=>path});
    assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
    assert.ok(html.includes('presentador.webmanifest'));
    assert.equal(html.includes('id="panel-admin"'),role==='presenter_admin');
  }
});
