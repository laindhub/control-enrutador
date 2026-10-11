(() => {
 const $=s=>document.querySelector(s);
 if(!$('#admin-person-select'))return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(v)||0);
 const date=v=>String(v||'').slice(0,10);
 const alertBox=$('#admin-person-error');
 let people=[],records=null,requestNumber=0;
 const person=()=>people.find(p=>String(p.id)===$('#admin-person-select').value);
 const showError=(message='')=>{alertBox.textContent=message;};
 async function api(path,body,method='GET') {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try {
   const response=await fetch('/api/presenters/admin'+path,{method,credentials:'same-origin',
    headers:{'Content-Type':'application/json','x-csrf-token':$('meta[name="csrf-token"]').content},
    signal:controller.signal,...(method!=='GET'?{body:JSON.stringify(body||{})}:{})});
   const value=await response.json();
   if(!response.ok)throw new Error(value.error||'No se pudo completar la operación.');
   return value;
  } finally {clearTimeout(timeout);}
 }
 function selectedPerson(){
  const p=person();
  if(!p)throw new Error('Seleccioná un presentador.');
  return p;
 }
 function render() {
  const d=records,p=person();
  if(!d||!p){$('#admin-person-summary').innerHTML='';$('#admin-person-sales').innerHTML='<p class="muted">Seleccioná un presentador.</p>';$('#admin-person-leads').innerHTML='';return;}
  const snapshot=Number(d.snapshot?.quantity||0),external=d.entries.reduce((n,e)=>n+Number(e.quantity),0);
  const paid=d.payments.reduce((n,e)=>n+Number(e.amount),0);
  const items=[
   ['Ventas del mes',d.sales.length],['Comisión generada',money(d.salesTotal)],
   ['Transferencias registradas',money(paid)],['Entrevistas del mes',d.summary.total],
   ['Salón · observadas',d.snapshot?snapshot:'Sin lectura'],['Otros registros',external]
  ];
  $('#admin-person-summary').innerHTML=items.map(([name,value])=>`<article class="metric"><span>${esc(name)}</span><strong>${esc(value)}</strong></article>`).join('');
  $('#admin-person-sales').innerHTML=d.sales.length?d.sales.map(s=>
   `<article class="card"><div class="sale-row"><div><strong>${esc(s.client_name||s.phone||'Cliente')}</strong><p class="muted">${esc(date(s.announced_date))} · ${esc(s.advisor||'Sin asesor')} · ${esc(s.presenter_label||'Sin charla')}</p></div><strong>${money(s.commission)}</strong></div>${s.notes?`<p class="muted">${esc(s.notes)}</p>`:''}<div class="row-actions"><button type="button" class="quiet" data-admin-edit-sale="${s.id}">Editar</button><button type="button" class="quiet" data-admin-delete-sale="${s.id}">Eliminar</button></div></article>`).join(''):
   '<p class="muted">Sin ventas registradas para este mes.</p>';
  const snap=d.snapshot?`<article class="card"><strong>${snapshot} entrevistas observadas en el salón</strong><p class="muted">Cuenta de origen: ${esc(d.snapshot.source_label||'Sin indicar')} · lectura ${esc(String(d.snapshot.captured_at||'').slice(0,19))}</p></article>`:'<p class="muted">Todavía no hay una lectura del salón para este mes.</p>';
  $('#admin-person-leads').innerHTML=`<p class="muted">Meta: ${d.summary.target} · faltan ${d.summary.remaining} · comisión potencial: ${money(d.summary.potential)}. El salón aporta un total mensual; las cargas externas se detallan por fecha y referencia.</p>`+
   snap+(d.entries.map(e=>`<article class="card"><div class="sale-row"><div><strong>${Number(e.quantity)} entrevistas externas</strong><p class="muted">${esc(date(e.entry_date))} · ${esc(e.notes)}</p></div><button type="button" class="quiet" data-admin-delete-leads="${e.id}">Eliminar</button></div></article>`).join('')||'<p class="muted">Sin ajustes externos registrados.</p>');
 }
 async function loadRecords() {
  const p=person(),month=$('#admin-month').value;
  const current=++requestNumber;
  if(!p||!month){records=null;render();return;}
  showError('');
  $('#admin-person-sales').innerHTML='<p class="muted">Cargando registros…</p>';
  try {
   const data=await api('/users/'+p.id+'/records?month='+encodeURIComponent(month));
   if(current!==requestNumber)return;
   records=data;render();
  }catch(error){if(current!==requestNumber)return;records=null;render();showError(error.message);}
 }
 async function loadAudit(){
  try {
   const {activity}=await api('/audit');
   const labels={sale_created:'Venta registrada',sale_updated:'Venta corregida',sale_deleted:'Venta eliminada',leads_added:'Entrevistas agregadas',leads_deleted:'Entrevistas eliminadas',password_reset:'Contraseña cambiada'};
   $('#admin-audit-list').innerHTML=activity.length?activity.map(a=>`<div class="mini-row"><span>${esc(a.presenter)} · ${esc(labels[a.action]||a.action)}</span><span class="muted">${esc(date(a.created_at))} · ${esc(a.actor)}</span></div>`).join(''):'<p class="muted">Todavía no hay intervenciones registradas.</p>';
  }catch(error){$('#admin-audit-list').textContent='No se pudo consultar la actividad: '+error.message;}
 }
 function applyPeople(next,today){
  if(!Array.isArray(next))return;
  const select=$('#admin-person-select'),old=select.value;
  people=next;
  const identity=people.some(p=>String(p.id)===old)?old:String(people[0]?.id||'');
  select.innerHTML=people.map(p=>`<option value="${p.id}">${esc(p.username)}${p.active?'':' · Inactivo'}</option>`).join('');
  select.value=identity;
  if(!$('#admin-month').value)$('#admin-month').value=String(today||new Date().toISOString()).slice(0,7);
  if(records?.person?.id!==Number(identity)||records?.month!==$('#admin-month').value)loadRecords();
 }
 document.addEventListener('presenter:state',event=>applyPeople(event.detail.people,event.detail.today));
 document.addEventListener('presenter:admin-change',()=>{loadRecords();loadAudit();});
 $('#admin-person-select').addEventListener('change',()=>{records=null;loadRecords();});
 $('#admin-month').addEventListener('change',()=>{records=null;loadRecords();});
 $('#admin-new-sale').addEventListener('click',()=>{
  try{window.__presenterOpenAdminSale(null,selectedPerson());}catch(error){showError(error.message);}
 });
 $('#admin-reset-password').addEventListener('click',()=>{
  try{const p=selectedPerson();$('#admin-password-person').textContent='Cuenta: '+p.username;$('#admin-password-form').reset();$('#admin-password-error').textContent='';$('#admin-password-dialog').showModal();}
  catch(error){showError(error.message);}
 });
 $('#admin-new-leads').addEventListener('click',()=>{
  try{const p=selectedPerson();$('#admin-lead-person').textContent='Cuenta: '+p.username;$('#admin-lead-form').reset();$('#admin-lead-form').elements.date.value=new Date().toLocaleDateString('en-CA');$('#admin-lead-error').textContent='';$('#admin-lead-dialog').showModal();}
  catch(error){showError(error.message);}
 });
 $('#admin-password-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');
  const password=form.elements.password.value;
  if(password!==form.elements.confirm.value){$('#admin-password-error').textContent='Las contraseñas no coinciden.';return;}
  button.disabled=true;$('#admin-password-error').textContent='';
  try{const p=selectedPerson();await api('/users/'+p.id+'/password',{password},'PATCH');form.reset();$('#admin-password-dialog').close();showError('Contraseña actualizada para '+p.username+'.');await loadAudit();}
  catch(error){$('#admin-password-error').textContent=error.message;}
  finally{button.disabled=false;}
 });
 $('#admin-lead-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,b=form.querySelector('[type=submit]');b.disabled=true;
  try{const p=selectedPerson();await api('/users/'+p.id+'/leads',Object.fromEntries(new FormData(form)),'POST');$('#admin-lead-dialog').close();await loadRecords();await loadAudit();}
  catch(error){$('#admin-lead-error').textContent=error.message;}
  finally{b.disabled=false;}
 });
 document.addEventListener('click',async event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.adminPersonOpen){
   document.querySelector('[data-tab="admin"]')?.click();
   $('#admin-person-select').value=b.dataset.adminPersonOpen;await loadRecords();return;
  }
  if(b.dataset.adminEditSale){
   const sale=records?.sales.find(s=>String(s.id)===b.dataset.adminEditSale);
   if(sale&&person())window.__presenterOpenAdminSale(sale,person());
   return;
  }
  if(b.dataset.adminDeleteSale||b.dataset.adminDeleteLeads){
   const p=person();if(!p)return;
   const isSale=Boolean(b.dataset.adminDeleteSale);
   const label=isSale?'esta venta':'esta carga de entrevistas';
   if(!window.confirm('¿Eliminar '+label+' de '+p.username+'? Se quitará de los cálculos y quedará en auditoría.'))return;
   b.disabled=true;
   try {
    const endpoint='/users/'+p.id+'/'+(isSale?'sales/'+b.dataset.adminDeleteSale:'leads/'+b.dataset.adminDeleteLeads);
    await api(endpoint,{},'DELETE');
    await loadRecords();await loadAudit();
   }catch(error){showError(error.message);}finally{b.disabled=false;}
  }
 });
 loadAudit();
})();