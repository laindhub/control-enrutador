const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.join(__dirname,'../../android-tablet/app/src/main/assets');
const crmOrigin='https://liniers.xn--somosmasdueos-skb.com';
const uuid='11111111-1111-4111-8111-111111111111';
(async()=>{
 let server,browser;
 try {
  const timers=new Set();
  server=http.createServer((req,res)=>{
   if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   res.write(`<html><head><meta name="viewport" content="width=device-width"></head><body>
    <header>Local 1 · Salón · Nahuel · Salir</header><main id="body"><div class="animate-pulse">Cargando</div></main>
    <nav id="dock" style="position:fixed;bottom:0;height:68px"><a href="/floor" aria-current="page">Puestos</a><a href="/floor/activity">Hoy</a><a href="/floor/profile">Yo</a></nav>`);
   const timer=setTimeout(()=>{
    timers.delete(timer);
    res.end(`<script>document.querySelector('main').innerHTML='<h1>Charla y derivación</h1><form><button type="button" role="radio">La vio entera</button><select><option>Asesor</option></select><button type="button" id="save">Guardar derivación</button></form>';</script></body></html>`);
   },1400);
   timers.add(timer);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const script=name=>fs.readFileSync(path.join(root,name),'utf8').replaceAll(crmOrigin,origin);
  browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:393,height:852}});
  const navigations=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url());});
  await page.goto(origin+'/floor/visits/'+uuid+'/assignment',{waitUntil:'commit'});
  await page.waitForSelector('#dock');
  assert.equal(await page.evaluate(script('assignment-readiness.js')),false,'the streamed header and skeleton are not a ready form');
  await page.evaluate(()=>{
   window.__mdUnifiedHideOnly=true;
   window.MdAssignment={complete:nonce=>(window.__completed||=[]).push(nonce)};
  });
  // Deliberately inject as early as the old 500ms path. Hide-only must remain safe.
  await page.evaluate(script('unified-navigation.js'));
  await page.waitForFunction(()=>document.querySelector('#dock').dataset.mdUnifiedNav==='1');
  await page.waitForLoadState('load');
  assert.equal(await page.evaluate(script('assignment-readiness.js')),true);
  assert.equal(await page.locator('#save').isVisible(),true);
  assert.deepEqual(navigations,[origin+'/floor/visits/'+uuid+'/assignment'],'no custom-scheme main-frame navigation during streaming');
  assert.equal(await page.locator('#dock').isVisible(),false);
  await page.evaluate(({uuid})=>{window.__mdAssignment={uuid,nonce:'streamed-visit'};},{uuid});
  await page.evaluate(script('assignment-return.js'));
  await page.route('**/api/**',route=>route.fulfill({contentType:'application/json',body:'{"ok":true}'}));
  await page.click('#save');
  await page.evaluate(uuid=>fetch('/api/floor/visits/'+uuid+'/assignment',{method:'POST'}),uuid);
  await page.waitForFunction(()=>window.__completed?.length===1);
  assert.deepEqual(await page.evaluate(()=>window.__completed),['streamed-visit']);
  assert.equal(navigations.length,1,'confirmation uses the native message, not navigation');
  await page.evaluate(()=>{document.querySelector('main').innerHTML='<div class="animate-pulse">Cargando</div>';});
  assert.equal(await page.evaluate(script('assignment-readiness.js')),false,'a permanent skeleton never masquerades as ready');
  await page.evaluate(()=>{history.replaceState({},'','/floor/login');document.querySelector('main').innerHTML='<input type="password" placeholder="PIN">';});
  assert.equal(await page.evaluate(script('assignment-readiness.js')),true,'show the real login if authentication is needed');
  await page.evaluate(uuid=>{history.replaceState({},'','/floor/visits/'+uuid+'/assignment');document.querySelector('main').innerHTML='<input type="hidden" value="uuid">';},uuid);
  assert.equal(await page.evaluate(script('assignment-readiness.js')),false,'hidden fields are not a usable form');
  console.log('PASS: streamed CRM form completes without navigation, skeleton readiness, original login, single dock and native saved-only return.');
 } finally {
  if(browser)await browser.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
