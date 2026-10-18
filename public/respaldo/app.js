const app = document.getElementById('app');
const state = { user: null, users: [], visits: [], selectedUser: null, adminLogin: false, pin: '', view: '', current: null, answers: {}, chapter: 0, search: '' };
const sources = ['Promotor con ruleta','Folleto','Recomendación','Redes sociales','Orgánico','Vino a ver a su asesor'];
const exitReasons = ['Tenía poco tiempo','Ya es propietario','Solo quería el premio','No trabaja','No vive en Buenos Aires'];
const speakers = ['Keren Botini','Nicolas Espinosa','Nicole Laquinta','Thomas Núñez','Katherine Puppo','Priscila Zajama'];
const yesNoUnknown = ['Sí','No','No contestó'];
const maybe = ['Sí','No','No aplica','No contestó'];
const pretest = [
  {key:'vivienda_propia',label:'¿Ya sos dueño de una vivienda?',options:maybe},
  {key:'quiere_ser_dueno',label:'¿Te gustaría ser dueño?',options:maybe},
  {key:'puede_pagar_200k',label:'¿Podrías pagar 200.000 pesos por mes para ser dueño?',options:yesNoUnknown}
];
const fields = [
  {title:'Conociendo a la persona',questions:[
    ['vino_por_maca','¿Vino por Maca?',maybe],
    ['age','Edad','number'],
    ['genero','Género',['Masculino','Femenino','No contestó']],
    ['disponible_ser_dueno','¿Crees que podés ser Dueño alguna vez?',['Sí','No','Quizás','No contestó']],
    ['intentos_previos','¿Intentaste ser Dueño antes?',yesNoUnknown],
    ['urgencia','¿Qué tan urgente es para vos ser Dueño?',['Muy urgente','Urgente','Me gustaría pero no es urgente','Poco urgente','Cero urgente','No contestó']],
    ['miedo_estafas','¿Tenés miedo de que te estafen?',['Sí, ya fui estafado','Sí, aunque nunca fui estafado','Un poco','No me preocupa','No contestó']],
    ['motivos','¿Por qué querés ser Dueño?', ['Sentirme segura y tranquila','Dejar algo a mi familia','Ahorrar para el futuro','Dejar de pagar alquiler','Tener mi propio espacio'],'multi'],
    ['frenos','¿Qué te frena hoy?',['Creo que no puedo ser dueño','Los precios están muy altos','No tengo ahorros suficientes','No califico para un crédito','Tengo miedo de endeudarme','Tengo miedo que me estafen','No encuentro la propiedad que me guste','No sé ni por dónde empezar','No vale la pena ser dueño','Ninguna'],'multi'],
    ['vivienda_actual','¿Dónde vivís actualmente?',['Departamento','PH','Casa','No contestó']]
  ]},
  {title:'La propiedad soñada',questions:[
    ['ubicaciones','¿Dónde te gustaría tener tu propiedad? (localidades separadas por coma)','text'],
    ['tipo_propiedad','¿Cómo te gustaría que fuera tu propiedad?',['Departamento','Casa','PH','No contestó']],
    ['dormitorios','Dormitorios',['Monoambiente','1 dormitorio','2 dormitorios','3 dormitorios','4 dormitorios o más','No contestó']],
    ['servicios','¿Qué servicios te gustaría tener?',['Cochera','Gimnasio','Lavadero','Parrilla','Pileta','Sala de juegos','Salón de fiestas','Ninguna'],'multi']
  ]},
  {title:'Punto de partida',questions:[['tiene_ahorros','¿Contás con ahorros?',yesNoUnknown]]},
  {title:'¿Disponible para ser dueño/a?',questions:[
    ['cuota_posible_ars','¿Cuánto podrías pagar por mes para convertirte en Dueño?','number'],
    ['ingreso_mensual_total_ars','¿Cuál es tu ingreso mensual total? (en pesos)','number'],
    ['situacion_laboral','¿Cuál es tu situación laboral actual?',['Relación de dependencia','Independiente','Jubilado','Desempleado','No contestó']],
    ['quien_decide','Si decidieras entrar a un plan, ¿quién tomaría la decisión final?',['Yo solo','Yo y alguien más','No contestó']]
  ]},
  {title:'Últimas preguntas',questions:[
    ['conoce_spazios','¿Conocés la constructora Spazios?',yesNoUnknown],
    ['conoce_tapiola','¿Conocés a Juan Manuel Tapiola?',yesNoUnknown],
    ['como_llego','¿Cómo llegaste al local?',['Ruletas','Folleto','Estaba pasando y me llamó la atención','Me recomendó alguien','Redes sociales','No contestó']],
    ['email','Correo electrónico (opcional)','email']
  ]}
];
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const tag = (text, kind='') => '<span class="tag '+kind+'">'+esc(text)+'</span>';
const fmt = date => date ? new Date(String(date).replace(' ','T')+'Z').toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}) : '—';
const input = (key, label, value='',type='text') => '<label class="field">'+esc(label)+'<input name="'+esc(key)+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'min="0" step="1"':'')+'></label>';
const select = (key, label, options, value='', empty='Seleccionar') => '<label class="field">'+esc(label)+'<select name="'+esc(key)+'"><option value="">'+esc(empty)+'</option>'+options.map(o=>'<option '+(String(o)===String(value)?'selected':'')+'>'+esc(o)+'</option>').join('')+'</select></label>';
const btn = (text,id,style='')=>'<button type="button" class="btn '+style+'" data-action="'+id+'">'+esc(text)+'</button>';
const userRoles = {admin:'Administración',recepcion:'Recepción',pretest:'Pre-test',fulltest:'Full-test',enrutador:'Enrutación',asesor:'Conversión'};
async function api(url, options={}) {
  const r = await fetch('/respaldo/api'+url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  let data; try { data = await r.json(); } catch { data = {}; }
  if (!r.ok) throw Error(data.error || 'Solicitud fallida ('+r.status+')');
  return data;
}
function status(message, kind='error') {
  const n=document.createElement('div'); n.className='notice '+kind; n.textContent=message;
  document.body.append(n); setTimeout(()=>n.remove(),5000);
}
function wire(id,callback) { const el=document.querySelector('[data-action="'+id+'"]'); if (el) el.onclick=callback; }
function header() {
  return '<header class="top"><div class="brand"><span class="logo">⌂</span> <span>Más<b>Dueños</b></span><small>Respaldo</small></div><div class="operator">'+esc(state.user.name)+' · '+esc(userRoles[state.user.role])+'</div>'+btn('Salir','logout','ghost')+'</header>';
}
function boardShell(content) {
  app.innerHTML=header()+'<section class="main">'+content+'</section>';
  wire('logout',async()=>{try{await api('/logout',{method:'POST',body:'{}'});}catch{}state.user=null;state.adminLogin=false; await loginScreen();});
}
async function boot() {
  try { await api('/health'); } catch(e) {
    app.innerHTML='<div class="center"><h1>Respaldo sin configurar</h1><p>'+esc(e.message)+'</p><p>Revisá las variables RESPALDO_DB_* y RESPALDO_ADMIN_* en Hostinger.</p></div>'; return;
  }
  try { state.user=await api('/me'); state.users=await api('/users'); await home(); }
  catch { await loginScreen(); }
}
async function loginScreen() {
  state.user=null;
  try { state.users=await api('/users'); } catch(e) { status(e.message); return; }
  renderLogin();
}
function renderLogin() {
  if (state.adminLogin) {
    app.innerHTML='<section class="login"><div class="brand big"><span class="logo">⌂</span> Más<b>Dueños</b><small>Respaldo</small></div>'
      +'<h1>Administración</h1><p>Ingresá las credenciales exclusivas del Respaldo configuradas en Hostinger.</p>'
      +'<form id="admin-login-form">'+input('username','Usuario')+input('password','Contraseña','','password')
      +'<button class="btn primary">Entrar</button></form>'+btn('← Volver a operadores','back-admin','ghost')+'</section>';
    wire('back-admin',()=>{state.adminLogin=false;renderLogin();});
    document.getElementById('admin-login-form').onsubmit=async event=>{
      event.preventDefault();
      const f=new FormData(event.currentTarget);
      try {
        state.user=await api('/login',{method:'POST',body:JSON.stringify({username:f.get('username'),password:f.get('password')})});
        state.adminLogin=false;state.selectedUser=null;state.users=await api('/users');await home();
      } catch(error) { status(error.message); }
    };
    return;
  }
  app.innerHTML='<section class="login"><div class="brand big"><span class="logo">⌂</span> Más<b>Dueños</b><small>Respaldo</small></div>'
    +(!state.selectedUser?'<h1>¿Quién sos?</h1><p>Tocá tu nombre. Después ponés tu PIN.</p><input id="search-user" placeholder="Buscá tu nombre" autocomplete="off"><div id="users"></div>'+btn('Acceso Administración','admin-login','outline')
      :'<h1>'+esc(state.selectedUser.name)+'</h1><p>Ingresá tu PIN para continuar</p><form id="login-form"><input type="password" name="pin" inputmode="numeric" autocomplete="off" minlength="4" maxlength="80" autofocus placeholder="PIN" required><button class="btn primary">Entrar</button></form>'+btn('No soy yo','back-user','ghost'))
    +'</section>';
  if (!state.selectedUser) {
    wire('admin-login',()=>{state.adminLogin=true;renderLogin();});
    const filter=document.getElementById('search-user');
    const renderUsers=()=>{const q=filter.value.toLowerCase();document.getElementById('users').innerHTML=state.users.filter(u=>u.name.toLowerCase().includes(q)).map(u=>
      '<button class="identity" data-user="'+u.id+'"><span class="avatar">'+esc(u.name.split(' ').map(x=>x[0]).slice(0,2).join(''))+'</span><span>'+esc(u.name)+'<small>'+esc(userRoles[u.role])+'</small></span></button>').join('');
      document.querySelectorAll('[data-user]').forEach(b=>b.onclick=()=>{state.selectedUser=state.users.find(u=>u.id===Number(b.dataset.user));renderLogin();});
    }; filter.oninput=renderUsers;renderUsers();
  } else {
    wire('back-user',()=>{state.selectedUser=null; renderLogin();});
    document.getElementById('login-form').onsubmit=async e=>{
      e.preventDefault();
      const pin=new FormData(e.target).get('pin');
      try { state.user=await api('/login',{method:'POST',body:JSON.stringify({id:state.selectedUser.id,pin})});state.selectedUser=null;await home(); }
      catch(error){status(error.message);}
    };
  }
}
async function home() {
  try { state.visits=await api('/visits'+(state.search?'?search='+encodeURIComponent(state.search):'')); }
  catch(e){status(e.message);return;}
  if (!state.view || (state.user.role!=='admin' && state.view!==state.user.role)) state.view=state.user.role;
  renderHome();
}
function renderHome() {
  let content='<div class="heading"><div><h1>'+esc(userRoles[state.view])+'</h1><p>Salón Más Dueños · respaldo operativo independiente</p></div></div>';
  if (state.user.role==='admin') content+='<nav class="tabs">'+Object.keys(userRoles).map(r=>btn(userRoles[r], 'role-'+r,state.view===r?'selected':'ghost')).join('')+'</nav>';
  if (state.view==='recepcion') content+=receptionForm();
  if (state.view==='admin') content+=adminHome();
  if (state.view!=='recepcion' && state.view!=='admin') content+=visitList();
  boardShell(content);
  for (const role of Object.keys(userRoles)) wire('role-'+role,()=>{state.view=role;state.current=null;renderHome();});
  if (state.view==='recepcion') bindReception();
  if (state.view==='admin') bindAdmin();
  wire('refresh',()=>home());
  document.querySelectorAll('[data-visit]').forEach(el=>el.onclick=()=>openVisit(el.dataset.visit));
}
function visitList() {
  const role=state.view;
  const relevant=state.visits.filter(v=>{
    if (role==='pretest') return v.phase==='pretest';
    if (role==='fulltest') return v.phase==='fulltest';
    if (role==='enrutador') return v.phase==='enrutacion';
    if (role==='asesor') return v.phase==='asesor' && (state.user.role!=='asesor' || Number(v.assigned_advisor_id)===state.user.id);
    return true;
  });
  return '<div class="listhead"><h2>Personas pendientes ('+relevant.length+')</h2>'+btn('Actualizar','refresh','outline')+'</div>'
    +(relevant.length?relevant.map(v=>'<button class="visit" data-visit="'+esc(v.id)+'"><span><b>'+esc(v.visitor_name)+'</b><small>'+esc(v.source||'')+' · '+fmt(v.created_at)+'</small></span><span>Continuar →</span></button>').join(''):'<div class="empty">No hay personas pendientes en este puesto.</div>');
}
function receptionForm() {
  return '<div class="panel"><h2>Registrar ingreso</h2><form id="checkin-form">'
    +input('visitor_name','Nombre de la persona')
    +select('source','¿Por dónde entró?',sources,'Promotor con ruleta')
    +input('promoter','¿Quién la trajo? (si corresponde)')
    +select('continues','¿Siguió adelante?',['Sí, sigue el recorrido','No continuó'],'Sí, sigue el recorrido')
    +'<div id="reason-wrap">'+select('exit_reason','Motivo por el que no continuó',exitReasons)+'</div>'
    +'<button class="btn primary">Registrar ingreso</button></form></div>';
}
function bindReception(){
  const form=document.getElementById('checkin-form');
  const r=document.getElementById('reason-wrap');
  const toggle=()=>{r.hidden=form.elements.continues.value==='Sí, sigue el recorrido';form.elements.promoter.closest('.field').hidden=!['Promotor con ruleta','Vino a ver a su asesor'].includes(form.elements.source.value);};
  form.elements.continues.onchange=toggle;form.elements.source.onchange=toggle;toggle();
  form.onsubmit=async e=>{
    e.preventDefault();const f=new FormData(form);const yes=f.get('continues')==='Sí, sigue el recorrido';
    try {await api('/visits',{method:'POST',body:JSON.stringify({visitor_name:f.get('visitor_name'),source:f.get('source'),promoter:f.get('promoter')||'',continues:yes,exit_reason:yes?'':f.get('exit_reason')})});status('Ingreso registrado correctamente.','success');await home();}
    catch(e){status(e.message);}
  };
}
function adminHome() {
  const v=state.visits; const pending=v.filter(x=>x.crm_status==='pendiente').length;
  return '<div class="stats"><div><b>'+v.length+'</b><small>Visitas recientes</small></div><div><b>'+pending+'</b><small>Por cargar en CRM empresarial</small></div></div>'
    +'<div class="panel"><h2>CRM propio — carga manual</h2><p>Ningún dato se envía automáticamente al CRM de la empresa.</p><div class="toolbar"><input id="search-leads" placeholder="Buscar por nombre o teléfono" value="'+esc(state.search)+'">'+btn('Buscar','search-leads-btn','outline')+'<a class="btn outline" href="/respaldo/api/export">Exportar JSON</a></div>'
    +v.map(x=>'<button class="visit" data-visit="'+esc(x.id)+'"><span><b>'+esc(x.visitor_name)+'</b><small>'+fmt(x.created_at)+' · '+esc(x.phase)+'</small></span>'+tag(x.crm_status)+'</button>').join('')
    +'</div><div class="panel"><h2>Crear usuario de Respaldo</h2><form id="create-user">'+input('name','Nombre del operador')+select('role','Puesto',Object.keys(userRoles))+input('pin','PIN (mínimo 4 caracteres; 6 para admin)')+'<button class="btn primary">Crear usuario</button></form></div>';
}
function bindAdmin() {
  wire('search-leads-btn',()=>{state.search=document.getElementById('search-leads').value;home();});
  const form=document.getElementById('create-user');form.elements.pin.type='password';form.onsubmit=async e=>{
    e.preventDefault();const o=Object.fromEntries(new FormData(form));
    try {await api('/users',{method:'POST',body:JSON.stringify(o)});status('Usuario creado.','success');state.users=await api('/users');form.reset();}
    catch(e){status(e.message);}
  };
}
async function openVisit(id) {
  try {
    state.current=await api('/visits/'+encodeURIComponent(id));
    state.answers=state.view==='fulltest'?(state.current.fulltest_json||{}):{};
    state.chapter=0;renderVisit();
  } catch(e){status(e.message);}
}
function renderVisit() {
  const v=state.current;if(!v)return home();
  let content='<div class="back">'+btn('← Volver','go-home','ghost')+'</div><h1>'+esc(v.visitor_name)+'</h1><p>Visita '+fmt(v.created_at)+'</p>';
  if(state.view==='pretest') content+=pretestForm(v);
  if(state.view==='fulltest') content+=fulltestForm(v);
  if(state.view==='enrutador') content+=routingForm(v);
  if(state.view==='asesor') content+=conversionForm(v);
  if(state.view==='admin') content+=crmForm(v);
  boardShell(content);
  wire('go-home',()=>{state.current=null;home();});
  if(state.view==='pretest') bindPretest(v);
  if(state.view==='fulltest') bindFulltest(v);
  if(state.view==='enrutador') bindRouting(v);
  if(state.view==='asesor') bindConversion(v);
  if(state.view==='admin') bindCrm(v);
}
function choiceMarkup(key,label,options,current='',multi=false){
  return '<fieldset class="choice-group"><legend>'+esc(label)+'</legend><div class="choices">'+options.map(o=>'<label class="option"><input type="'+(multi?'checkbox':'radio')+'" name="'+esc(key)+'" value="'+esc(o)+'" '+(multi?(Array.isArray(current)&&current.includes(o)?'checked':''):(current===o?'checked':''))+'> '+esc(o)+'</label>').join('')+'</div></fieldset>';
}
function pretestForm(v) {
  const a=v.pretest_json||{};
  return '<form class="panel" id="pretest-form">'+input('visitor_name','Nombre y apellido',v.visitor_name)+input('phone','Teléfono (+54)',v.phone||'','tel')
    +pretest.map(q=>choiceMarkup(q.key,q.label,q.options,a[q.key])).join('')
    +'<p class="muted">Todas las respuestas del cuestionario son opcionales.</p><button class="btn primary">Guardar Pre-test</button></form>';
}
function bindPretest(v) {
  document.getElementById('pretest-form').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,f=new FormData(form),answers={};
    pretest.forEach(q=>answers[q.key]=f.get(q.key)||null);
    try {await api('/visits/'+v.id+'/pretest',{method:'PUT',body:JSON.stringify({visitor_name:f.get('visitor_name'),phone:f.get('phone'),answers})});status('Pre-test guardado.','success');state.current=null;await home();}
    catch(e){status(e.message);}
  };
}
function questionMarkup(q,a){
  const [key,label,options,kind]=q;
  const val=a[key];
  return Array.isArray(options)?choiceMarkup(key,label,options,val,kind==='multi'):
    input(key,label,val??'',options==='number'?'number':options==='email'?'email':'text');
}
function optionalQuestions(a) {
  let result=[];
  if(a.tiene_ahorros==='Sí') result.push(['ahorro_efectivo_ars','Efectivo en pesos','number'],['ahorro_efectivo_usd','Efectivo en dólares','number'],['ahorro_vehiculos_usd','Vehículos (USD)','number'],['ahorro_propiedades_usd','Propiedades (USD)','number']);
  if(['Casa','PH'].includes(a.tipo_propiedad))result.push(['viviria_en_departamento','¿Vivirías en departamento?',['Sí, totalmente.','Sí, podría ser.','No creo.','No, ni loco.']]);
  if(['Relación de dependencia','Independiente'].includes(a.situacion_laboral))result.push(['trabajo_en_blanco','¿Estás en blanco?',['Sí','No','En parte','No contestó']],['trabajo','¿De qué trabajás?','text']);
  if(a.quien_decide==='Yo y alguien más')result.push(['acompanante_presente','¿Esa persona está presente?',yesNoUnknown]);
  return result;
}
function fulltestForm(v) {
  const c=fields[state.chapter];
  const dynamic=optionalQuestions(state.answers).filter(q=>{
    const i=state.chapter;
    return (i===1 && q[0]==='viviria_en_departamento')||(i===2&&q[0].startsWith('ahorro_'))||
      (i===3&&['trabajo_en_blanco','trabajo','acompanante_presente'].includes(q[0]));
  });
  return '<div class="progress">Capítulo '+(state.chapter+1)+' de 5 <div class="bar"><span style="width:'+((state.chapter+1)*20)+'%"></span></div></div>'
    +'<form id="fulltest-form" class="panel"><h2>'+esc(c.title)+'</h2><p>Ninguna pregunta es obligatoria.</p>'
    +c.questions.concat(dynamic).map(q=>questionMarkup(q,state.answers)).join('')
    +'<div class="actions">'+btn('Volver','previous-step','outline')+btn('Guardar y salir','save-draft','outline')+'<button class="btn primary">'+(state.chapter===4?'Enviar Full-test':'Siguiente paso →')+'</button></div></form>';
}
function collectAnswers(){
  const form=document.getElementById('fulltest-form');if(!form)return;
  const f=new FormData(form);
  const questions=fields[state.chapter].questions.concat(optionalQuestions(state.answers));
  for (const q of questions) {
    const key=q[0], val=f.get(key);
    if (q[3]==='multi') state.answers[key]=f.getAll(key);
    else if (val!==null)state.answers[key]=q[2]==='number' ? (val===''?null:Number(val)) : (val||null);
  }
}
function bindFulltest(v) {
  const form=document.getElementById('fulltest-form');
  form.querySelectorAll('input').forEach(el=>{
    if (['tiene_ahorros','tipo_propiedad','situacion_laboral','quien_decide'].includes(el.name)) {
      el.onchange=()=>{ collectAnswers();renderVisit(); };
    }
  });
  wire('previous-step',()=>{collectAnswers();if(state.chapter>0){state.chapter--;renderVisit();}else{state.current=null;home();}});
  async function save(complete){
    collectAnswers();
    try {await api('/visits/'+v.id+'/fulltest',{method:'PUT',body:JSON.stringify({answers:state.answers,complete})});return true;}
    catch(e){status(e.message);return false;}
  }
  wire('save-draft',async()=>{if(await save(false)){status('Borrador guardado.','success');state.current=null;await home();}});
  form.onsubmit=async e=>{
    e.preventDefault();
    const last=state.chapter===4;
    if(await save(last)){
      if(last){status('Full-test enviado.','success');state.current=null;await home();}
      else{state.chapter++;renderVisit();}
    }
  };
}
function routingForm(v) {
  const advisorOptions=state.users.filter(u=>u.role==='asesor');
  return '<form id="routing-form" class="panel"><h2>¿Cómo le fue en la charla?</h2>'
    +select('outcome','Resultado',['entera','entera_no_deriva','se_fue','no_se_quedo'])
    +select('speaker','¿Quién dio la charla?',speakers)
    +select('product','¿Qué producto?',['PAI','Pozo'])
    +'<label class="field">Asesor (si corresponde)<select name="advisor_id"><option value="">Sin asesor</option>'
    +advisorOptions.map(u=>'<option value="'+u.id+'">'+esc(u.name)+'</option>').join('')+'</select></label>'
    +select('reason','Motivo, si no continúa',exitReasons)
    +'<button class="btn primary">Confirmar derivación</button></form>';
}
function bindRouting(v){
  document.getElementById('routing-form').onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));
    try{await api('/visits/'+v.id+'/route',{method:'PUT',body:JSON.stringify(f)});status('Resultado registrado.','success');state.current=null;await home();}
    catch(e){status(e.message);}
  };
}
function conversionForm(v) {
  return '<div class="panel"><h2>¿La persona se sentó con vos?</h2><p>Solo se registra la conversión a atención. No implica venta ni reserva.</p><div class="actions">'
    +btn('Sí, se sentó','converted','primary')+btn('No se sentó','not-converted','outline')+'</div></div>';
}
function bindConversion(v) {
  for (const [k,seated] of [['converted',true],['not-converted',false]])wire(k,async()=>{
    if(!confirm('¿Confirmás este resultado?'))return;
    try{await api('/visits/'+v.id+'/conversion',{method:'PUT',body:JSON.stringify({seated})});status('Conversión registrada.','success');state.current=null;await home();}
    catch(e){status(e.message);}
  });
}
function crmForm(v){
  return '<div class="panel"><h2>Ficha del lead</h2><p><b>Ingreso:</b> '+fmt(v.created_at)+' · <b>Canal:</b> '+esc(v.source)+' · <b>Promotor:</b> '+esc(v.promoter)+'</p>'
    +'<p><b>Teléfono:</b> '+esc(v.phone||'No informado')+' · <b>Estado:</b> '+esc(v.phase)+'</p>'
    +'<details><summary>Respuestas Pre-test</summary><pre>'+esc(JSON.stringify(v.pretest_json||{},null,2))+'</pre></details>'
    +'<details><summary>Respuestas Full-test</summary><pre>'+esc(JSON.stringify(v.fulltest_json||{},null,2))+'</pre></details>'
    +'<details><summary>Enrutación</summary><pre>'+esc(JSON.stringify(v.routing_json||{},null,2))+'</pre></details>'
    +'<p><b>¿Se sentó con el asesor?</b> '+(v.seated===null?'Pendiente':v.seated?'Sí':'No')+'</p>'
    +'</div><form class="panel" id="crm-form"><h2>Control de carga en el CRM empresarial</h2>'
    +select('status','Estado',['pendiente','cargado','no_cargar'],v.crm_status,'Seleccionar')
    +'<label class="field">Notas internas<textarea name="note" rows="3">'+esc(v.crm_note||'')+'</textarea></label>'
    +'<p class="muted">Marcar como cargado es una constancia manual; esta acción no transmite información al CRM de la empresa.</p>'
    +'<button class="btn primary">Guardar estado</button></form>';
}
function bindCrm(v) {
  document.getElementById('crm-form').onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));
    try{await api('/visits/'+v.id+'/crm',{method:'PUT',body:JSON.stringify(f)});status('Estado actualizado.','success');state.current=null;await home();}
    catch(e){status(e.message);}
  };
}
boot();
