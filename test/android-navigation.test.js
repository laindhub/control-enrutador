import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../android/app/src/main/assets/salon-navigation.js',import.meta.url),'utf8');
function setup(path='/floor',origin='https://liniers.xn--somosmasdueos-skb.com') {
 const events=new Map(),observers=[],timers=new Map();let timerId=0;
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.contentWindow={};}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  setAttribute(){}
  remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
 }
 const main=new Element('main'),original=new Element('p');original.textContent='136 derivaciones';main.append(original);
 function find(id,n=main){if(n.id===id)return n;for(const child of n.children){const found=find(id,child);if(found)return found;}return null;}
 const location={origin,pathname:path,href:origin+path};
 const window={addEventListener:(name,fn)=>events.set(name,fn)};
 const context={location,window,document:{documentElement:{},getElementById:find,querySelector:()=>main,createElement:tag=>new Element(tag)},
  MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},
  setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn(),history:{pushState(){},replaceState(){}},Date};
 vm.runInNewContext(source,context);
 return {events,observers,timers,location,context,main,original,find,sync:()=>observers.forEach(fn=>fn())};
}
test('activity gains sales without replacing its content or intercepting original navigation',()=>{
 const p=setup('/floor/activity');
 assert.equal(p.main.children[0],p.original);assert.equal(p.original.textContent,'136 derivaciones');
 assert.ok(p.find('md-sales-integration'));assert.equal(p.find('md-sales-frame').src,'https://masduenos.laind.io/presentador/integrado');
 assert.equal(p.events.has('click'),false);assert.equal(p.location.href,'https://liniers.xn--somosmasdueos-skb.com/floor/activity');
});
test('SPA navigation inserts once, removes the section elsewhere, and recreates it on return',()=>{
 const p=setup();assert.equal(p.find('md-sales-integration'),null);
 p.location.pathname='/floor/activity';p.sync();p.sync();assert.equal(p.main.children.length,2);
 p.location.pathname='/floor';p.sync();assert.equal(p.main.children.length,1);
 p.location.pathname='/floor/activity';p.sync();assert.equal(p.main.children.length,2);
 vm.runInNewContext(source,p.context);assert.equal(p.observers.length,1);
});
test('resize accepts only the actual sales frame and bounds its height',()=>{
 const p=setup('/floor/activity'),frame=p.find('md-sales-frame'),onMessage=p.events.get('message');
 onMessage({origin:'https://example.com',source:frame.contentWindow,data:{type:'md-sales-height',height:999}});assert.equal(frame.style.height,undefined);
 onMessage({origin:'https://masduenos.laind.io',source:{},data:{type:'md-sales-height',height:999}});assert.equal(frame.style.height,undefined);
 onMessage({origin:'https://masduenos.laind.io',source:frame.contentWindow,data:{type:'md-sales-height',height:999}});assert.equal(frame.style.height,'999px');
});
test('other origins are untouched',()=>{const p=setup('/floor/activity','https://example.com');assert.equal(p.observers.length,0);assert.equal(p.main.children.length,1);});
test('an unavailable initial frame retries progressively and stops after the trusted ready message',()=>{
 const p=setup('/floor/activity'),frame=p.find('md-sales-frame');
 const first=[...p.timers.values()][0];assert.equal(first.delay,5000);first.fn();
 assert.match(frame.src,/retry=/);assert.equal([...p.timers.values()][0].delay,10000);
 p.events.get('message')({origin:'https://masduenos.laind.io',source:frame.contentWindow,data:{type:'md-sales-height',height:300}});
 assert.equal(p.timers.size,0);assert.equal(frame.dataset.ready,'1');
});
