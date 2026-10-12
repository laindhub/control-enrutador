// Determina qué diapositivas muestran un video duplicado como vista previa.
function descriptor(element) {
  if (!element || typeof element !== 'object') return null;
  const type = String(element.type || element.kind || '').toLowerCase();
  const mime = String(element.mimeType || element.mediaType || element.mime || element.media?.mimeType || '').toLowerCase();
  if (!['video', 'media'].includes(type) && !type.includes('video') && !mime.includes('video')) return null;
  if (type === 'audio' || mime.startsWith('audio')) return null;
  const fields = ['src', 'source', 'url', 'path', 'fileName', 'filename', 'mediaUrl', 'mediaPath', 'dataUrl'];
  const sources = [element, element.media, element.video, element.props, element.data].filter(x => x && typeof x === 'object');
  const ref = sources.flatMap(x => fields.map(key => x[key])).find(x => typeof x === 'string' && x && !x.startsWith('blob:')) || '';
  const source = ref.length > 700 ? ref.length + ':' + ref.slice(0,180) + ':' + ref.slice(-180) : ref;
  const num = x => Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0;
  const position = [element.x, element.y, element.width ?? element.w, element.height ?? element.h].map(num).join(':');
  return {source, position};
}
function videos(slide) {
  const found = [];
  const visit = elements => {
    if (!Array.isArray(elements)) return;
    for (const element of elements) {
      const video = descriptor(element);
      if (video) found.push(video);
      visit(element?.elements);
      visit(element?.children);
    }
  };
  visit(slide?.elements);
  return found;
}
export function duplicateVideoPreviewSlides(slides) {
  if (!Array.isArray(slides)) return new Set();
  const videoSlides = slides.map(videos);
  const paused = new Set();
  for (let index = 0; index < videoSlides.length - 1; index++) {
    if (videoSlides[index].some(first => videoSlides[index + 1].some(next =>
      (first.source && next.source && first.source === next.source) ||
      (first.position !== '0:0:0:0' && first.position === next.position)))) {
      paused.add(index);
    }
  }
  return paused;
}
export function mayAutoPlayVideo(index, paused, forcedSlide = null) {
  if (Number.isInteger(forcedSlide) && forcedSlide >= 0) return index === forcedSlide;
  return !paused.has(index);
}
