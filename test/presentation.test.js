import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ejs from 'ejs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('presentation route is isolated and available without the CRM session', () => {
  const server = read('src/server.js');
  const presentation = server.indexOf("app.get('/presentacion'");
  const startupGate = server.indexOf("app.use((req, res, next) => {\n  if (startupState === 'starting')");
  const session = server.indexOf('app.use(sessionMiddleware);');
  assert.ok(presentation > 0, 'presentation route exists');
  assert.ok(presentation > startupGate, 'viewer follows normal service readiness checks');
  assert.ok(presentation < session, 'local-only viewer does not require login');
  assert.match(server, /res\.render\('presentation'/);
  assert.match(server, /https:\/\/esm\.sh/);
});

test('PPTX client loads locally, supports presentation and optional editing', () => {
  const html = read('views/presentation.ejs');
  const js = read('public/js/presentation.js');
  assert.match(html, /type="file"/);
  assert.match(html, /id="start"/);
  assert.match(html, /id="edit-mode"/);
  assert.match(html, /id="download"/);
  assert.match(js, /viewer\.loadFile\(file\)/);
  assert.match(js, /viewer\.enterPresentation\(\)/);
  assert.match(js, /viewer\.downloadPptx\(currentFile\.name\)/);
  assert.match(js, /autosave: false/);
  assert.match(js, /onPresentationChange/);
  assert.match(js, /onSlideChange/);
  assert.match(js, /media\.play\(\)/);
  assert.match(js, /duplicateVideoPreviewSlides/);
  assert.match(js, /blockPreviewAutoplay/);
  assert.match(html, /id="video-auto-slide"/);
  assert.doesNotMatch(js, /fetch\([^)]*file|FormData\(|XMLHttpRequest/);
});

test('presentation page uses its own isolated mobile styling and no unsafe inline scripts', () => {
  const html = read('views/presentation.ejs');
  const css = read('public/css/presentation.css');
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.match(html, /assetUrl\('js\/presentation\.js'\)/);
});

test('all static assets referenced by presentation EJS exist and render', () => {
  const html = read('views/presentation.ejs');
  const assets = [...html.matchAll(/assetUrl\('([^']+)'\)/g)].map(match => match[1]);
  assert.ok(assets.length >= 4, 'icons, CSS and JS are resolved through the asset helper');
  for (const asset of assets) {
    const file = new URL('../public/' + asset, import.meta.url);
    assert.ok(readFileSync(file).length > 0, asset + ' must exist in the deployed public directory');
  }
  const rendered = ejs.render(html, {
    assetUrl: relativePath => {
      const file = new URL('../public/' + relativePath, import.meta.url);
      readFileSync(file); // Same fail-fast behavior as the production assetUrl.
      return '/assets/' + relativePath;
    },
  }, {filename: 'views/presentation.ejs'});
  assert.match(rendered, /<title>Presentación \| Salón Más Dueños<\/title>/);
  assert.match(rendered, /src="\/assets\/js\/presentation.js"/);
  assert.match(rendered, /href="\/assets\/assets\/favicon-red.svg"/);
});

test('error page and main login use the current system name', () => {
  for (const path of ['views/error.ejs', 'views/login.ejs', 'views/warming.ejs', 'views/operator.ejs', 'views/app.ejs', 'views/admin.ejs']) {
    assert.doesNotMatch(read(path), /Control Enrutador|CONTROL ENRUTADOR/, path);
  }
  assert.match(read('views/error.ejs'), /SALÓN MÁS DUEÑOS/);
});


test('a repeated video previews paused then plays on the following slide', async () => {
  const {duplicateVideoPreviewSlides, mayAutoPlayVideo} = await import('../public/js/presentation-media.js');
  const slides = [
    {elements:[{type:'text',text:'Intro'}]},
    {elements:[{type:'media',mediaType:'video/mp4',src:'video.mp4',x:80,y:60,width:520,height:330}]},
    {elements:[{type:'media',mediaType:'video/mp4',src:'video.mp4',x:80,y:60,width:520,height:330}]},
    {elements:[{type:'media',mediaType:'video/mp4',src:'otro.mp4',x:80,y:100,width:520,height:300}]},
  ];
  const paused=duplicateVideoPreviewSlides(slides);
  assert.deepEqual([...paused],[1]);
  assert.equal(mayAutoPlayVideo(1,paused),false);
  assert.equal(mayAutoPlayVideo(2,paused),true);
  assert.equal(mayAutoPlayVideo(3,paused),true);
  assert.equal(mayAutoPlayVideo(1,paused,1),true,'explicit override');
  assert.equal(mayAutoPlayVideo(2,paused,1),false,'override disables other slides');
});

test('the same video with different temporary URLs remains paused on its preview', async () => {
  const {duplicateVideoPreviewSlides} = await import('../public/js/presentation-media.js');
  const slides=[
    {elements:[{type:'video',src:'blob:temp-A',x:30,y:50,width:600,height:340}]},
    {elements:[{type:'video',src:'blob:temp-B',x:30,y:50,width:600,height:340}]},
    {elements:[{type:'video',src:'otro.mp4',x:0,y:0,width:100,height:80}]},
  ];
  assert.deepEqual([...duplicateVideoPreviewSlides(slides)],[0]);
});


test('two different videos in the same slide position are not treated as previews', async () => {
  const {duplicateVideoPreviewSlides} = await import('../public/js/presentation-media.js');
  const slides = [
    {elements:[{type:'media',src:'intro.mp4',x:60,y:60,width:800,height:480}]},
    {elements:[{type:'media',src:'next.mp4',x:60,y:60,width:800,height:480}]},
  ];
  assert.deepEqual([...duplicateVideoPreviewSlides(slides)], []);
});


test('slideshow loop turns on only for the active session, preserving other properties', async () => {
  const {enablePresentationLoop} = await import('../public/js/presentation-loop.js');
  let state={presentationProperties:{showSubtitles:true,loopContinuously:false}, endOfShow:true};
  const viewer={store:{get:()=>state,set:patch=>{state={...state,...patch};}}};
  const restore=enablePresentationLoop(viewer);
  assert.equal(typeof restore,'function');
  assert.equal(state.presentationProperties.loopContinuously,true);
  assert.equal(state.presentationProperties.showSubtitles,true);
  assert.equal(state.endOfShow,false);
  viewer.store.set({presentationProperties:{...state.presentationProperties,showSubtitles:false}});
  restore();
  restore();
  assert.equal(state.presentationProperties.loopContinuously,false);
  assert.equal(state.presentationProperties.showSubtitles,false);
  assert.equal(state.endOfShow,false);
});

test('unconfigured looping flag is removed on exit, never baked into saved presentation', async () => {
  const {enablePresentationLoop} = await import('../public/js/presentation-loop.js');
  let state={presentationProperties:{showSubtitles:true}};
  const viewer={store:{get:()=>state,set:patch=>{state={...state,...patch};}}};
  const restore=enablePresentationLoop(viewer);
  assert.equal(state.presentationProperties.loopContinuously,true);
  restore();
  assert.equal(Object.hasOwn(state.presentationProperties,'loopContinuously'),false);
  assert.equal(enablePresentationLoop({}),null,'do not start a show if the library changes its API');
});

test('presentation uses the native continuous loop for keyboard, wheel and click navigation', () => {
  const script=read('public/js/presentation.js');
  const css=read('public/css/presentation.css');
  assert.match(script,/enablePresentationLoop\(viewer\)/);
  assert.match(script,/restorePresentationLoop\?\.\(\)/);
  assert.match(script,/onPresentationChange:/);
  assert.match(css,/\.pptxv-presentation-touch-exit\{display:none!important\}/);
});


test('the real 40-slide deck has a deferred video animation on logical slide 21', async () => {
  const {videoStepForHash, isForwardInput} = await import('../public/js/presentation-timing.js');
  const sha='bdb35bfa366b7c2570a36a0d5b1172836765d50796a8e772345b5a5ccf6f25c7';
  assert.equal(videoStepForHash(34796967, sha),20);
  assert.equal(videoStepForHash(34796966, sha),null);
  assert.equal(videoStepForHash(34796967, 'not-original'),null);
  assert.equal(isForwardInput({type:'wheel',deltaY:20,deltaX:0}),true);
  assert.equal(isForwardInput({type:'wheel',deltaY:-20,deltaX:0}),false);
  assert.equal(isForwardInput({type:'keydown',key:'ArrowDown'}),true);
  assert.equal(isForwardInput({type:'keydown',key:'Escape'}),false);
  assert.equal(isForwardInput({type:'click',button:0}),true);
  assert.equal(isForwardInput({type:'click',button:2}),false);
  assert.equal(isForwardInput({type:'touchend',deltaY:75}),true);
  assert.equal(isForwardInput({type:'touchend',deltaY:-75}),false);
});

test('video playback is suppressed until the slide internal step is triggered', () => {
  const script=read('public/js/presentation.js');
  assert.match(script,/mediaBuildSlide = await getTimedVideoSlide\(file\)/);
  assert.match(script,/activeSlideIndex === mediaBuildSlide && \(!mediaBuildTriggered \|\| videoPlaybackEnded\)/);
  assert.match(script,/mediaBuildTriggered = true;/);
  assert.match(script,/event\.stopImmediatePropagation\(\)/);
  assert.match(script,/document\.addEventListener\('wheel', handleMediaBuildAdvance/);
});


test('salon menus include an accessible shortcut to presentations', () => {
  for (const path of ['views/app.ejs', 'views/admin.ejs', 'views/login.ejs', 'views/operator.ejs']) {
    assert.match(read(path), /href="\/presentacion"/, path);
  }
  assert.match(read('public/css/styles.css'), /\.presentation-shortcut/);
});

test('official presentation and local upload are separate cards', () => {
  const view = read('views/presentation.ejs');
  const script = read('public/js/presentation.js');
  assert.match(view, /id="open-default"/);
  assert.match(view, /id="dropzone"/);
  assert.match(view, /id="default-availability"/);
  assert.match(view, /40 diapositivas/);
  assert.match(script, /\/assets\/presentaciones\/mas-duenos-liniers\.pptx/);
  assert.match(script, /fetch\(DEFAULT_PPTX_URL, \{method:'HEAD'/);
  assert.match(script, /new File\(\[data\], DEFAULT_PPTX_NAME/);
  assert.match(script, /isOfficialDeckResponse\(response\)/);
  assert.match(script, /readVerifiedOfficialDeck\(response\)/);
  assert.match(script, /openPresentation\(file\)/);
  assert.match(script, /Archivo pendiente de publicación/);
});

test('the default deck has a hash-verified same-origin route before authentication', () => {
  const server=read('src/server.js');
  const pptxRoute=server.indexOf("app.get('/assets/presentaciones/mas-duenos-liniers.pptx'");
  const session=server.indexOf('app.use(sessionMiddleware);');
  const helper=read('src/official-presentation.js');
  assert.ok(pptxRoute > 0 && pptxRoute < session, 'default deck is available without requiring a CRM login');
  assert.match(server, /resolveOfficialPresentation\(/);
  assert.match(server, /Cache-Control', 'no-store'/);
  assert.match(server, /res\.sendFile\(filename/);
  assert.match(helper, /masduenos/);
  assert.match(helper, /OFFICIAL_PRESENTATION_SHA256/);
});

test('Hostinger 200/HTML warming does not make the official PPTX appear available', async () => {
  const {isOfficialDeckResponse,readVerifiedOfficialDeck,OFFICIAL_DECK_MIME,OFFICIAL_DECK_SIZE} =
    await import('../public/js/presentation-source.js');
  const html = new Response('<h1>Conectando</h1>',{status:200,headers:{'content-type':'text/html'}});
  assert.equal(isOfficialDeckResponse(html),false);
  await assert.rejects(readVerifiedOfficialDeck(html),/no entregó el archivo PowerPoint/);
  assert.equal(isOfficialDeckResponse(new Response(null,{status:200,headers:{
    'content-type':OFFICIAL_DECK_MIME,'content-length':String(OFFICIAL_DECK_SIZE+1)
  }})),false);
  assert.equal(isOfficialDeckResponse(new Response(null,{status:200,headers:{
    'content-type':OFFICIAL_DECK_MIME,'content-length':String(OFFICIAL_DECK_SIZE)
  }})),true);
});

test('official deck verifies bytes, ZIP signature and SHA-256 before viewer.loadFile', async () => {
  const {createHash,webcrypto} = await import('node:crypto');
  const {readVerifiedOfficialDeck,OFFICIAL_DECK_MIME} = await import('../public/js/presentation-source.js');
  const bytes=Buffer.from([80,75,3,4,0,1,2,3]);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const settings={size:bytes.length,sha256,subtle:webcrypto.subtle};
  const make=content=>new Response(content,{status:200,headers:{'content-type':OFFICIAL_DECK_MIME}});
  assert.equal((await readVerifiedOfficialDeck(make(bytes),settings)).size,bytes.length);
  await assert.rejects(readVerifiedOfficialDeck(make(bytes),{...settings,size:bytes.length+1}),/incompleta/);
  await assert.rejects(readVerifiedOfficialDeck(make(bytes),{...settings,sha256:'0'.repeat(64)}),/no coincide/);
  await assert.rejects(readVerifiedOfficialDeck(make(Buffer.alloc(bytes.length)),settings),/no es un PPTX/);
});

test('official deck endpoint precedes startup warmup middleware', () => {
  const source=read('src/server.js');
  const route=source.indexOf("app.get('/assets/presentaciones/mas-duenos-liniers.pptx'");
  const gate=source.indexOf("app.use((req, res, next) => {");
  assert.ok(route>0 && route<gate, 'PPTX must be delivered even during DB startup');
});

test('Geraldine clip plays once, and the next navigation skips the native playFrom animation', () => {
  const js=read('public/js/presentation.js');
  assert.match(js,/videoPlaybackEnded = true/);
  assert.match(js,/mediaAttempted = new WeakSet\(\);\n    blockWheelUntil = 0/);
  assert.match(js,/videoPlaybackNode && videoPlaybackNode !== media/);
  assert.doesNotMatch(js,/const generation = \+\+mediaGeneration;\s*mediaAttempted = new WeakSet/);
  assert.match(js,/viewer\?\.goToSlide\(activeSlideIndex \+ 1\)/);
  assert.match(js,/document\.addEventListener\('touchend', handleMediaTouchEnd/);
  assert.match(js,/document\.addEventListener\('click', handleMediaBuildAdvance/);
});
