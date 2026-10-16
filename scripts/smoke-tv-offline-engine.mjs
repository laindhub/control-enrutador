import assert from 'node:assert/strict';
import {readFileSync,createReadStream,statSync} from 'node:fs';
import {extname,join,normalize,resolve,sep} from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const dir=resolve('android-tv/app/src/main/assets');
const pptx=join(dir,'bundle','presentation.pptx');
assert.ok(statSync(pptx).size>1000000,'Actual verified PPTX must be available');
assert.ok(statSync(join(dir,'pptx-viewer-offline.js')).size>10000,'Bundled engine must be built');
const snapshots=JSON.parse(readFileSync(join(dir,'slides','manifest.json'),'utf8'));
const packageManifest=JSON.parse(readFileSync(join(dir,'bundle','manifest.json'),'utf8'));
assert.equal(snapshots.pptxSha256,packageManifest.presentation.sha256,'Images must match original PPTX');
assert.equal(snapshots.slideCount,40);
for(let i=1;i<=40;i++)
  assert.ok(statSync(join(dir,'slides','slide-'+String(i).padStart(3,'0')+'.jpg')).size>14000);
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer((req,res)=>{
  let requested=new URL(req.url,'http://127.0.0.1').pathname;
  let file;
  if(requested==='/tv/cache/presentation.pptx')file=pptx;
  else if(requested.startsWith('/tv/')){
    file=resolve(dir,requested.slice(4));
    if(!file.startsWith(dir+sep)){res.writeHead(403).end();return;}
  }else{res.writeHead(404).end();return;}
  try{
    const size=statSync(file).size;
    res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','content-length':size});
    createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1920,height:1080}});
  let forbidden=[];
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))
      return route.continue();
    forbidden.push(url);return route.abort('internetdisconnected');
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text().slice(0,450));});
  await page.goto(origin+'/tv/index.html',{waitUntil:'domcontentloaded',timeout:30000});
  const status=await Promise.race([
    page.waitForFunction(()=>{
      const mode=document.body.classList.contains('tv-presenting');
      const hidden=document.getElementById('loading')?.hidden;
      const html=document.getElementById('slides')?.innerHTML||'';
      return mode&&hidden&&html.length>1000?'ready':false;
    },null,{timeout:180000}).then(()=>({ok:true})),
    page.waitForFunction(()=>document.querySelector('#loading h1')?.textContent.includes('No se pudo abrir'),
      null,{timeout:180000}).then(()=>({ok:false})),
  ]);
  const state=await page.evaluate(()=>({
    slide:document.getElementById('slides')?.dataset.slide,
    loaded:document.getElementById('loading')?.hidden,
    chars:document.getElementById('slides')?.innerHTML.length,
    message:document.getElementById('message')?.textContent,
    title:document.querySelector('#loading h1')?.textContent,
  }));
  console.log('Offline browser load state:',JSON.stringify(state));
  assert.equal(forbidden.length,0,'External network used by PPTX viewer: '+forbidden.join(', '));
  assert.ok(status.ok,'Failed offline PPTX parse: '+JSON.stringify(state)+'; errors '+errors.join(' | '));
  assert.equal(String(state.slide),'0','Presentation must automatically start on first slide');
  const first=await page.waitForFunction(()=>document.querySelector('#tv-fast-layer img')?.naturalWidth===1920,
    null,{timeout:20000});
  assert.ok(first,'First instant screenshot must be fully decoded');
  const clock=await page.evaluate(()=>{
    const start=performance.now();
    window.tvRemoteKey?.('PageDown');
    return {ms:performance.now()-start,slide:document.getElementById('slides')?.dataset.slide};
  });
  assert.equal(clock.slide,'1','PageDown must advance immediately with no Wi-Fi');
  await page.evaluate(()=>window.tvMenuResumed?.());
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'1',
    'Resuming from the native menu must not recreate/reset the PowerPoint');
  assert.ok(clock.ms<120,'PageDown handler must not redraw PPTX: '+clock.ms+'ms');
  await page.waitForFunction(()=>
    document.querySelector('#tv-fast-layer img')?.src.endsWith('/slide-002.jpg') &&
    document.querySelector('#tv-fast-layer img')?.naturalWidth===1920,
    null,{timeout:15000});
  await page.evaluate(()=>window.tvRemoteKey?.('PageUp'));
  await page.waitForFunction(()=>document.querySelector('#tv-fast-layer img')?.src.endsWith('/slide-001.jpg'),null,{timeout:5000});
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'0');
  console.log('Offline TCL scenario: all 40 screenshots pre-rendered, full PPTX loaded, next/previous without PPTX repaint or Wi-Fi PASSED');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
