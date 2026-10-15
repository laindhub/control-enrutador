import {duplicateVideoPreviewSlides,mayAutoPlayVideo} from './presentation-media.js';
import {getTimedVideoSlide} from './presentation-timing.js';
// Reaching this line confirms that every local ES module resolved correctly.
window.__tvBooted=true;
const $=id=>document.getElementById(id);
const DECK='/tv/cache/presentation.pptx';
const INTRO='/tv/cache/introduccion.mp4';
const MODULE='https://esm.sh/pptx-vanilla-viewer@3.31.1?bundle';
let viewer=null,slide=0,total=0,mode='loading';
let mediaBuildSlide=null,mediaBuildTriggered=false,mediaPlaybackEnded=false;
let mediaPlaybackNode=null,mediaAttempted=new WeakSet(),pausedPreviewSlides=new Set();
let mediaObserver=null,mediaGeneration=0;
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
  mode='error';$('loading').hidden=false;$('ready').hidden=true;
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
function allowedToPlayVideo(){
  if(slide===mediaBuildSlide&&(!mediaBuildTriggered||mediaPlaybackEnded))return false;
  return mayAutoPlayVideo(slide,pausedPreviewSlides);
}
function pausePreview(video){
  video.autoplay=false;
  video.removeAttribute('autoplay');
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
function playVisibleMedia(){
  if(mode!=='slides')return;
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
    if(mediaAttempted.has(video))continue;
    mediaAttempted.add(video);
    video.autoplay=true;
    if(video.tagName==='VIDEO')video.playsInline=true;
    video.play()?.catch?.(err=>console.warn('Video integrado:',err));
  }
}
function scheduleMedia(){
  const generation=++mediaGeneration;
  const refresh=()=>{if(generation===mediaGeneration)playVisibleMedia();};
  refresh();
  setTimeout(refresh,100);setTimeout(refresh,350);
}
function slideChanged(index){
  if(!Number.isInteger(index)||index<0)return;
  if(slide!==index){
    mediaBuildTriggered=false;
    mediaPlaybackEnded=false;
    mediaPlaybackNode=null;
    mediaAttempted=new WeakSet();
    slide=index;
  }
  host.dataset.slide=String(slide);
  if(mode==='slides')scheduleMedia();
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
      fileName:'mas-duenos-liniers.pptx',
      onLoad:({slideCount})=>{total=slideCount;},
      onSlideChange:slideChanged,
      onPresentationChange:active=>{
        if(active&&mode==='slides')scheduleMedia();
        else if(!active&&mode==='slides'){
          mode='ready';document.body.classList.remove('tv-presenting');
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
    mediaBuildSlide=await deadline(getTimedVideoSlide(file),
      'verificar las animaciones',90000);
    pausedPreviewSlides=duplicateVideoPreviewSlides(viewer.getSlides?.()||[]);
    mediaObserver?.disconnect();
    mediaObserver=new MutationObserver(()=>{if(mode==='slides')scheduleMedia();});
    mediaObserver.observe(host,{childList:true,subtree:true});
    mode='ready';$('loading').hidden=true;$('ready').hidden=false;
    $('summary').textContent=total+' diapositivas · Archivo guardado en Android TV';
    $('start').focus();
  }catch(e){error(e);}
}
function start(){
  if(mode!=='ready'||!viewer)return;
  enableLoop();mode='slides';
  $('ready').hidden=true;$('loading').hidden=true;
  // This click comes from a real TV OK/Enter press, enabling browser fullscreen.
  try{Promise.resolve(viewer.enterPresentation()).catch(e=>{
    console.warn('Fullscreen WebView fallback:',e);
  });}catch(e){console.warn('Fullscreen native fallback:',e);}
  document.body.classList.add('tv-presenting');
  slideChanged(viewer.getCurrentSlide?.()??0);
  scheduleMedia();
}
function closeIntro(){
  if(mode!=='intro')return;
  const video=$('intro-video');
  video.pause();video.removeAttribute('src');video.load();
  $('intro').hidden=true;
  mode='slides';viewer?.goToSlide?.(0);slideChanged(0);
}
function openIntro(){
  if(mode!=='slides'||slide!==0)return;
  mode='intro';
  const root=document.fullscreenElement||host;
  if($('intro').parentElement!==root)root.append($('intro'));
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
    if(!mediaBuildTriggered){mediaBuildTriggered=true;scheduleMedia();return;}
  }
  viewer?.goToSlide?.((slide+1)%total);
}
function previous(){viewer?.goToSlide?.((slide-1+total)%total);}
function handle(key,repeat=false){
  if(repeat)return;
  if(mode==='intro'){
    if(key==='Tab'||key==='Enter'||key==='Escape')closeIntro();
    else if(['ArrowLeft','ArrowUp','PageUp'].includes(key))seek(-1);
    else if(['ArrowRight','ArrowDown','PageDown'].includes(key))seek(1);
    return;
  }
  if(mode==='ready'){
    if(key==='Enter'||key===' ')$('start').click();
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
    mode='ready';
    document.body.classList.remove('tv-presenting');
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
    $('ready').hidden=false;$('start').focus();
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
$('start').addEventListener('click',start);
$('intro-video').addEventListener('ended',closeIntro);
window.addEventListener('beforeunload',()=>mediaObserver?.disconnect());
void prepare();
