#!/usr/bin/env node
/**
 * Reassemble exactly the user's approved 39-slide presentation.
 * Binary fragments are stored in Git so the GitHub runner does not need
 * Google Drive, public sharing or internet access to the user attachment.
 */
import {createReadStream,createWriteStream} from 'node:fs';
import {readdir,mkdir,stat,rm,rename,open} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const PARTS='android-tv/source/presentation-39';
const TARGET='android-tv/app/src/main/assets/bundle/presentation.pptx';
const EXPECTED_SIZE=35735002;
const EXPECTED_SHA='175c2002b3b2f7f5d9c42412bfb770514f1c03fc924b5833cc49bb63e1d53f12';
const names=(await readdir(PARTS)).filter(s=>/^part-\d{2}$/.test(s)).sort();
if(names.length!==46||names.some((name,i)=>name!=='part-'+String(i).padStart(2,'0')))
  throw Error('The complete 46-part PowerPoint source is required');
await mkdir(path.dirname(TARGET),{recursive:true});
const temp=TARGET+'.assembling';
await rm(temp,{force:true});
const output=createWriteStream(temp,{flags:'wx'});
const hash=createHash('sha256');
let written=0;
try {
  for(const part of names){
    const filename=path.join(PARTS,part);
    for await(const chunk of createReadStream(filename)){
      hash.update(chunk);
      written+=chunk.length;
      if(written>EXPECTED_SIZE)throw Error('PowerPoint exceeds expected length');
      if(!output.write(chunk))await new Promise(resolve=>output.once('drain',resolve));
    }
  }
  await new Promise((resolve,reject)=>output.end(err=>err?reject(err):resolve()));
  const actual=hash.digest('hex');
  if(written!==EXPECTED_SIZE||actual!==EXPECTED_SHA)
    throw Error('Wrong PPTX bytes: size '+written+' SHA-256 '+actual);
  const fd=await open(temp,'r');
  try {
    const bytes=Buffer.alloc(4);await fd.read(bytes,0,4,0);
    if(!bytes.equals(Buffer.from([0x50,0x4b,0x03,0x04])))
      throw Error('Not a PPTX ZIP archive');
  }finally{await fd.close();}
  await rename(temp,TARGET);
  console.log('EXACT USER PPTX VERIFIED: 39 slides,',written,'bytes, SHA-256',actual);
} catch(error){
  output.destroy();
  await rm(temp,{force:true});
  throw error;
}
