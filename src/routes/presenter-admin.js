import express from 'express';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {pool,withTransaction} from '../db.js';
import {nowLocal} from '../time.js';
import {leadMonth,leadInteger,leadSummary,defaultLeadPolicy} from '../presenter-leads.js';
import {validDate,money} from '../presenter-sales.js';

// Every route here is administrator-only. Presenter IDs come only from validated
// URL parameters; the signed-in account is never silently impersonated.
export function createPresenterAdminRouter({id,text,saleValues,saleFingerprint,leadSelection}) {
 const router=express.Router();
 router.use((req,res,next)=>req.session.user?.role==='presenter_admin'
  ?next():res.status(403).json({error:'Acceso exclusivo para administración.'}));
 const person=async(userId,db=pool)=>{
  const [rows]=await db.execute("SELECT id,username,active FROM users WHERE id=? AND role='presenter' LIMIT 1",[userId]);
  if(!rows.length)throw Object.assign(new Error('Presentador no encontrado.'),{status:404});
  return rows[0];
 };
 const audit=(db,req,userId,action,recordId=null)=>db.execute(
  'INSERT INTO presenter_admin_audit (actor_id,target_id,action,record_id) VALUES (?,?,?,?)',
  [req.session.user.id,userId,action,recordId]);
 const safeJson=x=>typeof x==='string'?JSON.parse(x):x;

 router.get('/users/:userId/records',async(req,res)=>{
  const userId=id(req.params.userId),month=leadMonth(req.query.month||nowLocal().toFormat('yyyy-MM'));
  const presenter=await person(userId),start=month+'-01';
  const [[sales],[payments],[snapshots],[entries],[policies],[plans]]=await Promise.all([
   pool.execute('SELECT * FROM presenter_sales WHERE user_id=? AND announced_date>=? AND announced_date<DATE_ADD(?,INTERVAL 1 MONTH) AND deleted_at IS NULL ORDER BY announced_date DESC,id DESC',[userId,start,start]),
   pool.execute('SELECT id,folder_start,paid_date,amount,notes FROM presenter_payments WHERE user_id=? AND paid_date>=? AND paid_date<DATE_ADD(?,INTERVAL 1 MONTH) AND deleted_at IS NULL ORDER BY paid_date DESC,id DESC',[userId,start,start]),
   pool.execute('SELECT quantity,source_label,captured_at FROM presenter_lead_snapshots WHERE user_id=? AND month=?',[userId,month]),
   pool.execute('SELECT id,entry_date,quantity,notes FROM presenter_lead_entries WHERE user_id=? AND entry_date>=? AND entry_date<DATE_ADD(?,INTERVAL 1 MONTH) AND deleted_at IS NULL ORDER BY entry_date DESC,id DESC',[userId,start,start]),
   pool.execute('SELECT policy_json FROM presenter_lead_policies WHERE month<=? ORDER BY month DESC LIMIT 1',[month]),
   pool.execute('SELECT plan_json FROM presenter_lead_plans WHERE user_id=? AND month=?',[userId,month])
  ]);
  const policy=safeJson(policies[0]?.policy_json)||defaultLeadPolicy;
  const plan=safeJson(plans[0]?.plan_json)||{goal:policy.elite};
  const snapshot=snapshots[0]||null;
  const summary=leadSummary({month,today:nowLocal().toISODate(),policy,plan,
   sourceCount:snapshot?Number(snapshot.quantity):null,
   manualCount:entries.reduce((n,e)=>n+Number(e.quantity),0)});
  res.set('Cache-Control','no-store').json({person:presenter,month,sales,payments,snapshot,entries,policy,plan,summary,
   salesTotal:sales.reduce((n,s)=>n+Number(s.commission),0)});
 });

 router.post('/users/:userId/sales',async(req,res)=>{
  const userId=id(req.params.userId),data=saleValues(req.body);
  const linked=await leadSelection(text(req.body.visitId,36),data);
  try {
   const saleId=await withTransaction(async db=>{
    await person(userId,db);
    const [rates]=await db.execute('SELECT amount FROM presenter_commissions WHERE effective_date<=? ORDER BY effective_date DESC LIMIT 1',[data.date]);
    const commission=money(rates[0]?.amount??32000,true);
    const [result]=await db.execute('INSERT INTO presenter_sales (user_id,announced_date,client_name,phone,advisor,presenter_label,quota,commission,notes,raw_text,fingerprint,source_visit_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
     [userId,data.date,data.clientName,data.phone,data.advisor,data.presenter,data.quota,commission,data.notes,data.rawText,saleFingerprint(data),linked]);
    await audit(db,req,userId,'sale_created',result.insertId);
    return result.insertId;
   });
   res.status(201).json({ok:true,id:saleId});
  }catch(error){
   if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'La venta ya existe en esa cuenta.'});
   throw error;
  }
 });

 router.patch('/users/:userId/sales/:saleId',async(req,res)=>{
  const userId=id(req.params.userId),saleId=id(req.params.saleId),data=saleValues(req.body);
  const linked=await leadSelection(text(req.body.visitId,36),data);
  try {
   const found=await withTransaction(async db=>{
    await person(userId,db);
    const [result]=await db.execute('UPDATE presenter_sales SET announced_date=?,client_name=?,phone=?,advisor=?,presenter_label=?,quota=?,notes=?,raw_text=?,source_visit_id=?,fingerprint=? WHERE id=? AND user_id=? AND deleted_at IS NULL',
     [data.date,data.clientName,data.phone,data.advisor,data.presenter,data.quota,data.notes,data.rawText,linked,saleFingerprint(data),saleId,userId]);
    if(result.affectedRows)await audit(db,req,userId,'sale_updated',saleId);
    return result.affectedRows;
   });
   res.status(found?200:404).json(found?{ok:true}:{error:'Venta no encontrada en esa cuenta.'});
  }catch(error){
   if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'La venta ya existe en esa cuenta.'});
   throw error;
  }
 });

 router.delete('/users/:userId/sales/:saleId',async(req,res)=>{
  const userId=id(req.params.userId),saleId=id(req.params.saleId);
  const found=await withTransaction(async db=>{
   await person(userId,db);
   const [result]=await db.execute('UPDATE presenter_sales SET deleted_at=UTC_TIMESTAMP(),fingerprint=NULL WHERE id=? AND user_id=? AND deleted_at IS NULL',[saleId,userId]);
   if(result.affectedRows)await audit(db,req,userId,'sale_deleted',saleId);
   return result.affectedRows;
  });
  res.status(found?200:404).json(found?{ok:true}:{error:'Venta no encontrada.'});
 });

 router.patch('/users/:userId/password',async(req,res)=>{
  const userId=id(req.params.userId),password=req.body.password;
  if(typeof password!=='string'||Buffer.byteLength(password,'utf8')>72)
   return res.status(400).json({error:'Contraseña inválida. Puede quedar vacía o tener hasta 72 bytes.'});
  const hash=await bcrypt.hash(password,12);
  await withTransaction(async db=>{
   await person(userId,db);
   await db.execute("UPDATE users SET password_hash=? WHERE id=? AND role='presenter'",[hash,userId]);
   await audit(db,req,userId,'password_reset');
  });
  res.json({ok:true});
 });

 router.post('/users/:userId/leads',async(req,res)=>{
  const userId=id(req.params.userId),date=validDate(req.body.date);
  const quantity=leadInteger(req.body.quantity,1),notes=text(req.body.notes,1000);
  if(date>nowLocal().toISODate()||!notes)return res.status(400).json({error:'Indicá una fecha pasada o actual y una referencia.'});
  await withTransaction(async db=>{
   await person(userId,db);
   const [result]=await db.execute('INSERT INTO presenter_lead_entries (user_id,entry_date,quantity,notes,request_id) VALUES (?,?,?,?,?)',
    [userId,date,quantity,notes,randomUUID()]);
   await audit(db,req,userId,'leads_added',result.insertId);
  });
  res.status(201).json({ok:true});
 });

 router.delete('/users/:userId/leads/:entryId',async(req,res)=>{
  const userId=id(req.params.userId),entryId=id(req.params.entryId);
  const found=await withTransaction(async db=>{
   await person(userId,db);
   const [result]=await db.execute('UPDATE presenter_lead_entries SET deleted_at=UTC_TIMESTAMP() WHERE id=? AND user_id=? AND deleted_at IS NULL',[entryId,userId]);
   if(result.affectedRows)await audit(db,req,userId,'leads_deleted',entryId);
   return result.affectedRows;
  });
  res.status(found?200:404).json(found?{ok:true}:{error:'Carga no encontrada.'});
 });

 router.get('/audit',async(_req,res)=>{
  const [rows]=await pool.query('SELECT a.id,a.action,a.record_id,a.created_at,u.username AS actor,p.username AS presenter FROM presenter_admin_audit a JOIN users u ON u.id=a.actor_id JOIN users p ON p.id=a.target_id ORDER BY a.id DESC LIMIT 60');
  res.set('Cache-Control','no-store').json({activity:rows});
 });
 return router;
}
