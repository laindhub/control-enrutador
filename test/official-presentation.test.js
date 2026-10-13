import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {officialPresentationPaths, resolveOfficialPresentation, OFFICIAL_PRESENTATION_NAME} from '../src/official-presentation.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('official presentation is served from Hostinger home/masduenos without placing the PPTX in Git', async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mas-duenos-deck-'));
  t.after(() => rm(base, {recursive:true, force:true}));
  const projectRoot = path.join(base, 'application');
  const homeDir = path.join(base, 'home');
  const hostingDir = path.join(homeDir, 'masduenos');
  await mkdir(hostingDir, {recursive:true});
  const pptx = path.join(hostingDir, OFFICIAL_PRESENTATION_NAME);
  const valid = Buffer.from('example PPTX binary validation fixture');
  const expectedSha256 = digest(valid);
  await writeFile(pptx, valid);

  const options = {projectRoot,homeDir, expectedSize: valid.length,expectedSha256};
  assert.ok(officialPresentationPaths(projectRoot,homeDir).includes(pptx));
  assert.equal(await resolveOfficialPresentation(options),pptx);
  assert.equal(await resolveOfficialPresentation(options),pptx, 'validated file may be cached');

  await writeFile(pptx,Buffer.from('tampered content - wrong length'));
  assert.equal(await resolveOfficialPresentation(options),null, 'reject wrong file size');
  await writeFile(pptx,Buffer.alloc(valid.length,0));
  assert.equal(await resolveOfficialPresentation(options),null, 'reject incorrect SHA even with same file size');
  await writeFile(pptx,valid);
  assert.equal(await resolveOfficialPresentation(options),pptx, 'restored file is accepted');
});

test('official repository public directory takes precedence over the hosting fallback', async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'mas-duenos-repo-'));
  t.after(() => rm(base, {recursive:true, force:true}));
  const projectRoot=path.join(base,'app');
  const homeDir=path.join(base,'home');
  const content=Buffer.from('fixture');
  const expectedSize=content.length;
  const expectedSha256=digest(content);
  const publicDir=path.join(projectRoot,'public','presentaciones');
  await mkdir(publicDir,{recursive:true});
  const candidate=path.join(publicDir, OFFICIAL_PRESENTATION_NAME);
  await writeFile(candidate,content);
  assert.equal(await resolveOfficialPresentation({projectRoot,homeDir,expectedSize,expectedSha256}),candidate);
});
