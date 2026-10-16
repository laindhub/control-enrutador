/**
 * Generate exact visual snapshots of the Liniers PPTX using the SAME local
 * pptx-vanilla-viewer version used by Android TV. CI only; TCL only displays
 * the resulting JPEGs and never repaints the PowerPoint on PageDown.
 *
 * The capture runs with the real signed media bundle and no Internet access.
 * There are no external fonts, cloud renders, conversion services, or changes
 * to the original video/media bytes.
 */
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {extname,resolve,join,sep} from 'node:path';
import {chromium} from 'playwright';

const root=resolve('android-tv/app/src/main/assets');
const deck=join(root,'bundle','presentation.pptx');
const meta=JSON.parse(await readFile(join(root,'bundle','manifest.json'),'utf8'));
if(meta.version!==1 || meta.presentation.size!==(await stat(deck)).size)
  throw Error('Offline slide captures require a verified original PPTX');
const output=join(root,'slides');
await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://localhost');
  let f;
  if(url.pathname==='/tv/cache/presentation.pptx')f=deck;
  else if(url.pathname.startsWith('/tv/')) {
    f=resolve(root,url.pathname.slice('/tv/'.length));
    if(!f.startsWith(root+sep)){response.writeHead(403).end();return;}
  }else{response.writeHead(404).end();return;}
  import('node:fs/promises').then(fs=>fs.stat(f)).then(info=>{
    response.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream','content-length':info.size});
    createReadStream(f).pipe(response);
  }).catch(()=>response.writeHead(404).end());
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({
    viewport:{width:1920,height:1080},
    deviceScaleFactor:1,
    reducedMotion:'reduce',
  });
  const external=[];
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('blob:')||url.startsWith('data:'))
      return route.continue();
    external.push(url);
    return route.abort('internetdisconnected');
  });
  const page=await context.newPage();
  page.on('pageerror',e=>console.error('PPTX snapshot pageerror:',e.message));
  await page.goto(origin+'/tv/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.classList.contains('tv-presenting')&&
    document.getElementById('loading')?.hidden&&
    document.getElementById('slides')?.dataset.slide==='0',null,{timeout:180000});
  await page.evaluate(()=>document.fonts.ready);
  const shots=[];
  // Rendering happens here ONCE, on GitHub's much faster computer, never
  // at the moment the TCL presenter presses a remote control button.
  for(let n=0;n<40;n++){
    const state=await page.evaluate(index=>window.__tvCaptureSlide?.(index),n);
    if(state!==n)throw Error('PPTX captured incorrect slide: '+n+' became '+state);
    await page.waitForFunction(index=>document.getElementById('slides')?.dataset.slide===String(index),n);
    // A small settlement window is intentional during CI to avoid capturing
    // Chromium's 4-tile intermediate composite, which is the user's bug.
    await page.waitForTimeout(165);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>
      requestAnimationFrame(resolve))));
    const name='slide-'+String(n+1).padStart(3,'0')+'.jpg';
    const path=join(output,name);
    const jpeg=await page.screenshot({
      type:'jpeg',quality:94,
      animations:'disabled',
      timeout:40000,
    });
    if(jpeg.length<14000)throw Error('Slide '+(n+1)+' screenshot unexpectedly tiny');
    await writeFile(path,jpeg);
    shots.push(name);
    console.log('Pre-rendered',n+1,'/ 40,',Math.round(jpeg.length/1024),'KiB');
  }
  if(external.length)throw Error('Rendering fetched external resources: '+external.join(', '));
  await writeFile(join(output,'manifest.json'),JSON.stringify({
    version:1,
    pptxSha256:meta.presentation.sha256,
    pptxBytes:meta.presentation.size,
    slideCount:shots.length,
    width:1920,height:1080,
    images:shots,
  },null,2)+'\n');
  console.log('All 40 pre-rendered slides ready; PowerPoint tile redraw eliminated at runtime.');
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
