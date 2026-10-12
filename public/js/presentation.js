// Los PPTX se procesan en el navegador, nunca se envían al servidor.
// El motor se fija a una versión específica para evitar cambios inesperados.
const VIEWER_MODULE = 'https://esm.sh/pptx-vanilla-viewer@3.31.1?bundle';
const MAX_FILE_SIZE = 250 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const picker = $('file-input');
const dropzone = $('dropzone');
const host = $('pptx-host');
let viewer = null;
let currentFile = null;
let loading = false;
let presenting = false;
let mediaObserver = null;
let modulePromise = null;
let statusTimer = null;
let mediaAttempted = new WeakSet();

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
function playVisibleMedia() {
  if (!presenting) return;
  const root = document.fullscreenElement || host;
  root.querySelectorAll('video, audio').forEach((media) => {
    const rect = media.getBoundingClientRect();
    const visible = rect.width > 1 && rect.height > 1 && rect.left < innerWidth &&
      rect.right > 0 && rect.top < innerHeight && rect.bottom > 0 &&
      !media.closest('[aria-hidden="true"]');
    if (!visible) return;
    if (mediaAttempted.has(media)) return;
    mediaAttempted.add(media);
    media.autoplay = true;
    if (media.tagName === 'VIDEO') media.playsInline = true;
    const result = media.play();
    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        if (error && error.name === 'NotAllowedError') {
          status('Este navegador bloqueó el video con sonido. Activá el audio una vez desde los controles del reproductor.', true, true);
        } else if (error && error.name === 'NotSupportedError') {
          status('El formato de este video no es compatible con el navegador. Convertirlo a MP4 H.264/AAC puede resolverlo.', true, true);
        }
      });
    }
  });
}
function scheduleMedia() {
  mediaAttempted = new WeakSet();
  setTimeout(playVisibleMedia, 0);
  setTimeout(playVisibleMedia, 350);
}
function cleanupViewer() {
  presenting = false;
  mediaObserver?.disconnect();
  mediaObserver = null;
  if (viewer) { viewer.destroy(); viewer = null; }
  host.replaceChildren();
}
async function openPresentation(file) {
  if (loading) return;
  if (!validPresentation(file)) {
    status('Seleccioná un PPTX, PPSX o PPTM válido de hasta 250 MB.', true, true);
    return;
  }
  loading = true;
  dropzone.setAttribute('aria-busy', 'true');
  $('change-file').disabled = true;
  status('Preparando el motor de presentaciones…', false, true);
  try {
    modulePromise ||= import(VIEWER_MODULE);
    const { createPptxViewer } = await modulePromise;
    if (typeof createPptxViewer !== 'function') throw Error('No se encontró el motor de PowerPoint.');
    cleanupViewer();
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
      onError: (message) => { status('Problema al interpretar el archivo: ' + message, true, true); },
      onSlideChange: () => { if (presenting) scheduleMedia(); },
      onPresentationChange: (active) => {
        presenting = Boolean(active);
        if (presenting) scheduleMedia();
      }
    });
    await viewer.loadFile(file);
    if (!slides) throw Error('El archivo no contiene diapositivas reconocibles.');
    mediaObserver = new MutationObserver(() => { if (presenting) playVisibleMedia(); });
    mediaObserver.observe(host, {childList: true, subtree: true});
    showReady(file, slides);
  } catch (error) {
    cleanupViewer();
    status('No se pudo abrir la presentación: ' + (error?.message || 'error desconocido') +
      '. Comprobá tu conexión y que el archivo no esté dañado.', true, true);
    console.error('Error del visor PPTX:', error);
  } finally {
    loading = false;
    picker.value = '';
    dropzone.removeAttribute('aria-busy');
    $('change-file').disabled = false;
  }
}

$('start').addEventListener('click', () => {
  if (!viewer) return;
  presenting = true;
  // No await antes de enterPresentation(): el permiso de fullscreen debe
  // solicitarse directamente desde el gesto del usuario.
  Promise.resolve(viewer.enterPresentation()).then(scheduleMedia).catch((error) => {
    presenting = false;
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
    mediaAttempted = new WeakSet();
  }
});
window.addEventListener('beforeunload', cleanupViewer);