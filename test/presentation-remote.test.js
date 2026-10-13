import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {describeRemoteEvent,safeIntroUrl,loadRemoteSettings,saveRemoteSettings,
  REMOTE_STORAGE_KEY} from '../public/js/presentation-remote.js';

test('classifies USB presenter keyboard signals and modifiers consistently',()=>{
  const down=describeRemoteEvent({type:'keydown',key:'PageDown',code:'PageDown',
    repeat:false,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false});
  assert.equal(down.signature,'key::PageDown');
  assert.equal(down.assignable,true);
  assert.equal(describeRemoteEvent({type:'keydown',code:'PageDown',repeat:true}),null);
  assert.equal(describeRemoteEvent({type:'keydown',code:'Escape'}),null);
  assert.equal(describeRemoteEvent({type:'keydown',code:'F5'}),null);
  const tab=describeRemoteEvent({type:'keydown',code:'Tab',key:'Tab',repeat:false,
    ctrlKey:false,altKey:false,shiftKey:false,metaKey:false});
  assert.equal(tab.signature,'key::Tab');
  assert.equal(tab.assignable,true);
  assert.equal(describeRemoteEvent({type:'keydown',code:'Tab',key:'Tab',shiftKey:true}).assignable,false);
  const ctrl=describeRemoteEvent({type:'keydown',code:'KeyP',key:'p',ctrlKey:true});
  assert.equal(ctrl.assignable,false);
  assert.notEqual(ctrl.signature,down.signature);
});

test('mouse and wheel are detectable but a generic left click is never assignable',()=>{
  const mouse=describeRemoteEvent({type:'mousedown',button:0});
  assert.equal(mouse.signature,'mouse:0');
  assert.equal(mouse.assignable,false);
  assert.equal(describeRemoteEvent({type:'mousedown',button:3}).assignable,true);
  assert.equal(describeRemoteEvent({type:'wheel',deltaY:100,deltaX:0}).signature,'wheel:vertical:positivo');
  assert.equal(describeRemoteEvent({type:'wheel',deltaY:-90,deltaX:0}).signature,'wheel:vertical:negativo');
  assert.equal(describeRemoteEvent({type:'mouseup',button:3}),null);
});

test('video URL only accepts paths from the same web origin',()=>{
  const origin='https://example.test';
  assert.equal(safeIntroUrl('/assets/presentaciones/video-intro.mp4',origin),'/assets/presentaciones/video-intro.mp4');
  assert.equal(safeIntroUrl('https://example.test/assets/intro.mp4?rev=1',origin),'/assets/intro.mp4?rev=1');
  assert.equal(safeIntroUrl('https://evil.test/intro.mp4',origin),'');
  assert.equal(safeIntroUrl('javascript:alert(1)',origin),'');
  assert.equal(safeIntroUrl('//evil.test/intro.mp4',origin),'');
});

test('mapping persists per browser and handles disabled private storage',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const data={signature:'key::Tab',label:'Tab',introUrl:'/assets/presentaciones/video-intro.mp4',armed:true};
  assert.equal(saveRemoteSettings(data,storage),true);
  assert.equal(JSON.parse(values.get(REMOTE_STORAGE_KEY)).version,1);
  assert.deepEqual(loadRemoteSettings(storage),data);
  assert.equal(saveRemoteSettings(data,{setItem(){throw Error('Quota exceeded');}}),false);
  assert.deepEqual(loadRemoteSettings({getItem(){throw Error('Denied');}}),{signature:'key::Tab',label:'Tab',introUrl:'/assets/presentaciones/introduccion.mp4',armed:true});
});

test('Tab remapping requires an explicit enabled mode, never global interception',()=>{
  const source=readFileSync(new URL('../public/js/presentation-remote.js',import.meta.url),'utf8');
  assert.match(source,/if\(!settings\.armed/);
  assert.match(source,/desc\.signature==='key::Tab'/);
  assert.match(source,/enabled\.addEventListener\('change',toggleEnabled\)/);
  assert.match(source,/enabled\.disabled=!settings\.signature/);
});

test('first-time notebook automatically binds physical Tab to introduction.mp4',()=>{
  const defaults=loadRemoteSettings({getItem:()=>null});
  assert.deepEqual(defaults,{signature:'key::Tab',label:'Tab',
    introUrl:'/assets/presentaciones/introduccion.mp4',armed:true});
});
