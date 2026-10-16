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
  plugins:[{
    name:'disable-tv-unused-optional-3d-and-ai',
    setup(ctx){
      // pptx-vanilla-viewer@3.31.1 has optional dynamic imports for 3D and
      // AI editing. Presentation Liniers does not use those features; never
      // let a deferred import require the Internet on TCL.
      const optional=/^(?:three(?:\/.*)?|ai)$/;
      ctx.onResolve({filter:optional},args=>({
        path:args.path,namespace:'tv-offline-optional',
      }));
      ctx.onLoad({filter:/.*/,namespace:'tv-offline-optional'},args=>({
        contents:`throw new Error("Optional 3D/AI editing feature is unavailable in offline TV presentation"); export default {};`,
        loader:'js',
      }));
    },
  }],
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

const fontsRoot=resolve('node_modules/@fontsource/carlito/files');
let fontCss='/* Local Carlito font faces — SIL OFL 1.1; no Google Fonts requests. */\n';
for(const [weight,style] of [[400,'normal'],[700,'normal'],[400,'italic'],[700,'italic']]){
  const name='carlito-latin-'+weight+'-'+style+'.woff2';
  const bytes=await readFile(resolve(fontsRoot,name));
  if(bytes.length<1000)throw Error('Missing bundled font '+name);
  fontCss+="@font-face{font-family:'Carlito';font-weight:"+weight+";font-style:"+style+
    ";font-display:block;src:url(data:font/woff2;base64,"+bytes.toString('base64')+
    ") format('woff2')}\n";
}
const fontOutput=resolve('android-tv/app/src/main/assets/tv-fonts.css');
await (await import('node:fs/promises')).writeFile(fontOutput,fontCss);
console.log('Four Carlito font faces embedded for offline PowerPoint typography:',fontCss.length,'CSS bytes');
