import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import ejs from 'ejs';
import {readFileSync} from 'node:fs';
import {pool} from '../src/db.js';
import {initializeDatabase} from '../src/schema.js';
import {createPresenterRouter} from '../src/routes/presenters.js';
import {createPresenterAdminRouter} from '../src/routes/presenter-admin.js';

const value=Number;
const record=id=>({id,username:'Presentador '+id,active:true});
function appFor(role){
 const app=express();
 app.use(express.json());
 app.use((req,_res,next)=>{req.session={user:{id:900,role}};next();});
 app.use('/admin',createPresenterAdminRouter({
  id:input=>{const n=Number(input);if(!Number.isSafeInteger(n)||n<1)throw Object.assign(new Error('ID inválido'),{status:400});return n;},
  text:input=>String(input||'').trim(),
  saleValues:input=>({date:input.date||'2026-10-11',clientName:input.clientName||'Cliente',phone:'',advisor:'Ana',presenter:'Pedro',quota:null,notes:'',rawText:''}),
  saleFingerprint:data=>'f'.repeat(64),
  leadSelection:async()=>null
 }));
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
 return app;
}
async function serve(role,callback){
 const server=appFor(role).listen(0);
 await new Promise(resolve=>server.once('listening',resolve));
 try{await callback('http://127.0.0.1:'+server.address().port+'/admin');}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('ordinary presenter cannot inspect or change a colleague\'s account',async()=>{
 await serve('presenter',async url=>{
  for(const [path,method] of [
   ['/users/2/records?month=2026-10','GET'],
   ['/users/2/sales','POST'],
   ['/users/2/password','PATCH'],
   ['/users/2/leads','POST'],
   ['/users/2/sales/9','DELETE'],
   ['/audit','GET']
  ]){
   const response=await fetch(url+path,{method,headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:'{}'})});
   assert.equal(response.status,403,method+' '+path);
  }
 });
});
test('admin sale creation is scoped to the selected presenter, never the admin',async()=>{
 const original=pool.getConnection;
 const queries=[];
 pool.getConnection=async()=>({
  beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},
  execute:async(sql,params)=>{
   queries.push({sql,params});
   if(sql.includes('FROM users WHERE'))return [[record(params[0])]];
   if(sql.includes('FROM presenter_commissions'))return [[{amount:32000}]];
   if(sql.includes('INSERT INTO presenter_sales'))return [{insertId:411}];
   if(sql.includes('INSERT INTO presenter_admin_audit'))return [{insertId:1}];
   throw Error('Unexpected SQL '+sql);
  }
 });
 try{
  await serve('presenter_admin',async url=>{
   const response=await fetch(url+'/users/2/sales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:'2026-10-11',clientName:'Cliente'})});
   assert.equal(response.status,201);
   assert.equal((await response.json()).id,411);
  });
  const sale=queries.find(q=>q.sql.includes('INSERT INTO presenter_sales'));
  assert.equal(sale.params[0],2);
  const log=queries.find(q=>q.sql.includes('INSERT INTO presenter_admin_audit'));
  assert.deepEqual(log.params,[900,2,'sale_created',411]);
 }finally{pool.getConnection=original;}
});
test('admin can inspect monthly totals without modifying a colleague session',async()=>{
 const original=pool.execute;
 pool.execute=async(sql,params)=>{
  if(sql.includes('FROM users WHERE'))return [[record(params[0])]];
  if(sql.includes('FROM presenter_sales'))return [[{id:42,commission:32000,announced_date:'2026-10-11'}]];
  if(sql.includes('FROM presenter_payments'))return [[]];
  if(sql.includes('FROM presenter_lead_snapshots'))return [[{quantity:100,source_label:'Pedro'}]];
  if(sql.includes('FROM presenter_lead_entries'))return [[{id:1,entry_date:'2026-10-10',quantity:5,notes:'Ajuste'}]];
  if(sql.includes('FROM presenter_lead_policies')||sql.includes('FROM presenter_lead_plans'))return [[]];
  throw Error('Unexpected SQL: '+sql);
 };
 try{await serve('presenter_admin',async url=>{
  const result=await fetch(url+'/users/2/records?month=2026-10');
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.person.id,2);
  assert.equal(data.summary.total,105);
  assert.equal(data.salesTotal,32000);
  assert.equal(data.entries.length,1);
 });}
 finally{pool.execute=original;}
});

test('admin template exposes team controls while ordinary presenters cannot see them',()=>{
 const template=readFileSync(new URL('../views/presenter.ejs',import.meta.url),'utf8');
 const locals=role=>({user:{id:1,username:'Prueba',role},csrfToken:'unit-test-token',embedded:true,assetUrl:path=>'/assets/'+path});
 const admin=ejs.render(template,locals('presenter_admin'));
 const presenter=ejs.render(template,locals('presenter'));
 for(const key of ['admin-person-select','admin-month','admin-new-sale','admin-password-dialog','admin-lead-dialog','admin-person-sales']){
  assert.match(admin,new RegExp(key));
  assert.doesNotMatch(presenter,new RegExp(key));
 }
 assert.match(admin,/js\/presenter-admin\.js/);
 assert.doesNotMatch(presenter,/js\/presenter-admin\.js/);
});

test('existing schema v6 repairs missing admin audit table and permits creating a presenter',async()=>{
 const originalGetConnection=pool.getConnection,originalQuery=pool.query;
 let auditTableCreated=false;
 const queries=[],writes=[];
 const connection={
  release(){},beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},
  query:async(sql)=>{
   queries.push(sql);
   if(sql.includes('CREATE TABLE IF NOT EXISTS presenter_admin_audit'))auditTableCreated=true;
   return [[]];
  },
  execute:async(sql,args=[])=>{
   if(sql.includes("meta_key = 'schema_version'"))return [[{meta_value:'6'}]];
   if(sql.includes("meta_key = 'credential_fingerprint'"))return [[]];
   if(sql.includes('INSERT INTO users (username,password_hash,role)')){
    writes.push({sql,args});return [{insertId:721}];
   }
   if(sql.includes('INSERT INTO presenter_admin_audit')){
    if(!auditTableCreated)throw Object.assign(Error('Audit table missing'),{code:'ER_NO_SUCH_TABLE'});
    writes.push({sql,args});return [{insertId:23}];
   }
   return [[]];
  }
 };
 pool.getConnection=async()=>connection;
 pool.query=async(sql)=>{
  if(sql.includes('FROM presenter_admin_audit')){
   if(!auditTableCreated)throw Object.assign(Error('Audit table missing'),{code:'ER_NO_SUCH_TABLE'});
   return [[{id:23,action:'account_created',record_id:null,created_at:'2026-11-03',actor:'Admin',presenter:'prueba_nueva'}]];
  }
  throw Error('Unexpected query '+sql);
 };
 let server;
 try{
  // Simulate a production database that had already completed version 6
  // before the audit table was added to the schema statements.
  await initializeDatabase();
  assert.equal(auditTableCreated,true,'skipped v6 migration must be repaired');
  assert.equal(queries.filter(sql=>sql.includes('CREATE TABLE IF NOT EXISTS presenter_admin_audit')).length,1);
  assert.equal(queries.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS presenter_sales')),false,'avoid re-running unrelated migrations');
  await initializeDatabase();
  assert.equal(queries.filter(sql=>sql.includes('CREATE TABLE IF NOT EXISTS presenter_admin_audit')).length,2,'repair remains idempotent');

  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{req.session={user:{id:900,role:'presenter_admin'}};next();});
  app.use('/api/presenters',createPresenterRouter());
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message}));
  server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/api/presenters';
  const created=await fetch(url+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'prueba_nueva',password:''})});
  assert.equal(created.status,201,JSON.stringify(await created.clone().json()));
  assert.equal(writes.filter(q=>q.sql.includes('INSERT INTO users')).length,1);
  assert.deepEqual(writes.find(q=>q.sql.includes('INSERT INTO presenter_admin_audit')).args,[900,721,'account_created']);
  const response=await fetch(url+'/admin/audit');
  assert.equal(response.status,200);
  assert.equal((await response.json()).activity[0].action,'account_created');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  pool.getConnection=originalGetConnection;pool.query=originalQuery;
 }
});
