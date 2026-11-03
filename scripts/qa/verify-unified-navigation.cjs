const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||undefined,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:393,height:852}});
 const script=fs.readFileSync(path.join(__dirname,'../../android-tablet/app/src/main/assets/unified-navigation.js'),'utf8')
   .replace("location.href='masduenos://tab/'+tab;","(window.__nativeNotifications ||= []).push(tab);");
 const origin='https://liniers.xn--somosmasdueos-skb.com';
 const fixture=`<html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0">
 <main id="crm-content"><h1>Salón</h1><button id="unrelated">Hoy</button><p>Contenido del CRM</p></main>
 <nav id="original-tabs" style="position:fixed;bottom:0;left:0;right:0;height:68px;display:flex">
 <a href="/floor" onclick="event.preventDefault();history.pushState({},'',this.href);window.clicked='puestos'">Puestos</a>
 <a href="/floor/activity" onclick="event.preventDefault();history.pushState({},'',this.href);window.clicked='hoy'">Hoy</a>
 <a href="/floor/actual-profile-route" onclick="event.preventDefault();history.pushState({},'',this.href);window.clicked='yo'">Yo</a></nav></body></html>`;
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:fixture}));
 await page.goto(origin+'/floor');await page.evaluate(script);
 await page.waitForFunction(()=>document.getElementById('original-tabs').dataset.mdUnifiedNav==='1');
 assert.equal(await page.locator('#original-tabs').isVisible(),false);
 assert.equal(await page.locator('#crm-content').isVisible(),true);
 await page.evaluate(()=>{window.__mdUnifiedDestination='yo';window.__mdOpenUnifiedTab();});
 assert.equal(await page.evaluate(()=>window.clicked),'yo');
 assert.ok(page.url().endsWith('/floor/actual-profile-route'));
 await page.evaluate(()=>{window.__mdUnifiedDestination='hoy';window.__mdOpenUnifiedTab();});
 assert.equal(await page.evaluate(()=>window.clicked),'hoy');
 assert.equal(await page.locator('#unrelated').isVisible(),true);
 await page.evaluate(script);
 assert.equal(await page.locator('[data-md-unified-nav]').count(),1);
 // A request from the native dock must survive login until the real controls exist.
 await page.goto(origin+'/floor/login');
 await page.evaluate(()=>{document.getElementById('original-tabs').remove();window.__mdUnifiedDestination='yo';});
 await page.evaluate(script);
 assert.equal(await page.evaluate(()=>window.__mdUnifiedDestination),'yo');
 await page.evaluate(()=>{
  const nav=document.createElement('nav');nav.id='login-completed-tabs';nav.style.cssText='position:fixed;bottom:0;left:0;right:0;height:68px';
  for(const label of ['Puestos','Hoy','Yo']){const b=document.createElement('button');b.textContent=label;b.onclick=()=>window.clicked=label.toLowerCase();nav.append(b);}document.body.append(nav);
 });
 await page.waitForFunction(()=>window.__mdUnifiedDestination==='');
 assert.equal(await page.evaluate(()=>window.clicked),'yo');
 // An unrelated origin never gets navigation interception.
 await page.goto('https://untrusted.example/floor');await page.evaluate(script);
 assert.equal(await page.evaluate(()=>window.__mdUnifiedNavigation),undefined);
 console.log('PASS: phone navigation, profile route discovery, no duplicate docks, pending login destination, trusted origin and unrelated controls.');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
