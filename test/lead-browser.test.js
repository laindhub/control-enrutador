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
test('explicit configured browser takes precedence and reports its failure',async()=>{
 let calls=0;
 const chromium={launch:async options=>{calls++;assert.equal(options.executablePath,'/custom/chrome');throw Error('configured failure');}};
 await assert.rejects(launchLeadBrowser({chromium,executablePath:'/custom/chrome',platform:'linux'}),/configured failure/);
 assert.equal(calls,1);
});
