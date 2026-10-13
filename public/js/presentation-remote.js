// Remote presenter diagnostics and mappings, browser-side only.
// Standard USB keyboard/mouse receivers are exposed as DOM input events.
// No access to USB serials, raw HID devices, server storage, or CRM data.
export const REMOTE_STORAGE_KEY = 'salon-mas-duenos-intro-remote-v1';
const eventsToWatch = ['keydown','mousedown','wheel'];
const protectedCodes = new Set(['Escape','F5','F11','Tab','MetaLeft','MetaRight',
  'AltLeft','AltRight','ControlLeft','ControlRight','ShiftLeft','ShiftRight']);

export function describeRemoteEvent(event) {
  if (!event || !eventsToWatch.includes(event.type)) return null;
  if (event.type === 'keydown') {
    if (event.repeat || event.isComposing) return null;
    const code=String(event.code || event.key || '');
    if (!code || code==='Unidentified' || protectedCodes.has(code)) return null;
    // Preserve modifiers so keyboard shortcuts don't accidentally trigger.
    const modifiers=[event.ctrlKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',event.metaKey?'Meta':''].filter(Boolean);
    const shortcut=modifiers.length ? modifiers.join('+')+'+' : '';
    const signature='key:'+modifiers.join('+')+':'+code;
    return {type:'teclado',signature,label:shortcut+(event.key&&event.key!=='Unidentified'?event.key:code),
      detail:'code='+code+' · key='+String(event.key||'?')+(modifiers.length?' · '+modifiers.join('+'):''),
      assignable:!event.metaKey&&!event.ctrlKey&&!event.altKey};
  }
  if (event.type === 'mousedown') {
    const n=Number(event.button);
    if (!Number.isInteger(n) || n<0 || n>4) return null;
    // Generic primary clicks are indistinguishable from ordinary notebook mouse
    // clicks. Never let mapping prevent selecting the presentation card.
    const assignable=n!==0;
    return {type:'mouse',signature:'mouse:'+n,label:'Botón del mouse '+n,
      detail:n===0?'Clic izquierdo normal (no recomendable para remapear)':'mouse button '+n,
      assignable};
  }
  if (event.type === 'wheel') {
    const dx=Number(event.deltaX)||0,dy=Number(event.deltaY)||0;
    if (dx===0 && dy===0) return null;
    const axis=Math.abs(dy)>=Math.abs(dx)?'vertical':'horizontal';
    const direction=(axis==='vertical'?dy:dx)>0?'positivo':'negativo';
    return {type:'rueda',signature:'wheel:'+axis+':'+direction,
      label:'Rueda '+axis+' '+direction,detail:'deltaX='+Math.round(dx)+' · deltaY='+Math.round(dy),
      assignable:true};
  }
  return null;
}

export function safeIntroUrl(raw, origin) {
  if (!raw || !String(raw).trim()) return '';
  try {
    const parsed=new URL(String(raw).trim(),origin);
    if (parsed.origin!==origin || !['https:','http:'].includes(parsed.protocol)) return '';
    if (!parsed.pathname || parsed.pathname==='/') return '';
    return parsed.pathname+parsed.search;
  } catch { return ''; }
}

export function loadRemoteSettings(storage=globalThis.localStorage) {
  try {
    const data=JSON.parse(storage?.getItem(REMOTE_STORAGE_KEY)||'null');
    if (!data || data.version!==1) return {signature:'',label:'',introUrl:''};
    return {signature:typeof data.signature==='string'?data.signature.slice(0,100):'',
      label:typeof data.label==='string'?data.label.slice(0,150):'',
      introUrl:typeof data.introUrl==='string'?data.introUrl.slice(0,1000):''};
  } catch {return {signature:'',label:'',introUrl:''};}
}

export function saveRemoteSettings(settings,storage=globalThis.localStorage) {
  try {storage?.setItem(REMOTE_STORAGE_KEY,JSON.stringify({version:1,...settings}));return true;}
  catch {return false;} // Private browsing/storage blocked: mapping stays in memory.
}

export function initRemoteControl({
  doc=globalThis.document,
  storage=globalThis.localStorage,
  origin=globalThis.location?.origin,
  isPresenting=()=>false,
  onIntro=()=>{},
  onNotice=()=>{},
}={}) {
  const byId=id=>doc.getElementById(id);
  const button=byId('remote-listen'), assign=byId('remote-assign'), clear=byId('remote-clear');
  const events=byId('remote-events'), current=byId('remote-current');
  const introUrl=byId('remote-intro-url'), saveUrl=byId('remote-save-url');
  const selection=byId('remote-last'), state=byId('remote-state');
  if (![button,assign,clear,events,current,introUrl,saveUrl,selection,state].every(Boolean)) {
    return {dispose(){}};
  }
  let settings=loadRemoteSettings(storage);
  introUrl.value=settings.introUrl;
  let listening=false, captured=null;
  const records=[];
  const scope=target=>Boolean(target?.closest?.('#remote-settings,#intro-overlay'));
  const render=()=>{
    current.textContent=settings.signature?'Asignado: '+settings.label+' ('+settings.signature+')':'Sin botón asignado';
    current.dataset.signature=settings.signature;
    state.textContent=listening?'Escuchando… pulsá el botón una vez, después dos veces para comparar.':
      'Detector detenido. Activá la escucha para registrar señales.';
    button.textContent=listening?'Detener detección':'Detectar señales del control';
    assign.disabled=!captured?.assignable;
    selection.textContent=captured?('Última señal: '+captured.label+
      (captured.assignable?'':' · no se puede asignar con seguridad')):'Aún no se detectaron señales.';
  };
  const listen=flag=>{
    listening=Boolean(flag);captured=null;render();
    // Remote keydowns target the focused button after clicking "Detectar".
    // Release focus so they reach the document instead of the setup control.
    doc.activeElement?.blur?.();
  };
  const persist=()=>saveRemoteSettings(settings,storage);
  const addRecord=desc=>{
    records.unshift({when:new Date().toLocaleTimeString('es-AR'),...desc});
    if(records.length>14)records.pop();
    events.replaceChildren();
    for(const record of records){
      const line=doc.createElement('li');
      line.textContent=record.when+' · '+record.type+' · '+record.label+' · '+record.detail;
      events.append(line);
    }
  };
  const handle=event=>{
    const desc=describeRemoteEvent(event);
    if(!desc) return;
    if(scope(event.target)) return;
    if(listening){
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      captured=desc;
      addRecord(desc);
      render();
      return;
    }
    if(!settings.signature || desc.signature!==settings.signature || isPresenting()) return;
    // Don't intercept text editing, buttons, dialogs, or the event produced by
    // a conventional mouse primary click.
    if(event.type==='keydown' &&
       /^(INPUT|TEXTAREA|SELECT)$/i.test(event.target?.tagName||'')) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    onIntro({url:safeIntroUrl(settings.introUrl,origin),signature:desc.signature});
  };
  for(const eventName of eventsToWatch){
    doc.addEventListener(eventName,handle,{capture:true,passive:false});
  }
  const toggle=()=>listen(!listening);
  const assignLatest=()=>{
    if(!captured?.assignable)return;
    settings={...settings,signature:captured.signature,label:captured.label};
    persist();listen(false);
    onNotice('Botón asignado. Solo activará la introducción antes de presentar.');
  };
  const clearMap=()=>{
    settings={...settings,signature:'',label:''};
    persist();listen(false);onNotice('Asignación eliminada.');
  };
  const storeUrl=()=>{
    const next=safeIntroUrl(introUrl.value,origin);
    if(introUrl.value.trim()&&!next){
      onNotice('Usá una ruta del mismo sitio, por ejemplo /assets/presentaciones/video-intro.mp4.');
      return;
    }
    settings={...settings,introUrl:next};
    introUrl.value=next;persist();onNotice(next?'Ruta guardada en esta notebook.':'Ruta del video eliminada.');
  };
  button.addEventListener('click',toggle);
  assign.addEventListener('click',assignLatest);
  clear.addEventListener('click',clearMap);
  saveUrl.addEventListener('click',storeUrl);
  // Do not store a local file, permission, or HID token. Only event signature.
  render();
  return {
    getSettings:()=>({...settings}),
    dispose() {
      for(const eventName of eventsToWatch) doc.removeEventListener(eventName,handle,true);
      button.removeEventListener('click',toggle);
      assign.removeEventListener('click',assignLatest);
      clear.removeEventListener('click',clearMap);
      saveUrl.removeEventListener('click',storeUrl);
    },
  };
}
