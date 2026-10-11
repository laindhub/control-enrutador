import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress } from 'node:zlib';
import tar from 'tar-fs';

// Extract the trusted npm package without changing ownership (restricted hosts reject chown).
export async function bundledChromiumPath() {
  const require = createRequire(import.meta.url);
  const bin = path.resolve(path.dirname(require.resolve('@sparticuz/chromium')), '../../bin');
  // Managed Node hosts can mount /tmp with noexec. Keep binaries in the
  // application's private dependency cache, never in its public assets.
  const cacheRoot = fileURLToPath(new URL('../node_modules/.cache/masduenos-browser/', import.meta.url));
  await mkdir(cacheRoot, { recursive:true, mode:0o700 });
  const destination = path.join(cacheRoot, 'chromium-138');
  const ready = path.join(destination, '.ready');
  try { await access(ready); } catch {
    const temp = await mkdtemp(path.join(cacheRoot, 'unpack-'));
    try {
      const unpack = async (file, dir) => {
        const output = path.join(temp, dir);
        await mkdir(output, { recursive:true });
        await pipeline(createReadStream(path.join(bin, file)), createBrotliDecompress(), tar.extract(output, {chown:false}));
      };
      const results = await Promise.allSettled([
        pipeline(createReadStream(path.join(bin, 'chromium.br')), createBrotliDecompress(), createWriteStream(path.join(temp, 'chromium'), {mode:0o700})),
        unpack('fonts.tar.br', 'fonts'),
        unpack('swiftshader.tar.br', '.'),
        unpack('al2023.tar.br', 'al2023'),
      ]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
      await chmod(path.join(temp, 'chromium'), 0o700);
      await writeFile(path.join(temp, '.ready'), '138.0.2');
      await rm(destination, {recursive:true,force:true});
      await rename(temp, destination);
    } catch (error) { await rm(temp, {recursive:true,force:true}); throw error; }
  }
  // Repair modes even when an existing extraction has its ready marker.
  await chmod(destination, 0o700);
  await chmod(path.join(destination, 'chromium'), 0o700);
  // The package's fontconfig refers to /tmp/fonts; our private extraction has another path.
  const fonts = path.join(destination, 'fonts');
  const cache = path.join(destination, 'font-cache');
  await mkdir(cache, {recursive:true});
  await writeFile(path.join(fonts, 'fonts.conf'), `<?xml version="1.0"?><fontconfig><dir>${path.join(fonts, 'fonts')}</dir><cachedir>${cache}</cachedir></fontconfig>`);
  process.env.FONTCONFIG_PATH = fonts;
  const libs = path.join(destination, 'al2023/lib');
  process.env.LD_LIBRARY_PATH = [libs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  return path.join(destination, 'chromium');
}
