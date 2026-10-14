import test from 'node:test';
import assert from 'node:assert/strict';
import {INTRO_SEEK_STEP_SECONDS,introSeekDirection,seekIntroVideo} from '../public/js/presentation-intro-seek.js';

test('all four arrow keys seek five seconds in the expected direction',()=>{
  assert.equal(INTRO_SEEK_STEP_SECONDS,5);
  for(const code of ['ArrowLeft','ArrowUp']){
    assert.equal(introSeekDirection({type:'keydown',code}),-1);
  }
  for(const code of ['ArrowRight','ArrowDown']){
    assert.equal(introSeekDirection({type:'keydown',code}),1);
  }
  for(const code of ['Escape','Tab','Space','Enter','PageDown']){
    assert.equal(introSeekDirection({type:'keydown',code}),0);
  }
  assert.equal(introSeekDirection({type:'keyup',code:'ArrowDown'}),0);
  assert.equal(introSeekDirection({type:'keydown',code:'ArrowRight',repeat:true}),0);
  assert.equal(introSeekDirection({type:'keydown',code:'ArrowLeft',shiftKey:true}),0);
  assert.equal(introSeekDirection({type:'keydown',code:'ArrowDown',ctrlKey:true}),0);
});

test('seek respects beginning and duration of the introduction',()=>{
  const video={currentTime:23,duration:60};
  assert.equal(seekIntroVideo(video,-1),18);
  assert.equal(seekIntroVideo(video,1),23);
  video.currentTime=3;
  assert.equal(seekIntroVideo(video,-1),0);
  video.currentTime=58;
  assert.equal(seekIntroVideo(video,1),60);
});

test('seek handles missing duration and failed seeks without touching slides',()=>{
  const pending={currentTime:4,duration:NaN};
  assert.equal(seekIntroVideo(pending,1),9);
  assert.equal(seekIntroVideo(pending,-1),4);
  assert.equal(seekIntroVideo(pending,0),null);
  const locked={currentTime:10,duration:15,set currentTime(v){throw Error('Not ready');}};
  assert.equal(seekIntroVideo(locked,1),null);
});
