import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ejs from 'ejs';

test('/impresion route precedes startup guard and downloads a fixed ZIP',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.ok(server.indexOf("app.get('/impresion'")>0);
 assert.ok(server.indexOf("app.get('/impresion'")<server.indexOf("if (startupState === 'starting')",server.indexOf("app.use((req, res, next) => {",server.indexOf("app.get('/health'"))));
 assert.match(server,/app.get\('\/impresion\/descargar'/);
 assert.ok(server.includes("res.download(impressionZip,'Impresion_Mas_Duenos_2.3.1.zip'"));
 assert.ok(server.includes("path.join(publicRoot,'assets','impresion','Impresion_Mas_Duenos_2.3.1.zip')"));
});
test('installation guide only offers download when package exists',()=>{
 const view=readFileSync(new URL('../views/impression.ejs',import.meta.url),'utf8');
 const vars={assetUrl:()=>'/assets/favicon.svg'};
 const ready=ejs.render(view,{...vars,downloadable:true});
 const pending=ejs.render(view,{...vars,downloadable:false});
 assert.ok(ready.includes('href="/impresion/descargar"'));
 assert.ok(pending.includes('Preparando descarga'));
 assert.ok(!pending.includes('href="/impresion/descargar"'));
 assert.ok(ready.includes('edge://extensions'));
 assert.ok(ready.includes('manifest.json'));
 assert.ok(ready.includes('confirmación final'));
});
