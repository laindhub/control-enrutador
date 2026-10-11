import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createLeadSyncRunner} from '../src/lead-sync-runner.js';
function setup(){
 const timers=[],children=[],killed=[];
 const runner=createLeadSyncRunner({env:{LEAD_SYNC_ENABLED:'true'},
  setTimer(fn,delay){const timer={fn,delay,unref(){}};timers.push(timer);return timer;},
  clearTimer(timer){if(timer)timer.cancelled=true;},
  spawnProcess(){const child=new EventEmitter();child.pid=12345;children.push(child);return child;},
  kill(pid){killed.push(pid);}
 });
 return {...runner,timers,children,killed};
}
test('pending batches continue; duplicate starts do not overlap',()=>{
 const r=setup();r.startLeadSync();r.startLeadSync();assert.equal(r.timers.length,1);
 r.timers[0].fn();assert.equal(r.children.length,1);
 r.children[0].emit('message',{success:true,remaining:928});r.children[0].emit('close',0);
 assert.equal(r.timers.at(-1).delay,60000);
 r.timers.at(-1).fn();r.children[1].emit('message',{success:true,remaining:0});r.children[1].emit('close',0);
 assert.equal(r.timers.at(-1).delay,900000);
});
test('watchdog terminates process group and invalid PIN pauses retries',()=>{
 const r=setup();r.startLeadSync();r.timers[0].fn();
 r.timers[1].fn();assert.equal(Math.abs(r.killed[0]),12345);
 const count=r.timers.length;
 r.children[0].emit('message',{authenticationPaused:true});r.children[0].emit('close',1);
 assert.equal(r.timers.length,count);
});
test('shutdown kills the child and prevents another cycle',async()=>{
 const r=setup();r.startLeadSync();r.timers[0].fn();await r.stopLeadSync();
 assert.equal(Math.abs(r.killed[0]),12345);
 const count=r.timers.length;r.children[0].emit('close',0);assert.equal(r.timers.length,count);
});
test('manual trigger starts a worker immediately and refuses a concurrent run',()=>{
 const r=setup();
 assert.deepEqual(r.triggerLeadSyncNow(),{started:true,reason:'started'});
 assert.equal(r.children.length,1);
 assert.deepEqual(r.triggerLeadSyncNow(),{started:false,reason:'busy'});
 assert.equal(r.children.length,1);
});
test('manual trigger reports when synchronization is disabled',()=>{
 const r=createLeadSyncRunner({env:{LEAD_SYNC_ENABLED:'false'}});
 assert.deepEqual(r.triggerLeadSyncNow(),{started:false,reason:'disabled'});
});
