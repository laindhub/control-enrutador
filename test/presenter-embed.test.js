import test from 'node:test';
import assert from 'node:assert/strict';
import {enableSalonSession,restoreSalonSession,allowSalonFrame,salonOrigin} from '../src/presenter-embed.js';
test('only Android opt-in enables the secure cross-site sales session',()=>{
 const ordinary={query:{},session:{cookie:{sameSite:'lax',secure:true}}};
 enableSalonSession(ordinary,null,()=>{});assert.equal(ordinary.session.cookie.sameSite,'lax');
 const connected={path:'/presentador',query:{salon:'1'},session:{cookie:{sameSite:'lax',secure:true}}};
 enableSalonSession(connected,null,()=>{});assert.equal(connected.session.cookie.sameSite,'none');assert.equal(connected.session.cookie.secure,true);
});
test('login regeneration and subsequent API requests keep the embedded session cookie',()=>{
 const session={cookie:{sameSite:'lax',secure:true}};
 restoreSalonSession(session,true);
 assert.equal(session.salonIntegration,true);
 session.cookie.sameSite='lax';
 enableSalonSession({path:'/api/presenters/state',query:{},session},null,()=>{});
 assert.equal(session.cookie.sameSite,'none');
 const normal={cookie:{sameSite:'lax'}};restoreSalonSession(normal,false);
 assert.equal(normal.cookie.sameSite,'lax');
});
test('embedded sales allow only the exact salon ancestor and preserve script restrictions',()=>{
 const headers={'X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self';script-src 'self';frame-ancestors 'self'"};
 const res={removeHeader:n=>delete headers[n],getHeader:n=>headers[n],setHeader:(n,v)=>headers[n]=v};
 allowSalonFrame({},res,()=>{});
 assert.equal(headers['X-Frame-Options'],undefined);
 assert.equal(headers['Content-Security-Policy'],`default-src 'self';script-src 'self';frame-ancestors 'self' ${salonOrigin}`);
});
