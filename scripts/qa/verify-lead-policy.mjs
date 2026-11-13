import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ejs from 'ejs';
import {chromium} from 'playwright';
import {leadPlan,leadPolicy,leadSummary,normalizeLeadPolicy} from '../../src/presenter-leads.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const template=fs.readFileSync(path.join(root,'views/presenter.ejs'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
let embedded=false,postCount=0,total=600,policies=new Map([['2026-10',{unlock:650,baseRate:1350,elite:780,eliteRate:1500}]]);
const plans=new Map(),entries=[];
function current(month){const key=[...policies.keys()].filter(k=>k<=month).sort().at(-1);return {key,policy:normalizeLeadPolicy(policies.get(key))};}
const render=()=>ejs.render(template,{user:{username:'Prueba',role:'presenter_admin'},csrfToken:'test',embedded,assetUrl:p=>'/assets/'+p})
 .replace(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g,(tag,url)=>url.endsWith('/presenter-policy.js')||(embedded&&url.endsWith('/presenter-leads.js'))?tag:'');
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.pathname==='/presentador')return route.fulfill({contentType:'text/html',body:render()});
 if(url.pathname.startsWith('/assets/')){
  const name=path.resolve(root,'public',url.pathname.slice(8));assert.ok(name.startsWith(path.join(root,'public')+path.sep));
  const type=name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':'application/octet-stream';
  return route.fulfill({contentType:type,body:fs.readFileSync(name)});
 }
 if(url.pathname.endsWith('/lead-policy')){
  if(request.method()==='POST'){
   const body=request.postDataJSON(),value=leadPolicy(body);policies.set(body.month,value);postCount++;
   return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
  }
  const month=url.searchParams.get('month')||'2026-11',state=current(month);
  return route.fulfill({contentType:'application/json',body:JSON.stringify({month,policy:state.policy,policyMonth:state.key})});
 }
 if(url.pathname.endsWith('/lead-plan')&&request.method()==='POST'){
  const body=request.postDataJSON();
  plans.set(body.month,leadPlan(body,body.month));
  return route.fulfill({json:{ok:true}});
 }
 if(url.pathname.endsWith('/lead-entries')&&request.method()==='POST'){
  const body=request.postDataJSON();
  assert.equal(body.operation,'subtract');
  entries.push({id:1,entry_date:body.date,quantity:-Number(body.quantity),notes:body.notes});
  return route.fulfill({status:201,json:{ok:true}});
 }
 if(url.pathname.endsWith('/lead-entries/1')&&request.method()==='DELETE'){
  entries.length=0;
  return route.fulfill({json:{ok:true}});
 }
 if(url.pathname.endsWith('/lead-state')){
  const month=url.searchParams.get('month')||'2026-11',policy=current(month).policy,plan=plans.get(month)||{goal:780};
  return route.fulfill({contentType:'application/json',body:JSON.stringify({month,today:'2026-11-03',user:{username:'Prueba'},policy,plan,entries,snapshot:{quantity:total,source_label:'Prueba',captured_at:'2026-11-03'},summary:leadSummary({month,today:'2026-11-03',sourceCount:total,manualCount:entries.reduce((sum,e)=>sum+e.quantity,0),policy,plan})})});
 }
 return route.fulfill({contentType:'application/json',body:'{}'});
});
try{
 await page.setViewportSize({width:393,height:852});await page.goto('https://masduenos.laind.io/presentador');
 await page.evaluate(()=>{document.querySelector('#panel-sales').hidden=true;document.querySelector('#panel-admin').hidden=false;});
 const form=page.locator('#lead-policy-form');await page.waitForFunction(()=>document.querySelector('#lead-policy-form [name=unlock]').value==='650');
 assert.equal(await form.locator('[name=basic]').inputValue(),'');
 assert.equal(await page.locator('#panel-leads').count(),0,'web does not enable the Android-only calculator');
 const values={basic:500,basicRate:1200,unlock:650,baseRate:1350,elite:780,eliteRate:1500};
 for(const [name,value]of Object.entries(values))await form.locator('[name='+name+']').fill(String(value));
 await form.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#lead-policy-status').textContent.includes('guardados'));
 assert.equal(postCount,1);
 await page.reload();await page.evaluate(()=>{document.querySelector('#panel-sales').hidden=true;document.querySelector('#panel-admin').hidden=false;});
 await page.waitForFunction(()=>document.querySelector('#lead-policy-form [name=basic]').value==='500');
 assert.equal(await form.locator('[name=basicRate]').inputValue(),'1200');
 await form.locator('[name=basic]').fill('700');await form.locator('[type=submit]').click();assert.equal(postCount,1,'invalid ordering never submits');
 await form.locator('[name=basic]').fill('500');
 for(const width of [320,393,1280]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow at '+width);
  assert.equal(await page.locator('.brand img').isVisible(),width>700,'original web logo at '+width);
 }
 await page.setViewportSize({width:393,height:1000});
 fs.mkdirSync(path.join(root,'../web-qa'),{recursive:true});
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
 await page.screenshot({path:path.join(root,'../web-qa/gestion-mobile.png'),fullPage:false});
 embedded=true;await page.goto('https://masduenos.laind.io/presentador');
 await page.evaluate(()=>{document.querySelector('#panel-sales').hidden=true;document.querySelector('#panel-leads').hidden=false;document.querySelector('#lead-plan-form').parentElement.open=true;});
 await page.waitForFunction(()=>document.querySelector('#lead-progress').textContent.includes('Nivel básico alcanzado'));
 const ars=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
 for(const [goal,amount]of [[499,0],[500,600000],[649,778800],[650,877500],[779,1051650],[780,1170000]]){
  await page.locator('#lead-plan-form [name=goal]').fill(String(goal));
  assert.equal((await page.locator('#lead-goal-projection-value').innerText()).replace(/\D/g,''),String(amount),'UI projection at '+goal);
 }
 assert.ok((await page.locator('#lead-metrics').innerText()).includes(ars.format(720000)));
 // Generated earnings use the attained tier; potential compares unlock and elite.
 const metric=label=>page.locator('#lead-metrics .metric').filter({has:page.locator('span',{hasText:label})});
 const generated=metric('Comisión generada'),potential=metric('Acumulado potencial');
 for(const [count,earned,level,unlockPotential,elitePotential]of [[600,720000,'básico',810000,900000],[650,877500,'desbloqueo',877500,975000],[780,1170000,'élite',1053000,1170000]]){
  total=count;await page.reload();
  await page.waitForFunction(count=>document.querySelector('#lead-metrics .metric strong')?.textContent.trim()===String(count),count);
  assert.equal((await generated.locator('strong').innerText()).replace(/\D/g,''),String(earned),'earned at '+count);
  assert.equal(await generated.locator('.metric-note').innerText(),'('+level+')');
  assert.equal((await potential.locator('strong').innerText()).replace(/\D/g,''),String(unlockPotential),'unlock potential at '+count);
  assert.equal(await potential.locator('.metric-note').innerText(),'(élite: '+ars.format(elitePotential)+')');
 }
 total=600;await page.reload();
 await page.waitForFunction(()=>document.querySelector('#lead-metrics').textContent.includes('720.000'));
 for(const width of [320,393,1280]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>{document.querySelector('#panel-sales').hidden=true;document.querySelector('#panel-leads').hidden=false;});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'potential card does not overflow at '+width);
 }
 // Saving in Gestión refreshes the embedded calculation, without an APK or reload.
 await page.evaluate(()=>{document.querySelector('#panel-leads').hidden=true;document.querySelector('#panel-admin').hidden=false;});
 await page.waitForFunction(()=>document.querySelector('#lead-policy-form [name=basicRate]').value==='1200');
 await form.locator('[name=basicRate]').fill('1250');await form.locator('[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#lead-metrics').textContent.includes('750.000'));
 assert.equal(await form.locator('[name=basicRate]').inputValue(),'1250','lead refresh cannot overwrite the editor');
 await page.reload();
 await page.evaluate(()=>{
  document.querySelector('#panel-sales').hidden=true;
  document.querySelector('#panel-leads').hidden=false;
  document.querySelector('#lead-plan-form').parentElement.open=true;
 });
 await page.waitForFunction(()=>!document.querySelector('#lead-plan-fields').disabled);
 await page.locator('#lead-use-calendar').check();
 await page.locator('[data-date="2026-11-03"]').click();
 await page.locator('[data-date="2026-11-04"]').click();
 await page.locator('#lead-plan-form button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#lead-progress').textContent.includes('26 jornadas restantes según tus francos'));
 assert.deepEqual(plans.get('2026-11').offDates,['2026-11-03','2026-11-04']);
 await page.locator('#lead-month').fill('2026-10');
 await page.waitForFunction(()=>document.querySelector('[data-date="2026-10-31"]'));
 assert.equal(await page.locator('#lead-use-calendar').isChecked(),false);
 await page.locator('#lead-month').fill('2026-11');
 await page.waitForFunction(()=>document.querySelector('[data-date="2026-11-03"][aria-pressed="true"]'));
 await page.locator('#lead-use-calendar').uncheck();
 await page.locator('#lead-plan-form button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#lead-progress').textContent.includes('20 jornadas restantes estimadas'));
 assert.equal(plans.get('2026-11').offDates,null);
 await page.setViewportSize({width:393,height:852});
 await page.locator('#new-leads').click();
 await page.locator('#lead-entry-form select[name=operation]').selectOption('subtract');
 await page.locator('#lead-entry-form [name=quantity]').fill('3');
 await page.locator('#lead-entry-form [name=notes]').fill('Corrección de duplicados');
 await page.locator('#lead-entry-form button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#lead-progress').textContent.includes('597 / 780'));
 assert.match(await page.locator('#lead-entries').innerText(),/-3 entrevistas/);
 await page.locator('[data-lead-entry-delete="1"]').click();
 await page.locator('#lead-delete-confirm').click();
 await page.waitForFunction(()=>document.querySelector('#lead-progress').textContent.includes('600 / 780'));
 assert.deepEqual(errors,[]);
 console.log('PASS: web Gestión, six persisted fields, validation, 320/393/1280 layouts, original web logo, generated earnings by tier, unlock/elite potential and embedded refresh.');
}finally{await browser.close();}
