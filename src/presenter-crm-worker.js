import {pool} from './db.js';
import {decryptCrmPin} from './presenter-crm.js';
import {readPresenterCrm} from './presenter-crm-browser.js';

export async function syncOnePresenter({database=pool,read=readPresenterCrm}={}){
 const [rows]=await database.query(`SELECT user_id,crm_name,pin_cipher,status
  FROM presenter_crm_links WHERE status IN ('pending','active','error')
  ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,last_attempt_at ASC LIMIT 1`);
 const person=rows[0];if(!person)return {skipped:true};
 await database.execute('UPDATE presenter_crm_links SET last_attempt_at=UTC_TIMESTAMP() WHERE user_id=?',[person.user_id]);
 try{
  const result=await read({name:person.crm_name,pin:decryptCrmPin(person.pin_cipher)});
  await database.execute(`INSERT INTO presenter_lead_snapshots(user_id,month,quantity,source_label)
   VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),
   source_label=VALUES(source_label),captured_at=CURRENT_TIMESTAMP`,
   [person.user_id,result.month,result.quantity,result.sourceLabel]);
  await database.execute("UPDATE presenter_crm_links SET status='active',last_success_at=UTC_TIMESTAMP(),last_error=NULL WHERE user_id=?",[person.user_id]);
  return {ok:true,userId:person.user_id,month:result.month,quantity:result.quantity};
 }catch(error){
  // Never persist exceptions that might include PINs, URL parameters or browser internals.
  const status=['CRM_AUTH_REJECTED','CRM_IDENTITY_MISMATCH'].includes(error.code)?'invalid':'error';
  await database.execute('UPDATE presenter_crm_links SET status=?,last_error=? WHERE user_id=?',[status,
   status==='invalid'?'No se pudo confirmar la cuenta o el PIN.':'El CRM no está disponible para sincronizar.',person.user_id]);
  return {ok:false,userId:person.user_id,status};
 }
}
