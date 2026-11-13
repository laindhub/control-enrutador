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
 function renderGoalProjection(){
  if(!state)return;
  const input=$('#lead-plan-form').elements.namedItem('goal');
  const value=$('#lead-goal-projection-value'),detail=$('#lead-goal-projection-detail');
  const raw=input.value.trim(),goal=Number(raw),p=state.policy;
  if(!raw||!Number.isSafeInteger(goal)||goal<1||goal>100000){
   value.textContent='—';detail.textContent='Ingresá una meta válida para calcular la proyección.';return;
  }
  const rate=goal>=p.elite?p.eliteRate:goal>=p.unlock?p.baseRate:p.basic>0&&goal>=p.basic?p.basicRate:0;
  value.textContent=ars(goal*rate);
  detail.textContent=goal>=p.elite?'Tarifa élite: '+ars(p.eliteRate)+' por entrevista.':
   goal>=p.unlock?'Tarifa de desbloqueo: '+ars(p.baseRate)+' por entrevista.':
   p.basic>0&&goal>=p.basic?'Tarifa básica: '+ars(p.basicRate)+' por entrevista.':
   p.basic>0?'Por debajo del básico de '+p.basic+' entrevistas no se genera comisión.':
   'Por debajo del desbloqueo de '+p.unlock+' entrevistas no se genera comisión.';
 }
 let planMonth, planDirty=false, savingPlan=false, reloadPending=false;
 const planForm=$('#lead-plan-form'),monthInput=$('#lead-month');
 const calendarToggle=$('#lead-use-calendar'),calendarDays=$('#lead-calendar-days');
 const savePlan=planForm.querySelector('button[type=submit]');
 const dayLabel=new Intl.DateTimeFormat('es-AR',{dateStyle:'full',timeZone:'UTC'});
 function updateCalendar(){
  $('#lead-calendar').hidden=!calendarToggle.checked;
  $('#lead-calendar-estimate').hidden=calendarToggle.checked;
  const count=calendarDays.querySelectorAll('[aria-pressed="true"]').length;
  $('#lead-calendar-count').textContent=count===1?'1 franco marcado':count+' francos marcados';
 }
 function renderPlan(){
  if(planMonth===state.month&&planDirty)return;
  planMonth=state.month;planDirty=false;
  fill(planForm,{goal:state.plan.goal});
  const selected=new Set(state.plan.offDates||[]);
  calendarToggle.checked=Array.isArray(state.plan.offDates);
  const first=new Date(state.month+'-01T00:00:00Z');
  const offset=(first.getUTCDay()+6)%7;
  const days=new Date(first);
  days.setUTCMonth(days.getUTCMonth()+1,0);
  const cells=['L','M','M','J','V','S','D'].map(label=>'<span aria-hidden="true">'+label+'</span>');
  for(let i=0;i<offset;i++)cells.push('<span aria-hidden="true"></span>');
  for(let day=1;day<=days.getUTCDate();day++){
   const date=state.month+'-'+String(day).padStart(2,'0');
   cells.push('<button type="button" data-date="'+date+'" aria-label="'+esc(dayLabel.format(new Date(date+'T00:00:00Z')))+'" aria-pressed="'+selected.has(date)+'">'+day+'</button>');
  }
  calendarDays.innerHTML=cells.join('');
  updateCalendar();
 }
 function syncPlanButton(){
  savePlan.disabled=savingPlan||!state||state.month!==monthInput.value;
  $('#lead-plan-fields').disabled=savePlan.disabled;
 }
 function render(){
  const s=state.summary,p=state.policy,snapshot=state.snapshot,manual=state.entries.reduce((n,e)=>n+Number(e.quantity),0);
  $('#lead-account').textContent=`Cuenta de comisiones: ${state.user.username}. `+(snapshot?`Salón: ${snapshot.source_label} · actualizado ${snapshot.captured_at} UTC.`:'Abrí Yo en la app para leer las derivaciones del salón. Las cargas externas quedan guardadas aunque no haya lectura del salón.');
  $('#lead-metrics').innerHTML=[['Entrevistas del mes',s.total],['Salón · observadas',snapshot?Number(snapshot.quantity):'Sin lectura'],['Ajustes netos',manual],['Comisión generada',ars(s.earned),({basic:'(básico)',unlocked:'(desbloqueo)',elite:'(élite)'})[s.level]],['Acumulado potencial · desbloqueo',ars(s.total*p.baseRate),`(élite: ${ars(s.total*p.eliteRate)})`],['Necesitás por día',s.perDay===null?(s.monthEnded?'Mes finalizado':'Sin jornadas restantes'):s.perDay]].map(([label,value,note])=>`<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note?`<small class="metric-note">${esc(note)}</small>`:''}</article>`).join('');
  const scale=Math.max(p.elite,s.target),leadPercent=Math.min(100,s.total/scale*100);
  const marks=[...(p.basic>0?[{value:p.basic,label:'Básico'}]:[]),{value:p.unlock,label:'Desbloqueo'},{value:p.elite,label:'Élite'}];
  if(!marks.some(m=>m.value===s.target))marks.push({value:s.target,label:'Tu meta'});
  marks.sort((a,b)=>a.value-b.value);
  $('#lead-progress').innerHTML=`<div class="section-head"><h3>${s.level==='basic'?'Nivel básico alcanzado':s.unlocked?(s.total>=p.elite?'Nivel élite alcanzado':'Comisión desbloqueada'):p.basic>0?'Próxima meta: Básico':'Todavía falta desbloquear'}</h3><strong>${s.total} / ${s.target}</strong></div><div class="threshold-bar" role="progressbar" aria-label="Entrevistas del mes" aria-valuemin="0" aria-valuemax="${scale}" aria-valuenow="${Math.min(s.total,scale)}" aria-valuetext="${s.total} entrevistas, ${p.basic>0?'básico '+p.basic+', ':''}desbloqueo ${p.unlock}, élite ${p.elite}"><div class="threshold-fill" style="width:${leadPercent}%"></div>${marks.map(m=>`<span class="threshold-mark ${s.total>=m.value?'reached':''}" style="left:${m.value/scale*100}%" aria-hidden="true"></span>`).join('')}</div><div class="lead-threshold-labels">${marks.map(m=>`<span class="${s.total>=m.value?'reached':''}">${esc(m.label)} <strong>${m.value}</strong></span>`).join('')}</div><p>${s.level==='basic'||s.unlocked?`${ars(s.rate)} por cada entrevista del mes.`:p.basic>0?`Faltan ${s.toBasic} para el básico (${p.basic}), a ${ars(p.basicRate)} por entrevista.`:`Faltan ${s.toUnlock} para las ${p.unlock} y desbloquear ${ars(p.baseRate)} por entrevista.`} ${s.level==='basic'?`Faltan ${s.toUnlock} para desbloqueo (${p.unlock}), a ${ars(p.baseRate)} cada una.`:''} ${s.toElite?`Faltan ${s.toElite} para élite (${p.elite}), a ${ars(p.eliteRate)} cada una.`:''}</p><p class="muted">Meta personal: ${s.target} · faltan ${s.remaining} · ${s.workingDays} jornadas restantes ${s.estimatedDays?'estimadas (5 de cada 7 días)':'según tus francos marcados'}. ${!s.sourceKnown?'El cálculo todavía no incluye las derivaciones del salón. ':''}Los importes son calculados; no representan un pago recibido.</p>`;
  $('#lead-entries').innerHTML=state.entries.map(e=>`<article class="card"><div class="sale-row"><div><strong>${Number(e.quantity)>0?'+':''}${Number(e.quantity)} entrevistas</strong><p class="muted">${esc(e.entry_date)} · ${esc(e.notes)}</p></div><button type="button" class="quiet" data-lead-entry-delete="${e.id}">Eliminar</button></div></article>`).join('')||'<p class="muted">Sin ajustes en este mes.</p>';
  renderPlan();renderGoalProjection();syncPlanButton();

 }
 async function load(){
  if(loading){reloadPending=true;return;}
  loading=true;clearTimeout(retry);
  const month=monthInput.value;
  const panel=$('#panel-leads');
  panel.setAttribute('aria-busy',!state||state.month!==month);
  try{
   const result=await api('/lead-state?month='+encodeURIComponent(month));
   if(monthInput.value!==month)return;
   state=result;monthInput.value=state.month;render();message('');
   panel.setAttribute('aria-busy','false');
   await saveSource();
  }catch(error){
   message('No se pudo actualizar las metas. Tus datos guardados se conservan. '+error.message,true);
   if(navigator.onLine!==false&&!document.hidden)retry=setTimeout(load,10000);
  }finally{
   loading=false;panel.setAttribute('aria-busy','false');
   if(reloadPending){reloadPending=false;void load();}
  }
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
  if(source.month===monthInput.value)await load();
 }
 monthInput.onchange=()=>{syncPlanButton();$('#lead-plan-notice').hidden=true;load();};
 planForm.elements.namedItem('goal').addEventListener('input',()=>{planDirty=true;renderGoalProjection();});
 calendarToggle.onchange=()=>{planDirty=true;updateCalendar();};
 calendarDays.onclick=event=>{
  const day=event.target.closest('button[data-date]');
  if(!day)return;
  day.setAttribute('aria-pressed',day.getAttribute('aria-pressed')!=='true');
  planDirty=true;updateCalendar();
 };
 $('#new-leads').onclick=()=>{const form=$('#lead-entry-form');form.reset();fill(form,{date:state?.today||'',requestId:crypto.randomUUID()});$('#lead-entry-error').textContent='';$('#lead-entry-dialog').showModal();};
 $('#lead-entry-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;try{await api('/lead-entries',Object.fromEntries(new FormData(form)),'POST');$('#lead-entry-dialog').close();await load();}catch(error){$('#lead-entry-error').textContent=error.message;}finally{b.disabled=false;}};
 document.addEventListener('click',event=>{const b=event.target.closest('[data-lead-entry-delete]');if(!b)return;deleteId=b.dataset.leadEntryDelete;$('#lead-delete-error').textContent='';$('#lead-delete-dialog').showModal();});
 $('#lead-delete-confirm').onclick=async()=>{const b=$('#lead-delete-confirm');b.disabled=true;try{await api('/lead-entries/'+deleteId,{},'DELETE');$('#lead-delete-dialog').close();await load();}catch(error){$('#lead-delete-error').textContent=error.message;}finally{b.disabled=false;}};
 planForm.onsubmit=async event=>{
  event.preventDefault();
  if(savePlan.disabled)return;
  const month=state.month;
  const offDates=calendarToggle.checked?
   [...calendarDays.querySelectorAll('[aria-pressed="true"]')].map(day=>day.dataset.date):null;
  const body={month,goal:planForm.elements.namedItem('goal').value,offDates};
  const notice=$('#lead-plan-notice');
  savingPlan=true;syncPlanButton();
  try{
   await api('/lead-plan',body,'POST');
   if(monthInput.value===month){
    planDirty=false;
    await load();
    notice.className='muted';notice.textContent='Planificación guardada.';notice.hidden=false;
   }
  }catch(error){
   notice.className='form-error';notice.textContent=error.message;notice.hidden=false;
  }finally{savingPlan=false;syncPlanButton();}
 };
 window.addEventListener('message',event=>{
  if(event.origin!==salon||event.source!==window.parent||event.data?.type!=='md-lead-source')return;
  const d=event.data;if(!/^\d{4}-\d{2}$/.test(d.month)||!Number.isSafeInteger(d.quantity)||d.quantity<0||d.quantity>100000||typeof d.sourceLabel!=='string')return;
  source={month:d.month,quantity:d.quantity,sourceLabel:d.sourceLabel};saveSource();
 });
 window.addEventListener('md-lead-policy-updated',load);
 window.addEventListener('online',load);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(retry);else load();});
 if(document.body.classList.contains('embedded'))window.parent.postMessage({type:'md-leads-ready'},salon);
 load();
})();
