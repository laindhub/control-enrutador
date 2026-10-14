import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import ejs from 'ejs';
import helmet from 'helmet';
import {chromium} from 'playwright';
import PptxGenJS from 'pptxgenjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(path.join(tmpdir(), 'presentacion-e2e-'));
const presentation = path.join(temp, 'smoke.pptx');
let browser, server;
try {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  const slide = pptx.addSlide();
  slide.background = {color: 'FFFFFF'};
  slide.addText('PRUEBA PPTX', {x: 1, y: 2, w: 9, h: 1, fontSize: 32, color: '202020'});
  const last=pptx.addSlide();
  last.addText('DIAPOSITIVA FINAL', {x: 1, y: 2, w: 9, h: 1, fontSize: 32, color: '202020'});
  await pptx.writeFile({fileName: presentation});

  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://esm.sh'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      connectSrc: ["'self'", 'https://esm.sh', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:', 'blob:', 'https://fonts.gstatic.com'],
      mediaSrc: ["'self'", 'blob:', 'data:', 'https:'],
      workerSrc: ["'self'", 'blob:']
    }}
  }));
  app.use('/assets', express.static(path.join(root, 'public')));
  const assetUrl = (resource) => {
    const normalized = String(resource).replace(/^[/]+/, '');
    if (normalized.includes('..')) throw Error('Invalid asset path');
    readFileSync(path.join(root, 'public', normalized));
    return '/assets/' + normalized;
  };
  app.get('/presentacion', (_req, res) => {
    res.send(ejs.render(
      requireView(),
      {assetUrl},
      {filename: path.join(root, 'views/presentation.ejs')}
    ));
  });
  function requireView() { return readFileSync(path.join(root, 'views/presentation.ejs'), 'utf8'); }
  server = await new Promise(resolve => {
    const http = app.listen(0, '127.0.0.1', () => resolve(http));
  });
  const address = 'http://127.0.0.1:' + server.address().port + '/presentacion';
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({acceptDownloads:true});
  await page.addInitScript(() => {
    // Mock only the absent introductory MP4. The slideshow video engine
    // continues to use normal HTMLMediaElement behavior.
    const nativeSrc=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
    const nativePlay=HTMLMediaElement.prototype.play;
    const nativeLoad=HTMLMediaElement.prototype.load;
    Object.defineProperty(HTMLMediaElement.prototype,'src',{
      configurable:true,
      set(value){
        if(this.id==='intro-video'){
          this.dataset.testIntroUrl=value;
          return;
        }
        nativeSrc.set.call(this,value);
      },
      get(){
        if(this.id==='intro-video')return this.dataset.testIntroUrl||'';
        return nativeSrc.get.call(this);
      },
    });
    HTMLMediaElement.prototype.play=function(){
      if(this.id==='intro-video')return Promise.resolve();
      return nativePlay.call(this);
    };
    HTMLMediaElement.prototype.load=function(){
      if(this.id==='intro-video')return;
      return nativeLoad.call(this);
    };
    window.__screenWakeLog={requests:0,releases:0};
    Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{
      request:async type=>{
        if(type!=='screen') throw Error('Unexpected wake type');
        window.__screenWakeLog.requests++;
        const sentinel=new EventTarget();
        sentinel.release=async()=>{
          window.__screenWakeLog.releases++;
          sentinel.dispatchEvent(new Event('release'));
        };
        return sentinel;
      },
    }});
  });
  page.on('pageerror', error => console.error('Browser error:', error.message));
  const response = await page.goto(address, {waitUntil:'domcontentloaded'});
  assert.equal(response.status(), 200, 'presentation must render without a server error');
  await page.locator('h1').waitFor();

  assert.equal(await page.locator('#open-default').isVisible(), true);
  assert.equal(await page.locator('#dropzone').isVisible(), true);
  await page.waitForFunction(() => {
    const status = document.getElementById('default-availability')?.textContent || '';
    return /Lista para abrir|pendiente de publicación/.test(status);
  }, null, {timeout:15000});

  assert.equal(await page.title(), 'Presentación | Salón Más Dueños');
  assert.equal(await page.locator('#remote-enabled').isChecked(),true,
    'physical K01 Tab must work without onboarding');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#intro-overlay').isVisible(),false,
    'Tab must not launch the introduction before fullscreen starts');
  assert.equal(await page.evaluate(()=>document.fullscreenElement),null);

  // Browser-local remote proof: capture one key event and a rapid pair, bind it
  // to the independent intro, and ensure settings persist across reload.
  await page.locator('#remote-settings summary').click();
  await page.locator('#remote-listen').click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#remote-events li').count(),3,
    'one press and two presses should produce three visible DOM records');
  assert.equal(await page.locator('#remote-assign').isEnabled(),true);
  await page.locator('#remote-assign').click();
  assert.match(await page.locator('#remote-current').textContent(),/key::Tab/);
  await page.locator('#remote-enabled').check();
  await page.locator('#remote-intro-url').fill('/assets/presentaciones/introduccion.mp4');
  await page.locator('#remote-save-url').click();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#intro-overlay').isVisible(),false,
    'Even mapped Tab must not open MP4 from the selection screen');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.match(await page.locator('#remote-current').textContent(),/key::Tab/);
  assert.equal(await page.locator('#remote-intro-url').inputValue(),
    '/assets/presentaciones/introduccion.mp4');
  assert.equal(await page.locator('#remote-enabled').isChecked(),true);
  // Test the mapped key outside fullscreen; while presenting, the same key
  // must never unexpectedly replace the slides with the intro.

  // In a no-cache test environment, the viewer ESM is preloaded, but no
  // presentation should be fetched or built until the user selects one.
  assert.equal(await page.locator('#welcome').isVisible(),true);
  assert.equal(await page.locator('#open-default').getAttribute('data-prepared'),null);

  // Hostinger sometimes answers asset requests with HTTP 200 + HTML startup page.
  const officialAsset='**/assets/presentaciones/mas-duenos-liniers.pptx';
  await page.route(officialAsset,route=>route.fulfill({
    status:200,contentType:'text/html; charset=utf-8',body:'<h1>Conectando</h1>',
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#default-availability')?.textContent?.includes('Archivo pendiente de publicación'));
  assert.equal(await page.locator('#open-default').isDisabled(),true);
  assert.equal(await page.locator('#dropzone').isVisible(),true);
  await page.unroute(officialAsset);

  await page.locator('#file-input').setInputFiles(presentation);
  await page.locator('#workspace').waitFor({state:'visible',timeout:120000});
  await page.waitForFunction(() => /2 diapositivas/.test(document.getElementById('file-meta')?.textContent || ''), null, {timeout:120000});
  assert.equal(await page.locator('#file-name').textContent(), 'smoke.pptx');
  assert.match(await page.locator('#file-meta').textContent(), /2 diapositivas/);
  assert.equal(await page.locator('#start').isVisible(), true);
  const hostSize = await page.locator('#pptx-host').evaluate(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
  assert.ok(hostSize.width > 300 && hostSize.height > 300, 'viewer has a measurable stage');
  await page.waitForFunction(() => document.getElementById('pptx-host')?.textContent?.includes('PRUEBA PPTX'), null, {timeout:30000});
  // Exercise the real pinned viewer: the show must wrap from its final
  // slide back to the first while retaining fullscreen.
  await page.locator('#start').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement), null, {timeout:15000});
  async function assertFullscreenCursorHidden(label) {
    const sample=await page.evaluate(() => {
      const fs=document.fullscreenElement;
      const positions=[[Math.round(innerWidth/2),Math.round(innerHeight/2)],
        [Math.round(innerWidth*.15),Math.round(innerHeight*.2)],
        [Math.round(innerWidth*.85),Math.round(innerHeight*.8)]];
      return {root:fs?getComputedStyle(fs).cursor:null,
        hits:positions.map(([x,y])=>{
          const el=document.elementFromPoint(x,y);
          return {x,y,tag:el?.tagName,cursor:el?getComputedStyle(el).cursor:null};
        })};
    });
    assert.equal(sample.root,'none',label+': fullscreen root cursor');
    for(const hit of sample.hits){
      assert.equal(hit.cursor,'none',label+': visible cursor on '+hit.tag+' at '+hit.x+','+hit.y);
    }
  }
  await page.mouse.move(120,110);
  await page.mouse.move(560,340);
  await assertFullscreenCursorHidden('slide 1');

  // With a PPTX loaded but before fullscreen, Tab still must not launch the
  // video. This protects both the editor and the file selection screen.
  // Same physical Tab may start the intro over slide 1. It must preserve
  // fullscreen and reveal physical slide 1 after the video has ended.
  await page.keyboard.press('Tab');
  await page.locator('#intro-overlay').waitFor({state:'visible',timeout:10000});
  assert.equal(await page.locator('#intro-video').getAttribute('data-test-intro-url'),
    '/assets/presentaciones/introduccion.mp4');
  assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true);
  assert.equal(await page.locator('#intro-video').evaluate(video=>video.controls),false,
    'native playback controls must never appear');
  await page.mouse.move(300,100);
  await page.mouse.move(650,370);
  assert.equal(await page.locator('#intro-overlay').evaluate(el=>getComputedStyle(el).cursor),'none',
    'moving the mouse must not reveal a cursor over the introduction');
  assert.equal(await page.locator('#intro-video').evaluate(el=>getComputedStyle(el).cursor),'none');
  await page.locator('#intro-video').evaluate(video=>video.dispatchEvent(new Event('ended')));
  await page.locator('#intro-overlay').waitFor({state:'hidden',timeout:10000});
  assert.equal(await page.locator('#pptx-host').getAttribute('data-active-slide-index'),'0');
  await page.mouse.move(330,260);
  await assertFullscreenCursorHidden('slide 1 after introduction');

  await page.waitForFunction(() => window.__screenWakeLog.requests===1,null,{timeout:10000});
  assert.equal(await page.evaluate(()=>window.__screenWakeLog.releases),0,
    'wake lock must remain held while the slideshow is fullscreen');
  const slideshowToolbar=page.locator('.pptxv.pptxv-presenting .pptxv-present-toolbar-wrap');
  await slideshowToolbar.waitFor({state:'attached',timeout:15000});
  await page.mouse.move(100,100);
  await page.mouse.move(600,720);
  await page.waitForTimeout(650);
  assert.equal(await slideshowToolbar.evaluate(node=>getComputedStyle(node).display),'none',
    'moving the mouse in fullscreen must not reveal the toolbar');

  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.getElementById('pptx-host')?.dataset.activeSlideIndex === '1', null, {timeout:15000});
  await page.mouse.move(270,580);
  await assertFullscreenCursorHidden('slide 2');

  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#intro-overlay').isVisible(),false,
    'intro button must not interrupt slide 2 or later');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.getElementById('pptx-host')?.dataset.activeSlideIndex === '0', null, {timeout:15000});
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true,
    'advancing beyond last slide must not close fullscreen');
  // Esc must still exit the fullscreen presentation.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement, null, {timeout:10000});
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).cursor),'none',
    'cursor must return after Escape');

  await page.waitForFunction(() => window.__screenWakeLog.releases===1,null,{timeout:10000});
  console.log('Screen wake lock acquired in fullscreen and released after Escape.');
  console.log('PPTX opened, wrapped continuously, and exited with Escape in Chromium.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive:true, force:true});
}