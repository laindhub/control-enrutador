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
  // Dos diapositivas consecutivas comparten exactamente el mismo archivo.
  const video = path.join(root, 'public/assets/demo-ai/videos/melissa-historia.mp4');
  for (const label of ['VIDEO PAUSADO', 'VIDEO AUTOMÁTICO']) {
    const panel = pptx.addSlide();
    panel.addText(label, {x: 1, y: 0.2, w: 8, h: 0.7, fontSize: 24, color: '202020'});
    panel.addMedia({type: 'video', path: video, x: 2, y: 1.4, w: 8, h: 4.5});
  }
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
  page.on('pageerror', error => console.error('Browser error:', error.message));
  const response = await page.goto(address, {waitUntil:'domcontentloaded'});
  assert.equal(response.status(), 200, 'presentation must render without a server error');
  await page.locator('h1').waitFor();
  assert.equal(await page.title(), 'Presentación | Salón Más Dueños');
  await page.locator('#file-input').setInputFiles(presentation);
  await page.locator('#workspace').waitFor({state:'visible',timeout:120000});
  await page.waitForFunction(() => /3 diapositivas/.test(document.getElementById('file-meta')?.textContent || ''), null, {timeout:120000});
  assert.equal(await page.locator('#file-name').textContent(), 'smoke.pptx');
  assert.match(await page.locator('#file-meta').textContent(), /3 diapositivas/);
  assert.equal(await page.locator('#start').isVisible(), true);
  const hostSize = await page.locator('#pptx-host').evaluate(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
  assert.ok(hostSize.width > 300 && hostSize.height > 300, 'viewer has a measurable stage');
  await page.waitForFunction(() => document.getElementById('pptx-host')?.textContent?.includes('PRUEBA PPTX'), null, {timeout:30000});
  // Verificar controles sobre medios reales, sin requerir audio ni códec H264
  // en el runner (sí requiere video nativo en el DOM del visor).
  await page.locator('#start').click();
  await page.keyboard.press('ArrowRight');
  const getStageVideo = () => {
    const stage = document.fullscreenElement || document.getElementById('pptx-host');
    const candidates = [...stage.querySelectorAll('video')];
    return candidates.find(video => {
      const rect = video.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && rect.top < innerHeight && rect.bottom > 0;
    });
  };
  await page.waitForFunction(getStageVideo, null, {timeout:10000});
  await page.waitForTimeout(500);
  // Serializar la propiedad explícita del elemento; una implementación que
  // reproduzca todo por defecto fallaría esta comprobación.
  const previewAutoplay = await page.evaluate(() => {
    const stage = document.fullscreenElement || document.getElementById('pptx-host');
    return [...stage.querySelectorAll('video')].find(x => x.getBoundingClientRect().width > 1)?.autoplay;
  });
  if (previewAutoplay === undefined) {
    console.log('MEDIA DEBUG', await page.evaluate(() => {
      const stage = document.fullscreenElement || document.getElementById('pptx-host');
      return {fullscreen: Boolean(document.fullscreenElement), stageTag: stage.tagName,
        stageText: stage.textContent?.slice(-400),
        videos: [...document.querySelectorAll('video')].map(v => ({
          autoplay:v.autoplay, paused:v.paused,
          width:Math.round(v.getBoundingClientRect().width),
          height:Math.round(v.getBoundingClientRect().height),
          src: v.getAttribute('src')?.slice(0,70),
        })),
        notices:[...document.querySelectorAll('.status')].map(e=>e.textContent),
      };
    }));
  }
  assert.equal(previewAutoplay, false, 'first repeated video is a paused preview');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  const playbackAutoplay = await page.evaluate(() => {
    const stage = document.fullscreenElement || document.getElementById('pptx-host');
    return [...stage.querySelectorAll('video')].find(x => x.getBoundingClientRect().width > 1)?.autoplay;
  });
  assert.equal(playbackAutoplay, true, 'next slide allows automatic playback');
  console.log('PPTX rendered in Chromium; preview paused, following slide autoplay enabled.');

} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive:true, force:true});
}