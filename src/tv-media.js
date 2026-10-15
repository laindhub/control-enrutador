import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open,stat} from 'node:fs/promises';
import os from 'node:os';
import {officialPresentationPaths} from './official-presentation.js';
import {introVideoPaths} from './intro-video.js';

const specs={
  presentation:{name:'mas-duenos-liniers.pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    max:250*1024*1024,signature:Buffer.from([0x50,0x4b,0x03,0x04]),url:'/tv/media/presentation.pptx'},
  introduction:{name:'introduccion.mp4',mime:'video/mp4',max:1024*1024*1024,
    signature:Buffer.from('ftyp'),offset:4,url:'/tv/media/introduccion.mp4'},
};

// Only these two fixed filenames are ever served. No client-supplied paths.
export function createTvMediaStore({
  projectRoot,homeDir=os.homedir(),presentationPath='',introductionPath='',
}){
  const verified=new Map();
  const pending=new Map();
  const pathsFor=kind=>kind==='presentation'
    ?officialPresentationPaths(projectRoot,homeDir,presentationPath)
    :introVideoPaths({projectRoot,homeDir,presentationPath,configuredPath:introductionPath});
  const inspect=async(kind)=>{
    const spec=specs[kind];
    if(!spec)throw Error('Unsupported TV media');
    for(const filename of pathsFor(kind)){
      let info;
      try {info=await stat(filename);}
      catch(e){if(e?.code==='ENOENT'||e?.code==='ENOTDIR')continue;throw e;}
      if(!info.isFile()||info.size<12||info.size>spec.max)continue;
      const fingerprint=[filename,info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs].join(':');
      const old=verified.get(kind);
      if(old?.fingerprint===fingerprint)return old;
      const lock=kind+fingerprint;
      if(pending.has(lock))return pending.get(lock);
      const operation=(async()=>{
        const fh=await open(filename,'r');
        try{
          const bytes=Buffer.alloc(4);
          const result=await fh.read(bytes,0,4,spec.offset||0);
          if(result.bytesRead!==4||!bytes.equals(spec.signature))return null;
        }finally{await fh.close();}
        const hash=createHash('sha256');
        for await(const chunk of createReadStream(filename))hash.update(chunk);
        const after=await stat(filename);
        if(after.size!==info.size||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs)
          throw Error('TV media changed while hashing; retry');
        const record={filename,fingerprint,sha256:hash.digest('hex'),size:info.size,
          modified:info.mtime.toISOString(),url:spec.url,mime:spec.mime};
        verified.set(kind,record);
        return record;
      })();
      pending.set(lock,operation);
      try{
        const record=await operation;
        if(record)return record;
      }finally{pending.delete(lock);}
    }
    verified.delete(kind);
    return null;
  };
  const manifest=async()=>({
    version:1,
    presentation:await inspect('presentation'),
    introduction:await inspect('introduction'),
  });
  return {inspect,manifest};
}
