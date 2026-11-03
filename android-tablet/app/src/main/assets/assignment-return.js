(() => {
 'use strict';
 const origin='https://liniers.xn--somosmasdueos-skb.com';
 if(location.origin!==origin||window.__mdAssignmentHook)return;
 window.__mdAssignmentHook=true;
 const current=()=>window.__mdAssignment;
 const isForm=()=>/\/floor\/visits\/[0-9a-f-]{36}\/assignment\/?$/i.test(location.pathname);
 function arm(){const state=current();if(state&&isForm()&&location.pathname.replace(/\/$/,'')==='/floor/visits/'+state.uuid+'/assignment'){state.submitting=true;state.started=Date.now();state.failed=false;state.networkSuccess=false;}}
 document.addEventListener('submit',arm,true);
 document.addEventListener('click',event=>{
  const button=event.target.closest('button,input[type=submit]');
  if(button&&/guardar|confirmar|registrar|derivar|finalizar/i.test(button.textContent||button.value||''))arm();
 },true);
 function eligible(method,url,state){
  if(!state?.submitting||Date.now()-state.started>60000||!/^(POST|PUT|PATCH)$/i.test(method)||location.pathname.replace(/\/$/,'')!=='/floor/visits/'+state.uuid+'/assignment')return false;
  try{const target=new URL(url,location.href);return target.origin===origin&&
    (target.pathname.includes('/visits/'+state.uuid)||(!/\/visits\/[0-9a-f-]{36}/i.test(target.pathname)&&/assignment|routing|deriv/i.test(target.pathname)));}catch{return false;}
 }
 function complete(state){
  if(current()!==state||state.done||state.failed)return;
  if (!window.MdAssignment || typeof window.MdAssignment.complete !== 'function') return;
  state.done=true;window.MdAssignment.complete(state.nonce);
 }
 const returned=url=>{try{const u=new URL(url,origin);return u.origin===origin&&/^\/floor\/(router|visits)\/?$/.test(u.pathname);}catch{return false;}};
 function jsonResult(state,data){
  if(!data||typeof data!=='object')return false;
  const hasError=value=>Array.isArray(value)?value.length>0:value&&typeof value==='object'?Object.keys(value).length>0:!!value;
  if(data.ok===false||data.success===false||hasError(data.error)||hasError(data.errors)){state.failed=true;return true;}
  if(data.ok===true||data.success===true){complete(state);return true;}
  return false;
 }
 async function inspect(response,state){
  if(current()!==state)return;
  if(!response.ok){state.failed=true;return;}
  const type=(response.headers.get('content-type')||'').toLowerCase();
  if(type.includes('application/json')){
   try{if(jsonResult(state,await response.clone().json()))return;}catch{return;}
  }
  if(current()!==state||state.failed)return;
  if(response.status===204||(response.redirected&&returned(response.url))||returned(response.headers.get('x-action-redirect')?.split(';')[0]||'')){
   complete(state);return;
  }
  if(type.includes('text/x-component')){
   try{
    const text=(await response.clone().text()).slice(0,262144);
    if(/(?:^|\n)[0-9a-f]+:E\{|"(?:ok|success)":false|"error"\s*:/i.test(text)){state.failed=true;return;}
    if(/NEXT_REDIRECT[^\n]{0,600}\/floor\/(?:router|visits)/.test(text)){complete(state);return;}
   }catch{return;}
  }
  state.networkSuccess=true;checkNotice();
 }
 function checkNotice(){
  const state=current();if(!state?.networkSuccess||state.failed||state.done)return;
  const notices=[...document.querySelectorAll('[role=status],[role=alert],[data-sonner-toast]')];
  if(notices.some(node=>/derivaci[oó]n.{0,50}(guardada|registrada|exitosa|realizada)|guardad[oa] correctamente|derivad[oa] (?:con éxito|correctamente)/i.test(node.textContent||'')))complete(state);
 }
 const originalFetch=window.fetch;
 if(originalFetch)window.fetch=function(...args){
  const state=current(),request=args[0],options=args[1]||{};
  const url=typeof request==='string'||request instanceof URL?String(request):request?.url;
  const method=options.method||request?.method||'GET';
  const watch=eligible(method,url,state);
  return originalFetch.apply(this,args).then(response=>{if(watch)inspect(response,state).catch(()=>{});return response;},error=>{if(watch&&current()===state)state.failed=true;throw error;});
 };
 const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
 XMLHttpRequest.prototype.open=function(method,url,...rest){this.__mdMethod=method;this.__mdUrl=url;return open.call(this,method,url,...rest);};
 XMLHttpRequest.prototype.send=function(...args){
  const state=current();
  if(eligible(this.__mdMethod,this.__mdUrl,state)){
   this.addEventListener('load',()=>{
    if(current()!==state)return;
    if(this.status<200||this.status>=300){state.failed=true;return;}
    try{const data=this.responseType==='json'?this.response:JSON.parse(this.responseText);if(jsonResult(state,data))return;}catch{}
    if(this.status===204||returned(this.responseURL)){complete(state);return;}
    state.networkSuccess=true;checkNotice();
   },{once:true});
   this.addEventListener('error',()=>{if(current()===state)state.failed=true;},{once:true});
  }
  return send.apply(this,args);
 };
 new MutationObserver(checkNotice).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
