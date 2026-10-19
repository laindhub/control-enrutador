import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('real MySQL workflow: name selection > reception > pre-test > full-test > routing > conversion > admin CRM', async (t) => {
  if (!process.env.RESPALDO_DB_HOST) return t.skip('Requires CI MySQL container');
  const [{ db, ready }, { createRespaldoRouter }, { prepareRespaldoLogin, tryRespaldoLogin, loginWhenPrimaryOffline }] =
    await Promise.all([
      import('../src/respaldo/storage.js'),
      import('../src/respaldo/router.js'),
      import('../src/respaldo/login.js'),
    ]);
  await ready();
  const serverApp=express();
  serverApp.set('view engine','ejs');
  serverApp.set('views',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../views'));
  serverApp.locals.assetUrl = file => '/assets/'+file;
  serverApp.use(express.json());
  serverApp.use(express.urlencoded({extended:false}));
  serverApp.get('/login',prepareRespaldoLogin,loginWhenPrimaryOffline(()=> 'failed'));
  serverApp.post('/login',tryRespaldoLogin);
  serverApp.use('/respaldo',createRespaldoRouter());
  const server=serverApp.listen(0,'127.0.0.1');
  try {
    await new Promise((resolve,reject)=>{if(server.listening)resolve();else server.once('listening',resolve).once('error',reject);});
    const base='http://127.0.0.1:'+server.address().port;
    const request=async (pathname, method='GET', body=null, cookie='', csrf='')=>{
      const r=await fetch(base+pathname,{
        method,redirect:'manual',
        headers:{...(cookie?{cookie}:{}),
          ...(body?{'content-type':'application/json'}:{}),
          ...(csrf?{'x-respaldo-csrf':csrf}:{}),
        },
        ...(body?{body:JSON.stringify(body)}:{}),
      });
      const data=await r.json().catch(()=>({}));
      return {status:r.status,data,cookies:r.headers.getSetCookie()};
    };
    async function selectUser(name){
      const listing=await request('/respaldo/api/people');
      assert.equal(listing.status,200);
      const person=listing.data.people.find(p=>p.name===name);
      assert.ok(person,'missing staff: '+name);
      assert.ok(!listing.data.people.some(p=>p.role==='admin'));
      const nonce=listing.data.nonce;
      const cookie='respaldo_entry='+nonce;
      const entered=await request('/respaldo/api/enter','POST',{id:person.id,nonce},cookie);
      assert.equal(entered.status,201,JSON.stringify(entered.data));
      const sid=entered.cookies.join(';').match(/respaldo_sid=([a-f0-9]{64})/)?.[1];
      assert.ok(sid);
      const authenticatedCookie='respaldo_sid='+sid;
      const me=await request('/respaldo/api/me','GET',null,authenticatedCookie);
      assert.equal(me.status,200);
      assert.match(me.data.csrf,/^[a-f0-9]{64}$/);
      return {cookie:authenticatedCookie,csrf:me.data.csrf,person};
    }
    const recepcion=await selectUser('Camila Basiukevitz');
    const crossRole=await request('/respaldo/api/export','GET',null,recepcion.cookie);
    assert.equal(crossRole.status,403);
    const created=await request('/respaldo/api/visits','POST',{
      visitor_name:'Visitante Ficticio Respaldo Test',source:'Promotor con ruleta',
      promoter:'Ariel Mendez',continues:true,
    },recepcion.cookie,recepcion.csrf);
    assert.equal(created.status,201,JSON.stringify(created.data));
    const id=created.data.id;
    const pretest=await selectUser('Enzo Roble');
    const pre=await request('/respaldo/api/visits/'+id+'/pretest','PUT',{
      visitor_name:'Visitante Ficticio Respaldo Test',phone:'',
      answers:{vivienda_propia:'No',quiere_ser_dueno:'Sí',puede_pagar_200k:'Sí'},
    },pretest.cookie,pretest.csrf);
    assert.equal(pre.status,200,JSON.stringify(pre.data));
    const fulltest=await selectUser('Camila Sanabria');
    const full=await request('/respaldo/api/visits/'+id+'/fulltest','PUT',{
      answers:{age:31,urgencia:'Urgente',cuota_posible_ars:200000},complete:true,
    },fulltest.cookie,fulltest.csrf);
    assert.equal(full.status,200,JSON.stringify(full.data));
    const enrutador=await selectUser('Nahuel Lind');
    const people=await request('/respaldo/api/users','GET',null,enrutador.cookie);
    assert.equal(people.status,200);
    const advisor=people.data.find(u=>u.name==='Nadia Abregu'&&u.role==='asesor');
    assert.ok(advisor);
    const routed=await request('/respaldo/api/visits/'+id+'/route','PUT',{
      outcome:'entera',advisor_id:advisor.id,speaker:'Keren Botini',product:'PAI',
    },enrutador.cookie,enrutador.csrf);
    assert.equal(routed.status,200,JSON.stringify(routed.data));
    const asesor=await selectUser('Nadia Abregu');
    const seated=await request('/respaldo/api/visits/'+id+'/conversion','PUT',{seated:true},asesor.cookie,asesor.csrf);
    assert.equal(seated.status,200,JSON.stringify(seated.data));
    const [[visit]]=await db.execute('SELECT phase,seated,crm_status FROM respaldo_visits WHERE id=?',[id]);
    assert.equal(visit.phase,'cerrada');
    assert.equal(visit.seated,1);
    assert.equal(visit.crm_status,'pendiente');
    // A repeat submission is blocked by phase guard, never records conversion twice.
    const repeated=await request('/respaldo/api/visits/'+id+'/conversion','PUT',{seated:false},asesor.cookie,asesor.csrf);
    assert.equal(repeated.status,409);

    const loginPage=await fetch(base+'/login');
    const html=await loginPage.text();
    const nonce=html.match(/name="_backup_csrf" value="([a-f0-9]{64})"/)?.[1];
    assert.ok(nonce);
    const mainCookie='respaldo_login_csrf='+nonce;
    const form=new URLSearchParams({username:process.env.RESPALDO_USERNAME,
      password:process.env.RESPALDO_PASSWORD,_backup_csrf:nonce});
    const loginResponse=await fetch(base+'/login',{
      method:'POST',redirect:'manual',
      headers:{cookie:mainCookie,'content-type':'application/x-www-form-urlencoded'},
      body:form,
    });
    assert.equal(loginResponse.status,303);
    assert.equal(loginResponse.headers.get('location'),'/respaldo');
    const adminToken=loginResponse.headers.getSetCookie().join(';').match(/respaldo_sid=([a-f0-9]{64})/)?.[1];
    assert.ok(adminToken);
    const adminCookie='respaldo_sid='+adminToken;
    const adminMe=await request('/respaldo/api/me','GET',null,adminCookie);
    assert.equal(adminMe.data.role,'admin');
    const adminUpdated=await request('/respaldo/api/visits/'+id+'/crm','PUT',{status:'cargado',note:'Carga manual ficticia'},adminCookie,adminMe.data.csrf);
    assert.equal(adminUpdated.status,200,JSON.stringify(adminUpdated.data));
    const [[updated]]=await db.execute('SELECT crm_status FROM respaldo_visits WHERE id=?',[id]);
    assert.equal(updated.crm_status,'cargado');
    await db.execute('DELETE FROM respaldo_visits WHERE id=?',[id]);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await db.end();
  }
});
