import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import {enableSalonSession,restoreSalonSession} from '../src/presenter-embed.js';

test('real session survives login rotation, iframe loads, API calls and later reopening',async t=>{
 const app=express();app.set('trust proxy',1);
 app.use(session({secret:'test-only-session-secret',resave:false,saveUninitialized:false,rolling:true,cookie:{secure:true,sameSite:'lax',maxAge:86400000}}));
 app.use(enableSalonSession);
 app.get('/presentador/preparar',(_req,res)=>res.json({ready:true}));
 app.post('/login',(req,res,next)=>{
  const enabled=req.session.salonIntegration;
  req.session.regenerate(error=>{
   if(error)return next(error);
   restoreSalonSession(req.session,enabled);req.session.user={id:7};
   req.session.save(error=>error?next(error):res.json({ok:true}));
  });
 });
 app.get(['/presentador/integrado','/api/presenters/state'],(req,res)=>res.status(req.session.user?200:401).json({user:req.session.user}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 let cookie='';
 const request=async(path,method='GET')=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'x-forwarded-proto':'https',cookie}});
  const nextCookie=response.headers.get('set-cookie');
  assert.match(nextCookie,/SameSite=None/);assert.match(nextCookie,/Secure/);
  cookie=nextCookie.split(';')[0];return response;
 };
 assert.equal((await request('/presentador/preparar?salon=1')).status,200);
 const before=cookie;assert.equal((await request('/login','POST')).status,200);assert.notEqual(cookie,before);
 for(const path of ['/presentador/integrado','/api/presenters/state','/presentador/integrado','/presentador/preparar?salon=1','/api/presenters/state']){
  assert.equal((await request(path)).status,200);
 }
});
