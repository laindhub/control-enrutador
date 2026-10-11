import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function createLeadSyncRunner({spawnProcess=spawn,setTimer=setTimeout,clearTimer=clearTimeout,kill=process.kill.bind(process),env=process.env}={}) {
let child;
let timer;
let watchdog;
let stopped = true;
let authPaused = false;
let runNow;
const script = fileURLToPath(new URL('../scripts/sync-leads.js', import.meta.url));
function killWorker() {
 if (!child) return;
 try { kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch {}
}
function startLeadSync() {
 if (env.LEAD_SYNC_ENABLED !== 'true' || !stopped) return;
 stopped = false;
 const interval = Math.max(5, Math.min(1440, Number(env.LEAD_SYNC_INTERVAL_MINUTES) || 15))*60000;
 const run = () => {
  if (stopped || child || authPaused) return;
  let remaining = 0;
  let successful = false;
  try { child = spawnProcess(process.execPath, ['--max-old-space-size=128', script], {
   detached:process.platform !== 'win32', stdio:['ignore','ignore','ignore','ipc'],
   env:{...env,LEAD_SYNC_WORKER:'true'},
  });
  child.on('message', result => {
   if (result?.success === false && result.error) console.error('Sincronización de leads:', result.error);
   if (result?.browserDiagnostic) console.error('Diagnóstico de arranque de Chromium:', result.browserDiagnostic);
   if (result?.authenticationPaused) authPaused = true;
   if (result?.success) { successful = true; remaining = Number(result.remaining) || 0; }
  });
  watchdog = setTimer(killWorker, 180000);
  watchdog.unref();
  const finish = () => {
   clearTimer(watchdog); child = undefined;
   if (!stopped && !authPaused) {
    timer = setTimer(run, successful && remaining > 0 ? 60000 : interval);
    timer.unref();
   }
  };
  child.once('error', () => console.error('No se pudo iniciar el proceso de sincronización.'));
  child.once('close', finish); return true; } catch(error) { child=undefined; throw error; }
 };
 runNow=run;
 timer = setTimer(run, 15000); timer.unref();
}
function triggerLeadSyncNow() {
 if(env.LEAD_SYNC_ENABLED!=='true')return {started:false,reason:'disabled'};
 if(child)return {started:false,reason:'busy'};
 authPaused=false;
 if(stopped)startLeadSync();
 clearTimer(timer);timer=undefined;
 const started=runNow?.()||false;
 return {started,reason:started?'started':'busy'};
}
function isLeadSyncRunning(){return Boolean(child);}
async function stopLeadSync() {
 stopped = true; clearTimer(timer); clearTimer(watchdog); killWorker();
}

return {startLeadSync,stopLeadSync,triggerLeadSyncNow,isLeadSyncRunning};
}
export const {startLeadSync,stopLeadSync,triggerLeadSyncNow,isLeadSyncRunning}=createLeadSyncRunner();
