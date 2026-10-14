import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCachedIntroVideo, INTRO_VIDEO_CACHE, INTRO_VIDEO_URL} from '../public/js/presentation-intro-cache.js';

const video=()=>Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(16)]);
const sourceHeaders=(data,etag='"v1"')=>({
  'content-type':'video/mp4','content-length':String(data.length),etag
});
function memoryCache(){
  const files=new Map();
  return {
    files,
    open:async name=>{
      assert.equal(name,INTRO_VIDEO_CACHE);
      return {
        match:async key=>files.get(key)?.clone()||null,
        put:async(key,response)=>{files.set(key,response.clone());},
        delete:async key=>files.delete(key),
      };
    },
  };
}

test('first open stores intro and next open uses persisted MP4',async()=>{
  const db=memoryCache(),data=video();
  let get=0,head=0;
  const fetcher=async(_url,opts)=>{
    if(opts.method==='HEAD'){
      head++;
      return new Response(null,{headers:sourceHeaders(data)});
    }
    get++;
    return new Response(data,{headers:sourceHeaders(data)});
  };
  const first=await loadCachedIntroVideo({cacheStorage:db,fetcher});
  assert.equal(first.saved,true);
  assert.equal(first.fromCache,false);
  assert.equal(get,1);
  assert.ok(db.files.has(INTRO_VIDEO_URL));
  const second=await loadCachedIntroVideo({cacheStorage:db,fetcher});
  assert.equal(second.fromCache,true);
  assert.equal(second.blob.size,data.length);
  assert.equal(get,1);
  assert.equal(head,1);
});

test('modified ETag forces refresh and missing MP4 does not poison cache',async()=>{
  const db=memoryCache(),data=video();
  let etag='"one"',get=0;
  const fetcher=async(_url,opts)=>{
    if(opts.method==='HEAD')return new Response(null,{headers:sourceHeaders(data,etag)});
    get++;
    return new Response(data,{headers:sourceHeaders(data,etag)});
  };
  await loadCachedIntroVideo({cacheStorage:db,fetcher});
  etag='"two"';
  const second=await loadCachedIntroVideo({cacheStorage:db,fetcher});
  assert.equal(second.fromCache,false);
  assert.equal(get,2);
  const absent=await loadCachedIntroVideo({
    cacheStorage:memoryCache(),
    fetcher:async()=>new Response(null,{status:404}),
  });
  assert.equal(absent.status,'missing');
  assert.equal(absent.blob,null);
});

test('HTML, malformed MP4 and partial transfer cannot enter persistent cache',async()=>{
  const db=memoryCache();
  const cases=[
    new Response('<h1>loading</h1>',{headers:{'content-type':'text/html'}}),
    new Response(Buffer.alloc(25),{headers:{'content-type':'video/mp4'}}),
    new Response(video(),{headers:{'content-type':'video/mp4','content-length':'9999'}}),
  ];
  for(const response of cases){
    await assert.rejects(loadCachedIntroVideo({
      cacheStorage:db,fetcher:async()=>response.clone(),
    }));
    assert.equal(db.files.size,0);
  }
});

test('cache remains usable on network failure; full video plays if storage writes fail',async()=>{
  const data=video(),db=memoryCache();
  await loadCachedIntroVideo({cacheStorage:db,
    fetcher:async()=>new Response(data,{headers:sourceHeaders(data)})});
  const reuse=await loadCachedIntroVideo({cacheStorage:db,
    fetcher:async()=>{throw Error('offline');}});
  assert.equal(reuse.fromCache,true);
  const quota={
    open:async()=>({
      match:async()=>null,
      put:async()=>{throw Error('storage unavailable');},
    }),
  };
  const fallback=await loadCachedIntroVideo({cacheStorage:quota,
    fetcher:async()=>new Response(data,{headers:sourceHeaders(data)})});
  assert.equal(fallback.saved,false);
  assert.equal(fallback.blob.size,data.length);
});
