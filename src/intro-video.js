import {open, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {officialPresentationPaths, OFFICIAL_PRESENTATION_NAME} from './official-presentation.js';

export const INTRO_VIDEO_NAME = 'introduccion.mp4';

// Resolve the MP4 in the same hosting directory as the already-working PPTX.
// The route is fixed: no user-controlled file paths or directory browsing.
export function introVideoPaths({projectRoot,homeDir=os.homedir(),presentationPath='',configuredPath=''}){
  const fromDeck=officialPresentationPaths(projectRoot,homeDir,presentationPath);
  return [...new Set([configuredPath,
    ...fromDeck.map(filename=>path.join(path.dirname(filename),INTRO_VIDEO_NAME)),
  ].filter(Boolean).map(filename=>path.resolve(filename)))];
}
export async function resolveIntroVideo(options){
  for(const filename of introVideoPaths(options)){
    let info;
    try {info=await stat(filename);}
    catch(error){
      if(error?.code==='ENOENT'||error?.code==='ENOTDIR') continue;
      throw error;
    }
    if(!info.isFile() || info.size<12)continue;
    // Fast MP4 signature check prevents a server HTML/error document from
    // masquerading as the introduction (ftyp marker at offset 4).
    const file=await open(filename,'r');
    try{
      const buf=Buffer.alloc(12);
      const {bytesRead}=await file.read(buf,0,12,0);
      if(bytesRead>=12 && buf.toString('ascii',4,8)==='ftyp')
        return filename;
    }finally{await file.close();}
  }
  return null;
}
