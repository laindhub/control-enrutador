import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {pool} from '../src/db.js';
import {createPresenterLeadsRouter} from '../src/routes/presenter-leads.js';
test('Gestión stores three tiers by month without changing legacy months or erasing basic from cached editors',async()=>{
 const legacy={unlock:650,elite:780,baseRate:1350,eliteRate:1500};
 const policies=new Map([['2026-10',legacy]]),original=pool.execute;let writes=0;
 pool.execute=async(sql,params)=>{
  if(sql.startsWith('SELECT month,policy_json')){
   const month=[...policies.keys()].filter(m=>m<=params[0]).sort().at(-1);
   return [month?[{month,policy_json:JSON.stringify(policies.get(month))}]:[]];
  }
  if(sql.startsWith('INSERT INTO presenter_lead_policies')){writes++;policies.set(params[0],JSON.parse(params[1]));return [{affectedRows:1}];}
  return [[]];
 };
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.session={user:{id:7,role:req.get('role')||'presenter'}};next();});
 app.use(createPresenterLeadsRouter());app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const request=(path,body,role='presenter_admin')=>fetch('http://127.0.0.1:'+server.address().port+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',role},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await request('/lead-policy?month=2026-11',undefined,'presenter')).status,403);
  assert.equal((await request('/lead-policy',{month:'2026-11'},'presenter')).status,403);assert.equal(writes,0);
  assert.equal((await(await request('/lead-policy?month=2026-11')).json()).policy.basic,0);
  const configured={month:'2026-11',basic:500,basicRate:1200,unlock:650,baseRate:1350,elite:780,eliteRate:1500};
  assert.equal((await request('/lead-policy',configured)).status,200);
  const november=await(await request('/lead-policy?month=2026-11')).json();
  assert.equal(november.policy.basic,500);assert.equal(november.policy.basicRate,1200);assert.equal(november.policyMonth,'2026-11');
  assert.equal((await(await request('/lead-policy?month=2026-12')).json()).policy.basic,500);
  assert.equal((await(await request('/lead-policy?month=2026-10')).json()).policy.basic,0);assert.deepEqual(policies.get('2026-10'),legacy);
  assert.equal((await request('/lead-policy',{month:'2026-12',unlock:670,baseRate:1400,elite:800,eliteRate:1550})).status,200);
  assert.equal(policies.get('2026-12').basic,500);assert.equal(policies.get('2026-12').basicRate,1200);
  const count=writes;assert.equal((await request('/lead-policy',{...configured,basic:700})).status,400);assert.equal(writes,count);
  assert.equal((await request('/lead-policy',{...configured,basicRate:''})).status,400);assert.equal(writes,count);
 }finally{await new Promise(resolve=>server.close(resolve));pool.execute=original;await pool.end();}
});
