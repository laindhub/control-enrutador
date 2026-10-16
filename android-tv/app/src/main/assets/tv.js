import {duplicateVideoPreviewSlides,mayAutoPlayVideo} from './presentation-media.js';
import {getTimedVideoSlide} from './presentation-timing.js';
// Reaching this line confirms that every local ES module resolved correctly.
window.__tvBooted=true;
const $=id=>document.getElementById(id);
const DECK='/tv/cache/presentation.pptx';
const INTRO='/tv/cache/introduccion.mp4';
const MODULE='./pptx-viewer-offline.js';
let viewer=null,slide=0,total=0,mode='loading';
let mediaBuildSlide=null,mediaBuildTriggered=false,mediaPlaybackEnded=false;
let mediaPlaybackNode=null,mediaAttempted=new WeakSet(),mediaFailures=new WeakMap(),pausedPreviewSlides=new Set();
let mediaObserver=null,mediaGeneration=0;
let mediaFrame=0,mediaRetryShort=0,mediaRetryLong=0;
let chromeObserver=null,chromeFrame=0;
let mediaSlides=new Set();
let geraldineNativeRequested=false;
// One-time pre-rendered slide images: no PPTX DOM reflow on PageDown/PageUp.
// Images are generated at build time from this exact source PPTX; version
// and SHA-256 must match or we automatically retain the live PPTX viewer.
let fastSlides=null,fastLayer=null,fastCurrent=null,fastToken=0;
const fastDecoded=new Map();
const fastPreloadCount=3;
function fastFile(index){
  return '/tv/slides/'+fastSlides.images[index];
}
function warmFastFrame(index){
  if(!fastSlides)return null;
  index=(index+total)%total;
  if(fastDecoded.has(index))return fastDecoded.get(index);
  const img=new Image();
  img.className='tv-fast-slide';
  img.alt='';
  img.decoding='async';
  img.loading='eager';
  const promise=new Promise((resolve,reject)=>{
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Diapositiva precalculada inválida: '+(index+1)));
  });
  img.src=fastFile(index);
  // decode() primes the browser's native image decode cache for nearby pages.
  const ready=promise.then(()=>img.decode?.().catch(()=>{})??Promise.resolve())
    .then(()=>img);
  const entry={img,ready};
  fastDecoded.set(index,entry);
  // Ensure preload failures can't produce unhandled rejections.
  ready.catch(err=>console.warn('Caché visual:',err.message));
  return entry;
}
function primeNearby(index){
  if(!fastSlides)return;
  for(const offset of [0,1,2,3,-1,-2]){
    warmFastFrame(index+offset);
  }
  // Keep the decoded working set small on budget Android TV hardware.
  for(const key of fastDecoded.keys()){
    const forwards=(key-index+total)%total;
    const backwards=(index-key+total)%total;
    if(forwards>fastPreloadCount&&backwards>2&&key!==index){
      const entry=fastDecoded.get(key);
      if(entry.img!==fastCurrent)fastDecoded.delete(key);
    }
  }
}
function fastMount(){
  if(!fastSlides)return;
  // Fullscreen browser API places the viewer in a compositor top layer;
  // render the precomputed frames INSIDE that root to stay visible on TCL.
  const root=document.fullscreenElement||host;
  if(fastLayer?.parentElement!==root){
    fastLayer?.remove();
    fastLayer=document.createElement('div');
    fastLayer.id='tv-fast-layer';
    root.appendChild(fastLayer);
    // Reparenting a Fullscreen API overlay must reattach the decoded image.
    fastCurrent=null;
  }
  showFastFrame(slide);
}
function fallbackToLiveSlide(reason){
  console.warn('Presentación precalculada no disponible:',reason);
  fastSlides=null;
  fastToken++;
  fastLayer?.remove();
  fastLayer=null;
  fastCurrent=null;
  fastDecoded.clear();
  // Preserve presenter position even if one screenshot is corrupt.
  viewer?.goToSlide?.(slide);
}
function showFastFrame(index){
  if(!fastSlides)return;
  if(!fastLayer)fastMount();
  const token=++fastToken;
  const entry=warmFastFrame(index);
  entry.ready.then(img=>{
    if(!fastSlides||fastToken!==token||!fastLayer)return;
    if(img!==fastCurrent){
      // The image has already decoded: one compositor layer replacement,
      // rather than 4 tiling passes through the PPTX renderer.
      fastLayer.replaceChildren(img);
      fastCurrent=img;
    }
  }).catch(fallbackToLiveSlide);
  primeNearby(index);
}
async function loadFastSlides(blob){
  try{
    const reply=await fetch('/tv/slides/manifest.json',{cache:'no-store'});
    if(!reply.ok)return;
    const manifest=await reply.json();
    if(manifest.version!==1||manifest.slideCount!==total||
       manifest.pptxBytes!==blob.size||
       manifest.width!==1920||manifest.height!==1080||
       !Array.isArray(manifest.images)||manifest.images.length!==total||
       !manifest.images.every((name,i)=>
         name==='slide-'+String(i+1).padStart(3,'0')+'.jpg'))
      throw Error('Metadatos precalculados incompatibles con la presentación');
    // A newer downloaded PPTX must never be shown using the older images.
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
    const sha=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
    if(sha!==manifest.pptxSha256)return;
    fastSlides=manifest;
    await Promise.all([warmFastFrame(0).ready,warmFastFrame(1).ready,
      warmFastFrame(total-1).ready]);
    console.info('Presentación acelerada: 40 diapositivas precalculadas, sin repintado PPTX.');
  }catch(err){
    console.warn('Usando el visor PowerPoint convencional:',err);
    fastSlides=null;fastDecoded.clear();
  }
}

// Original slide 21 video shape geometry in EMUs, independently verified
// against the ZIP contents of mas-duenos-liniers.pptx.
const GERALDINE_GEOMETRY={
  slideW:18288000,slideH:10287000,
  left:9425035,top:969288,width:4447375,height:7909700,
};
// Presentation-only TV mode: disable the viewer's own navigation at creation
// and suppress every fallback control, including touch-only overlays. Never
// select slide content using broad "present*" selectors.
const HIDDEN_PRESENTER_CONTROLS=[
  '.pptxv-present-toolbar-wrap','.pptxv-present-toolbar',
  '.pptxv-presentation-touch-exit','.pptxv-toolbar',
  '.pptxv-statusbar','.pptxv-present-controls',
  '.pptxv-presentation-controls','.pptxv-present-navigation',
  '.pptxv-present-nav','.pptxv-present-prev','.pptxv-present-next',
  '.pptxv-present-touch-prev','.pptxv-present-touch-next',
  '.pptxv-present-slide-counter','.pptxv-present-counter',
  '.pptxv-slide-counter','.pptxv-slide-indicator',
  '.pptxv-present-position','.pptxv-slide-position',
  '.pptxv-present-pagination',
  '.pptxv-present-footer','.pptxv-present-overlay-controls',
  '[class*="present-toolbar"]','[class*="present-nav"]',
  '[class*="present-control"]','[class*="touch-exit"]',
  '[class*="touch-nav"]','[class*="slide-counter"]',
  '[class*="slide-indicator"]','[class*="slide-count"]',
  '[class*="present-position"]','[class*="present-pagination"]',
  // The generated toolbar buttons are not slide media.
  '.pptxv button','.pptxv [role="button"]',
];
function hidePresenterControl(target){
  if(target.style.getPropertyValue('display')!=='none'||
     target.style.getPropertyPriority('display')!=='important')
    target.style.setProperty('display','none','important');
  if(target.getAttribute('aria-hidden')!=='true')
    target.setAttribute('aria-hidden','true');
  if(target.tabIndex!==-1)target.tabIndex=-1;
  if(target.style.pointerEvents!=='none')target.style.pointerEvents='none';
}
const CHROME_SELECTOR=HIDDEN_PRESENTER_CONTROLS.join(',');
function removePresentationChrome(){
  if(mode!=='slides'&&mode!=='intro')return;
  // Don't rebuild the selector string on every slide update.
  for(const target of document.querySelectorAll(CHROME_SELECTOR))
    hidePresenterControl(target);
  // Older versions mount the 21 / 40 pill as an unclassified span. Hide only
  // a leaf counter inside presentation chrome, not actual PowerPoint text.
  for(const leaf of document.querySelectorAll('.pptxv span, .pptxv div')){
    if(leaf.children.length!==0||!/^\s*\d+\s*\/\s*\d+\s*$/.test(leaf.textContent||''))
      continue;
    if(leaf.closest('[class*="slide-content"],[class*="slide-canvas"],[class*="slide-stage"],[class*="slide-layer"]'))
      continue;
    hidePresenterControl(leaf);
  }
  for(const video of document.querySelectorAll('video')){
    if(video.id==='intro-video')continue;
    if(video.controls)video.controls=false;
    if(video.hasAttribute('controls'))video.removeAttribute('controls');
    if(video.getAttribute('controlsList')!=='nodownload noplaybackrate nofullscreen')
      video.setAttribute('controlsList','nodownload noplaybackrate nofullscreen');
    if(video.style.pointerEvents!=='none')video.style.pointerEvents='none';
  }
}
// The viewer injects its own CSS and may recreate toolbar DOM during every
// slide transition or when entering real fullscreen. Hide it again in DOM,
// not just with a selector that depends on the browser's fullscreen element.
function scheduleChromeSweep(){
  if(fastSlides||chromeFrame||mode!=='slides')return;
  // Only one DOM traversal per animation frame, regardless of how many
  // individual tiles/styles the PowerPoint renderer touches.
  chromeFrame=requestAnimationFrame(()=>{
    chromeFrame=0;
    removePresentationChrome();
  });
}
function stopChromeSweep(){
  chromeObserver?.disconnect();chromeObserver=null;
  if(chromeFrame){cancelAnimationFrame(chromeFrame);chromeFrame=0;}
}
function keepPresenterChromeHidden(){
  stopChromeSweep();
  removePresentationChrome();
  chromeObserver=new MutationObserver(records=>{
    if(mode!=='slides'||fastSlides)return;
    // Ignore the flood of ordinary slide style/transform mutations;
    // CSS already suppresses known buttons. Only new DOM or changed
    // presentation controls need a follow-up scan.
    for(const record of records){
      if(record.type==='childList'){
        if(record.addedNodes.length){scheduleChromeSweep();return;}
      }else if(record.target instanceof Element &&
               (record.target.matches(CHROME_SELECTOR) ||
                record.target.closest('.pptxv-present-toolbar-wrap,.pptxv-present-nav'))){
        scheduleChromeSweep();return;
      }
    }
  });
  chromeObserver.observe(document.documentElement,{
    childList:true,subtree:true,attributes:true,
    attributeFilter:['style','class'],
  });
}
// Touch input must never reveal the viewer's mobile arrows, counter, exit,
// toolbar or media controls. Navigation is exclusively the K01/TV remote or
// physical keyboard; native Android intro remains outside this WebView.
function suppressPresenterPointer(event){
  if(mode!=='slides')return;
  if(event.cancelable)event.preventDefault();
  event.stopImmediatePropagation();
}
for(const type of ['touchstart','touchmove','touchend','pointerdown','pointerup','click']){
  document.addEventListener(type,suppressPresenterPointer,
    {capture:true,passive:false});
}

const host=$('slides');

function message(value){$('message').textContent=value;}
async function deadline(promise,stage,ms=90000){
  let timeoutId;
  try{
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timeoutId=setTimeout(()=>
        reject(new Error('Tiempo agotado al '+stage+'. Probá con Reintentar o reiniciá el televisor.')),ms);}),
    ]);
  }finally{clearTimeout(timeoutId);}
}
function error(value){
  mode='error';$('loading').hidden=false;
  $('loading').querySelector('h1').textContent='No se pudo abrir la presentación';
  message(value?.message||String(value));
  const spinner=$('loading').querySelector('.spinner');
  if(spinner)spinner.hidden=true;
  const retry=$('retry-start');
  if(retry){retry.hidden=false;retry.focus();}
  console.error('Android TV:',value);
}
function visibleMedia(){
  const root=document.fullscreenElement||host;
  return [...root.querySelectorAll('video, audio')].filter(v=>{
    const r=v.getBoundingClientRect();
    return r.width>1&&r.height>1&&r.left<innerWidth&&r.right>0&&
      r.top<innerHeight&&r.bottom>0&&!v.closest('#intro')&&!v.closest('[aria-hidden="true"]');
  });
}
function hasVideoModel(element){
  if(!element||typeof element!=='object')return false;
  const mime=String(element.mimeType||element.mediaType||element.mime||
    element.media?.mimeType||element.video?.mimeType||'').toLowerCase();
  const type=String(element.type||element.kind||element.media?.type||'').toLowerCase();
  const source=String(element.src||element.fileName||element.media?.src||
    element.media?.fileName||element.video?.src||'');
  return type.includes('video')||mime.includes('video')||
    /\\.(mp4|webm)([?#]|$)/i.test(source)||
    ['elements','children'].some(key=>Array.isArray(element[key])&&element[key].some(hasVideoModel));
}
function locateGeraldineBuild(slides,known){
  if(Number.isInteger(known))return known;
  // Existing 40-slide Liniers decks may be replaced in Hostinger; a hash
  // mismatch must not disable the click-triggered Geraldine slide altogether.
  if(total===40&&Array.isArray(slides)&&(
    hasVideoModel(slides[20])||
    (hasVideoModel(slides[19])&&hasVideoModel(slides[20]))
  ))return 20;
  return null;
}
function allowedToPlayVideo(){
  // The native click-build on slide 21 takes precedence over the adjacent-
  // slide duplicate-preview heuristic. Otherwise a video also present on
  // slide 22 could keep Geraldine permanently paused after PageDown.
  if(slide===mediaBuildSlide)
    return mediaBuildTriggered&&!mediaPlaybackEnded&&!geraldineNativeRequested;
  return mayAutoPlayVideo(slide,pausedPreviewSlides);
}
// Native Android decodes the MP4 directly from the verified PPTX. Position its
// TextureView over the real movie shape without covering slide title or logo.
function nativeGeraldineBounds(){
  const v=visibleMedia().find(node=>node.tagName==='VIDEO');
  const rect=v?.getBoundingClientRect();
  if(rect&&rect.width>35&&rect.height>35&&
     rect.width/rect.height>0.43&&rect.width/rect.height<0.78&&
     rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight){
    return [rect.left/innerWidth,rect.top/innerHeight,
      rect.width/innerWidth,rect.height/innerHeight];
  }
  // If the PPTX viewer only paints the blank video poster, it may not create
  // a <video> element at all. Use its exact OOXML movie shape coordinates.
  const stage=host.getBoundingClientRect();
  const g=GERALDINE_GEOMETRY;
  const aspect=g.slideW/g.slideH;
  const width=Math.min(stage.width,stage.height*aspect);
  const height=width/aspect;
  const left=stage.left+(stage.width-width)/2;
  const top=stage.top+(stage.height-height)/2;
  return [
    (left+g.left/g.slideW*width)/innerWidth,
    (top+g.top/g.slideH*height)/innerHeight,
    (g.width/g.slideW*width)/innerWidth,
    (g.height/g.slideH*height)/innerHeight,
  ];
}
function pausePreview(video){
  if(video.autoplay)video.autoplay=false;
  if(video.hasAttribute('autoplay'))video.removeAttribute('autoplay');
  if(!video.paused)video.pause();
  try{if(Number.isFinite(video.currentTime)&&video.currentTime>0)video.currentTime=0;}catch{}
}
function blockPreviewAutoplay(event){
  const video=event.target;
  if(mode!=='slides'||video?.tagName!=='VIDEO')return;
  if(!(document.fullscreenElement||host).contains(video)||video.closest('#intro'))return;
  if(slide===mediaBuildSlide&&mediaPlaybackEnded ||
     !allowedToPlayVideo() ||
     slide===mediaBuildSlide&&mediaPlaybackNode&&mediaPlaybackNode!==video){
    pausePreview(video);
  }
}
function playbackFailed(video,error){
  mediaAttempted.delete(video);
  const failures=(mediaFailures.get(video)||0)+1;
  mediaFailures.set(video,failures);
  if(mediaPlaybackNode===video&&!mediaPlaybackEnded)mediaPlaybackNode=null;
  console.warn('Video integrado: intento '+failures,error);
  // A transient WebView decoder/readyState error must not permanently mark
  // Geraldine as played. Only retry the explicitly requested slide and cap
  // retries to avoid hammering a genuinely unsupported codec.
  if(failures<3&&slide===mediaBuildSlide&&mediaBuildTriggered&&
     !mediaPlaybackEnded&&mode==='slides'){
    setTimeout(()=>{
      if(video.isConnected&&slide===mediaBuildSlide&&
         mediaBuildTriggered&&!mediaPlaybackEnded&&mode==='slides')
        playVisibleMedia();
    },250*failures);
  }
}
function playVisibleMedia(){
  if(mode!=='slides')return;
  // Chrome removal runs in a separate, batched DOM pass. Never make video
  // probing re-scan every span, div and slide tile.
  for(const video of visibleMedia()){
    if(video.tagName==='VIDEO'){
      if(slide===mediaBuildSlide&&mediaPlaybackEnded){
        video.pause();
        continue;
      }
      if(!allowedToPlayVideo() ||
         slide===mediaBuildSlide&&mediaPlaybackNode&&mediaPlaybackNode!==video){
        pausePreview(video);continue;
      }
      if(slide===mediaBuildSlide&&!mediaPlaybackNode){
        mediaPlaybackNode=video;
        video.addEventListener('ended',()=>{
          if(mediaPlaybackNode===video&&slide===mediaBuildSlide){
            mediaPlaybackEnded=true;
            video.pause();
          }
        },{once:true});
      }
    }
    if(mediaAttempted.has(video)||mediaFailures.get(video)>=3)continue;
    mediaAttempted.add(video);
    video.autoplay=true;
    if(video.tagName==='VIDEO')video.playsInline=true;
    try {
      Promise.resolve(video.play()).catch(err=>playbackFailed(video,err));
    }catch(err){playbackFailed(video,err);}
  }
}
function cancelMediaChecks(){
  mediaGeneration++;
  if(mediaFrame){cancelAnimationFrame(mediaFrame);mediaFrame=0;}
  clearTimeout(mediaRetryShort);clearTimeout(mediaRetryLong);
  mediaRetryShort=0;mediaRetryLong=0;
}
function scheduleMedia(){
  if(mode!=='slides'||!mediaSlides.has(slide))return;
  // On ordinary slides there is no media to probe. On Geraldine, coalesce
  // potentially hundreds of viewer mutations into one compositor tick.
  cancelMediaChecks();
  const generation=mediaGeneration;
  mediaFrame=requestAnimationFrame(()=>{
    mediaFrame=0;
    if(generation!==mediaGeneration||mode!=='slides')return;
    playVisibleMedia();
    const refresh=()=>{
      if(generation===mediaGeneration&&mode==='slides')playVisibleMedia();
    };
    mediaRetryShort=setTimeout(refresh,100);
    mediaRetryLong=setTimeout(refresh,350);
  });
}
function slideChanged(index){
  if(!Number.isInteger(index)||index<0)return;
  if(slide!==index){
    if(slide===mediaBuildSlide||geraldineNativeRequested){
      geraldineNativeRequested=false;
      // This also removes the first-frame preview after slide 21.
      try{window.AndroidTv?.stopGeraldine?.();}catch(e){console.warn('Cierre Geraldine:',e);}
    }
    mediaBuildTriggered=false;
    mediaPlaybackEnded=false;
    mediaPlaybackNode=null;
    mediaAttempted=new WeakSet();
    mediaFailures=new WeakMap();
    cancelMediaChecks();
    slide=index;
  }
  host.dataset.slide=String(slide);
  if(mode==='slides'){
    // Only media slides need playback checks; plain PowerPoint slides can
    // change immediately without a full DOM/video scan or transition overlay.
    // The APK 1.5.0 showed movie pixels immediately. The newer native
    // decoder must do likewise, instead of exposing the PowerPoint black
    // movie-placeholder while waiting for the remote's PageDown command.
    if(slide===mediaBuildSlide&&!mediaBuildTriggered &&
       typeof window.AndroidTv?.previewGeraldine==='function'){
      const [x,y,w,h]=nativeGeraldineBounds();
      try{window.AndroidTv.previewGeraldine(x,y,w,h);}
      catch(error){console.warn('Vista previa Geraldine:',error);}
    }
    scheduleMedia();
  }
}
function enableLoop(){
  const store=viewer?.store;
  if(!store?.get||!store?.set)return;
  const props=store.get()?.presentationProperties||{};
  store.set({presentationProperties:{...props,loopContinuously:true},endOfShow:false});
}
async function prepare(){
  try{
    message('Abriendo el PPTX guardado en Android TV…');
    const response=await deadline(fetch(DECK,{cache:'no-store'}),
      'abrir el PowerPoint guardado');
    if(!response.ok)throw Error('No hay PPTX guardado. Volvé al menú y buscá actualizaciones.');
    if(!response.headers.get('content-type')?.includes('presentationml'))
      throw Error('El archivo descargado no es PowerPoint.');
    message('Leyendo PowerPoint guardado ('+
      (Number(response.headers.get('content-length')||0)/1048576).toFixed(1)+' MB)…');
    const blob=await deadline(response.blob(),'leer el PowerPoint guardado');
    const head=new Uint8Array(await blob.slice(0,4).arrayBuffer());
    if(head[0]!==80||head[1]!==75||head[2]!==3||head[3]!==4)
      throw Error('El archivo guardado no tiene formato PPTX.');
    message('Preparando diapositivas…');
    const {createPptxViewer}=await deadline(import(MODULE),
      'cargar el motor PowerPoint');
    if(typeof createPptxViewer!=='function')throw Error('No se pudo cargar el visor de PowerPoint.');
    viewer=createPptxViewer(host,{
      editable:false,autosave:false,locale:'es',showToolbar:false,
      showThumbnails:false,showCompatibilityToasts:false,
      hiddenActions:['navigation','fullscreen','zoom','notes'],
      fileName:'mas-duenos-liniers.pptx',
      onLoad:({slideCount})=>{total=slideCount;},
      onSlideChange:slideChanged,
      onPresentationChange:active=>{
        if(active&&mode==='slides')scheduleMedia();
        else if(!active&&mode==='slides'){
          // Android already owns immersive fullscreen. Some WebView builds
          // reject the browser Fullscreen API without a user gesture, even
          // though the PPTX viewer can display its slides normally. Never
          // leave the slideshow or require an extra OK in that situation.
          host.querySelector('.pptxv')?.classList.add('pptxv-presenting');
          scheduleChromeSweep();
        }
      },
      onError:e=>console.warn('Visor:',e),
    });
    const file=new File([blob],'mas-duenos-liniers.pptx',{
      type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    });
    message('Interpretando las diapositivas. Puede tardar en algunos televisores…');
    await deadline(viewer.loadFile(file),'interpretar las diapositivas',120000);
    if(total<1)throw Error('No hay diapositivas reconocibles.');
    // Same SHA-256-based click-build detection as the web presentation.
    message('Verificando las animaciones y el video de Geraldine…');
    const slides=viewer.getSlides?.()||[];
    const timedIndex=await deadline(getTimedVideoSlide(file),
      'verificar las animaciones',90000);
    mediaBuildSlide=locateGeraldineBuild(slides,timedIndex);
    pausedPreviewSlides=duplicateVideoPreviewSlides(slides);
    mediaSlides=new Set(slides.flatMap((model,index)=>
      hasVideoModel(model)?[index]:[]));
    if(mediaBuildSlide!==null)mediaSlides.add(mediaBuildSlide);
    mediaObserver?.disconnect();
    mediaObserver=new MutationObserver(records=>{
      if(mode!=='slides'||!mediaSlides.has(slide))return;
      // Only schedule playback when the renderer mounted new actual media.
      // Other slide tiles/layout changes should not trigger extra work.
      for(const record of records){
        for(const node of record.addedNodes){
          if(node.nodeType===1 &&
             (node.matches('video,audio')||node.querySelector('video,audio'))){
            scheduleMedia();return;
          }
        }
      }
    });
    mediaObserver.observe(host,{childList:true,subtree:true});
    message('Preparando imágenes de navegación instantánea…');
    await deadline(loadFastSlides(blob),'precargar imágenes de las diapositivas',30000);
    // Once the complete PPTX and Geraldine timing are ready, enter directly.
    // No readiness menu or synthetic button click is needed.
    start();
  }catch(e){error(e);}
}
function start(){
  if(mode!=='loading'||!viewer||total<1)return;
  enableLoop();
  mode='slides';
  document.body.classList.add('tv-presenting');
  // The Android Activity is already immersive: request browser presentation
  // mode but do not require a human gesture or block on requestFullscreen().
  // If Chromium refuses fullscreen without activation, keep slides visible
  // and apply the same viewer presentation layout locally.
  const fallback=error=>{
    console.warn('Visor sin Fullscreen API (Android ya es inmersivo):',error);
    host.querySelector('.pptxv')?.classList.add('pptxv-presenting');
    scheduleChromeSweep();
  };
  try{Promise.resolve(viewer.enterPresentation())
    .then(()=>{if(fastSlides)fastMount();})
    .catch(error=>{fallback(error);if(fastSlides)fastMount();});}
  catch(error){fallback(error);if(fastSlides)fastMount();}
  keepPresenterChromeHidden();
  slideChanged(viewer.getCurrentSlide?.()??0);
  scheduleMedia();
  // Leave the loading screen only after the compositor had a chance to
  // mount the first slide, preventing a transient unrendered white frame.
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(mode==='slides'){
      if(fastSlides)fastMount();
      $('loading').hidden=true;
    }
  }));
}
function closeIntro(){
  if(mode!=='intro')return;
  const video=$('intro-video');
  video.pause();video.removeAttribute('src');video.load();
  $('intro').hidden=true;
  mode='slides';
  if(fastSlides){slideChanged(0);showFastFrame(0);}
  else{viewer?.goToSlide?.(0);slideChanged(0);}
}
function openIntro(){
  if(mode!=='slides'||slide!==0)return;
  mode='intro';
  const root=document.fullscreenElement||host;
  if($('intro').parentElement!==root)root.append($('intro'));
  // Android TV uses the platform MediaPlayer on the verified file in private
  // storage. WebView can receive Tab but fail to decode the virtual MP4 URL.
  // A native overlay also prevents hidden HTML media controls from appearing.
  if(typeof window.AndroidTv?.playIntroduction==='function'){
    try{window.AndroidTv.playIntroduction();}
    catch(e){
      mode='slides';
      hint('No se pudo abrir el reproductor nativo de introducción.');
      console.warn('Reproductor nativo:',e);
    }
    return;
  }
  const video=$('intro-video');
  $('intro').hidden=false;video.src=INTRO;video.currentTime=0;
  video.play().catch(e=>{
    closeIntro();hint('No se pudo reproducir introduccion.mp4. Verificá la descarga.');
    console.warn('Reproducción de introducción:',e);
  });
}
function hint(str){
  $('hint').textContent=str;$('hint').hidden=false;
  setTimeout(()=>{$('hint').hidden=true;},2800);
}
function seek(direction){
  const video=$('intro-video');
  const end=Number.isFinite(video.duration)?video.duration:Infinity;
  const next=Math.max(0,Math.min(end,(Number(video.currentTime)||0)+direction*5));
  try{video.currentTime=next;}catch{}
}
// PowerPoint playFrom: the first forward command on the verified slide 21
// starts the embedded video, the second moves on without replaying it.
function next(){
  if(slide===mediaBuildSlide){
    if(!mediaBuildTriggered){
      mediaBuildTriggered=true;
      if(typeof window.AndroidTv?.playGeraldine==='function'){
        const [x,y,w,h]=nativeGeraldineBounds();
        geraldineNativeRequested=true;
        // Pause the WebView movie: a duplicate browser decoder would leave a
        // black layer over the working native TextureView and double audio.
        scheduleMedia();
        try{window.AndroidTv.playGeraldine(x,y,w,h);}
        catch(error){
          geraldineNativeRequested=false;
          console.warn('Geraldine nativa no disponible:',error);
          scheduleMedia();
        }
      }else scheduleMedia();
      return;
    }
  }
  if(fastSlides){
    slideChanged((slide+1)%total);
    showFastFrame(slide);
  }else viewer?.goToSlide?.((slide+1)%total);
}
function previous(){
  if(fastSlides){
    slideChanged((slide-1+total)%total);
    showFastFrame(slide);
  }else viewer?.goToSlide?.((slide-1+total)%total);
}
function handle(key,repeat=false){
  if(repeat)return;
  if(mode==='intro'){
    if(key==='Tab'||key==='Enter'||key==='Escape')closeIntro();
    else if(['ArrowLeft','ArrowUp','PageUp'].includes(key))seek(-1);
    else if(['ArrowRight','ArrowDown','PageDown'].includes(key))seek(1);
    return;
  }
  if(mode!=='slides')return;
  // TV D-pad OK (Enter) also opens the intro on slide 1 so a standard
  // Android TV remote, which has no Tab button, can operate the entire app.
  // The K01 keyboard shortcut remains Tab, as on the website.
  if(key==='Tab'){
    if(slide===0)openIntro();
  }else if(key==='Enter'){
    if(slide===0)openIntro();
    else next();
  }else if(['ArrowLeft','ArrowUp','PageUp'].includes(key))previous();
  else if(['ArrowRight','ArrowDown','PageDown',' '].includes(key))next();
  else if(key==='Escape'){
    // Exit to the native file/update menu; never show a second start screen.
    if(typeof window.AndroidTv?.exitPresentation==='function'){
      window.AndroidTv.exitPresentation();
    }
  }
}
document.addEventListener('play',blockPreviewAutoplay,true);
document.addEventListener('keydown',event=>{
  const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
    'PageUp','PageDown','Tab','Enter','Escape',' '];
  const key=event.code==='Space'?' ':event.code||event.key;
  if(!keys.includes(key))return;
  event.preventDefault();event.stopImmediatePropagation();
  handle(key,event.repeat);
},true);
window.tvRemoteKey=key=>handle(key,false);
window.tvRemoteTab=()=>handle('Tab',false);
// Return from the native main menu without loading index.html or rebuilding the
// PPTX. Keep the current slide and restore the snapshot above fullscreen.
window.tvMenuResumed=()=>{
  if(mode==='intro')closeIntro();
  if(mode!=='slides')return;
  if(fastSlides)fastMount();
  if(slide===mediaBuildSlide&&!mediaBuildTriggered)slideChanged(slide);
};
// Build-time diagnostic only; never offered as a runtime remote command.
if(location.hostname==='127.0.0.1')
  window.__tvCaptureSlide=index=>{
    if(!viewer||index<0||index>=total)throw Error('Invalid capture slide '+index);
    viewer.goToSlide(index);
    return viewer.getCurrentSlide();
  };
// Called by the Activity after native playback completes, fails, or is stopped.
window.tvNativeIntroEnded=detail=>{
  if(mode!=='intro')return;
  closeIntro();
  if(detail)hint(detail);
};
// Native MP4 completion must never restart or advance the slide by itself.
window.tvNativeGeraldineEnded=detail=>{
  if(slide!==mediaBuildSlide||!mediaBuildTriggered)return;
  geraldineNativeRequested=false;
  mediaPlaybackEnded=true;
  if(detail)console.error('Geraldine nativa:',detail);
};
$('intro-video').addEventListener('ended',closeIntro);
window.addEventListener('beforeunload',()=>{
  cancelMediaChecks();
  try{window.AndroidTv?.stopGeraldine?.();}catch{}
  mediaObserver?.disconnect();
  stopChromeSweep();
  fastToken++;
  fastLayer?.remove();
  fastDecoded.clear();
});
void prepare();
