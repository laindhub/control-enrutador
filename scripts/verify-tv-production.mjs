import assert from 'node:assert/strict';

const BASE='https://masduenos.laind.io';
const manifestUrl=BASE+'/tv/manifest.json';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const media={
  presentation:{path:'/tv/media/presentation.pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',signature:[0x50,0x4b,0x03,0x04],offset:0},
  introduction:{path:'/tv/media/introduccion.mp4',mime:'video/mp4',signature:[0x66,0x74,0x79,0x70],offset:4},
};
async function get(url,opts={}){
  const response=await fetch(url,{
    redirect:'error',
    signal:AbortSignal.timeout(25000),
    cache:'no-store',
    ...opts
  });
  return response;
}
let manifest;
for(let attempt=1;attempt<=24;attempt++){
  try{
    const response=await get(manifestUrl);
    assert.equal(response.status,200,'dynamic TV manifest must be reachable');
    assert.match(response.headers.get('content-type')||'',/application\/json/);
    manifest=await response.json();
    assert.equal(manifest.version,1);
    assert.ok(manifest.presentation?.sha256);
    break;
  }catch(error){
    if(attempt===24)throw error;
    console.log('TV endpoint not deployed yet, retry '+attempt+': '+error.message);
    await sleep(5000);
  }
}
for(const [kind,spec] of Object.entries(media)){
  const item=manifest[kind];
  if(!item){
    assert.equal(kind,'introduction','PPTX is required');
    console.log('Optional introduction not uploaded to Hostinger yet.');
    continue;
  }
  assert.equal(item.url,spec.path);
  assert.match(item.sha256,/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(item.size) && item.size>12);
  const head=await get(BASE+item.url,{method:'HEAD'});
  assert.equal(head.status,200,kind+' download must be reachable');
  assert.equal((head.headers.get('content-type')||'').split(';')[0].trim(),spec.mime);
  assert.equal(Number(head.headers.get('content-length')),item.size);
  const range=await get(BASE+item.url,{
    headers:{Range:'bytes=0-15','Accept-Encoding':'identity'},
  });
  assert.equal(range.status,206,kind+' must support efficient byte ranges');
  const bytes=new Uint8Array(await range.arrayBuffer());
  assert.equal(bytes.length,16);
  assert.deepEqual([...bytes.slice(spec.offset,spec.offset+4)],spec.signature);
  console.log(kind+': '+item.size+' bytes, SHA-256 '+item.sha256.slice(0,12)+'…, HEAD and HTTP Range OK');
}
console.log('Android TV production media manifest and Hostinger endpoints verified.');
