import {getTimedVideoSlide, isForwardInput, videoStepForHash} from './presentation-timing.js';
import {enablePresentationLoop} from './presentation-loop.js';
import {createPresentationWakeLock} from './presentation-wake-lock.js';
import {initRemoteControl} from './presentation-remote.js';
import {duplicateVideoPreviewSlides, mayAutoPlayVideo} from './presentation-media.js';
import {isOfficialDeckResponse, OFFICIAL_DECK_SHA256, OFFICIAL_DECK_SIZE} from './presentation-source.js';
import {hasCachedOfficialDeck, loadOfficialDeck} from './presentation-cache.js';
import {INTRO_VIDEO_URL, loadCachedIntroVideo} from './presentation-intro-cache.js';
import {introSeekDirection,seekIntroVideo} from './presentation-intro-seek.js';
// Los PPTX se procesan en el navegador, nunca se envían al servidor.
// El motor se fija a una versión específica para evitar cambios inesperados.
const VIEWER_MODULE = 'https://esm.sh/pptx-vanilla-viewer@3.31.1?bundle';
const MAX_FILE_SIZE = 250 * 1024 * 1024;
const DEFAULT_PPTX_URL = '/assets/presentaciones/mas-duenos-liniers.pptx';
const DEFAULT_PPTX_NAME = 'Nueva - Más dueños.pptx';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const $ = (id) => document.getElementById(id);
const picker = $('file-input');
const dropzone = $('dropzone');
const host = $('pptx-host');
let viewer = null;
let currentFile = null;
let loading = false;
let presenting = false;
const screenWakeLock = createPresentationWakeLock();
let mediaObserver = null;
let modulePromise = null;
let warmPromise = null;
let warmReady = null;
let statusTimer = null;
let mediaAttempted = new WeakSet();
let pausedPreviewSlides = new Set();
let activeSlideIndex = 0;
let forcedAutoplaySlide = null;
let slidesTotal = 0;
let mediaGeneration = 0;
let restorePresentationLoop = null;
let mediaBuildSlide = null;
let mediaBuildTriggered = false;
let blockWheelUntil = 0;
let videoPlaybackNode = null;
let videoPlaybackEnded = false;
let touchStartPosition = null;
let suppressSyntheticClickUntil = 0;

function status(message, isError = false, persist = false) {
  clearTimeout(statusTimer);
  const node = $('status');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.hidden = false;
  if (!persist) statusTimer = setTimeout(() => { node.hidden = true; }, isError ? 11000 : 4600);
}

function validPresentation(file) {
  return file && /\.(pptx|ppsx|pptm)$/i.test(file.name) &&
    file.size > 0 && file.size <= MAX_FILE_SIZE;
}


async function checkDefaultPresentation() {
  const button = $('open-default');
  const state = $('default-availability');
  button.disabled = true;
  try {
    // A saved, checksum-versioned copy needs no network HEAD request.
    const saved = await hasCachedOfficialDeck({url:DEFAULT_PPTX_URL});
    if (!saved) {
      const response = await fetch(DEFAULT_PPTX_URL, {method:'HEAD', cache:'no-store'});
      if (!isOfficialDeckResponse(response)) throw new Error('Archivo no disponible');
    }
    button.dataset.available = 'true';
    button.disabled = false;
    state.textContent = saved ? 'Lista para abrir · guardada en este dispositivo' :
      'Lista para abrir · se guardará tras la primera descarga';
    state.classList.add('available');
    state.classList.remove('unavailable');
    if (saved) startOfficialWarmup();
  } catch {
    button.dataset.available = 'false';
    button.disabled = true;
    state.textContent = 'Archivo pendiente de publicación';
    state.classList.add('unavailable');
    state.classList.remove('available');
  }
}
// The pinned module and cached deck can be prepared while the selection
// screen remains visible. This preloading never downloads a missing deck.
function ensureViewerModule() {
  if (!modulePromise) modulePromise = import(VIEWER_MODULE).catch(error => {
    modulePromise = null; // Permit retry after a transient CDN failure.
    throw error;
  });
  return modulePromise;
}

function startOfficialWarmup() {
  if (warmPromise || warmReady || loading || $('edit-mode').checked) return;
  warmPromise = (async () => {
    const {blob, fromCache} = await loadOfficialDeck({
      url:DEFAULT_PPTX_URL,
      fetcher: () => { throw Error('La preparación anticipada solo utiliza la caché local.'); },
    });
    if (!fromCache || $('edit-mode').checked) return;
    const file = new File([blob], DEFAULT_PPTX_NAME, {type:PPTX_MIME});
    await openPresentation(file, {background:true,verifiedOfficial:true});
  })().catch(error => {
    console.debug('El visor se preparará al abrir la presentación:',error?.message || error);
  }).finally(() => {warmPromise = null;});
}

function activatePreparedPresentation() {
  if (!viewer || !warmReady || $('edit-mode').checked) return false;
  const {file, slides} = warmReady;
  warmReady = null;
  $('workspace').classList.remove('prewarming');
  showReady(file, slides);
  try { viewer.zoomToFit?.(); } catch { /* ResizeObserver still handles fitting. */ }
  return true;
}

async function openDefaultPresentation() {
  if (loading && !warmPromise) return;
  // Start the MP4 download the moment Liniers is selected; do not delay the
  // PowerPoint engine or wait for the K01/Tab video playback button.
  void prepareIntroCache();
  const button = $('open-default');
  button.disabled = true;
  status('Abriendo la presentación del salón…', false, true);
  try {
    if (warmPromise) await warmPromise;
    if (activatePreparedPresentation()) return;
    const {blob, fromCache, saved} = await loadOfficialDeck({
      url:DEFAULT_PPTX_URL,
      onSource: source => status(source === 'cache' ?
        'Preparando las diapositivas guardadas…' :
        'Descargando la presentación por primera vez…', false, true),
    });
    const file = new File([blob], DEFAULT_PPTX_NAME, {type:PPTX_MIME});
    await openPresentation(file,{verifiedOfficial:true});
    if (!fromCache && saved) {
      $('default-availability').textContent = 'Lista para abrir · guardada en este dispositivo';
    } else if (!fromCache && !saved && viewer) {
      status('La presentación abrió, pero el navegador no permitió guardarla. Se descargará nuevamente la próxima vez.', true, true);
    }
  } catch (error) {
    status(error?.message || 'No se pudo descargar la presentación.', true, true);
    button.dataset.available = 'false';
    void checkDefaultPresentation();
  } finally {
    button.disabled = button.dataset.available !== 'true';
  }
}

function humanSize(bytes) {
  return (bytes / 1024 / 1024).toLocaleString('es-AR', {maximumFractionDigits: 1}) + ' MB';
}

function showReady(file, slideCount) {
  currentFile = file;
  $('file-name').textContent = file.name;
  $('file-meta').textContent = slideCount + (slideCount === 1 ? ' diapositiva' : ' diapositivas') + ' · ' + humanSize(file.size);
  $('welcome').hidden = true;
  $('workspace').hidden = false;
  $('start').hidden = false;
  $('change-file').hidden = false;
  $('download').hidden = !$('edit-mode').checked;
  status('Presentación lista. Presioná «Iniciar presentación» para habilitar también el audio.');
}

// El clic en «Iniciar» proporciona la interacción necesaria para solicitar
// reproducción audible. Para diapositivas posteriores no se requiere tocar el video.
function slideAllowsVideo() {
  if (activeSlideIndex === mediaBuildSlide && (!mediaBuildTriggered || videoPlaybackEnded)) return false;
  return mayAutoPlayVideo(activeSlideIndex, pausedPreviewSlides, forcedAutoplaySlide);
}
function getVisibleMedia() {
  const root = document.fullscreenElement || host;
  return [...root.querySelectorAll('video, audio')].filter(media => {
    const rect = media.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.left < innerWidth &&
      rect.right > 0 && rect.top < innerHeight && rect.bottom > 0 &&
      !media.closest('[aria-hidden="true"]');
  });
}
function pausePreview(media) {
  media.autoplay = false;
  if (!media.paused) media.pause();
  if (Number.isFinite(media.currentTime) && media.currentTime > 0) {
    try { media.currentTime = 0; } catch { /* Medio no desplazable. */ }
  }
}
function playVisibleMedia() {
  if (!presenting) return;
  for (const media of getVisibleMedia()) {
    if (media.tagName === 'VIDEO') {
      if (activeSlideIndex === mediaBuildSlide && videoPlaybackEnded) {
        media.pause(); // Preserve the last frame, even if the viewer refreshes.
        continue;
      }
      if (!slideAllowsVideo() ||
          (activeSlideIndex === mediaBuildSlide && videoPlaybackNode && videoPlaybackNode !== media)) {
        pausePreview(media);
        continue;
      }
      if (activeSlideIndex === mediaBuildSlide && !videoPlaybackNode) {
        videoPlaybackNode = media;
        media.addEventListener('ended', () => {
          if (videoPlaybackNode === media && activeSlideIndex === mediaBuildSlide) {
            videoPlaybackEnded = true;
          }
        }, {once:true});
      }
    }
    if (mediaAttempted.has(media)) continue;
    mediaAttempted.add(media);
    media.autoplay = true;
    if (media.tagName === 'VIDEO') media.playsInline = true;
    const result = media.play();
    if (result && typeof result.catch === 'function') {
      result.catch(error => {
        if (error?.name === 'NotAllowedError') {
          status('Este navegador bloqueó el video con sonido. Activá el audio una vez desde los controles del reproductor.', true, true);
        } else if (error?.name === 'NotSupportedError') {
          status('El formato de este video no es compatible con el navegador. Convertirlo a MP4 H.264/AAC puede resolverlo.', true, true);
        }
      });
    }
  }
}
// Interceptamos también reproducciones automáticas que inicie el motor.
function blockPreviewAutoplay(event) {
  const stage = document.fullscreenElement || host;
  if (!presenting || !stage.contains(event.target) || event.target?.tagName !== 'VIDEO') return;
  if (activeSlideIndex === mediaBuildSlide && videoPlaybackEnded) {
    event.target.pause();
  } else if (!slideAllowsVideo() ||
      (activeSlideIndex === mediaBuildSlide && videoPlaybackNode && videoPlaybackNode !== event.target)) {
    pausePreview(event.target);
  }
}
function scheduleMedia() {
  const generation = ++mediaGeneration;
  // Repeated refreshes must never replay an already-attempted video.
  const refresh = () => { if (generation === mediaGeneration) playVisibleMedia(); };
  refresh();
  setTimeout(refresh, 100);
  setTimeout(refresh, 350);
}
function slideChanged(index) {
  if (Number.isInteger(index) && index >= 0 && index !== activeSlideIndex) {
    // A new visit to slide 21 (including another loop) starts on its still frame.
    mediaBuildTriggered = false;
    videoPlaybackNode = null;
    videoPlaybackEnded = false;
    mediaAttempted = new WeakSet();
    blockWheelUntil = 0;
    activeSlideIndex = index;
  }
  host.dataset.activeSlideIndex = String(activeSlideIndex);
  if (presenting) scheduleMedia();
}

function cleanupViewer() {
  restorePresentationLoop?.();
  restorePresentationLoop = null;
  presenting = false;
  void screenWakeLock.deactivate();
  mediaGeneration++;
  pausedPreviewSlides = new Set();
  activeSlideIndex = 0;
  forcedAutoplaySlide = null;
  slidesTotal = 0;
  mediaBuildSlide = null;
  mediaBuildTriggered = false;
  videoPlaybackNode = null;
  videoPlaybackEnded = false;
  touchStartPosition = null;
  suppressSyntheticClickUntil = 0;
  blockWheelUntil = 0;
  mediaAttempted = new WeakSet();
  mediaObserver?.disconnect();
  mediaObserver = null;
  warmReady = null;
  delete $('open-default').dataset.prepared;
  if (viewer) { viewer.destroy(); viewer = null; }
  host.replaceChildren();
}
async function openPresentation(file, {background = false, verifiedOfficial = false} = {}) {
  // A manual upload waits for any offscreen warmup before replacing its viewer.
  if (!background && warmPromise) await warmPromise;
  if (loading) return false;
  if (!validPresentation(file)) {
    status('Seleccioná un PPTX, PPSX o PPTM válido de hasta 250 MB.', true, true);
    return;
  }
  loading = true;
  if (!background) {
    dropzone.setAttribute('aria-busy', 'true');
    $('change-file').disabled = true;
    status('Abriendo y ajustando las diapositivas…', false, true);
  }
  try {
    const {createPptxViewer} = await ensureViewerModule();
    if (typeof createPptxViewer !== 'function') throw Error('No se encontró el motor de PowerPoint.');
    cleanupViewer();
    // During background preparation keep a measurable, offscreen workspace.
    // The *same* viewer DOM will become visible on click; no second loadFile.
    $('workspace').hidden = false;
    $('workspace').classList.toggle('prewarming', background);
    if (!background) {
      $('welcome').hidden = true;
      $('file-name').textContent = file.name;
      $('file-meta').textContent = 'Abriendo diapositivas…';
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    let slides = 0;
    viewer = createPptxViewer(host, {
      editable: $('edit-mode').checked,
      autosave: false,
      locale: 'es',
      showToolbar: true,
      showThumbnails: true,
      showCompatibilityToasts: true,
      fileName: file.name,
      onLoad: ({slideCount}) => { slides = slideCount; },
      onError: (message) => {
        if (!background) status('Problema al interpretar el archivo: ' + message, true, true);
        else console.debug('Preparación anticipada:',message);
      },
      onSlideChange: slideChanged,
      onPresentationChange: (active) => {
        presenting = Boolean(active);
        if (presenting) {
          void screenWakeLock.activate();
          scheduleMedia();
        } else {
          void screenWakeLock.deactivate();
          restorePresentationLoop?.();
          restorePresentationLoop = null;
        }
      }
    });
    await viewer.loadFile(file);
    // The source deck contains a video playFrom animation on slide 21.
    // A single logical PPTX slide can therefore have two presentation steps.
    if (verifiedOfficial) mediaBuildSlide = videoStepForHash(OFFICIAL_DECK_SIZE, OFFICIAL_DECK_SHA256);
    else {
      try { mediaBuildSlide = await getTimedVideoSlide(file); }
      catch (error) { console.warn('Could not inspect video build fingerprint:', error); }
    }
    if (!slides) throw Error('El archivo no contiene diapositivas reconocibles.');
    slidesTotal = slides;
    pausedPreviewSlides = duplicateVideoPreviewSlides(viewer.getSlides?.() || []);
    const current = viewer.getCurrentSlide?.();
    activeSlideIndex = Number.isInteger(current) ? current : 0;
    host.dataset.activeSlideIndex = String(activeSlideIndex);
    $('video-auto-slide').max = String(slides);
    $('video-auto-slide').value = '';
    $('video-policy').hidden = false;
    mediaObserver = new MutationObserver(() => { if (presenting) playVisibleMedia(); });
    mediaObserver.observe(host, {childList: true, subtree: true});
    if (background) {
      warmReady = {file,slides};
      $('open-default').dataset.prepared = 'true';
      $('default-availability').textContent = 'Lista para abrir · guardada en este dispositivo · visor preparado';
    } else {
      showReady(file,slides);
    }
    return true;
  } catch (error) {
    cleanupViewer();
    currentFile = null;
    $('workspace').hidden = true;
    $('workspace').classList.remove('prewarming');
    $('welcome').hidden = false;
    $('start').hidden = true;
    $('download').hidden = true;
    $('change-file').hidden = true;
    $('video-policy').hidden = true;
    if (background) console.debug('No se pudo preparar la presentación anticipadamente:',error);
    else {
      status('No se pudo abrir la presentación: ' + (error?.message || 'error desconocido') +
        '. Comprobá tu conexión y que el archivo no esté dañado.', true, true);
      console.error('Error del visor PPTX:', error);
    }
    return false;
  } finally {
    loading = false;
    if (!background) {
      picker.value = '';
      dropzone.removeAttribute('aria-busy');
      $('change-file').disabled = false;
    }
  }
}

$('start').addEventListener('click', () => {
  if (!viewer) return;
  restorePresentationLoop?.();
  restorePresentationLoop = enablePresentationLoop(viewer);
  if (!restorePresentationLoop) {
    status('Este motor no permite repetir las diapositivas de forma segura. No se inició la presentación.', true, true);
    return;
  }
  presenting = true;
  // Activation is armed on the user gesture; the actual request waits until
  // fullscreenchange confirms that the viewer entered fullscreen.
  void screenWakeLock.activate();
  // No await antes de enterPresentation(): el permiso de fullscreen debe
  // solicitarse directamente desde el gesto del usuario.
  Promise.resolve(viewer.enterPresentation()).then(scheduleMedia).catch((error) => {
    presenting = false;
    void screenWakeLock.deactivate();
    restorePresentationLoop?.();
    restorePresentationLoop = null;
    status('No se pudo abrir pantalla completa: ' + (error?.message || 'permiso denegado'), true, true);
  });
});
$('download').addEventListener('click', async () => {
  if (!viewer || !currentFile) return;
  $('download').disabled = true;
  try { await viewer.downloadPptx(currentFile.name); }
  catch (error) { status('No se pudo guardar el PPTX: ' + (error?.message || 'error'), true, true); }
  finally { $('download').disabled = false; }
});
$('change-file').addEventListener('click', () => picker.click());
$('open-default').addEventListener('click', openDefaultPresentation);
$('edit-mode').addEventListener('change', () => {
  // Editing needs its own editable instance; don't reuse read-only warmup.
  if ($('edit-mode').checked && warmReady) {
    cleanupViewer();
    $('workspace').classList.remove('prewarming');
    $('workspace').hidden = true;
  } else if (!$('edit-mode').checked && !warmPromise && !viewer) {
    void hasCachedOfficialDeck({url:DEFAULT_PPTX_URL}).then(saved => {
      if (saved) startOfficialWarmup();
    });
  }
});
dropzone.addEventListener('click', () => picker.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); picker.click(); }
});
picker.addEventListener('change', () => { if (picker.files?.[0]) openPresentation(picker.files[0]); });
for (const name of ['dragenter', 'dragover']) {
  dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
}
for (const name of ['dragleave', 'drop']) {
  dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
}
dropzone.addEventListener('drop', (event) => { if (event.dataTransfer?.files?.[0]) openPresentation(event.dataTransfer.files[0]); });
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    presenting = false;
    void screenWakeLock.deactivate();
    mediaAttempted = new WeakSet();
  }
});
$('video-auto-slide').addEventListener('change', event => {
  const value = event.target.value.trim();
  if (!value) { forcedAutoplaySlide = null; return; }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > slidesTotal) {
    status('Ingresá un número de diapositiva válido.', true);
    event.target.value = '';
    forcedAutoplaySlide = null;
    return;
  }
  forcedAutoplaySlide = number - 1;
});
// No permitir salir accidentalmente mediante el menú contextual o el
// comando "Finalizar" del toolbar. Esc sigue bajo el control del navegador.
document.addEventListener('contextmenu', event => {
  if (!presenting) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
document.addEventListener('present-toolbar-request', event => {
  if (presenting && event.detail?.id === 'end') {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
// The source deck's slide 21 contains a native playFrom(0) click-effect.
// First advance plays Geraldine once. The next advance skips that effect
// and goes directly to slide 22 via the viewer's public navigation API.
function handleMediaBuildAdvance(event) {
  if (!presenting || activeSlideIndex !== mediaBuildSlide || !isForwardInput(event)) return;
  const stage = document.fullscreenElement || host;
  if (event.type !== 'keydown' && !stage.contains(event.target)) return;
  if (event.type === 'keydown' && /^(INPUT|TEXTAREA|SELECT)$/i.test(event.target?.tagName || '')) return;
  if (event.type === 'click' && event.target.closest?.('video, audio, button, a, input, select, textarea, [contenteditable="true"]')) return;
  if (event.type === 'click' && performance.now() < suppressSyntheticClickUntil) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  // One move on a touchpad can dispatch many wheel events.
  if ((event.type === 'wheel' || event.type === 'touchend') &&
      performance.now() < blockWheelUntil) return;
  if (!mediaBuildTriggered) {
    mediaBuildTriggered = true;
    blockWheelUntil = performance.now() + 850;
    scheduleMedia();
    return;
  }
  // Letting a second "next" event reach PowerPoint would replay the video.
  viewer?.goToSlide(activeSlideIndex + 1);
}

function handleMediaTouchStart(event) {
  if (!presenting || activeSlideIndex !== mediaBuildSlide || event.touches.length !== 1) return;
  const stage = document.fullscreenElement || host;
  if (!stage.contains(event.target)) return;
  touchStartPosition = {x:event.touches[0].clientX, y:event.touches[0].clientY};
}
function handleMediaTouchEnd(event) {
  const start = touchStartPosition;
  touchStartPosition = null;
  if (!start || !event.changedTouches?.length) return;
  const deltaY = start.y - event.changedTouches[0].clientY;
  const deltaX = start.x - event.changedTouches[0].clientX;
  if (deltaY < 45 || Math.abs(deltaY) < Math.abs(deltaX)) return;
  suppressSyntheticClickUntil = performance.now() + 750;
  handleMediaBuildAdvance({
    type:'touchend', target:event.target, deltaY, deltaX,
    preventDefault:()=>event.preventDefault(),
    stopImmediatePropagation:()=>event.stopImmediatePropagation(),
  });
}

// Branch-only remote pilot: listen for USB presenter events on the landing
// screen. Mapping does not affect slideshow navigation or Geraldine.
const introOverlay=$('intro-overlay');
const introVideo=$('intro-video');
let introRunning=false;
let introCachedBlob=null;
let introCachePromise=null;
let introPlaybackObjectUrl=null;
let introProgressLastPaint=0;
function renderIntroCacheProgress({phase,received=0,total=0}){
  const panel=$('intro-cache-progress');
  const state=$('intro-cache-stage');
  const amount=$('intro-cache-amount');
  const meter=$('intro-cache-meter');
  const note=$('intro-cache-state');
  if(!panel || !state || !amount || !meter)return;
  panel.hidden=false;
  panel.dataset.state=phase;
  const mb=n=>(n/1024/1024).toLocaleString('es-AR',{maximumFractionDigits:1});
  const knownTotal=Number.isFinite(total) && total>0;
  const percent=knownTotal?Math.min(100,Math.floor(received/total*100)):null;
  if(phase==='checking'){
    state.textContent='Verificando video guardado…';
    amount.textContent='Caché local';
    meter.removeAttribute('value');
  }else if(phase==='downloading'){
    const now=performance.now();
    if(received && knownTotal && percent!==100 && now-introProgressLastPaint<100)return;
    introProgressLastPaint=now;
    state.textContent=percent===null?'Descargando video introductorio…':
      'Descargando introducción · '+percent+' %';
    amount.textContent=mb(received)+' MB'+(knownTotal?' / '+mb(total)+' MB':' descargados');
    if(knownTotal)meter.value=percent;
    else meter.removeAttribute('value');
  }else{
    const messages={
      saving:'Guardando el video en la notebook…',
      cached:'Video disponible en caché',
      ready:'Video guardado y listo',
      'not-saved':'Video descargado, pero no se pudo guardar',
      missing:'Video pendiente de subir a Hostinger',
      error:'No se pudo descargar el video',
    };
    state.textContent=messages[phase]||'Video introductorio';
    amount.textContent=knownTotal?mb(total)+' MB':phase==='missing'?'Archivo no disponible':'';
    if(phase==='missing'||phase==='error')meter.value=0;
    else meter.value=100;
  }
  if(note)note.textContent=state.textContent+(amount.textContent?' · '+amount.textContent:'');
}
function prepareIntroCache(){
  if(introCachePromise)return introCachePromise;
  renderIntroCacheProgress({phase:'checking'});
  introCachePromise=loadCachedIntroVideo({
    url:INTRO_VIDEO_URL,
    onProgress:renderIntroCacheProgress,
  }).then(result=>{
    if(result.blob)introCachedBlob=result.blob;
    renderIntroCacheProgress({
      phase:result.status==='missing'?'missing':
        !result.saved?'not-saved':result.fromCache?'cached':'ready',
      received:result.blob?.size||0,total:result.blob?.size||0,
    });
    return result;
  }).catch(error=>{
    renderIntroCacheProgress({phase:'error'});
    console.debug('Caché de introducción:',error?.message||error);
    return {blob:null,status:'error',saved:false};
  }).finally(()=>{introCachePromise=null;});
  return introCachePromise;
}

const introOriginalParent=introOverlay.parentNode;
const introOriginalNext=introOverlay.nextSibling;

function canStartIntro(){
  // The remote must never launch video from the landing page or editor.
  return !introRunning && presenting && Boolean(document.fullscreenElement) &&
    activeSlideIndex===0;
}
function restoreIntroOverlay(){
  if(introOverlay.parentNode!==introOriginalParent){
    introOriginalParent.insertBefore(introOverlay,introOriginalNext);
  }
}
function closeIntro({finished=false}={}){
  if(!introRunning)return;
  introRunning=false;
  introVideo.pause();
  introVideo.removeAttribute('src');
  introVideo.load();
  if(introPlaybackObjectUrl){
    URL.revokeObjectURL(introPlaybackObjectUrl);
    introPlaybackObjectUrl=null;
  }
  introOverlay.hidden=true;
  restoreIntroOverlay();
  // The original fullscreen slideshow stays active behind the video.
  if(finished && presenting && document.fullscreenElement) viewer?.goToSlide?.(0);
}
function openIntroFromRemote({url}={}){
  if(!canStartIntro())return;
  // Reuse the presentation's existing fullscreen element, not a second
  // browser fullscreen that would require another user gesture.
  document.fullscreenElement.append(introOverlay);
  introRunning=true;
  introOverlay.hidden=false;
  // Use the completely saved MP4 when available. On the very first opening,
  // before prefetch completes, direct streaming keeps Tab immediately usable.
  const selectedUrl=url || INTRO_VIDEO_URL;
  if(introCachedBlob && selectedUrl===INTRO_VIDEO_URL){
    introPlaybackObjectUrl=URL.createObjectURL(introCachedBlob);
    introVideo.src=introPlaybackObjectUrl;
  }else{
    introVideo.src=selectedUrl;
  }
  introVideo.currentTime=0;
  void introVideo.play().catch(error=>{
    if(!introRunning)return;
    closeIntro();
    status('No se pudo reproducir introduccion.mp4. Verificá el archivo en Hostinger.',true,true);
    console.debug('Intro playback:',error?.name||error);
  });
}
const remoteControl=initRemoteControl({
  // Tab/K01 is only active on physical slide 1, with the show already in
  // fullscreen. Outside that state Tab keeps its normal browser behavior.
  isPresenting:()=>!canStartIntro(),
  onIntro:openIntroFromRemote,
  onNotice:message=>status(message),
});
introVideo.addEventListener('ended',()=>closeIntro({finished:true}));
introVideo.addEventListener('error',()=>{
  if(!introRunning)return;
  closeIntro();
  status('Video introductorio no disponible. Subí introduccion.mp4 a la carpeta masduenos de Hostinger.',true,true);
});
document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement && introRunning) closeIntro();
});
// While the intro is playing, all arrow buttons seek the MP4 by five seconds
// instead of changing slides: Left/Up rewind, Right/Down forward. Tab toggles
// the introduction off. Keep Escape native so it still exits fullscreen.
// Capture before the PPTX viewer's own keyboard handlers.
for(const type of ['keydown','wheel','click','touchend']){
  document.addEventListener(type,event=>{
    if(!introRunning || (type==='keydown' && event.key==='Escape'))return;
    if(type==='keydown'){
      const direction=introSeekDirection(event);
      if(direction)seekIntroVideo(introVideo,direction);
      if(event.code==='Tab' &&
         !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey &&
         !event.repeat){
        closeIntro({finished:true});
      }
    }
    // Consume all other inputs while the MP4 overlay is active, including
    // arrows rejected due to key auto-repeat and mouse wheel scrolling.
    event.preventDefault();
    event.stopImmediatePropagation();
  },{capture:true,passive:false});
}
introOverlay.addEventListener('contextmenu',event=>event.preventDefault());
// The presenter hardware emits Tab. Beyond slide 1, ignore that shortcut
// without allowing the browser to move focus out of the fullscreen viewer.
document.addEventListener('keydown',event=>{
  if(!presenting || activeSlideIndex===0 || event.code!=='Tab')return;
  if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  event.preventDefault();
  event.stopImmediatePropagation();
},true);
document.addEventListener('keydown', handleMediaBuildAdvance, true);
document.addEventListener('wheel', handleMediaBuildAdvance, {capture:true, passive:false});
document.addEventListener('click', handleMediaBuildAdvance, true);
document.addEventListener('touchstart', handleMediaTouchStart, {capture:true, passive:true});
document.addEventListener('touchend', handleMediaTouchEnd, {capture:true, passive:false});
document.addEventListener('play', blockPreviewAutoplay, true);
window.addEventListener('beforeunload', () => {
  remoteControl.dispose();
  void screenWakeLock.dispose();
  cleanupViewer();
});
// Preload the pinned ESM engine while the selection screen is visible.
void ensureViewerModule().catch(() => {});
void checkDefaultPresentation();
