import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/sync-presenter-crm.js',import.meta.url));
let child=null,timer=null,watchdog=null,stopped=true;
export function triggerPresenterCrmSync(){
 if(process.env.PRESENTER_CRM_SYNC_ENABLED==='false')return false;
 if(child)return false;
 child=spawn(process.execPath,['--max-old-space-size=192',script],{
  detached:process.platform!=='win32',stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,PRESENTER_CRM_SYNC_WORKER:'true'}
 });
 child.on('message',msg=>{if(msg?.crmSync&&msg.ok===false)console.warn('CRM individual: pendiente de sincronización.');});
 child.on('error',()=>console.error('No se pudo iniciar sincronización individual.'));
 watchdog=setTimeout(()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{}},100000);
 watchdog.unref?.();
 child.once('close',()=>{
  clearTimeout(watchdog);child=null;
 });
 return true;
}
export function startPresenterCrmSync(){
 if(!stopped||process.env.PRESENTER_CRM_SYNC_ENABLED==='false')return;
 stopped=false;
 timer=setInterval(()=>triggerPresenterCrmSync(),5*60*1000);
 timer.unref?.();
 setTimeout(()=>{if(!stopped)triggerPresenterCrmSync();},30000).unref?.();
}
export function stopPresenterCrmSync(){
 stopped=true;clearInterval(timer);
 if(child)try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{}
}
