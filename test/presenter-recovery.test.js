import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/presenter.js', import.meta.url), 'utf8');
const state = { today:'2026-10-11', sales:[], payments:[], folders:[], rates:[], people:[] };
const settle = async () => { for(let i=0;i<4;i++) await new Promise(resolve=>setImmediate(resolve)); };
function panel(responses) {
  const nodes = new Map(), timers = new Map(), events = new Map(); let nextId=0, requests=0;
  const node = selector => {
    if(['#rates-list','#rate-form','#user-form'].includes(selector)) return null;
    if(!nodes.has(selector)) nodes.set(selector, {value:'',content:'csrf',hidden:true,dataset:{},classList:{toggle(){}},
      textContent:'',innerHTML:'',scrollIntoView(){},elements:{namedItem(){return {value:'',onchange:null};}}});
    return nodes.get(selector);
  };
  const document = {hidden:false,querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events.set('document:'+name,fn)};
  const navigator={onLine:true};
  vm.runInNewContext(source, {document,navigator,window:{scrollTo(){},addEventListener:(name,fn)=>events.set(name,fn)},
    location:{hash:''},history:{replaceState(){}},Intl,Date,AbortController,URLSearchParams,
    setTimeout:(fn,delay)=>{timers.set(++nextId,{fn,delay});return nextId;},clearTimeout:id=>timers.delete(id),
    fetch:async()=>{
      const answer=responses[Math.min(requests++,responses.length-1)];
      if(answer instanceof Error)throw answer;
      return {ok:answer.status===200,status:answer.status,headers:{get:()=>answer.retryAfter||null},json:async()=>answer.body||state};
    }
  });
  return {node,navigator,document,events,timers,get requests(){return requests;}};
}
test('startup 503 retries the read, respects Retry-After and clears the recovered notice', async()=>{
  const p=panel([{status:503,retryAfter:'4',body:{error:'Starting'}},{status:200}]); await settle();
  assert.equal(p.node('#notice').dataset.kind,'connection');
  assert.equal(p.timers.size,1);
  const retry=[...p.timers.values()][0]; assert.equal(retry.delay,4000);retry.fn();await settle();
  assert.equal(p.requests,2);assert.equal(p.node('#notice').hidden,true);
  assert.match(p.node('#metrics').innerHTML,/Ventas del mes/);
});
test('offline preserves the current data and reconnects when the network returns',async()=>{
  const p=panel([{status:200}]);await settle(); const visible=p.node('#metrics').innerHTML;
  p.navigator.onLine=false;p.events.get('offline')();await settle();
  assert.equal(p.requests,1);assert.equal(p.node('#metrics').innerHTML,visible);assert.equal(p.node('#notice').hidden,false);
  p.navigator.onLine=true;p.events.get('online')();await settle();
  assert.equal(p.requests,2);assert.equal(p.node('#notice').hidden,true);
});
test('expired sessions do not loop; recovery does not remove unrelated notices',async()=>{
  const expired=panel([{status:401,body:{error:'Expired'}}]);await settle();
  assert.equal(expired.timers.size,0);assert.match(expired.node('#notice').textContent,/sesión venció/);
  const p=panel([{status:200}]);await settle();
  p.node('#notice').dataset.kind='message';p.node('#notice').hidden=false;p.node('#notice').textContent='Venta guardada';
  p.events.get('online')();await settle();assert.equal(p.node('#notice').textContent,'Venta guardada');assert.equal(p.node('#notice').hidden,false);
});
test('failed reads back off and hidden pages stop scheduling retries',async()=>{
  const p=panel([new TypeError('Failed to fetch')]);await settle();
  assert.equal([...p.timers.values()][0].delay,2000);
  [...p.timers.values()][0].fn();await settle();assert.equal([...p.timers.values()][0].delay,4000);
  p.document.hidden=true;p.events.get('document:visibilitychange')();assert.equal(p.timers.size,0);
});
