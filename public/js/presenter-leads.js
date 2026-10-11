(() => {
 const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ars=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(v);
 const salon='https://liniers.xn--somosmasdueos-skb.com';let state,source,sourceSaved='',savingSource=false,loading=false,retry,deleteId;
 async function api(path,body,method='GET'){
  const response=await fetch('/api/presenters'+path,{method,credentials:'same-origin',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json','x-csrf-token':$('meta[name="csrf-token"]').content},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo completar la operación.');return result;
 }
 const message=(text,error=false)=>{const node=$('#lead-notice');node.className=error?'form-error':'muted';node.textContent=text;};
 function fill(form,values){for(const [key,value]of Object.entries(values))if(form.elements.namedItem(key))form.elements.namedItem(key).value=value??'';}
 function render(){
  const s=state.summary,p=state.policy,snapshot=state.snapshot,manual=state.entries.reduce((n,e)=>n+Number(e.quantity),0);
  $('#lead-account').textContent=`Cuenta de comisiones: ${state.user.username}. `+(snapshot?`Salón: ${snapshot.source_label} · actualizado ${snapshot.captured_at} UTC.`:'Abrí Yo en la app para leer las derivaciones del salón. Las cargas externas quedan guardadas aunque no haya lectura del salón.');
  $('#lead-metrics').innerHTML=[['Entrevistas del mes',s.total],['Salón · observadas',snapshot?Number(snapshot.quantity):'Sin lectura'],['Otros registros',manual],['Comisión desbloqueada',ars(s.earned)],['Acumulado potencial',ars(s.potential)],['Necesitás por día',s.perDay===null?'Mes finalizado':s.perDay]].map(([label,value])=>`<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('');
  const scale=Math.max(p.elite,s.target),leadPercent=Math.min(100,s.total/scale*100);
  const marks=[{value:p.unlock,label:'Desbloqueo'},{value:p.elite,label:'Élite'}];
  if(!marks.some(m=>m.value===s.target))marks.push({value:s.target,label:'Tu meta'});
  marks.sort((a,b)=>a.value-b.value);
  $('#lead-progress').innerHTML=`<div class="section-head"><h3>${s.unlocked?(s.total>=p.elite?'Nivel élite alcanzado':'Comisión desbloqueada'):'Todavía falta desbloquear'}</h3><strong>${s.total} / ${s.target}</strong></div><div class="threshold-bar" role="progressbar" aria-label="Entrevistas del mes" aria-valuemin="0" aria-valuemax="${scale}" aria-valuenow="${Math.min(s.total,scale)}" aria-valuetext="${s.total} entrevistas, desbloqueo ${p.unlock}, élite ${p.elite}"><div class="threshold-fill" style="width:${leadPercent}%"></div>${marks.map(m=>`<span class="threshold-mark ${s.total>=m.value?'reached':''}" style="left:${m.value/scale*100}%" aria-hidden="true"></span>`).join('')}</div><div class="lead-threshold-labels">${marks.map(m=>`<span class="${s.total>=m.value?'reached':''}">${esc(m.label)} <strong>${m.value}</strong></span>`).join('')}</div><p>${s.unlocked?`${ars(s.rate)} por cada entrevista del mes.`:`Faltan ${s.toUnlock} para las ${p.unlock} y desbloquear ${ars(p.baseRate)} por entrevista.`} ${s.toElite?`Faltan ${s.toElite} para élite (${p.elite}), a ${ars(p.eliteRate)} cada una.`:''}</p><p class="muted">Meta personal: ${s.target} · faltan ${s.remaining} · ${s.workingDays} días de trabajo restantes ${s.estimatedDays?'estimados con 5 días por semana':'según tus francos'}. ${!s.sourceKnown?'El cálculo todavía no incluye las derivaciones del salón. ':''}Los importes son calculados; no representan un pago recibido.</p>`;
  $('#lead-entries').innerHTML=state.entries.map(e=>`<article class="card"><div class="sale-row"><div><strong>${Number(e.quantity)} entrevistas externas</strong><p class="muted">${esc(e.entry_date)} · ${esc(e.notes)}</p></div><button type="button" class="quiet" data-lead-entry-delete="${e.id}">Eliminar</button></div></article>`).join('')||'<p class="muted">Sin cargas externas en este mes.</p>';
  fill($('#lead-plan-form'),{goal:state.plan.goal});$('#lead-plan-form').querySelectorAll('[name=offDays]').forEach(box=>box.checked=state.plan.offDays?.includes(Number(box.value))||false);
  if($('#lead-policy-form'))fill($('#lead-policy-form'),{month:state.month,...p});
 }
 async function load(){
  if(loading)return;loading=true;clearTimeout(retry);
  try{state=await api('/lead-state?month='+encodeURIComponent($('#lead-month').value||''));$('#lead-month').value=state.month;render();message('');await saveSource();}
  catch(error){message('No se pudo actualizar las metas. Tus datos guardados se conservan. '+error.message,true);if(navigator.onLine!==false&&!document.hidden)retry=setTimeout(load,10000);}
  finally{loading=false;}
 }
 async function saveSource(){
  if(!source||!state||savingSource)return;
  // Own session and salon account must represent the same person; never silently cross accounts.
  const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  if(normalize(source.sourceLabel).split(/\s+/)[0]!==normalize(state.user.username).split(/\s+/)[0]){message(`No se guardó la lectura: el salón corresponde a ${source.sourceLabel} y tu cuenta a ${state.user.username}. Conectá tu propia cuenta de comisiones.`,true);return;}
  const key=JSON.stringify(source);if(sourceSaved===key)return;savingSource=true;
  try{await api('/lead-snapshot',source,'POST');sourceSaved=key;}
  catch(error){message('No se pudo guardar el total del salón: '+error.message,true);return;}
  finally{savingSource=false;}
  // Reload only if this is the month being viewed. Avoid a mutation/postMessage loop.
  if(source.month===$('#lead-month').value){loading=false;await load();}
 }
 $('#lead-month').onchange=load;
 $('#new-leads').onclick=()=>{const form=$('#lead-entry-form');form.reset();fill(form,{date:state?.today||'',requestId:crypto.randomUUID()});$('#lead-entry-error').textContent='';$('#lead-entry-dialog').showModal();};
 $('#lead-entry-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;try{await api('/lead-entries',Object.fromEntries(new FormData(form)),'POST');$('#lead-entry-dialog').close();await load();}catch(error){$('#lead-entry-error').textContent=error.message;}finally{b.disabled=false;}};
 document.addEventListener('click',event=>{const b=event.target.closest('[data-lead-entry-delete]');if(!b)return;deleteId=b.dataset.leadEntryDelete;$('#lead-delete-error').textContent='';$('#lead-delete-dialog').showModal();});
 $('#lead-delete-confirm').onclick=async()=>{const b=$('#lead-delete-confirm');b.disabled=true;try{await api('/lead-entries/'+deleteId,{},'DELETE');$('#lead-delete-dialog').close();await load();}catch(error){$('#lead-delete-error').textContent=error.message;}finally{b.disabled=false;}};
 for(const [id,path] of [['lead-plan-form','/lead-plan'],['lead-policy-form','/lead-policy']]){
  const form=$('#'+id);if(!form)continue;form.onsubmit=async event=>{event.preventDefault();const b=form.querySelector('button');b.disabled=true;const body=Object.fromEntries(new FormData(form));if(id==='lead-plan-form'){body.month=$('#lead-month').value;const days=[...form.querySelectorAll('[name=offDays]:checked')].map(box=>Number(box.value));body.offDays=days.length?days:null;}
   try{await api(path,body,'POST');if(body.month)$('#lead-month').value=body.month;await load();message('Configuración guardada.');}catch(error){message(error.message,true);}finally{b.disabled=false;}};
 }
 window.addEventListener('message',event=>{
  if(event.origin!==salon||event.source!==window.parent||event.data?.type!=='md-lead-source')return;
  const d=event.data;if(!/^\d{4}-\d{2}$/.test(d.month)||!Number.isSafeInteger(d.quantity)||d.quantity<0||d.quantity>100000||typeof d.sourceLabel!=='string')return;
  source={month:d.month,quantity:d.quantity,sourceLabel:d.sourceLabel};saveSource();
 });
 window.addEventListener('online',load);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(retry);else load();});
 if(document.body.classList.contains('embedded'))window.parent.postMessage({type:'md-leads-ready'},salon);
 load();
})();
