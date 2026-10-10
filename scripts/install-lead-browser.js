import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
if(process.env.LEAD_SYNC_CHROMIUM_PATH){
 console.log('Sincronizador: se usará el Chromium configurado en LEAD_SYNC_CHROMIUM_PATH.');
}else{
 const cli=path.join(path.dirname(require.resolve('playwright/package.json')),'cli.js');
 const result=spawnSync(process.execPath,[cli,'install','chromium'],{
  env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH||'0'},
  stdio:'inherit',timeout:240000,
 });
 if(result.status!==0)console.warn('No se pudo instalar Chromium. La app de ventas puede arrancar; revisá el build del sincronizador.');
}
