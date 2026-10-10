import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { sessionOptions, sessionStore } from '../src/auth.js';
import { pool } from '../src/db.js';

test('the same session survives a server replacement and its cookie renews',async()=>{
  const store=new session.MemoryStore();
  const create=()=>{
    const app=express();
    app.use(session({...sessionOptions,store,secret:'stable-test-secret',cookie:{...sessionOptions.cookie,secure:false}}));
    app.post('/login',(req,res)=>{req.session.user={id:7};res.json({ok:true});});
    app.get('/me',(req,res)=>res.json({user:req.session.user||null}));
    app.post('/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
    return app.listen(0,'127.0.0.1');
  };
  let server=create();
  await new Promise(resolve=>server.once('listening',resolve));
  const url=()=>`http://127.0.0.1:${server.address().port}`;
  try {
    const login=await fetch(url()+'/login',{method:'POST'});
    const cookie=login.headers.get('set-cookie').split(';')[0];
    await login.json();
    await new Promise(resolve=>server.close(resolve));
    server=create();await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch(url()+'/me',{headers:{cookie}});
    assert.deepEqual((await response.json()).user,{id:7});
    assert.ok(response.headers.get('set-cookie').startsWith(cookie));
    assert.equal(sessionOptions.rolling,true);
    assert.equal(sessionOptions.cookie.maxAge,400*24*60*60*1000);
    await fetch(url()+'/logout',{method:'POST',headers:{cookie}});
    const after=await fetch(url()+'/me',{headers:{cookie}});
    assert.equal((await after.json()).user,null);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await sessionStore.onReady();await sessionStore.close();await pool.end();
  }
});
