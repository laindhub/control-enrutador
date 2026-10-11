(() => {
 const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ars=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(v);
 const date=v=>v?new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short'}).format(new Date(v+'T12:00:00')):'—';
 let selectedSalesDay='',salesPage=0;
 let state,removeAction,loading=false,retryTimer,retryAttempt=0;
 function showPanel(tab,updateUrl=true){
  const allowed=['leads','sales','folders','payments','admin'];
  if(!allowed.includes(tab)||!$('#panel-'+tab))tab='sales';
  document.querySelectorAll('[id^="panel-"]').forEach(p=>p.hidden=p.id!=='panel-'+tab);
  document.querySelectorAll('[data-tab]').forEach(b=>{
   const selected=b.dataset.tab===tab;
   b.classList.toggle('selected',selected);
   if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  document.body.classList.toggle('leads-active',tab==='leads');
  if(updateUrl)history.replaceState(null,'','#'+tab);
  if(!document.body.classList.contains('embedded'))window.scrollTo({top:0,behavior:'instant'});
 }
 async function api(path,body,method='GET') {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await fetch('/api/presenters'+path,{method,credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json','x-csrf-token':$('meta[name="csrf-token"]').content},...(body?{body:JSON.stringify(body)}:{})});
   let result;try{result=await response.json();}catch{result={error:'No se pudo leer la respuesta del servidor.'};}
   if(!response.ok){
    const error=Error(result.error||'No se pudo completar la operación.');error.status=response.status;
    const retryAfter=response.headers.get('Retry-After');
    error.retryAfter=retryAfter?( /^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Math.max(0,Date.parse(retryAfter)-Date.now()) ):0;
    throw error;
   }
   if(!result||result.error)throw Error(result?.error||'No se pudo leer la respuesta del servidor.');
   return result;
  }catch(error){
   if(!error.status&&(error.name==='AbortError'||error.name==='TypeError')){
    throw Error(method==='GET'?'No se pudo conectar con el servidor.':'No se pudo confirmar la operación. Actualizá la lista antes de reintentar para comprobar si quedó guardada.');
   }
   throw error;
  }finally{clearTimeout(timeout);}
 }
 function notify(message,error=false){const n=$('#notice');n.dataset.kind='message';n.className='notice'+(error?' error':'');n.textContent=message;n.hidden=false;n.scrollIntoView({behavior:'smooth',block:'nearest'});}
 function connectionNotice(message,error=false){const n=$('#notice');n.dataset.kind='connection';n.className='notice'+(error?' error':'');n.textContent=message;n.hidden=false;}
 function empty(message){return `<div class="empty">${esc(message)}</div>`;}
 function actions(kind,item){return `<div class="row-actions">${kind==='sales'?`<button data-edit="${item.id}">Editar</button>`:''}<button data-delete="${item.id}" data-kind="${kind}">Eliminar</button></div>`;}
 function saleDetail(s){return `<article class="card"><div class="sale-row"><div><div class="sale-name">${esc(s.client_name||'Cliente sin nombre')}</div><div class="sale-meta">${date(s.announced_date)} · ${esc(s.advisor||'Asesor sin indicar')}${s.phone?' · '+esc(s.phone):''}</div><div class="sale-meta">Charla: ${esc(s.presenter_label||'Sin indicar')}${s.source_visit_id?' · Visita vinculada':''}</div></div><div class="amount">${ars(s.commission)}</div></div>${s.notes?`<p class="sale-meta">${esc(s.notes)}</p>`:''}${actions('sales',s)}${s.source_visit_id?`<button class="quiet" data-lead="${s.id}">Ver ficha del lead</button><div id="lead-${s.id}" hidden></div>`:''}${s.raw_text?`<details class="detail"><summary>Ver anuncio original</summary><pre>${esc(s.raw_text)}</pre></details>`:''}</article>`;}
 function renderSalesDays(sales){
  const days=[...new Set(sales.map(s=>s.announced_date))].sort().reverse();
  if(!days.includes(selectedSalesDay)){selectedSalesDay=days[0]||'';salesPage=0;}
  const daily=sales.filter(s=>s.announced_date===selectedSalesDay),pages=Math.max(1,Math.ceil(daily.length/4));salesPage=Math.min(salesPage,pages-1);
  $('#sales-days').innerHTML=days.length?`<div class="sales-day-nav"><button type="button" class="day-arrow" data-sales-day="${days[days.indexOf(selectedSalesDay)+1]||''}" ${days.indexOf(selectedSalesDay)===days.length-1?'disabled':''} aria-label="Día anterior con ventas">‹</button><div><strong>${date(selectedSalesDay)}</strong><span>${daily.length} ${daily.length===1?'venta':'ventas'} · ${ars(daily.reduce((n,s)=>n+Number(s.commission),0))}</span></div><button type="button" class="day-arrow" data-sales-day="${days[days.indexOf(selectedSalesDay)-1]||''}" ${days.indexOf(selectedSalesDay)===0?'disabled':''} aria-label="Día siguiente con ventas">›</button></div><div class="sales-day-strip" aria-label="Días con ventas">${days.map(day=>`<button type="button" data-sales-day="${day}" aria-pressed="${day===selectedSalesDay}" class="${day===selectedSalesDay?'selected':''}">${date(day)}</button>`).join('')}</div>`:'';
  $('#sales-list').innerHTML=daily.slice(salesPage*4,salesPage*4+4).map(s=>`<button type="button" class="sale-tile" data-sale-view="${s.id}" aria-label="Ver venta de ${esc(s.client_name||'Cliente sin nombre')}"><span class="sale-tile-avatar" aria-hidden="true">${esc((s.client_name||'V').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase())}</span><strong class="sale-tile-name">${esc(s.client_name||'Cliente sin nombre')}</strong><span class="sale-tile-advisor">${esc(s.advisor||'Asesor sin indicar')}</span><strong class="sale-tile-amount">${ars(s.commission)}</strong><span class="sale-tile-detail">Ver detalle ↗</span></button>`).join('')||empty('Todavía no tenés ventas en este mes. Pegá tu primer anuncio para empezar.');
  $('#sales-pagination').innerHTML=pages>1?`<div class="sales-page-nav"><button type="button" data-sales-page="${salesPage-1}" ${salesPage===0?'disabled':''}>Anterior</button><span>${salesPage+1} / ${pages}</span><button type="button" data-sales-page="${salesPage+1}" ${salesPage===pages-1?'disabled':''}>Siguiente</button></div>`:'';
 }
 function render() {
  const month=$('#month').value;const sales=state.sales.filter(s=>s.announced_date.startsWith(month));const payments=state.payments.filter(p=>p.paid_date.startsWith(month));const expected=sales.reduce((sum,s)=>sum+Number(s.commission),0),received=payments.reduce((sum,p)=>sum+Number(p.amount),0),balance=state.folders.reduce((sum,f)=>sum+f.balance,0);
  $('#metrics').innerHTML=[['Ventas del mes',sales.length],['Comisión generada',ars(expected)],['Cobrado en el mes',ars(received)],['Saldo total de carpetas',ars(balance)]].map(([label,value])=>`<article class="metric"><span>${label}</span><strong>${value}</strong></article>`).join('');
  const salesGoal=1000000,salesPercent=Math.min(100,Math.max(0,expected/salesGoal*100));
  const rateDate=month===state.today?.slice(0,7)?state.today:month+'-31';
  const projectedRate=Number(state.rates.find(r=>r.effective_date<=rateDate)?.amount??32000);
  const remainingSales=v=>Math.ceil(Math.max(0,v-expected)/projectedRate);
  $('#sales-progress').innerHTML=`<div class="section-head"><h2>Tu primer millón del mes</h2><strong>${salesPercent.toFixed(1).replace('.',',')}%</strong></div><p class="progress-value">${ars(expected)} <span class="muted">/ ${ars(salesGoal)}</span></p><div class="threshold-labels sales-threshold-counts">${[250000,500000,750000,1000000].map(v=>`<span class="${expected>=v?'reached':''}">${expected>=v?'Alcanzada':remainingSales(v)+' '+(remainingSales(v)===1?'venta':'ventas')}</span>`).join('')}</div><div class="threshold-bar sales-threshold-bar" role="progressbar" aria-label="Comisión generada del mes" aria-valuemin="0" aria-valuemax="${salesGoal}" aria-valuenow="${Math.min(expected,salesGoal)}" aria-valuetext="${ars(expected)} de ${ars(salesGoal)}"><div class="threshold-fill" style="width:${salesPercent}%"></div>${[250000,500000,750000,1000000].map(v=>`<span class="threshold-mark ${expected>=v?'reached':''}" style="left:${v/salesGoal*100}%" aria-hidden="true"></span>`).join('')}</div><div class="threshold-labels">${[250000,500000,750000,1000000].map(v=>`<span class="${expected>=v?'reached':''}">${ars(v)}</span>`).join('')}</div><p class="muted">${expected>=salesGoal?'Meta alcanzada. Seguís sumando comisiones.':'Faltan '+ars(salesGoal-expected)+' de comisión para llegar al millón.'} Se calcula sobre tus ventas del mes seleccionado, sin sumar entrevistas ni pagos recibidos. Ventas restantes estimadas a ${ars(projectedRate)} de comisión por venta.</p>`;
  renderSalesDays(sales);
  $('#folders-list').innerHTML=state.folders.map(f=>`<article class="card"><div class="sale-row"><div><div class="sale-name">${date(f.start)} → ${date(f.end)}</div><div class="sale-meta">Pago esperado: ${date(f.payFrom)} o ${date(f.payTo)}</div></div><span class="badge ${f.status==='Pagada'?'paid':''}">${esc(f.status)}</span></div><div class="folder-values"><div><span>Ventas</span><strong>${f.count}</strong></div><div><span>Esperado</span><strong>${ars(f.expected)}</strong></div><div><span>Recibido</span><strong>${ars(f.paid)}</strong></div><div><span>${f.balance<0?'Excedente':'Falta cobrar'}</span><strong>${ars(Math.abs(f.balance))}</strong></div></div><button class="secondary" data-pay="${f.start}">Registrar pago</button><details class="detail"><summary>Ver ventas de la carpeta</summary>${f.sales.map(s=>`<div class="mini-row"><span>${esc(s.client_name||s.phone)} · ${date(s.announced_date)}</span><strong>${ars(s.commission)}</strong></div>`).join('')||'<p>Sin ventas.</p>'}</details></article>`).join('');
  $('#payments-list').innerHTML=state.payments.map(p=>`<article class="card"><div class="sale-row"><div><div class="sale-name">Transferencia del ${date(p.paid_date)}</div><div class="sale-meta">Carpeta del ${date(p.folder_start)}${p.notes?' · '+esc(p.notes):''}</div></div><div class="amount">${ars(p.amount)}</div></div>${actions('payments',p)}</article>`).join('')||empty('Registrá la transferencia cuando la recibas para compararla con tu carpeta.');
  if($('#rates-list')){
   $('#rates-list').innerHTML=state.rates.map(r=>`<div class="mini-row"><span>Desde ${esc(r.effective_date==='1970-01-01'?'el inicio':r.effective_date)}</span><strong>${ars(r.amount)}</strong></div>`).join('');
   $('#users-list').innerHTML=state.people.map(p=>`<div class="mini-row"><span>${esc(p.username)} · ${p.active?'Activo':'Desactivado'}</span><button class="quiet" data-person="${p.id}" data-active="${p.active?'false':'true'}">${p.active?'Desactivar':'Activar'}</button></div>`).join('');
   $('#sync-status').innerHTML=`<h3>Sincronización de leads</h3><p class="muted">${state.sync?`Última ejecución correcta: ${esc(state.sync.last_success_at||'Todavía no hay una')} UTC · ${Number(state.sync.visits_seen)} visitas en la lista · ${Number(state.sync.details_updated)} fichas leídas en esa ejecución. Total: ${Number(state.sync.completed_total||0)} completas · ${Number(state.sync.pending_total||0)} pendientes.`:'El sincronizador todavía no tiene ejecuciones registradas.'}</p>${state.sync?.last_error?`<p class="form-error">La última importación de fichas no se completó. Tus ventas y pagos siguen disponibles.</p><details class="detail"><summary>Ver diagnóstico de la importación</summary><p>${esc(state.sync.last_error)}</p></details>`:''}${state.user.role==='presenter_admin'?`<button id="sync-now" class="secondary" ${state.syncRunning?'disabled':''}>${state.syncRunning?'Sincronizando…':'Sincronizar ahora'}</button>`:''}`;
  }
 }
 async function load(){
  clearTimeout(retryTimer);
  if(loading)return;
  if(navigator.onLine===false){connectionNotice('Sin conexión. Tus datos visibles se conservan; reconectaremos automáticamente.');return;}
  loading=true;
  if(!state)connectionNotice('Cargando tus ventas…');
  try{
   const nextState=await api('/state');
   state=nextState;if(!$('#month').value)$('#month').value=state.today.slice(0,7);render();retryAttempt=0;
   if($('#notice').dataset.kind==='connection')$('#notice').hidden=true;
  }catch(error){
   const temporary=!error.status||[408,429,500,502,503,504].includes(error.status);
   if(temporary){
    connectionNotice(state?'Reconectando… Podés seguir consultando tus datos.':'Conectando… El panel se actualizará automáticamente.');
    if(!document.hidden&&navigator.onLine!==false){
     const delay=Math.max(Math.min(30000,2000*2**Math.min(retryAttempt++,4)),Math.min(300000,error.retryAfter||0));
     retryTimer=setTimeout(load,delay);
    }
   }else connectionNotice(error.status===401?'Tu sesión venció. Volvé a iniciar sesión para continuar.':error.message,true);
  }finally{loading=false;}
 }
 const saleForm=$('#sale-form');const field=name=>saleForm.elements.namedItem(name);
 function estimate(){if(!state)return;const rate=state.rates.find(r=>r.effective_date<=field('date').value);const original=state.sales.find(s=>String(s.id)===field('id').value);$('#sale-estimate').textContent='Comisión de esta venta: '+ars(original?original.commission:rate?.amount??32000)+(original?' · conserva su importe original.':' · según la fecha del anuncio.');}
 function leadQuery(){return '/leads?'+new URLSearchParams({phone:field('phone').value,name:field('clientName').value,date:field('date').value,advisor:field('advisor').value});}
 function autoLead(leads){const exact=leads.filter(l=>l.matchType==='phone');return exact.length===1?exact[0].source_visit_id:'';}
 function leadsOptions(leads,selected=''){
 const completed=leads.filter(l=>l.matchType!=='pending'),pending=leads.filter(l=>l.matchType==='pending');
 const option=l=>`<option value="${esc(l.source_visit_id)}">${esc(l.name||l.list_text?.replace(/\s+/g,' ').slice(0,160)||'Visita sin nombre')} · ${esc(l.source_date)} · ${esc(l.advisor||'Asesor pendiente de importar')}${l.matchType==='pending'?' · Ficha pendiente, verificar manualmente':l.matchType==='name'?' · Revisar coincidencia por nombre':''}</option>`;
 field('visitId').innerHTML='<option value="">Sin visita vinculada</option>'+completed.map(option).join('')+(pending.length?'<optgroup label="Posibles visitas: ficha y asesor pendientes de verificar">'+pending.map(option).join('')+'</optgroup>':'');
 field('visitId').value=selected;
 }
 async function openSale(item){if(!state)return;saleForm.reset();$('#sale-error').textContent='';leadsOptions([]);field('date').value=item?.announced_date||'';field('id').value=item?.id||'';field('rawText').value=item?.raw_text||'';for(const [f,k] of Object.entries({clientName:'client_name',phone:'phone',advisor:'advisor',presenter:'presenter_label',quota:'quota',notes:'notes'}))field(f).value=item?.[k]??'';$('#sale-title').textContent=item?'Editar venta':'Del anuncio a tu cuenta';estimate();$('#sale-dialog').showModal();if(item)try{leadsOptions((await api(leadQuery())).leads,item.source_visit_id||'');}catch(error){$('#sale-error').textContent=error.message;}}
 function openPayment(folder){if(!state)return;const form=$('#payment-form');form.reset();$('#payment-error').textContent='';form.elements.folderStart.innerHTML=state.folders.map(f=>`<option value="${f.start}">${date(f.start)} → ${date(f.end)} · falta ${ars(f.balance)}</option>`).join('');if(folder)form.elements.folderStart.value=folder;form.elements.date.value=state.today;$('#payment-dialog').showModal();}
 $('#new-sale').onclick=()=>openSale();$('#new-payment').onclick=()=>openPayment();$('#month').onchange=render;$('#refresh').onclick=load;field('date').onchange=estimate;
 document.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.salesDay){selectedSalesDay=button.dataset.salesDay;salesPage=0;render();}if(button.dataset.salesPage!==undefined){salesPage=Number(button.dataset.salesPage);render();}if(button.dataset.saleView){const item=state.sales.find(s=>String(s.id)===button.dataset.saleView);if(item){$('#sale-detail-content').innerHTML=saleDetail(item);$('#sale-detail-dialog').showModal();}}if(button.dataset.lead){button.disabled=true;try{const {lead}=await api('/sales/'+button.dataset.lead+'/lead');const box=$('#lead-'+button.dataset.lead);let detail=lead?.detail_json;if(typeof detail==='string')detail=JSON.parse(detail);box.innerHTML=lead?`<div class="detail"><strong>Visita del ${esc(lead.source_date)}</strong><p class="muted">Asesor: ${esc(lead.advisor||'Sin indicar')} · Promotor: ${esc(lead.promoter||'Sin indicar')}</p>${(detail?.fields||[]).map(f=>`<div class="mini-row"><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong></div>`).join('')}<details><summary>Recorrido</summary><pre>${esc(detail?.timeline||'Sin recorrido disponible')}</pre></details></div>`:empty('La ficha ya no está disponible.');box.hidden=false;}catch(error){notify(error.message,true);}finally{button.disabled=false;}}if(button.dataset.close)$('#'+button.dataset.close).close();if(button.dataset.tab)showPanel(button.dataset.tab);if(button.dataset.edit){$('#sale-detail-dialog').close();openSale(state.sales.find(s=>String(s.id)===button.dataset.edit));}if(button.dataset.pay)openPayment(button.dataset.pay);if(button.dataset.delete){if($('#sale-detail-dialog').open)$('#sale-detail-dialog').close();removeAction=()=>api('/'+button.dataset.kind+'/'+button.dataset.delete,{},'DELETE');$('#confirm-dialog').showModal();}if(button.id==='sync-now'){button.disabled=true;try{await api('/sync-now',{},'POST');notify('Sincronización iniciada. Se actualizarán las visitas por lotes.');const timer=setInterval(async()=>{await load();if(!state?.syncRunning){clearInterval(timer);if(state?.sync?.last_error)notify(state.sync.last_error,true);else notify('Se completó el lote. La sincronización seguirá mientras queden visitas pendientes.');}},8000);setTimeout(()=>clearInterval(timer),900000);}catch(error){notify(error.message,true);button.disabled=false;}}if(button.dataset.person){button.disabled=true;try{await api('/users/'+button.dataset.person,{active:button.dataset.active==='true'},'PATCH');await load();}catch(error){notify(error.message,true);}finally{button.disabled=false;}}});
 $('#confirm-delete').onclick=async()=>{const b=$('#confirm-delete');b.disabled=true;try{await removeAction();$('#confirm-dialog').close();await load();notify('Registro eliminado del cálculo.');}catch(error){notify(error.message,true);}finally{b.disabled=false;}};
 $('#extract').onclick=async()=>{const b=$('#extract');b.disabled=true;b.textContent='Leyendo mensaje…';$('#sale-error').textContent='';try{const result=await api('/extract',{message:field('rawText').value,date:field('date').value},'POST');for(const [key,value] of Object.entries(result.data))if(field(key))field(key).value=value??'';leadsOptions(result.leads,autoLead(result.leads));}catch(error){$('#sale-error').textContent=error.message;}finally{b.disabled=false;b.textContent='Leer mensaje con IA';}};
 $('#find-lead').onclick=async()=>{const b=$('#find-lead');b.disabled=true;try{const result=await api(leadQuery());leadsOptions(result.leads,autoLead(result.leads));$('#sale-error').textContent=result.leads.length?(autoLead(result.leads)?'':result.leads.some(l=>l.matchType==='pending')?'Hay visitas de la lista cuya ficha todavía no se importó. Las pendientes no tienen el asesor verificado; revisalas en el sitio de origen antes de vincular.':'Elegí la visita y verificá nombre, fecha y asesor. Las coincidencias por nombre requieren tu confirmación.'):'No hay coincidencias sincronizadas. Revisá nombre y fecha, o guardá la venta sin visita.';}catch(error){$('#sale-error').textContent=error.message;}finally{b.disabled=false;}};
 saleForm.onsubmit=async event=>{event.preventDefault();const b=saleForm.querySelector('[type="submit"]');b.disabled=true;$('#sale-error').textContent='';try{const body=Object.fromEntries(new FormData(saleForm));body.quota=body.quota===''?null:Number(body.quota);await api('/sales'+(body.id?'/'+body.id:''),body,body.id?'PATCH':'POST');$('#sale-dialog').close();await load();notify('Venta guardada. Tu carpeta se actualizó.');}catch(error){$('#sale-error').textContent=error.message;}finally{b.disabled=false;}};
 $('#payment-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,b=form.querySelector('button');b.disabled=true;try{await api('/payments',Object.fromEntries(new FormData(form)),'POST');$('#payment-dialog').close();await load();notify('Pago registrado.');}catch(error){$('#payment-error').textContent=error.message;}finally{b.disabled=false;}};
 for(const [selector,path,message] of [['#rate-form','/rates','Comisión actualizada. Las ventas guardadas conservaron su importe.'],['#user-form','/users','Cuenta de presentador creada.']])if($(selector))$(selector).onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,b=form.querySelector('button');b.disabled=true;try{await api(path,Object.fromEntries(new FormData(form)),'POST');form.reset();await load();notify(message);}catch(error){notify(error.message,true);}finally{b.disabled=false;}};
 window.addEventListener('online',()=>{retryAttempt=0;load();});
 window.addEventListener('offline',()=>{clearTimeout(retryTimer);connectionNotice('Sin conexión. Tus datos visibles se conservan; reconectaremos automáticamente.');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(retryTimer);else{retryAttempt=0;load();}});
 window.addEventListener('pagehide',()=>clearTimeout(retryTimer));
 showPanel(location.hash.slice(1)||new URLSearchParams(location.search).get('area'),false);
 window.addEventListener('hashchange',()=>showPanel(location.hash.slice(1)||new URLSearchParams(location.search).get('area'),false));
 if(document.body.classList.contains('embedded')){
  let pending=false;
  const resize=()=>{
   if(pending)return;pending=true;
   requestAnimationFrame(()=>{
    pending=false;
    const dialog=[...document.querySelectorAll('dialog')].some(d=>d.open);
    window.parent.postMessage({type:'md-sales-dialog',open:dialog},'https://liniers.xn--somosmasdueos-skb.com');
    const height=Math.max(document.body.scrollHeight,260);
    window.parent.postMessage({type:'md-sales-height',height},'https://liniers.xn--somosmasdueos-skb.com');
   });
  };
  new ResizeObserver(resize).observe(document.body);
  new MutationObserver(resize).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
  resize();
  window.addEventListener('message',event=>{
   if(event.origin==='https://liniers.xn--somosmasdueos-skb.com'&&event.source===window.parent&&event.data?.type==='md-activity-area'){showPanel(event.data.area,false);return;}
   if(event.origin!=='https://liniers.xn--somosmasdueos-skb.com'||event.source!==window.parent||event.data?.type!=='md-sales-close-dialog')return;
   document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  });
 }
 load();if(!document.body.classList.contains('embedded')&&'serviceWorker'in navigator)navigator.serviceWorker.register('/presentador-sw.js',{scope:'/presentador'}).catch(()=>{});
})();
