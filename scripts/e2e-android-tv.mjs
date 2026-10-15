import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const dir=path.resolve('android-tv/app/src/main/assets');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
  const pathName=new URL(req.url,'http://localhost').pathname;
  if(pathName==='/tv/cache/presentation.pptx'){
    res.writeHead(200,{'content-type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
    res.end(Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.alloc(40)]));
    return;
  }
  const name=path.basename(pathName);
  if(!['index.html','tv.js','tv.css'].includes(name)){res.writeHead(404).end();return;}
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
    const current=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
    const duration=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'duration');
    Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{
      configurable:true,
      get(){return this.id==='intro-video'?Number(this.dataset.fakeTime||0):current.get.call(this);},
      set(n){if(this.id==='intro-video'){this.dataset.fakeTime=String(n);return;} current.set.call(this,n);},
    });
    Object.defineProperty(HTMLMediaElement.prototype,'duration',{
      configurable:true,
      get(){return this.id==='intro-video'?60:duration.get.call(this);},
    });
    HTMLMediaElement.prototype.play=function(){
      if(this.id==='intro-video')return Promise.resolve();
      return originalPlay.call(this);
    };
  });
  await page.route('https://esm.sh/pptx-vanilla-viewer@3.31.1?bundle',route=>route.fulfill({
    status:200,contentType:'application/javascript',
    headers:{'access-control-allow-origin':'*'},
    body:`export function createPptxViewer(host,opts){
      let slide=0,properties={};
      return {
        store:{get:()=>({presentationProperties:properties}),set:v=>{properties=v.presentationProperties||properties;}},
        async loadFile(){opts.onLoad({slideCount:40});},
        getCurrentSlide:()=>slide,
        goToSlide(n){slide=n;opts.onSlideChange(n);},
        enterPresentation(){opts.onPresentationChange(true);return Promise.resolve();},
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
  console.log('Android TV remote simulation: Enter, arrows, PageUp, PageDown and Tab OK');
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
