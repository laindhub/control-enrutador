import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../android/app/src/main/assets/salon-navigation.js',import.meta.url),'utf8');
function setup(path='/floor',origin='https://liniers.xn--somosmasdueos-skb.com',prepared=true) {
 const events=new Map(),observers=[],timers=new Map(),styles=[];let timerId=0;
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.messages=[];this.contentWindow={postMessage:(data,origin)=>this.messages.push({data,origin})};this.ownText='';}
  set textContent(value){this.ownText=value;}
  get textContent(){return this.ownText+this.children.map(node=>node.textContent).join('');}
  append(...nodes){for(const n of nodes){if(n.parent)n.remove();n.parent=this;this.children.push(n);}}
  insertBefore(node,other){if(!this.children.includes(other))throw Error('Invalid reference');if(node.parent)node.remove();node.parent=this;this.children.splice(this.children.indexOf(other),0,node);}
  querySelectorAll(selector){const tags=selector.split(',').map(tag=>tag.trim());const found=[];const walk=el=>{for(const child of el.children){if(tags.includes(child.tag))found.push(child);walk(child);}};walk(this);return found;}
  get lastElementChild(){return this.children.at(-1);}
  get nextElementSibling(){return this.parent?.children[this.parent.children.indexOf(this)+1]||null;}
  get parentElement(){return this.parent;}
  getBoundingClientRect(){return this.tag==='header'?{height:76,bottom:76}:{height:1000};}
  getAttribute(name){return this[name];}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,fn){this[name]=fn;}
  prepend(n){if(n.parent)n.remove();n.parent=this;this.children.unshift(n);}
  get firstElementChild(){return this.children[0];}
  remove(){if(!this.parent)return;this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=undefined;}
 }
 const header=new Element('header'),label=new Element('span');label.textContent='Nahuel · Liniers';header.append(label);
 const main=new Element('main'),original=new Element('p');original.textContent='136 derivaciones';main.append(original);
 function find(id,n=main){if(n.id===id)return n;for(const child of n.children){const found=find(id,child);if(found)return found;}return null;}
 const location={origin,pathname:path,href:origin+path};
 const window={dispatchEvent(){},__mdSalesPrepared:prepared,addEventListener:(name,fn)=>events.set(name,fn)};
 const context={location,window,document:{documentElement:{style:{},append:node=>styles.push(node)},getElementById:find,querySelector:selector=>selector==='header'?header:main,createElement:tag=>new Element(tag)},
  MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}},
  setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn(),Event:class{constructor(type){this.type=type;}},history:{pushState(){},replaceState(){}},Date};
 vm.runInNewContext(source,context);
 return {events,observers,timers,styles,location,context,main,original,find,sync:()=>observers.forEach(fn=>fn())};
}
test('activity gains sales without replacing its content or intercepting original navigation',()=>{
 const p=setup('/floor/activity');
 assert.equal(p.main.children[2],p.original);assert.equal(p.original.textContent,'136 derivaciones');
 assert.ok(p.find('md-sales-integration'));assert.equal(p.find('md-sales-frame').src,'https://masduenos.laind.io/presentador/integrado?area=leads');
 assert.equal(p.events.has('click'),false);assert.equal(p.location.href,'https://liniers.xn--somosmasdueos-skb.com/floor/activity');
});
test('waits for first-party session preparation before making any iframe request',()=>{
 const p=setup('/floor/activity',undefined,false),frame=p.find('md-sales-frame');
 assert.equal(frame.src,undefined);assert.equal(p.timers.size,0);
 p.events.get('md-sales-prepared')();assert.match(frame.src,/presentador\/integrado\?area=leads$/);
});
test('activity arriving late stays above the embedded sales',()=>{
 const p=setup('/floor/activity'),section=p.find('md-sales-integration');
 p.main.append(p.original);p.sync();
 assert.equal(p.main.lastElementChild,section);assert.equal(p.main.children[2],p.original);
});
test('SPA navigation inserts once, removes the section elsewhere, and recreates it on return',()=>{
 const p=setup();assert.equal(p.find('md-sales-integration'),null);
 p.location.pathname='/floor/activity';p.sync();p.sync();assert.equal(p.main.children.length,4);
 p.location.pathname='/floor';p.sync();assert.equal(p.main.children.length,1);assert.equal(p.find('md-activity-tabs-spacer'),null);
 p.location.pathname='/floor/activity';p.sync();assert.equal(p.main.children.length,4);
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

test('trusted dialogs fill the screen, keep their place in the page and restore it on close',()=>{
 const p=setup('/floor/activity'),frame=p.find('md-sales-frame'),original=frame.style.cssText;
 const event={origin:'https://masduenos.laind.io',source:frame.contentWindow,data:{type:'md-sales-dialog',open:true}};
 p.events.get('message')({...event,source:{}});assert.equal(frame.style.cssText,original);
 p.events.get('message')(event);assert.match(frame.style.cssText,/position:fixed/);assert.match(frame.style.cssText,/height:100dvh/);
 assert.equal(frame.parentElement.style.minHeight,'1000px');
 p.events.get('message')({...event,data:{type:'md-sales-height',height:5000}});assert.equal(frame.style.height,undefined);
 p.events.get('message')({...event,data:{type:'md-sales-dialog',open:false}});assert.equal(frame.style.cssText,original);
 assert.equal(frame.parentElement.style.minHeight,undefined);assert.equal(p.context.window.__mdSalesModalOpen,false);
});

test('activity tabs select leads and sales while keeping original content intact',()=>{
 const p=setup('/floor/activity');const tabs=p.find('md-activity-tabs');
 assert.equal(p.main.dataset.mdActivityTab,'leads');
 tabs.children[1].click();assert.equal(p.main.dataset.mdActivityTab,'sales');
 assert.equal(tabs.children[1]['aria-selected'],'true');assert.equal(p.original.textContent,'136 derivaciones');
 tabs.children[0].click();assert.equal(p.main.dataset.mdActivityTab,'leads');
});

test('reads monthly derivations and source identity without adding manual data to the source count',()=>{
 const p=setup('/floor/activity'),frame=p.find('md-sales-frame');
 p.original.textContent='mi mes · octubre de 2026 Derivaciones 136';p.sync();
 const payload=frame.messages.find(m=>m.data.type==='md-lead-source');
 assert.deepEqual(JSON.parse(JSON.stringify(payload.data)),{type:'md-lead-source',month:'2026-10',quantity:136,sourceLabel:'Nahuel'});
 assert.equal(payload.origin,'https://masduenos.laind.io');
 const count=frame.messages.length;p.sync();assert.equal(frame.messages.length,count);
 p.original.textContent='mi mes · noviembre de 2026 Derivaciones 10';p.sync();assert.equal(frame.messages.at(-1).data.month,'2026-11');
});

test('long salon history stays below the embedded metrics and never grows above them',()=>{
 const p=setup('/floor/activity'),create=tag=>p.context.document.createElement(tag),section=p.find('md-sales-integration');
 const totals=create('section');totals.textContent='mi mes · octubre de 2026 Derivaciones 140';
 const history=create('section'),label=create('h3'),list=create('div');label.textContent='lo que hice';history.append(label,list);
 p.main.insertBefore(totals,section);p.main.insertBefore(history,section);
 for(let i=0;i<50;i++){const entry=create('p');entry.textContent='Derivación '+(i+1);list.append(entry);}
 p.sync();
 assert.deepEqual(p.main.children.map(child=>child===section?'embedded':child===totals?'totals':child===history?'history':child.id==='md-activity-tabs-spacer'?'spacer':child.tag),['div','spacer','p','totals','embedded','history']);
 const extra=create('p');extra.textContent='Derivación 51';list.prepend(extra);p.sync();p.sync();
 assert.equal(section.nextElementSibling,history);
 assert.equal(history.children[1].children.length,51);
 assert.equal(totals.textContent,'mi mes · octubre de 2026 Derivaciones 140');
});
test('nested React content keeps totals first, integrated metrics second and timeline last',()=>{
 const p=setup('/floor/activity'),create=tag=>p.context.document.createElement(tag),section=p.find('md-sales-integration');
 const wrapper=create('div'),totals=create('section'),history=create('section'),heading=create('div'),entries=create('div');
 totals.textContent='4 pasos hoy mi mes · octubre de 2026 Derivaciones 140 de lo que hice, cuánto siguió';
 heading.textContent='lo que hice';history.append(heading,entries);wrapper.append(totals,history);
 p.main.insertBefore(wrapper,section);p.sync();
 assert.deepEqual(wrapper.children.map(node=>node===section?'embedded':node===totals?'totals':'history'),['totals','embedded','history']);
 p.find('md-activity-tabs').children[1].click();
 assert.equal(p.main.dataset.mdActivityTab,'sales');
 assert.equal(p.find('md-sales-integration').parentElement,wrapper);
 p.location.pathname='/floor';p.sync();
 assert.equal(p.find('md-sales-integration'),null);
 assert.equal(wrapper.children.includes(history),true);
});

test('Leads and Ventas remain fixed immediately below the salon header with compact height',()=>{
 const p=setup('/floor/activity'),tabs=p.find('md-activity-tabs'),spacer=p.find('md-activity-tabs-spacer');
 assert.equal(tabs.style.top,'76px');
 assert.equal(tabs.nextElementSibling,spacer);
 assert.equal(spacer.nextElementSibling,p.original);
 assert.equal(tabs.children[0].textContent,'Leads');
 assert.equal(tabs.children[1].textContent,'Ventas');
 const css=p.styles[0].textContent;
 assert.match(css,/#md-activity-tabs\{position:fixed!important;/);
 assert.match(css, /#md-activity-tabs\{[^}]*height:44px/);
 assert.match(css, /#md-activity-tabs-spacer\{[^}]*height:48px/);
 assert.match(css, /:not\(#md-activity-tabs-spacer\)/);
 p.events.get('scroll')();
 assert.equal(tabs.style.top,'76px');
 tabs.children[1].click();
 assert.equal(p.main.dataset.mdActivityTab,'sales');
});
test('CRM live activity updates preserve only one fixed tab bar and one spacer',()=>{
 const p=setup('/floor/activity'),tabs=p.find('md-activity-tabs'),spacer=p.find('md-activity-tabs-spacer');
 for(let index=0;index<50;index++){const entry=p.context.document.createElement('p');entry.textContent='Derivación '+index;p.main.insertBefore(entry,p.find('md-sales-integration'));}
 p.sync();p.sync();
 assert.equal(p.main.children.filter(child=>child===tabs).length,1);
 assert.equal(p.main.children.filter(child=>child===spacer).length,1);
 assert.equal(tabs.nextElementSibling,spacer);
 p.location.pathname='/floor';p.sync();
 assert.equal(p.find('md-activity-tabs'),null);
 assert.equal(p.find('md-activity-tabs-spacer'),null);
});

test('Android launcher matches the advisor follow-up favicon instead of the former red icon',()=>{
 const icon=readFileSync(new URL('../android/app/src/main/res/drawable/app_icon.xml',import.meta.url),'utf8');
 assert.match(icon,/android:fillColor="#000000"/);
 assert.doesNotMatch(icon,/android:fillColor="#D8251B"/);
 assert.match(icon,/android:scaleX="0.34" android:scaleY="0.34" android:translateX="10.5" android:translateY="10.5"/);
 assert.match(icon,/android:strokeColor="#FFFFFF"/);
});
