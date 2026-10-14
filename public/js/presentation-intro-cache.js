// Persistent Cache Storage for the independent Hostinger introduction MP4.
// Runs only after the user opens the official Liniers presentation, never
// merely by visiting the landing page. Other uploaded PPTX files are unaffected.
export const INTRO_VIDEO_URL = '/assets/presentaciones/introduccion.mp4';
export const INTRO_VIDEO_CACHE = 'salon-mas-duenos-introduccion-mp4-v1';
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const metaNames = [
  ['etag','x-laind-intro-source-etag'],
  ['last-modified','x-laind-intro-source-modified'],
  ['content-length','x-laind-intro-source-length'],
];

function mp4Response(response) {
  return response?.ok &&
    (response.headers.get('content-type') || '').split(';',1)[0].trim().toLowerCase() === 'video/mp4';
}

async function validatedVideo(response, maxBytes, onChunk = () => {}) {
  if (!mp4Response(response)) throw Error('El servidor todavía no entregó un video MP4.');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw Error('El MP4 supera el límite de almacenamiento local.');
  let blob;
  if (response.body?.getReader) {
    const reader=response.body.getReader();
    const chunks=[];
    let received=0;
    try {
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        received+=value.byteLength;
        if(received>maxBytes || (declared && received>declared)){
          await reader.cancel().catch(()=>{});
          throw Error('La descarga supera el tamaño anunciado o permitido.');
        }
        chunks.push(value);
        onChunk(received,declared);
      }
    }finally{reader.releaseLock();}
    blob=new Blob(chunks,{type:'video/mp4'});
  }else{
    blob=await response.blob();
    onChunk(blob.size,declared);
  }
  if (blob.size < 12 || blob.size > maxBytes ||
      await blob.slice(4,8).text() !== 'ftyp') {
    throw Error('El archivo recibido no es un MP4 completo y válido.');
  }
  if (declared && blob.size !== declared) throw Error('La descarga del MP4 quedó incompleta.');
  return blob;
}

function hasChanged(head, saved) {
  if (!mp4Response(head)) return false; // 404/HTML/network error: use the saved copy.
  return metaNames.some(([remote, local]) => {
    const a = head.headers.get(remote);
    const b = saved.headers.get(local);
    return Boolean(a && b && a !== b);
  });
}

export async function loadCachedIntroVideo({
  url = INTRO_VIDEO_URL,
  fetcher = globalThis.fetch,
  cacheStorage = globalThis.caches,
  maxBytes = MAX_VIDEO_BYTES,
  onProgress = () => {},
} = {}) {
  const report = (phase,received=0,total=0)=>onProgress({phase,received,total});
  let cache = null;
  try { cache = await cacheStorage?.open?.(INTRO_VIDEO_CACHE) || null; }
  catch { /* Storage disabled or insufficient. Network playback still works. */ }

  if (cache) {
    try {
      const stored = await cache.match(url);
      if (stored) {
        report('checking');
        let blob;
        try { blob = await validatedVideo(stored.clone(), maxBytes); }
        catch { await cache.delete(url).catch(()=>{}); }
        if (blob) {
          let changed = false;
          try {
            const head = await fetcher(url,{method:'HEAD',cache:'no-store'});
            changed = hasChanged(head,stored);
          } catch { /* Offline or temporary Hostinger failure: reuse saved MP4. */ }
          if (!changed) {
            report('cached',blob.size,blob.size);
            return {blob,fromCache:true,saved:true,status:'ready'};
          }
          await cache.delete(url).catch(()=>{});
        }
      }
    } catch { /* Corrupt cache must not block downloads. */ }
  }

  const response = await fetcher(url,{method:'GET',cache:'no-store'});
  if (response.status === 404) {
    report('missing');
    return {blob:null,fromCache:false,saved:false,status:'missing'};
  }
  const declared=Number(response.headers.get('content-length')||0);
  report('downloading',0,declared);
  const blob=await validatedVideo(response,maxBytes,
    (received,total)=>report('downloading',received,total));
  report('saving',blob.size,blob.size);
  let saved=false;
  if (cache) {
    try {
      const headers = {'content-type':'video/mp4','content-length':String(blob.size)};
      for (const [remote,local] of metaNames) {
        const value=response.headers.get(remote);
        if(value) headers[local]=value;
      }
      await cache.put(url,new Response(blob,{status:200,headers}));
      saved=true;
    } catch { /* Browser quota can reject large MP4s; playback still works. */ }
  }
  report(saved?'ready':'not-saved',blob.size,blob.size);
  return {blob,fromCache:false,saved,status:'ready'};
}
