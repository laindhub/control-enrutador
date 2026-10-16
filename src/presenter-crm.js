import {createCipheriv,createDecipheriv,randomBytes,hkdfSync} from 'node:crypto';
import {config} from './config.js';

export const CRM_ORIGIN='https://liniers.xn--somosmasdueos-skb.com';
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const key=()=>Buffer.from(hkdfSync('sha256',Buffer.from(config.sessionSecret),Buffer.from('salon-presenter-crm-v1'),Buffer.from('aes-256-gcm-credential-encryption'),32));
export function encryptCrmPin(pin){
 if(typeof pin!=='string'||!/^\d{4}$/.test(pin))throw Object.assign(new Error('El PIN debe tener cuatro dígitos.'),{status:400});
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 const content=Buffer.concat([cipher.update(pin,'utf8'),cipher.final()]);
 return Buffer.concat([Buffer.from([1]),iv,cipher.getAuthTag(),content]).toString('base64');
}
export function decryptCrmPin(encoded){
 const data=Buffer.from(encoded,'base64');
 if(data.length!==33||data[0]!==1)throw Error('Credencial no disponible.');
 const decipher=createDecipheriv('aes-256-gcm',key(),data.subarray(1,13));
 decipher.setAuthTag(data.subarray(13,29));
 return Buffer.concat([decipher.update(data.subarray(29)),decipher.final()]).toString('utf8');
}
export function normalizeCrmName(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
export function validateCrmIdentity(name,username){
 const clean=String(name||'').replace(/\s+/g,' ').trim();
 if(clean.length<3||clean.length>120||!/^[\p{L}\p{M}\p{N} .'-]+$/u.test(clean))
  throw Object.assign(new Error('Seleccioná tu nombre de la lista del CRM.'),{status:400});
 const given=normalizeCrmName(clean),user=normalizeCrmName(username);
 if(!user||given.split(' ')[0]!==user.split(' ')[0])
  throw Object.assign(new Error('La cuenta del CRM debe corresponder a tu propio usuario de Salón.'),{status:403});
 return clean;
}
export function parseCrmActivity(raw,identity){
 const text=String(raw||'').replace(/\s+/g,' ');
 const section=text.match(/\bmi mes\b\s*[·•-]?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s*)?(20\d{2})/i);
 if(!section)throw new Error('No se identificó el mes del CRM.');
 const monthIndex=MONTHS.indexOf(section[1].toLowerCase());
 const scoped=text.slice(section.index,section.index+900);
 const match=scoped.match(/\bDerivaciones\s+([\d.]+)/i);
 if(!match)throw new Error('No se encontró el contador de derivaciones.');
 const count=Number(match[1].replace(/\./g,''));
 if(!Number.isSafeInteger(count)||count<0||count>100000)throw new Error('El contador del CRM no es válido.');
 const month=section[2]+'-'+String(monthIndex+1).padStart(2,'0');
 if(identity && !normalizeCrmName(raw).includes(normalizeCrmName(identity)))
  throw new Error('El CRM no confirma la identidad del presentador.');
 return {month,quantity:count};
}
export const publicCrmLink=(row)=>!row?{linked:false,status:'unlinked'}:
 {linked:true,name:row.crm_name,status:row.status,lastSuccess:row.last_success_at||null,lastAttempt:row.last_attempt_at||null,
  message:row.status==='active'?'Cuenta vinculada y sincronizada.':
  row.status==='invalid'?'No se pudo validar el PIN. Volvé a vincular tu cuenta.':
  row.status==='error'?'No se pudo contactar al CRM. Reintentaremos.':'Validando tus datos con el CRM…'};
