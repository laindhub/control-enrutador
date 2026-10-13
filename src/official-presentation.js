import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const OFFICIAL_PRESENTATION_NAME = 'mas-duenos-liniers.pptx';
export const OFFICIAL_PRESENTATION_SIZE = 34_796_967;
export const OFFICIAL_PRESENTATION_SHA256 = 'bdb35bfa366b7c2570a36a0d5b1172836765d50796a8e772345b5a5ccf6f25c7';

// The verified deck is provisioned outside Git so hosting deployments do not
// need to upload 34.8 MB through the repository's text-only integration.
const verifiedFiles = new Map();

export function officialPresentationPaths(projectRoot, homeDir = os.homedir(), configuredPath = '') {
  return [...new Set([
    configuredPath,
    path.join(projectRoot, 'public', 'presentaciones', OFFICIAL_PRESENTATION_NAME),
    path.join(projectRoot, OFFICIAL_PRESENTATION_NAME),
    path.join(homeDir, 'masduenos', OFFICIAL_PRESENTATION_NAME),
  ].filter(Boolean).map(value => path.resolve(value)))];
}

export async function resolveOfficialPresentation({
  projectRoot,
  homeDir = os.homedir(),
  configuredPath = '',
  expectedSize = OFFICIAL_PRESENTATION_SIZE,
  expectedSha256 = OFFICIAL_PRESENTATION_SHA256,
}) {
  for (const filename of officialPresentationPaths(projectRoot, homeDir, configuredPath)) {
    let info;
    try {
      info = await stat(filename);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue;
      throw error;
    }
    if (!info.isFile() || info.size !== expectedSize) continue;

    const fingerprint = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    const cached = verifiedFiles.get(filename);
    if (cached?.fingerprint === fingerprint && cached.expectedSha256 === expectedSha256) return filename;

    const hash = createHash('sha256');
    try {
      for await (const chunk of createReadStream(filename)) hash.update(chunk);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (hash.digest('hex') !== expectedSha256) {
      verifiedFiles.delete(filename);
      continue;
    }
    verifiedFiles.set(filename, {fingerprint, expectedSha256});
    return filename;
  }
  return null;
}
