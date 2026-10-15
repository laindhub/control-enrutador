const $=id=>document.getElementById(id);
const DECK='/tv/cache/presentation.pptx';
const INTRO='/tv/cache/introduccion.mp4';
const MODULE='https://esm.sh/pptx-vanilla-viewer@3.31.1?bundle';
let viewer=null,slide=0,total=0,mode='loading',geraldineTriggered=false,geraldineVideo=null;
const host=$('slides');

function message(value){$('message').textContent=value;}
function error(value){
  mode='error';$('loading').hidden=false;$('ready').hidden=true;
  $('loading').querySelector('h1').textContent='No se pudo abrir la presentación';
  message(value?.message||String(value));console.error('Android TV:',value);
}
function visibleMedia(){
  const root=document.fullscreenElement||host;
  return [...root.querySelectorAll('video')].filter(v=>{
    const r=v.getBoundingClientRect();
    return r.width>20&&r.height>20&&!v.closest('#intro');
  });
}
function slideChanged(index){
  if(!Number.isInteger(index)||index<0)return;
  if(slide!==index){geraldineTriggered=false;geraldineVideo=null;}
  slide=index;host.dataset.slide=String(slide);
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
    const response=await fetch(DECK,{cache:'no-store'});
    if(!response.ok)throw Error('No hay PPTX guardado. Volvé al menú y buscá actualizaciones.');
    if(!response.headers.get('content-type')?.includes('presentationml'))
      throw Error('El archivo descargado no es PowerPoint.');
    const blob=await response.blob();
    const head=new Uint8Array(await blob.slice(0,4).arrayBuffer());
    if(head[0]!==80||head[1]!==75||head[2]!==3||head[3]!==4)
      throw Error('El archivo guardado no tiene formato PPTX.');
    message('Preparando diapositivas…');
    const {createPptxViewer}=await import(MODULE);
    if(typeof createPptxViewer!=='function')throw Error('No se pudo cargar el visor de PowerPoint.');
    viewer=createPptxViewer(host,{
      editable:false,autosave:false,locale:'es',showToolbar:false,
      showThumbnails:false,showCompatibilityToasts:false,
      fileName:'mas-duenos-liniers.pptx',
      onLoad:({slideCount})=>{total=slideCount;},
      onSlideChange:slideChanged,
      onPresentationChange:active=>{if(!active&&mode==='slides')mode='ready';},
      onError:e=>console.warn('Visor:',e),
    });
    await viewer.loadFile(new File([blob],'mas-duenos-liniers.pptx',{
      type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }));
    if(total<1)throw Error('No hay diapositivas reconocibles.');
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
  slideChanged(viewer.getCurrentSlide?.()??0);
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
function maybePlayGeraldine(){
  // The original 40-slide deck contains a playFrom build on slide 21.
  // Preserve its still frame on entry; first forward button plays the video.
  if(slide!==20||total!==40||geraldineTriggered)return false;
  const video=visibleMedia()[0];
  if(!video)return false;
  geraldineTriggered=true;geraldineVideo=video;
  video.playsInline=true;
  try{video.currentTime=0;}catch{}
  video.play()?.catch?.(()=>{});
  return true;
}
function next(){
  if(maybePlayGeraldine())return;
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
  if(key==='Tab'||key==='Enter'){
    if(slide===0)openIntro();
    else next();
  }else if(['ArrowLeft','ArrowUp','PageUp'].includes(key))previous();
  else if(['ArrowRight','ArrowDown','PageDown',' '].includes(key))next();
  else if(key==='Escape'){
    mode='ready';
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
    $('ready').hidden=false;$('start').focus();
  }
}
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
void prepare();
