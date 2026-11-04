import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ejs from 'ejs';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const template=fs.readFileSync(path.join(root,'views/presenter.ejs'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:393,height:852}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let rate=32000,commissions=[],payments=[],saleMonth='2026-11';
 const rates=()=>[{effective_date:'2026-12-01',amount:100000},{effective_date:'2026-11-01',amount:rate},{effective_date:'2026-10-01',amount:32000}];
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/presentador')return route.fulfill({contentType:'text/html',body:ejs.render(template,{user:{username:'Prueba',role:'presenter'},csrfToken:'test',embedded:true,assetUrl:p=>'/assets/'+p}).replace(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g,(tag,url)=>url.endsWith('/presenter.js')?tag:'')});
  if(url.pathname.startsWith('/assets/')){
   const name=path.resolve(root,'public',url.pathname.slice(8));assert.ok(name.startsWith(path.join(root,'public')+path.sep));
   return route.fulfill({contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'application/octet-stream',body:fs.readFileSync(name)});
  }
  if(url.pathname==='/api/presenters/state')return route.fulfill({contentType:'application/json',body:JSON.stringify({today:'2026-11-04',user:{username:'Prueba',role:'presenter'},rates:rates(),sales:commissions.map((commission,i)=>({id:i+1,commission,announced_date:saleMonth+'-02',client_name:'Prueba '+i})),payments,folders:[],people:[]})});
  return route.fulfill({contentType:'application/json',body:'{}'});
 });
 const counts=()=>page.locator('.sales-threshold-counts span').allTextContents();
 async function refresh(expected){
  await page.click('#refresh');
  await page.waitForFunction(expected=>JSON.stringify([...document.querySelectorAll('.sales-threshold-counts span')].map(n=>n.textContent))===JSON.stringify(expected),expected);
 }
 await page.goto('https://masduenos.laind.io/presentador');
 await page.waitForSelector('.sales-threshold-counts');
 assert.deepEqual(await counts(),['8 ventas','16 ventas','24 ventas','32 ventas']);
 rate=48000;await refresh(['6 ventas','11 ventas','16 ventas','21 ventas']);
 commissions=[48000,48000,48000];await refresh(['3 ventas','8 ventas','13 ventas','18 ventas']);
 assert.match(await page.locator('#sales-progress').innerText(),/144\.000/);
 assert.match(await page.locator('#sales-progress').innerText(),/48\.000/,'future commission must not apply early');
 payments=[{paid_date:'2026-11-04',amount:900000,folder_start:'2026-10-29'}];await refresh(['3 ventas','8 ventas','13 ventas','18 ventas']);
 commissions=[32000,48000,48000];await refresh(['3 ventas','8 ventas','13 ventas','19 ventas']);
 commissions=[208000];await refresh(['1 venta','7 ventas','12 ventas','17 ventas']);
 commissions=[250000];await refresh(['0 ventas','6 ventas','11 ventas','16 ventas']);
 commissions=[1008000];await refresh(['0 ventas','0 ventas','0 ventas','0 ventas']);
 assert.match(await page.locator('#sales-progress').innerText(),/Meta alcanzada/);
 rate=0;commissions=[];await refresh(['—','—','—','—']);
 assert.match(await page.locator('#sales-progress').innerText(),/comisión mayor a cero/);
 rate=48000;commissions=[32000,32000,32000];saleMonth='2026-10';
 await page.click('#refresh');await page.locator('#month').fill('2026-10');await page.locator('#month').dispatchEvent('change');
 assert.deepEqual(await counts(),['5 ventas','13 ventas','21 ventas','29 ventas'],'historical month uses its own commission rate');
 for(const width of [320,393,1280]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: dynamic rates, remaining sales, mixed historical commissions, payments excluded, attained goals, zero rate and mobile layouts.');
}finally{await browser.close();}
