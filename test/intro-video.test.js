import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveIntroVideo,introVideoPaths} from '../src/intro-video.js';

test('MP4 introduction is served from the same Hostinger folder as the PPTX',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'introduccion-masduenos-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const projectRoot=path.join(dir,'domains','example','hbuilds','current','nodejs');
  const location=path.join(dir,'masduenos','introduccion.mp4');
  await mkdir(path.dirname(location),{recursive:true});
  const options={projectRoot,homeDir:path.join(dir,'otherhome')};
  assert.ok(introVideoPaths(options).includes(location));
  assert.equal(await resolveIntroVideo(options),null,'missing MP4 is not announced');
  await writeFile(location,Buffer.from('<html>Not found</html>'));
  assert.equal(await resolveIntroVideo(options),null,'HTML cannot be served as MP4');
  await writeFile(location,Buffer.concat([Buffer.from([0,0,0,0]),Buffer.from('ftypisom'),Buffer.alloc(16)]));
  assert.equal(await resolveIntroVideo(options),location);
});
test('MP4 route is public, fixed and precedes startup or CRM login',async()=>{
  const {readFileSync}=await import('node:fs');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const pos=server.indexOf("app.get('/assets/presentaciones/introduccion.mp4'");
  assert.ok(pos>0);
  assert.ok(pos<server.indexOf("if (startupState === 'starting')"));
  assert.ok(pos<server.indexOf('app.use(sessionMiddleware);'));
  assert.match(server,/res\.type\('video\/mp4'\)/);
  assert.match(server,/res\.sendFile\(filename/);
});
