import test from 'node:test';
import assert from 'node:assert/strict';
import {launchLeadBrowser} from '../src/lead-browser.js';
test('missing system browser uses bundled Chromium without installing anything',async()=>{
 const calls=[],browser={};
 const chromium={launch:async options=>{calls.push(options);if(calls.length===1)throw Error('missing shared library');return browser;}};
 const compact={args:['--no-sandbox'],executablePath:async()=>'/tmp/bundled-chromium'};
 assert.equal(await launchLeadBrowser({chromium,compact,platform:'linux'}),browser);
 assert.equal(calls[1].executablePath,'/tmp/bundled-chromium');assert.deepEqual(calls[1].args,compact.args);
});
test('explicit configured browser takes precedence and reports its failure on unsupported platforms',async()=>{
 let calls=0;
 const chromium={launch:async options=>{calls++;assert.equal(options.executablePath,'/custom/chrome');throw Error('configured failure');}};
 await assert.rejects(launchLeadBrowser({chromium,executablePath:'/custom/chrome',platform:'darwin'}),/configured failure/);
 assert.equal(calls,1);
});
test('a broken configured executable also recovers through the bundled Linux browser',async()=>{
 const calls=[];const chromium={launch:async options=>{calls.push(options);if(calls.length===1)throw Error('invalid configured path');return {};}};
 await launchLeadBrowser({chromium,executablePath:'/old/chrome',platform:'linux',compact:{args:[],executablePath:async()=>'/bundled/chrome'}});
 assert.equal(calls[0].executablePath,'/old/chrome');assert.equal(calls[1].executablePath,'/bundled/chrome');
});
