import express from 'express';
import {pool} from '../db.js';
import {nowLocal} from '../time.js';
import {validDate} from '../presenter-sales.js';
import {defaultLeadPolicy,leadMonth,leadInteger,leadPolicy,leadPlan,leadSummary} from '../presenter-leads.js';
const json=v=>typeof v==='string'?JSON.parse(v):v;
const admin=(req,res,next)=>req.session.user.role==='presenter_admin'?next():res.status(403).json({error:'Solo el administrador puede modificar el esquema.'});
export function createPresenterLeadsRouter(){
 const router=express.Router();
 router.get('/lead-state',async(req,res)=>{
  const month=leadMonth(req.query.month||nowLocal().toFormat('yyyy-MM')),userId=req.session.user.id;
  const [[policies],[snapshots],[entries],[plans]]=await Promise.all([
   pool.execute('SELECT month,policy_json FROM presenter_lead_policies WHERE month<=? ORDER BY month DESC LIMIT 1',[month]),
   pool.execute('SELECT * FROM presenter_lead_snapshots WHERE user_id=? AND month=?',[userId,month]),
   pool.execute('SELECT id,entry_date,quantity,notes FROM presenter_lead_entries WHERE user_id=? AND entry_date>=? AND entry_date<LAST_DAY(?) + INTERVAL 1 DAY AND deleted_at IS NULL ORDER BY entry_date DESC,id DESC',[userId,month+'-01',month+'-01']),
   pool.execute('SELECT plan_json FROM presenter_lead_plans WHERE user_id=? AND month=?',[userId,month])]);
  const policy=json(policies[0]?.policy_json)||defaultLeadPolicy,plan=json(plans[0]?.plan_json)||{goal:policy.elite,offDays:null};
  const snapshot=snapshots[0]||null,today=nowLocal().toISODate();
  res.set('Cache-Control','no-store').json({month,today,user:req.session.user,policy,policyMonth:policies[0]?.month||null,plan,snapshot,entries,summary:leadSummary({month,today,policy,plan,sourceCount:snapshot?Number(snapshot.quantity):null,manualCount:entries.reduce((sum,e)=>sum+Number(e.quantity),0)})});
 });
 router.post('/lead-snapshot',async(req,res)=>{
  const month=leadMonth(req.body.month),quantity=leadInteger(req.body.quantity),sourceLabel=String(req.body.sourceLabel||'').trim().slice(0,255);
  if(!sourceLabel)return res.status(400).json({error:'No se pudo identificar la cuenta del salón.'});
  await pool.execute('INSERT INTO presenter_lead_snapshots (user_id,month,quantity,source_label) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),source_label=VALUES(source_label),captured_at=CURRENT_TIMESTAMP',[req.session.user.id,month,quantity,sourceLabel]);res.json({ok:true});
 });
 router.post('/lead-entries',async(req,res)=>{
  const date=validDate(req.body.date),quantity=leadInteger(req.body.quantity,1),notes=String(req.body.notes||'').trim().slice(0,1000),requestId=String(req.body.requestId||'');
  if(date>nowLocal().toISODate()||!notes||! /^[0-9a-f-]{36}$/i.test(requestId))return res.status(400).json({error:'Indicá fecha pasada o actual, referencia y cantidad válida.'});
  await pool.execute('INSERT INTO presenter_lead_entries (user_id,entry_date,quantity,notes,request_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE request_id=request_id',[req.session.user.id,date,quantity,notes,requestId]);res.status(201).json({ok:true});
 });
 router.delete('/lead-entries/:id',async(req,res)=>{
  const [result]=await pool.execute('UPDATE presenter_lead_entries SET deleted_at=UTC_TIMESTAMP() WHERE id=? AND user_id=? AND deleted_at IS NULL',[leadInteger(req.params.id,1,Number.MAX_SAFE_INTEGER),req.session.user.id]);res.status(result.affectedRows?200:404).json(result.affectedRows?{ok:true}:{error:'Carga no encontrada.'});
 });
 router.post('/lead-plan',async(req,res)=>{const month=leadMonth(req.body.month),plan=leadPlan(req.body);await pool.execute('INSERT INTO presenter_lead_plans (user_id,month,plan_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE plan_json=VALUES(plan_json)',[req.session.user.id,month,JSON.stringify(plan)]);res.json({ok:true});});
 router.post('/lead-policy',admin,async(req,res)=>{const month=leadMonth(req.body.month),policy=leadPolicy(req.body);await pool.execute('INSERT INTO presenter_lead_policies (month,policy_json,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE policy_json=VALUES(policy_json),updated_by=VALUES(updated_by)',[month,JSON.stringify(policy),req.session.user.id]);res.json({ok:true});});
 return router;
}
