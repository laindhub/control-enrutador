import {build} from 'esbuild';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

const output=resolve('android-tv/app/src/main/assets/pptx-viewer-offline.js');
await mkdir(dirname(output),{recursive:true});
const result=await build({
  entryPoints:[resolve('scripts/tv-pptx-engine-entry.mjs')],
  outfile:output,
  bundle:true,
  splitting:false,
  platform:'browser',
  format:'esm',
  target:['chrome100'],
  mainFields:['browser','module','main'],
  conditions:['browser','import','default'],
  minify:true,
  sourcemap:false,
  legalComments:'none',
  metafile:true,
  logLevel:'info',
  define:{'process.env.NODE_ENV':'"production"'},
});
const main=Object.entries(result.metafile.outputs).find(([name])=>
  name.endsWith('/pptx-viewer-offline.js')||name.endsWith('\\pptx-viewer-offline.js'));
if(!main)throw Error('No PPTX engine bundle was generated');
const imports=Object.values(result.metafile.outputs).flatMap(v=>v.imports||[]);
if(imports.length)throw Error('PPTX engine still contains external imports: '+JSON.stringify(imports));
const source=await readFile(output,'utf8');
if(source.length<10000)throw Error('Bundled viewer is unexpectedly small');
if(/from\s*["']https?:\/\//.test(source))throw Error('PPTX viewer still imports a network dependency');
const size=(await stat(output)).size;
console.log('Bundled pptx-vanilla-viewer@3.31.1 into local WebView module:',size,'bytes');
console.log('Inputs bundled:',Object.keys(result.metafile.inputs).length,' | Imports remaining:',imports.length);
