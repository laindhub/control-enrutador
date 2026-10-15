import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const dir=path.resolve('android-tv/app/src/main/assets');
const nativeRouter=readFileSync('android-tv/app/src/main/java/io/laind/masduenos/tv/TvActivity.java','utf8');
const htmlEntry=readFileSync(path.join(dir,'index.html'),'utf8');
assert.match(nativeRouter,/autoOpenAfterSync/);
assert.match(nativeRouter,/if\(playable && autoOpenAfterSync && !inPlayer\)/);
assert.match(nativeRouter,/openPlayer\(\)/);
const tvScript=readFileSync(path.join(dir,'tv.js'),'utf8');
// Browser tests must not serve an import that Android's real WebView rejects.
// This previously caused production to freeze on the static loading screen
// even though a permissive Chromium mock passed all presentation tests.
const required=['index.html','tv.js','tv.css','presentation-media.js','presentation-timing.js'];
for(const name of required){
  assert.ok(nativeRouter.includes('"/tv/'+name+'"'),
    'Android WebView must explicitly intercept '+name);
  assert.ok(readFileSync(path.join(dir,name)).length>0);
}
assert.match(htmlEntry,/window\.__tvBooted=false/);
assert.match(tvScript,/window\.__tvBooted=true/);
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const pathName=new URL(req.url,'http://localhost').pathname;
  if(pathName==='/tv/cache/presentation.pptx'){
    res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
    res.end(Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(40)]));
    return;
  }
  const name=path.basename(pathName);
  if(!['index.html','tv.js','tv.css','presentation-media.js','presentation-timing.js'].includes(name)){res.writeHead(404).end();return;}
  res.writeHead(200,{'content-type':mime[path.extname(name)]});
  res.end(readFileSync(path.join(dir,name)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  page.on('pageerror',err=>{throw err;});
  await page.addInitScript(()=>{
    const originalPlay=HTMLMediaElement.prototype.play;
    const originalPause=HTMLMediaElement.prototype.pause;
    const originalPaused=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'paused');
    const current=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
    const duration=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'duration');
    Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{
      configurable:true,
      get(){return this.id==='intro-video'?Number(this.dataset.fakeTime||0):
          this.id==='geraldine-test'?Number(this.dataset.fakeTime||0):
          current.get.call(this);},
      set(n){if(this.id==='intro-video'||this.id==='geraldine-test'){
          this.dataset.fakeTime=String(n);return;
        } current.set.call(this,n);},
    });
    Object.defineProperty(HTMLMediaElement.prototype,'duration',{
      configurable:true,
      get(){return this.id==='intro-video'?60:duration.get.call(this);},
    });
    Object.defineProperty(HTMLMediaElement.prototype,'paused',{
      configurable:true,
      get(){return this.id==='geraldine-test'?
        this.dataset.mockPaused!=='false':originalPaused.get.call(this);}
    });
    HTMLMediaElement.prototype.pause=function(){
      if(this.id==='geraldine-test'){
        this.dataset.mockPaused='true';
        this.dataset.pauseCalls=String(1+Number(this.dataset.pauseCalls||0));
        return;
      }
      return originalPause.call(this);
    };
    HTMLMediaElement.prototype.play=function(){
      if(this.id==='intro-video')return Promise.resolve();
      if(this.id==='geraldine-test'){
        this.dataset.playCalls=String(1+Number(this.dataset.playCalls||0));
        this.dataset.mockPaused='false';
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      }
      return originalPlay.call(this);
    };
  });
  // Verify the fallback also works for future replacement PPTX versions:
  // the known SHA-256 doesn't match, but slide 21 still contains Geraldine.
  await page.route('**/tv/presentation-timing.js',route=>route.fulfill({
    status:200,contentType:'application/javascript',
    body:'export async function getTimedVideoSlide(){return null;}',
  }));
  await page.route('https://esm.sh/pptx-vanilla-viewer@3.31.1?bundle',route=>route.fulfill({
    status:200,contentType:'application/javascript',
    headers:{'access-control-allow-origin':'*'},
    body:`export function createPptxViewer(host,opts){
      let slide=0,properties={};
      const root=document.createElement('div');
      root.className='pptxv';
      root.innerHTML='<div class="pptxv-present-toolbar-wrap" style="display:block">SLIDE CONTROLS</div>'+
        '<div class="pptxv-presentation-touch-exit" style="display:block">EXIT</div>'+
        '<div class="tv-mock-content"></div>';
      host.append(root);
      const fake=()=>{
        const zone=root.querySelector('.tv-mock-content');
        zone.replaceChildren();
        if(slide===19||slide===20){
          const v=document.createElement('video');
          v.id='geraldine-test';
          v.style.cssText='display:block;width:480px;height:270px;';
          v.dataset.mockPaused='true';
          v.controls=true;
          zone.append(v);
          // Simulate the PPTX engine's unwelcome automatic video play.
          v.play();
        }
      };
      const slides=Array.from({length:40},(_,i)=>({
        elements:(i===19||i===20)?[{type:'video',src:'geraldine.mp4',x:1,y:1,width:10,height:10}]:[]
      }));
      return {
        store:{get:()=>({presentationProperties:properties}),set:v=>{properties=v.presentationProperties||properties;}},
        async loadFile(){opts.onLoad({slideCount:40});},
        getSlides:()=>slides,
        getCurrentSlide:()=>slide,
        goToSlide(n){slide=n;opts.onSlideChange(n);fake();},
        enterPresentation(){
          root.classList.add('pptxv-presenting');
          opts.onPresentationChange(true);
          fake();
          return Promise.resolve();
        },
      };
    }`,
  }));
  await page.goto('http://127.0.0.1:'+server.address().port+'/tv/index.html');
  await page.locator('#start').waitFor({state:'visible',timeout:25000});
  assert.match(await page.locator('#summary').textContent(),/40 diapositivas/);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ready').isVisible(),false);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'1');
  await page.keyboard.press('PageUp');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'0');
  await page.keyboard.press('Tab');
  await page.locator('#intro').waitFor({state:'visible'});
  await page.locator('#intro-video').evaluate(v=>{v.currentTime=17;});
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#intro-video').evaluate(v=>v.currentTime),22);
  await page.keyboard.press('PageUp');
  assert.equal(await page.locator('#intro-video').evaluate(v=>v.currentTime),17);
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('#intro-video').evaluate(v=>v.currentTime),12);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#intro-video').evaluate(v=>v.currentTime),17);
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'0');
  await page.keyboard.press('Tab');
  await page.locator('#intro').waitFor({state:'hidden'});
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'1');
  // The viewer's floating controls must be hidden even when its own markup
  // sets display:block. There must be no mouse-dependent presentation chrome.
  assert.equal(await page.locator('.pptxv-present-toolbar-wrap').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await page.locator('.pptxv-presentation-touch-exit').evaluate(el=>getComputedStyle(el).display),'none');
  for(let i=1;i<19;i++)await page.keyboard.press('PageDown');
  await page.waitForFunction(()=>document.querySelector('#geraldine-test')?.dataset.mockPaused==='true');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'19');
  // The slideshow's preview video must be paused, even if the viewer
  // automatically calls play() when mounting the DOM.
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'20');
  await page.waitForFunction(()=>document.querySelector('#geraldine-test')?.dataset.mockPaused==='true');
  const visible=page.locator('#geraldine-test');
  await page.waitForFunction(()=>{
    const v=document.querySelector('#geraldine-test');
    return v && !v.controls && v.style.pointerEvents==='none';
  });
  assert.ok(Number(await visible.getAttribute('data-pause-calls'))>=1,
    'automatic Geraldine play must be intercepted and paused');
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'20',
    'first forward input on slide 21 must play the video, not change slide');
  await page.waitForFunction(()=>document.querySelector('#geraldine-test')?.dataset.mockPaused==='false');
  const played=Number(await visible.getAttribute('data-play-calls'));
  await page.waitForTimeout(500);
  assert.equal(Number(await visible.getAttribute('data-play-calls')),played,
    'Geraldine must never start playing again on viewer refresh');
  await visible.evaluate(video=>video.dispatchEvent(new Event('ended')));
  await page.waitForTimeout(450);
  assert.equal(Number(await visible.getAttribute('data-play-calls')),played,
    'Geraldine must not restart after ending');
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'21',
    'second forward input must advance from the video to slide 22');
  // The engine can recreate its toolbar whenever slides change.
  await page.evaluate(()=>{
    const wrap=document.querySelector('.pptxv');
    const controls=document.createElement('div');
    controls.className='pptxv-present-toolbar-wrap';
    controls.textContent='late controls';
    controls.style.display='block';
    wrap.appendChild(controls);
  });
  await page.waitForFunction(()=>{
    const all=[...document.querySelectorAll('.pptxv-present-toolbar-wrap')];
    return all.length>=2 && all.every(el=>getComputedStyle(el).display==='none' &&
      el.getAttribute('aria-hidden')==='true');
  });
  // The PPTX engine can also force the existing bar back via an inline style.
  await page.evaluate(()=>{
    const bar=document.querySelector('.pptxv-present-toolbar-wrap');
    bar.style.setProperty('display','block','important');
  });
  await page.waitForFunction(()=>[...document.querySelectorAll('.pptxv-present-toolbar-wrap')]
    .every(el=>getComputedStyle(el).display==='none'));

  await page.keyboard.press('PageUp');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'20');
  await page.waitForFunction(()=>document.querySelector('#geraldine-test')?.dataset.mockPaused==='true');
  console.log('Android TV: controls hidden; Geraldine preview paused; one-click playback; no replay; PageUp/PageDown OK');
  // Failed module requests must show a usable retry action, not an endless
  // "Preparando presentación" spinner like Android TV 1.1.0.
  const broken=await browser.newPage();
  await broken.addInitScript(()=>{window.__tvBootTimeoutMs=350;});
  await broken.route('**/tv/presentation-media.js',route=>route.fulfill({
    status:404,body:'',contentType:'text/plain',
  }));
  await broken.goto('http://127.0.0.1:'+server.address().port+'/tv/index.html');
  await broken.locator('#retry-start').waitFor({state:'visible',timeout:5000});
  assert.match(await broken.locator('#loading h1').textContent(),/No se pudo iniciar/);
  assert.equal(await broken.locator('.spinner').isVisible(),false);
  await broken.close();
  console.log('Android TV: missing module now shows actionable error and Retry button');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
