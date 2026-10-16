import express from 'express';
import {rateLimit} from 'express-rate-limit';
import {pool} from '../db.js';
import {encryptCrmPin,normalizeCrmName,validateCrmIdentity,publicCrmLink} from '../presenter-crm.js';
import {triggerPresenterCrmSync} from '../presenter-crm-runner.js';

const limiter=rateLimit({windowMs:30*60*1000,limit:3,standardHeaders:'draft-8',legacyHeaders:false,
 keyGenerator:req=>String(req.session.user.id),message:{error:'Demasiados intentos. Esperá 30 minutos para volver a vincular.'}});
export const isIOS=req=>/iPhone|iPad|iPod/i.test(req.get('user-agent')||'');
export async function getLink(userId,db=pool){
 const [rows]=await db.execute('SELECT crm_name,status,last_success_at,last_attempt_at FROM presenter_crm_links WHERE user_id=?',[userId]);
 return rows[0]||null;
}
export function createPresenterCrmRouter(){
 const router=express.Router();
 router.get('/crm-link',async(req,res)=>res.set('Cache-Control','no-store').json(publicCrmLink(await getLink(req.session.user.id))));
 router.get('/crm-names',async(req,res)=>{
  const query=normalizeCrmName(req.query.q).slice(0,80);
  if(query.length<2)return res.json({names:[]});
  const [rows]=await pool.execute(`SELECT DISTINCT source_label AS name FROM presenter_lead_snapshots
   WHERE source_label LIKE ? UNION SELECT username AS name FROM users
   WHERE role IN ('presenter','presenter_admin') AND username LIKE ? LIMIT 25`,['%'+query.replace(/[%_]/g,'')+'%','%'+query.replace(/[%_]/g,'')+'%']);
  res.set('Cache-Control','no-store').json({names:rows.map(r=>r.name)});
 });
 router.post('/crm-link',limiter,async(req,res)=>{
  const name=validateCrmIdentity(req.body.name,req.session.user.username);
  const pin=req.body.pin;
  const encoded=encryptCrmPin(pin);
  const key=normalizeCrmName(name);
  try{
   await pool.execute(`INSERT INTO presenter_crm_links(user_id,crm_name,crm_name_key,pin_cipher,status)
     VALUES(?,?,?,?,'pending')
     ON DUPLICATE KEY UPDATE crm_name=VALUES(crm_name),crm_name_key=VALUES(crm_name_key),
     pin_cipher=VALUES(pin_cipher),status='pending',last_error=NULL,last_attempt_at=NULL`,
     [req.session.user.id,name,key,encoded]);
  }catch(error){
   if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Ese perfil de Liniers ya está vinculado a otro usuario.'});
   throw error;
  }
  triggerPresenterCrmSync();
  res.status(202).json({ok:true,link:publicCrmLink({crm_name:name,status:'pending'})});
 });
 router.delete('/crm-link',async(req,res)=>{
  await pool.execute('DELETE FROM presenter_crm_links WHERE user_id=?',[req.session.user.id]);
  res.json({ok:true});
 });
 router.post('/crm-sync',async(req,res)=>{
  const link=await getLink(req.session.user.id);
  if(!link)return res.status(404).json({error:'Primero vinculá tu cuenta.'});
  if(link.status==='invalid')return res.status(409).json({error:'Revisá el PIN e intentá vincular otra vez.'});
  const started=triggerPresenterCrmSync();
  res.status(started?202:409).json(started?{ok:true}:{error:'Sincronización en curso. Esperá unos minutos.'});
 });
 return router;
}
