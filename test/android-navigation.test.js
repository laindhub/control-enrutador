import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../android/app/src/main/assets/salon-navigation.js',import.meta.url),'utf8');
function setup(host='liniers.xn--somosmasdueos-skb.com',path='/floor') {
  const location={hostname:host,pathname:path,protocol:'https:',href:'unchanged'},listeners=[];
  const context={location,window:{},document:{addEventListener:(...args)=>listeners.push(args)}};
  vm.runInNewContext(source,context);return {context,location,listeners};
}
function click(p,label,form=false) {
  let stopped=false;const control={innerText:label,getAttribute:()=>null,hasAttribute:()=>false,closest:()=>form?{}:null};
  p.listeners[0][1]({target:{closest:()=>control},preventDefault(){stopped=true;},stopImmediatePropagation(){}});return stopped;
}
test('only the original Yo control navigates to sales, including nested icons',()=>{
  const p=setup();assert.equal(click(p,'Hoy'),false);assert.equal(p.location.href,'unchanged');
  assert.equal(click(p,'Yo'),true);assert.equal(p.location.href,'https://masduenos.laind.io/presentador');
});
test('login-to-floor SPA navigation and replacement controls retain the listener without duplicate registration',()=>{
  const p=setup(undefined,'/login');assert.equal(click(p,'Yo'),false);
  p.location.pathname='/floor';assert.equal(click(p,'Yo'),true);
  vm.runInNewContext(source,p.context);assert.equal(p.listeners.length,1);
});
test('untrusted origins and controls in forms are not modified',()=>{
  assert.equal(setup('example.com').listeners.length,0);
  assert.equal(click(setup(),'Yo',true),false);
});
