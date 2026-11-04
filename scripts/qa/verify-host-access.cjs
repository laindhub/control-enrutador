const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||undefined,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:393,height:852}});
  const origin='https://liniers.xn--somosmasdueos-skb.com';
  const script=fs.readFileSync(path.join(__dirname,'../../android-tablet/app/src/main/assets/host-access-state.js'),'utf8');
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<main></main>'}));
  const read=async()=>JSON.parse(await page.evaluate(script));
  await page.goto(origin+'/floor/login');
  assert.deepEqual(await read(),{login:true,authenticated:false},'show login before a form or PIN field exists');
  await page.evaluate(()=>{document.querySelector('main').innerHTML='<h1>Elegí tu perfil</h1><button>Host de prueba</button>';});
  assert.equal(await page.locator('form,input').count(),0);
  assert.equal((await read()).login,true,'the real profile chooser can have no form');
  await page.evaluate(()=>{history.replaceState({},'','/floor/full-test');});
  assert.deepEqual(await read(),{login:true,authenticated:false},'React can show the chooser without changing the full-test URL');
  await page.evaluate(()=>{
   document.querySelector('main').innerHTML='<input type="password" name="pin"><button>Ingresar</button>';
   Object.defineProperty(HTMLInputElement.prototype,'value',{get(){throw Error('Credentials must never be read');}});
  });
  assert.equal((await read()).login,true,'the detector does not read the PIN value');
  await page.evaluate(()=>{document.querySelector('main').innerHTML='<button aria-pressed="true">Atendidas</button><p>No hay personas atendidas</p><input type="search" placeholder="Buscar personas">';});
  assert.deepEqual(await read(),{login:false,authenticated:true},'after re-login an empty day is still authenticated');
  await page.evaluate(()=>{document.querySelector('main').insertAdjacentHTML('beforeend','<p>Iniciar sesión de prueba</p><input type="password" hidden>');});
  assert.deepEqual(await read(),{login:false,authenticated:true},'hidden credential templates and person text cannot force login');
  await page.evaluate(()=>{history.replaceState({},'','/floor/visits/11111111-1111-4111-8111-111111111111/full-test');document.querySelector('main').innerHTML='<h1>Persona de prueba</h1><button>Imprimir Full-test</button>';});
  assert.deepEqual(await read(),{login:false,authenticated:true},'a selected visit stays authenticated');
  await page.evaluate(()=>{document.querySelector('main').innerHTML='<h1>Ingresá tu PIN</h1><input name="pin"><button>Ingresar</button>';});
  assert.deepEqual(await read(),{login:true,authenticated:false},'a session lost while verifying a visit is detected');
  await page.goto(origin+'/floor/full-test');
  assert.deepEqual(await read(),{login:false,authenticated:false},'an empty streaming document is not an authenticated list');
  await page.goto('https://untrusted.example/floor/login');
  assert.deepEqual(await read(),{login:false,authenticated:false},'an unrelated origin cannot report Host authentication');
  console.log('PASS: login without form, same-route expiry, PIN privacy, empty-day recovery, selected-visit expiry and trusted origin.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
