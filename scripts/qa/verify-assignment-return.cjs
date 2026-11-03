const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||undefined,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:393,height:852}});
 const origin='https://liniers.xn--somosmasdueos-skb.com',uuid='11111111-1111-4111-8111-111111111111';
 const asset=fs.readFileSync(path.join(__dirname,'../../android-tablet/app/src/main/assets/assignment-return.js'),'utf8');
 let reply={status:200,type:'application/json',body:'{"ok":true}',headers:{}};
 await page.route('**/*',route=>{
  if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<main><h1>Charla y derivación</h1><button type="button" id="save">Guardar derivación</button></main>'});
  return route.fulfill({status:reply.status,contentType:reply.type,body:reply.body,headers:reply.headers});
 });
 async function setup(next={}){
  reply={status:200,type:'application/json',body:'{"ok":true}',headers:{},...next};
  await page.goto(origin+'/floor/visits/'+uuid+'/assignment');
  await page.evaluate(({uuid})=>{window.__mdAssignment={uuid,nonce:'current-request'};window.MdAssignment={complete:nonce=>(window.__completed ||= []).push(nonce)};},{uuid});
  await page.evaluate(asset);
 }
 async function save(url='/api/floor/visits/'+uuid+'/assignment',method='POST',tap=true){
  if(tap)await page.click('#save');
  await page.evaluate(({url,method})=>fetch(url,{method}).then(r=>r.text()),{url,method});
  await page.waitForTimeout(80);
 }
 const count=()=>page.evaluate(()=>(window.__completed||[]).length);
 await setup();await save();assert.equal(await count(),1,'verified JSON save returns');
 await setup({body:'{"ok":true,"errors":[]}'});await save();assert.equal(await count(),1,'empty errors are not failures');
 await setup({body:'{"success":false,"error":"invalid"}'});await save();assert.equal(await count(),0,'business failure stays on form');
 await setup({status:500,body:'{"error":"server"}'});await save();assert.equal(await count(),0,'HTTP failure stays on form');
 await setup();await save(undefined,'GET');assert.equal(await count(),0,'GET is not a saved derivation');
 await setup();await save(undefined,'POST',false);assert.equal(await count(),0,'background POST without user submit is ignored');
 await setup();await save('/api/floor/visits/22222222-2222-4222-8222-222222222222/assignment');assert.equal(await count(),0,'another person cannot complete this lead');
 await setup();await page.evaluate(()=>history.pushState({},'','/floor/router'));assert.equal(await count(),0,'navigation alone never counts as saved');
 await setup({type:'text/x-component',body:'1:E{"digest":"validation"}'});await save();assert.equal(await count(),0,'Next action errors do not return');
 await setup({type:'text/x-component',body:'0:[]',headers:{'x-action-redirect':'/floor/router;push'}});await save();assert.equal(await count(),1,'server action redirect confirms save');
 await setup({body:'{"result":"pending-ui"}'});await save();assert.equal(await count(),0,'unrecognized 200 is not sufficient');
 await page.evaluate(()=>{const notice=document.createElement('div');notice.setAttribute('role','status');notice.textContent='Derivación registrada correctamente';document.body.append(notice);});
 await page.waitForFunction(()=>(window.__completed||[]).length===1);
 await setup({status:204,body:''});await page.click('#save');
 await page.evaluate(url=>new Promise(resolve=>{const x=new XMLHttpRequest();x.open('POST',url);x.onload=resolve;x.send();}),'/api/floor/visits/'+uuid+'/assignment');
 await page.waitForFunction(()=>(window.__completed||[]).length===1);
 console.log('PASS: saved-only return, failed/invalid saves, GETs, other visits, Next actions, DOM confirmation and XHR.');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
