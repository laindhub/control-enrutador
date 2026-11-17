#!/usr/bin/env node
/**
 * Download the official TWO immutable TV media paths into the APK assets.
 * Executed ONLY on the GitHub hosted builder for the large offline APK;
 * does not add binary media to Git history. Hard-fails on any hash/size error.
 */
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,rm,rename,readFile,stat,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import https from 'node:https';
import path from 'node:path';

const HOST='masduenos.laind.io';
const BASE='https://'+HOST;
const OUTPUT='android-tv/app/src/main/assets/bundle';
const specs=[
  {kind:'presentation',route:'/tv/media/presentation.pptx',file:'presentation.pptx',
   max:250*1024*1024,mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
   signature:Buffer.from([0x50,0x4b,0x03,0x04]),offset:0},
  {kind:'introduction',route:'/tv/media/introduccion.mp4',file:'introduccion.mp4',
   max:1024*1024*1024,mime:'video/mp4',
   signature:Buffer.from('ftyp'),offset:4},
];

function get(route){
  return new Promise((resolve,reject)=>{
    const req=https.get(BASE+route,{
      headers:{'accept-encoding':'identity','user-agent':'MasDuenosTV-Offline-Packager/1'},
      timeout:60000,
    },res=>{
      if(res.statusCode!==200){
        res.resume();
        reject(new Error(route+': HTTP '+res.statusCode));
        return;
      }
      resolve(res);
    });
    req.on('timeout',()=>req.destroy(new Error(route+': read timeout')));
    req.on('error',reject);
  });
}
async function fetchManifest(){
  const stream=await get('/tv/manifest.json');
  const parts=[];
  let length=0;
  for await(const chunk of stream){
    length+=chunk.length;
    if(length>65536)throw new Error('Remote manifest exceeds 64 KB');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function main(){
  const manifest=await fetchManifest();
  if(manifest.version!==1)throw Error('Unsupported TV manifest version');
  await mkdir(OUTPUT,{recursive:true});
  const bundled={version:1};
  for(const spec of specs){
    // The complete APK uses the exact 39-slide user-approved PPTX restored
    // from Git's checksum-pinned binary parts; only the introduction is
    // fetched from the existing Hostinger media endpoint.
    if(spec.kind==='presentation'){
      const local=path.join(OUTPUT,spec.file);
      let localBytes;
      try {localBytes=await readFile(local);}catch(e){
        throw Error('Approved 39-slide deck was not assembled before media packaging');
      }
      const localSha=createHash('sha256').update(localBytes).digest('hex');
      if(localBytes.length!==35735002 ||
         localSha!=='175c2002b3b2f7f5d9c42412bfb770514f1c03fc924b5833cc49bb63e1d53f12')
        throw Error('Approved PowerPoint did not match supplied 39-slide file');
      bundled.presentation={size:localBytes.length,sha256:localSha};
      console.log('Bundled approved PPTX (not Hostinger):',localBytes.length,localSha);
      continue;
    }
    const info=manifest[spec.kind];
    if(!info)throw Error('Remote manifest missing '+spec.kind);
    const size=Number(info.size);
    const sha=String(info.sha256||'').toLowerCase();
    if(info.url!==spec.route || !Number.isSafeInteger(size) || size<12 ||
       size>spec.max || !/^[0-9a-f]{64}$/.test(sha))
      throw Error('Invalid manifest entry for '+spec.kind);
    const destination=path.join(OUTPUT,spec.file);
    const partial=destination+'.part';
    const response=await get(spec.route);
    const receivedType=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
    if(receivedType!==spec.mime){
      response.destroy();
      throw Error('Unexpected Content-Type for '+spec.kind+': '+receivedType);
    }
    if(response.headers['content-length'] && Number(response.headers['content-length'])!==size){
      response.destroy();
      throw Error('Mismatched Content-Length for '+spec.kind);
    }
    const hash=createHash('sha256');
    let received=0;
    try{
      await pipeline(response,async function* (input){
        for await (const chunk of input){
          received+=chunk.length;
          if(received>size)throw Error('Exceeded expected media size: '+spec.kind);
          hash.update(chunk);
          yield chunk;
        }
      },createWriteStream(partial,{flags:'wx'}));
      if(received!==size || hash.digest('hex')!==sha)
        throw Error('Media SHA-256 or size mismatch: '+spec.kind);
      const {open}=await import('node:fs/promises');
      const handle=await open(partial,'r');
      try{
        const probe=Buffer.alloc(4);
        const {bytesRead}=await handle.read(probe,0,4,spec.offset);
        if(bytesRead!==4||!probe.equals(spec.signature))
          throw Error('Invalid file header: '+spec.kind);
      }finally{await handle.close();}
      await rename(partial,destination);
    }catch(error){
      await rm(partial,{force:true});
      throw error;
    }
    bundled[spec.kind]={sha256:sha,size};
    process.stdout.write('Bundled '+spec.kind+': '+size+' bytes, SHA-256 '+sha+'\n');
  }
  await writeFile(path.join(OUTPUT,'manifest.json'),JSON.stringify(bundled,null,2)+'\n');
  for(const spec of specs){
    const info=bundled[spec.kind];
    const file=path.join(OUTPUT,spec.file);
    if((await stat(file)).size!==info.size)
      throw Error('Bundle file changed during packaging: '+spec.kind);
  }
  console.log('Ready to build standalone 39-slide offline TV APK.');
}
main().catch(error=>{console.error('TV bundle build failed:',error);process.exitCode=1;});
