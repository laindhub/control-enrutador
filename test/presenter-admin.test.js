import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {pool} from '../src/db.js';
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
