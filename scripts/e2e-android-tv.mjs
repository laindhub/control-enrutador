import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const dir=path.resolve('android-tv/app/src/main/assets');
const nativeRouter=readFileSync('android-tv/app/src/main/java/io/laind/masduenos/tv/TvActivity.java','utf8');
const assetStore=readFileSync('android-tv/app/src/main/java/io/laind/masduenos/tv/TvAssetStore.java','utf8');
assert.match(assetStore,/restoreBundledAssets\(listener\)/,
  'Bundled media must be restored before the server manifest fetch');
assert.ok(assetStore.indexOf('restoreBundledAssets(listener)')<
  assetStore.indexOf('JSONObject manifest=readJson(MANIFEST)'),
  'Start must be possible from APK assets before any network request');
assert.match(assetStore,/getAssets\(\)\.open\("bundle\/manifest\.json"\)/);
assert.match(assetStore,/SHA-256 del paquete incorporado incorrecto/);
const htmlEntry=readFileSync(path.join(dir,'index.html'),'utf8');
assert.match(nativeRouter,/autoOpenAfterSync/);
assert.match(nativeRouter,/if\(playable && autoOpenAfterSync && !inPlayer\)/);
assert.match(nativeRouter,/openPlayer\(\)/);
assert.match(nativeRouter,/new IntroBridge\(\)/);
assert.ok(nativeRouter.includes('new TextureView(this)'));
assert.ok(nativeRouter.includes('new Surface(surfaceTexture)'));
assert.ok(nativeRouter.includes('engine.setSurface(surface)'));
assert.ok(nativeRouter.includes('transform.setScale(scaleX,scaleY,w/2f,h/2f)'));
assert.ok(nativeRouter.includes('introLayer.bringToFront()'));
assert.ok(nativeRouter.includes('MEDIA_INFO_VIDEO_RENDERING_START'));
assert.ok(nativeRouter.includes('introLayer.setAlpha(0f)'),
  'Only the native introduction should fade in over the existing slide');
assert.match(nativeRouter,/fadeOutNativeIntroduction\(true,null\)/);
assert.match(nativeRouter,/void revealNativeIntroduction\(\)/);
// SurfaceView layering and the old opaque VideoView background caused
// sound-only playback while the composited image stayed black.
assert.ok(!nativeRouter.includes('new VideoView(this)'));
assert.ok(!nativeRouter.includes('introTexture.setBackgroundColor('));
assert.ok(nativeRouter.includes('engine.release()'));
assert.ok(nativeRouter.includes('surface.release()'));
assert.match(nativeRouter,/files\.file\("introduction"\)\.getAbsolutePath\(\)/);
assert.match(nativeRouter,/KEYCODE_TAB/);
assert.match(nativeRouter,/seekNativeIntroduction\(-5\)/);
assert.match(nativeRouter,/seekNativeIntroduction\(5\)/);
// Physical PageUp/PageDown must be handled directly by the Activity after the
// native video removes its overlay, without depending on WebView focus.
assert.ok(nativeRouter.includes('code==KeyEvent.KEYCODE_PAGE_UP||code==KeyEvent.KEYCODE_PAGE_DOWN'));
assert.ok(nativeRouter.includes('dispatchSlideNavigation(code==KeyEvent.KEYCODE_PAGE_DOWN?"PageDown":"PageUp")'));
assert.ok(nativeRouter.includes('window.tvNativeIntroEnded?.'));
assert.ok(nativeRouter.includes('window.tvRemoteKey?.'));
assert.ok(nativeRouter.includes('event.getRepeatCount()==0'));
assert.match(nativeRouter,/new GeraldinePlayer\(this,frame/);
assert.match(nativeRouter,/geraldine\.play\(files\.file\("presentation"\)/);
assert.match(nativeRouter,/void onConfigurationChanged\(Configuration config\)/);
const manifest=readFileSync('android-tv/app/src/main/AndroidManifest.xml','utf8');
assert.match(manifest,/keyboard\|keyboardHidden\|navigation/);
const nativeGeraldine=readFileSync('android-tv/app/src/main/java/io/laind/masduenos/tv/GeraldinePlayer.java','utf8');
assert.match(nativeGeraldine,/ppt\/slides\/_rels\/slide21\.xml\.rels/);
assert.match(nativeGeraldine,/new TextureView\(activity\)/);
assert.match(nativeGeraldine,/MediaMetadataRetriever/);
assert.match(nativeGeraldine,/getFrameAtTime\(0,MediaMetadataRetriever\.OPTION_CLOSEST_SYNC\)/);
assert.match(nativeGeraldine,/texture\.setAlpha\(0f\)/);
assert.match(nativeGeraldine,/MEDIA_INFO_VIDEO_RENDERING_START/);
assert.match(nativeGeraldine,/previewRequested/);
assert.match(nativeGeraldine,/void dismiss\(\)/);
assert.match(nativeRouter,/geraldine\.warm\(files\.file\("presentation"\)/);
assert.match(nativeRouter,/void previewGeraldine\(double x,double y,double w,double h\)/);
assert.match(nativeGeraldine,/ppt\/media\//);

const tvScript=readFileSync(path.join(dir,'tv.js'),'utf8');
// Browser tests must not serve an import that Android's real WebView rejects.
// This previously caused production to freeze on the static loading screen
// even though a permissive Chromium mock passed all presentation tests.
const required=['index.html','tv.js','tv.css','presentation-media.js','presentation-timing.js','pptx-viewer-offline.js'];
assert.ok(!tvScript.includes('https://esm.sh'),'PowerPoint engine must not require esm.sh');
assert.match(tvScript,/const MODULE='\.\/pptx-viewer-offline\.js'/);
for(const name of required){
  assert.ok(nativeRouter.includes('"/tv/'+name+'"'),
    'Android WebView must explicitly intercept '+name);
  assert.ok(readFileSync(path.join(dir,name)).length>0);
}
assert.match(htmlEntry,/window\.__tvBooted=false/);
assert.match(tvScript,/window\.__tvBooted=true/);
// Presentation must start automatically with no intermediate confirmation UI.
assert.doesNotMatch(htmlEntry,/id="ready"|id="start"/);
assert.doesNotMatch(tvScript,/\$\('ready'\)|\$\('start'\)/);
assert.match(tvScript,/\/\/ Once the complete PPTX and Geraldine timing are ready, enter directly\.[\s\S]*?start\(\);/);
assert.match(nativeRouter,/void exitPresentation\(\)/);
assert.doesNotMatch(tvScript,/tv-slide-veil|beginSlideTransition|navigateSlide/,
  'Slide navigation must be instantaneous with no gradient overlay');
assert.match(tvScript,/scheduleChromeSweep/);
assert.match(tvScript,/mediaSlides=new Set/);
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const pathName=new URL(req.url,'http://localhost').pathname;
  if(pathName==='/tv/cache/presentation.pptx'){
    res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
    res.end(Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(40)]));
    return;
  }
  const name=path.basename(pathName);
  if(!['index.html','tv.js','tv.css','presentation-media.js','presentation-timing.js','pptx-viewer-offline.js'].includes(name)){res.writeHead(404).end();return;}
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
        if(this.dataset.failNextPlay==='true'){
          this.dataset.failNextPlay='false';
          return Promise.reject(new DOMException('Transient decoder startup','AbortError'));
        }
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
  await page.route('**/tv/pptx-viewer-offline.js',route=>route.fulfill({
    status:200,contentType:'application/javascript',
    headers:{'access-control-allow-origin':'*'},
    body:`export function createPptxViewer(host,opts){
      let slide=0,properties={};
      const root=document.createElement('div');
      root.className='pptxv';
      root.dataset.hiddenActions=JSON.stringify(opts.hiddenActions||[]);
      root.innerHTML='<div class="pptxv-present-toolbar-wrap" style="display:block">SLIDE CONTROLS</div>'+
        '<div class="pptxv-presentation-touch-exit" style="display:block">EXIT</div>'+
        '<div class="pptxv-present-touch-prev" style="display:block"><button>BACK</button></div>'+
        '<div class="pptxv-present-touch-next" style="display:block"><button>NEXT</button></div>'+
        '<div class="pptxv-present-position" style="display:block"><span>21 / 40</span></div>'+
        '<div class="pptxv-obscure-count"><span>21 / 40</span></div>'+
        '<div class="pptxv-slide-stage"><span id="real-slide-text">21 / 40</span></div>'+
        '<div class="tv-mock-content"></div>';
      host.append(root);
      window.__tvTouchClicks=0;
      root.addEventListener('touchend',()=>window.__tvTouchClicks++);
      root.addEventListener('click',()=>window.__tvTouchClicks++);
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
        elements:i===19?[{type:'video',src:'geraldine.mp4',x:1,y:1,width:10,height:10}]:
          i===20||i===21?[{type:'media',media:{mimeType:'video/mp4',src:'geraldine.mp4'},
            x:1,y:1,width:10,height:10}]:[]
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
  // No Enter, simulated click or other user gesture: the page must enter
  // presentation by itself as soon as its cached PPTX finishes loading.
  try{
    await page.waitForFunction(()=>document.body.classList.contains('tv-presenting') &&
      document.querySelector('#slides')?.dataset.slide==='0' &&
      document.getElementById('loading')?.hidden,{},{timeout:25000});
  }catch(err){
    const diagnostic=await page.evaluate(()=>({
      title:document.querySelector('#loading h1')?.textContent,
      message:document.getElementById('message')?.textContent,
      booted:window.__tvBooted,
      started:document.body.classList.contains('tv-presenting'),
      slide:document.querySelector('#slides')?.dataset.slide,
      engineRequest:performance.getEntriesByType('resource')
        .filter(x=>x.name.includes('pptx-viewer-offline.js')).map(x=>x.name),
    }));
    console.error('Offline browser startup diagnostic:',JSON.stringify(diagnostic));
    throw err;
  }
  assert.equal(await page.locator('#ready').count(),0,'No Todo listo screen');
  assert.equal(await page.locator('#start').count(),0,'No start button');
  assert.equal(await page.locator('.pptxv').evaluate(
    el=>el.classList.contains('pptxv-presenting')),true);
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'0');
  // Most important Android TV acceptance test: never build navigation buttons,
  // and forcibly hide any desktop/mobile chrome reintroduced by the viewer.
  assert.ok(JSON.parse(await page.locator('.pptxv').getAttribute('data-hidden-actions'))
    .includes('navigation'),'viewer must not create its own navigation controls');
  for(const css of [
    '.pptxv-present-toolbar-wrap','.pptxv-presentation-touch-exit',
    '.pptxv-present-touch-prev','.pptxv-present-touch-next',
    '.pptxv-present-position','.pptxv-obscure-count span'
  ]){
    await page.waitForFunction(css=>{
      const el=document.querySelector(css);
      return !!el&&getComputedStyle(el).display==='none';
    },css);
  }
  assert.equal(await page.locator('#real-slide-text').evaluate(
    el=>getComputedStyle(el).display),'inline',
    'hide presenter counter only, not genuine slide text');
  const wasPrevented=await page.evaluate(()=>{
    const control=document.querySelector('.pptxv-present-touch-next');
    const touch=new Event('touchend',{bubbles:true,cancelable:true});
    control.dispatchEvent(touch);
    return touch.defaultPrevented;
  });
  assert.equal(wasPrevented,true,'touch input should not invoke hidden viewer navigation');
  assert.equal(await page.evaluate(()=>window.__tvTouchClicks),0,
    'the PPTX viewer must never receive touch/click during TV presentation');
  await page.mouse.move(140,180);
  await page.waitForTimeout(120);
  assert.equal(await page.locator('.pptxv-present-touch-next').evaluate(
    el=>getComputedStyle(el).display),'none','moving a pointer must not reveal controls');
  // The gradient used to cover slide changes in 1.6.7 and was distracting.
  // Both remote commands must act immediately, without a transition veil.
  const navigation=await page.evaluate(()=>{
    window.tvRemoteKey('PageDown');
    const first=document.getElementById('slides').dataset.slide;
    window.tvRemoteKey('PageUp');
    const second=document.getElementById('slides').dataset.slide;
    return {first,second,overlay:!!document.querySelector('.tv-slide-veil,.tv-slide-reveal')};
  });
  assert.equal(navigation.first,'1','PageDown must advance immediately');
  assert.equal(navigation.second,'0','PageUp must reverse immediately');
  assert.equal(navigation.overlay,false,'No visual veil should appear between slides');
  assert.ok(!readFileSync(path.join(dir,'tv.css'),'utf8').includes('.tv-slide-veil'),
    'No PPTX gradient overlay CSS should remain');
  assert.ok(nativeGeraldine.includes('setDuration(185)'),
    'Geraldine native video playback must remain unchanged');
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
  // Simulate Android's JS bridge: the physical Tab must request NATIVE
  // playback instead of starting the WebView's virtual MP4 URL.
  await page.evaluate(()=>{
    window.__nativeIntroStarts=0;
    window.AndroidTv={playIntroduction(){window.__nativeIntroStarts++;}};
  });
  await page.evaluate(()=>window.tvRemoteTab());
  assert.equal(await page.evaluate(()=>window.__nativeIntroStarts),1,
    'native Tab must invoke the Android player exactly once');
  assert.equal(await page.locator('#intro').isVisible(),false,
    'native playback must not show the WebView video overlay');
  assert.equal(await page.locator('#intro-video').getAttribute('src'),null,
    'native playback must not request the virtual MP4 from WebView');
  // Mirrors the exact JS batch delivered from Android's physical
  // PageDown key after the TextureView overlay loses keyboard focus.
  await page.evaluate(()=>{
    window.tvNativeIntroEnded('');
    window.tvRemoteKey('PageDown');
  });
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'1',
    'PageDown must navigate immediately after native video, even without DOM keydown');
  await page.evaluate(()=>window.tvRemoteKey('PageUp'));
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'0',
    'PageUp must navigate immediately after native video without focus');
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
  // The same media reference also occurs on slide 22: the duplicate-preview
  // detector would previously classify slide 21 as paused forever.
  // Simulate one rejected play() so the retry path is covered as well.
  await visible.evaluate(v=>{v.dataset.failNextPlay='true';});
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'20',
    'first forward input on slide 21 must play the video, not change slide');
  await page.waitForFunction(()=>document.querySelector('#geraldine-test')?.dataset.mockPaused==='false',
    {timeout:3500});
  assert.equal(await visible.getAttribute('data-fail-next-play'),'false',
    'a transient playback failure must be retried on Geraldine');
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
  // Touch-only controls are also recreated on slide transitions:
  // verify the observer removes them, including a new counter pill.
  await page.evaluate(()=>{
    const viewer=document.querySelector('.pptxv');
    const extra=document.createElement('div');
    extra.className='pptxv-present-touch-next';
    extra.style.setProperty('display','flex','important');
    extra.innerHTML='<button>Touch NEXT</button>';
    viewer.appendChild(extra);
    const pagination=document.createElement('div');
    pagination.className='pptxv-present-pagination';
    pagination.textContent='22 / 40';
    viewer.appendChild(pagination);
  });
  await page.waitForFunction(()=>{
    return [...document.querySelectorAll('.pptxv-present-touch-next,.pptxv-present-pagination')]
      .every(el=>getComputedStyle(el).display==='none');
  });
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

  // Simulate native Android's poster/decoder bridge *before* reaching slide
  // 21, so the preview must appear without a separate PageDown command.
  await page.evaluate(()=>{
    window.__geraldineNative=[];
    window.__geraldinePreviews=[];
    window.__geraldineStopped=0;
    window.AndroidTv={
      previewGeraldine(...bounds){window.__geraldinePreviews.push(bounds);},
      playGeraldine(...bounds){window.__geraldineNative.push(bounds);},
      stopGeraldine(){window.__geraldineStopped++;}
    };
  });
  await page.keyboard.press('PageUp');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'20');
  await page.waitForFunction(()=>document.querySelector('#geraldine-test')?.dataset.mockPaused==='true');
  assert.equal(await page.evaluate(()=>window.__geraldinePreviews.length),1,
    'slide 21 must request its first-frame poster before playback is triggered');
  assert.equal(await page.evaluate(()=>window.__geraldineNative.length),0,
    'showing a poster must never autoplay Geraldine');
  const previewBounds=await page.evaluate(()=>window.__geraldinePreviews[0]);
  assert.ok(previewBounds.every(v=>Number.isFinite(v)&&v>0&&v<1),
    'first frame must be positioned over the embedded movie, not the entire slide');
  // Real Android uses a TextureView over the ORIGINAL PPTX movie
  // shape, not the Chromium video stub.
  const browserPlays=Number(await page.locator('#geraldine-test').getAttribute('data-play-calls'));
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'20');
  assert.equal(await page.evaluate(()=>window.__geraldineNative.length),1,
    'click-build must request exactly one Android native video');
  const bounds=await page.evaluate(()=>window.__geraldineNative[0]);
  assert.ok(bounds.every(v=>Number.isFinite(v)&&v>0&&v<1),'native video bounds must be on the screen');
  assert.ok(bounds[2]/bounds[3]<0.9,'native overlay should cover only portrait video');
  await page.waitForTimeout(400);
  assert.equal(Number(await page.locator('#geraldine-test').getAttribute('data-play-calls')),browserPlays,
    'browser video must stay paused while Android renders Geraldine');
  await page.evaluate(()=>window.tvNativeGeraldineEnded(''));
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'20',
    'finishing native playback must leave the presentation on slide 21');
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'21');
  assert.equal(await page.evaluate(()=>window.__geraldineStopped),1,
    'leaving the finished slide must dismiss its poster');
  // A user can also skip Geraldine mid-play: that must release the decoder.
  await page.keyboard.press('PageUp');
  assert.equal(await page.evaluate(()=>window.__geraldinePreviews.length),2,
    'revisiting slide 21 must redisplay the cached poster');
  await page.keyboard.press('PageDown');
  assert.equal(await page.evaluate(()=>window.__geraldineNative.length),2,
    'revisiting slide 21 should allow another native playback');
  await page.keyboard.press('PageDown');
  assert.equal(await page.locator('#slides').getAttribute('data-slide'),'21');
  assert.equal(await page.evaluate(()=>window.__geraldineStopped),2,
    'skipping active Geraldine must release both decoder and poster');
  console.log('Android TV: Geraldine native video and remote navigation verified; all controls remain hidden');
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
  assert.deepEqual(offlineUnexpected,[],'Viewer must not request Internet for PowerPoint engine');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
