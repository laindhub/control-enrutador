import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ejs from 'ejs';
import {CRM_ORIGIN,CRM_TEST_URL,cspForCrmIframe} from '../src/iframe-probe.js';

test('iframe experiment permits only Liniers, without weakening unrelated CSP directives',()=>{
  const initial="default-src 'self'; script-src 'self'; frame-ancestors 'self'; frame-src 'self'; form-action 'self'";
  const updated=cspForCrmIframe(initial);
  assert.equal(updated.split('frame-src').length-1,1);
  assert.ok(updated.includes('frame-src '+CRM_ORIGIN));
  assert.ok(updated.includes("script-src 'self'"));
  assert.ok(updated.includes("frame-ancestors 'self'"));
  assert.ok(updated.includes("form-action 'self'"));
  assert.ok(!updated.includes('https:;'));
});
test('experimental page uses the exact CRM and keeps a direct fallback link',()=>{
  const template=readFileSync(new URL('../views/iframe-probe.ejs',import.meta.url),'utf8');
  const html=ejs.render(template,{crmUrl:CRM_TEST_URL,assetUrl:asset=>'/assets/'+asset});
  assert.match(html,/id="crm-frame"/);
  assert.ok(html.includes('src="'+CRM_TEST_URL+'"'));
  assert.match(html,/id="open-crm"/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.match(html,/id="result"/);
  assert.ok(html.includes('js/iframe-probe.js'));
});
test('probe does not attempt cross-origin DOM access or claim iframe load means success',()=>{
  const script=readFileSync(new URL('../public/js/iframe-probe.js',import.meta.url),'utf8');
  assert.ok(!script.includes('frame.contentDocument'));
  assert.ok(!script.includes('frame.contentWindow.document'));
  assert.ok(script.includes('este evento no confirma'));
  assert.ok(script.includes('data-result'));
});
