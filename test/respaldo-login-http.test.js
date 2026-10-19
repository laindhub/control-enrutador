import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { prepareRespaldoLogin, loginWhenPrimaryOffline, tryRespaldoLogin } from '../src/respaldo/login.js';

test('real login form POST from public HTTPS domain survives reverse proxy HTTP hop', async () => {
  const previous = process.env.RESPALDO_USERNAME;
  process.env.RESPALDO_USERNAME = 'respaldo';
  const app=express();
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../views'));
  app.locals.assetUrl = name => '/assets/'+name;
  app.use(express.urlencoded({extended:false}));
  app.get('/login', prepareRespaldoLogin, loginWhenPrimaryOffline(()=> 'failed'));
  app.post('/login', tryRespaldoLogin, (_req,res)=>res.status(401).send('main login'));
  const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise((resolve,reject)=>{if(server.listening)resolve();else server.once('listening',resolve).once('error',reject);});
    const base='http://127.0.0.1:'+server.address().port;
    const page=await fetch(base+'/login');
    assert.equal(page.status,200);
    const html=await page.text();
    const csrf=html.match(/name="_backup_csrf" value="([a-f0-9]{64})"/)?.[1];
    assert.ok(csrf,'backup login nonce must be rendered on the existing login');
    const cookie=page.headers.get('set-cookie')?.match(/respaldo_login_csrf=([a-f0-9]{64})/)?.[1];
    assert.equal(cookie,csrf);
    const submitted=new URLSearchParams({
      username:'respaldo',password:'respaldo',_backup_csrf:csrf,
    });
    const response=await fetch(base+'/login',{
      method:'POST',redirect:'manual',
      headers:{
        cookie:'respaldo_login_csrf='+cookie,
        'content-type':'application/x-www-form-urlencoded',
        origin:'https://masduenos.laind.io',
        'x-forwarded-proto':'http',
        'sec-fetch-site':'same-origin',
      },body:submitted,
    });
    const body=await response.text();
    assert.equal(response.status,503,'Database validation must run after CSRF validation');
    assert.match(body,/Respaldo|base de datos/);
    assert.doesNotMatch(body,/Origen de ingreso no permitido/);
    assert.doesNotMatch(body,/Usuario o contraseña incorrectos/);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if(previous === undefined)delete process.env.RESPALDO_USERNAME;else process.env.RESPALDO_USERNAME=previous;
  }
});
