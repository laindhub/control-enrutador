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

/* Clases y estructura de las capturas originales de Liniers.
 * original.css es el Tailwind compilado recuperado de la aplicación; estas
 * clases se aplican directamente al DOM en vez de simularlas con un tema nuevo. */
const uiOriginal = Object.freeze({
  main:'mx-auto w-full max-w-lg flex-1 px-4 py-6',
  login:'mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8',
  h1:'text-3xl leading-tight font-medium tracking-tight',
  h2:'text-lg font-medium',
  muted:'text-muted-foreground text-lg leading-snug',
  meta:'text-muted-foreground text-salon-meta leading-snug',
  label:'text-muted-foreground flex flex-wrap gap-x-2 text-salon-meta',
  input:'w-full rounded-field-mobile border border-border bg-surface px-4 py-3 text-salon-option outline-none caret-brand placeholder:text-muted-foreground focus:border-foreground aria-[invalid=true]:border-alert disabled:bg-pressed disabled:text-muted-foreground h-14',
  choice:'rounded-field-mobile flex cursor-pointer items-center border transition-colors min-h-11 gap-1.5 px-1.5 py-0.5 text-[13px] leading-tight active:bg-pressed border-border bg-surface',
  choiceLarge:'rounded-field-mobile flex cursor-pointer items-center border transition-colors min-h-[58px] gap-3 px-4 py-2.5 text-salon-option active:bg-pressed border-border bg-surface',
  person:'rounded-card-mobile bg-surface border shadow-card active:bg-pressed flex w-full items-center gap-4 p-4 text-left transition-colors duration-150',
  avatar:'bg-id-red-tint text-id-red-text rounded-pill flex size-12 shrink-0 items-center justify-center text-[19px] font-medium',
  submit:'rounded-field-mobile inline-flex w-full items-center justify-center gap-2.5 text-center transition-colors duration-150 outline-none select-none bg-brand-deep text-on-brand shadow-lift min-h-[52px] px-4 font-medium',
  chapter:'bg-background -mx-4 sticky top-12 z-10 flex items-center justify-center gap-1 border-b px-4 py-1',
});
const salonHomeIcon='<svg aria-hidden="true" class="shrink-0 size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.5"></rect><path d="M7 15.4V9.9l5-3.4 5 3.4v5.5" stroke-linejoin="round"></path></svg>';
const checkMark='<svg aria-hidden="true" class="size-3" viewBox="0 0 12 12" fill="none"><path d="M2 6.5 4.8 9 10 3.5" stroke="var(--on-brand)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path></svg>';

async function api(url, options = {}) {
  const headers = {'Content-Type':'application/json',...(options.headers||{})};
  const write = !['GET','HEAD','OPTIONS'].includes(String(options.method||'GET').toUpperCase());
  if(write && state.user?.csrf) headers['X-Respaldo-CSRF'] = state.user.csrf;
  const res = await fetch('/respaldo/api'+url,{credentials:'same-origin',...options,headers});
  let data={};try{data=await res.json()}catch{}
  if(!res.ok) {const error=new Error(data.error||('Error '+res.status));error.status=res.status;throw error;}
  return data;
}
function status(message,type='error') {
  const notice=document.createElement('div');notice.className='notice '+type;
  notice.textContent=message;document.body.appendChild(notice);
  setTimeout(()=>notice.remove(),5000);
}
function wire(id,callback) {
  const button=document.querySelector('[data-action="'+id+'"]');
  if(button)button.addEventListener('click',callback);
}
const roleLabels={admin:'Administración',recepcion:'Ingreso',pretest:'Pre-test',fulltest:'Full-test',enrutador:'Enrutador',asesor:'Conversión'};
const promoterRoster=['Ariel Mendez','Nicolas Jimenez','Camila Basiukevitz','Prueba T 1','Hanna Mendez','Prueba T2','Karina Acosta','Prueba T3','Laura Zangaro','Prueba T4','Luciano Barraza','Prueba T5','Luz Vigliano','Samira Morales','Martina Montiel','Sofia Mitre','Melina Acuña','Trinidad Silva','Nadia Chavez'];
const actionButton=(label,id,kind='')=>'<button type="button" class="salon-button '+kind+'" data-action="'+esc(id)+'">'+esc(label)+'</button>';
const initials=name=>String(name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const timeline=v=>'<p class="salon-meta">Entró '+fmt(v.created_at)+' · '+esc(v.source||'')+(v.promoter?' · la trajo '+esc(v.promoter):'')+'</p>';
let rosterNonce='';
let roster=[];
async function boot() {
  try {await api('/health');}catch(error){showSetupError(error);return;}
  try{
    state.user=await api('/me');
    state.users=await api('/users');
    await home();
  }catch(error){
    if(error.status===401) {state.user=null;await showRoster();return;}
    showSetupError(error);
  }
}
function showSetupError(error) {
  app.innerHTML='<main class="salon-page"><div class="salon-content"><div class="salon-wordmark">Más <strong>Dueños</strong><span>Salón</span></div>'
  +'<h1>Respaldo no disponible</h1><p>'+esc(error.message)+'</p>'
  +'<a class="salon-button" href="/login">Volver al inicio</a></div></main>';
}
async function showRoster() {
  try {const result=await api('/people'); roster=result.people;rosterNonce=result.nonce;renderRoster();}
  catch(error){showSetupError(error);}
}
function renderRoster() {
  app.innerHTML='<main class="'+uiOriginal.login+'">'
    +'<div class="mb-8 flex items-center gap-2.5"><span class="inline-flex items-center gap-2 text-h2">'
    +salonHomeIcon+'<span class="wordmark leading-none"><span class="font-normal">Más</span> Dueños</span></span>'
    +'<span class="text-muted-foreground text-small">Salón · Respaldo</span></div>'
    +'<div class="space-y-6"><div class="space-y-1.5"><h1 class="'+uiOriginal.h1+'">¿Quién sos?</h1>'
    +'<p class="'+uiOriginal.muted+'">Tocá tu nombre para entrar.</p></div>'
    +'<div class="relative salon-search"><svg aria-hidden="true" class="lucide text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>'
    +'<input id="roster-search" class="'+uiOriginal.input+' pl-12" type="search" placeholder="Buscá tu nombre" aria-label="Buscá tu nombre" autocomplete="off"></div>'
    +'<ul class="space-y-3" id="roster-results" aria-label="Personal de Liniers"></ul>'
    +'<p class="text-muted-foreground text-salon-meta">Elegí únicamente tu nombre. Administración gestiona los puestos habilitados.</p>'
    +'<a href="/login" class="text-muted-foreground hover:text-foreground text-small underline underline-offset-4">Volver al inicio</a>'
    +'</div></main>';
  const search=document.getElementById('roster-search');
  const list=document.getElementById('roster-results');
  function draw(){
    const query=search.value.toLocaleLowerCase('es').trim();
    const people=roster.filter(person=>person.name.toLocaleLowerCase('es').includes(query));
    list.innerHTML=people.map(person=>'<li><button type="button" class="'+uiOriginal.person+'" data-person="'+person.id+'">'
      +'<span aria-hidden="true" class="'+uiOriginal.avatar+'">'+esc(initials(person.name))+'</span>'
      +'<span class="min-w-0 flex-1"><span class="block text-salon-row leading-snug font-medium">'+esc(person.name)+'</span>'
      +'<span class="text-muted-foreground block truncate text-salon-meta leading-snug">Liniers</span></span>'
      +'</button></li>').join('') || '<li class="salon-empty">No encontramos a esa persona.</li>';
    list.querySelectorAll('[data-person]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;
      try{
        await api('/enter',{method:'POST',body:JSON.stringify({id:Number(button.dataset.person),nonce:rosterNonce})});
        state.user=await api('/me');state.users=await api('/users');
        state.view=state.user.role;await home();
      }catch(error){status(error.message);await showRoster();}
    });
  }
  search.addEventListener('input',draw);draw();
}
function header() {
  return '<header class="bg-background border-border-row sticky top-0 z-10 border-b salon-top">'
    +'<div class="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-2.5">'
    +'<span class="inline-flex items-center gap-2 text-h2">'+salonHomeIcon
    +'<span class="font-medium">Salón</span></span>'
    +'<span class="text-muted-foreground inline-flex min-w-0 flex-1 items-center justify-end gap-2 text-small">'
    +'<span class="rounded-pill bg-id-red-tint text-id-red-text inline-flex size-8 shrink-0 items-center justify-center text-small font-medium">'+esc(initials(state.user.name))+'</span>'
    +'<span class="truncate">'+esc(state.user.name.split(' ')[0])+' · Liniers</span></span>'
    +'<button type="button" class="text-muted-foreground hover:text-foreground flex min-h-11 items-center px-1 text-small" data-action="logout">Salir</button>'
    +'</div></header>';
}
function page(content,wide=false) {
  const operator=state.user.role!=='admin';
  app.innerHTML='<div class="salon-layout">'+header()
    +'<main class="'+uiOriginal.main+(wide?' salon-wide':'')+'">'+content+'</main>'
    +(operator?'<nav class="bg-background border-border sticky bottom-0 z-10 order-last grid auto-cols-fr grid-flow-col border-t pb-[env(safe-area-inset-bottom)] salon-bottomnav" aria-label="Navegación del salón">'
      +[['Puestos','puestos'],['Hoy','hoy'],['Yo','yo']].map(([label,screen])=>'<button type="button" class="salon-navitem'+((state.secondaryView||'puestos')===screen?' current':'')+'" data-screen="'+screen+'">'+label+'</button>').join('')
      +'</nav>':'')+'</div>';
  wire('logout',async()=>{
    try{await api('/logout',{method:'POST',body:'{}'});}
    catch(error){status(error.message);return;}
    state.user=null;state.current=null;state.view='';state.secondaryView='puestos';await showRoster();
  });
  document.querySelectorAll('[data-screen]').forEach(el=>el.onclick=()=>{
    state.secondaryView=el.dataset.screen;renderHome();
  });
}
function home() {
  try{state.visits=await api('/visits'+(state.search?'?search='+encodeURIComponent(state.search):''));}
  catch(error){if(error.status===401){state.user=null;await showRoster();return;}showSetupError(error);return;}
  state.view=state.user.role;
  state.current=null;
  renderHome();
}
function renderHome() {
  if(state.view==='admin'){renderAdmin();return;}
  if(state.view==='recepcion'){renderReception();return;}
  page('<div class="salon-intro"><h1>'+esc(roleLabels[state.view])+'</h1>'
    +'<p>'+({pretest:'Tomar el pre-test',fulltest:'Tomar el Test del Dueño',enrutador:'Charla y derivación',asesor:'Confirmar si la persona se sentó'}[state.view]||'')+'</p></div>'
    +pendingList());
  wire('refresh',()=>home());
  document.querySelectorAll('[data-visit]').forEach(button=>button.onclick=()=>openVisit(button.dataset.visit));
}
function pendingList() {
  const role=state.view;
  const wait=state.visits.filter(v=>role==='pretest'?v.phase==='pretest':role==='fulltest'?v.phase==='fulltest':
    role==='enrutador'?v.phase==='enrutacion':role==='asesor'?v.phase==='asesor':false);
  return '<div class="salon-counters"><span><strong>'+wait.length+'</strong> En espera</span>'
    +'<span><strong>0</strong> Perdidos</span><span><strong>0</strong> Atendidas</span></div>'
    +'<div class="salon-list-heading"><h2>En espera</h2>'+actionButton('Actualizar lista','refresh','link')+'</div>'
    +(wait.length?'<ul class="salon-visit-list">'+wait.map(v=>'<li><button class="salon-visit" data-visit="'+esc(v.id)+'">'
    +'<span class="salon-avatar">'+esc(initials(v.visitor_name))+'</span>'
    +'<span class="salon-visit-details"><strong>'+esc(v.visitor_name)+'</strong><small>'+esc(v.source||'')+' · '+esc(v.promoter||'Liniers')+'</small></span>'
    +'<span class="salon-chevron">›</span></button></li>').join('')+'</ul>':
    '<p class="salon-empty">No hay personas en espera por el momento.</p>');
}
function renderReception() {
  page('<button class="salon-back" data-action="home-tools">← Herramientas</button>'
    +'<h1 class="salon-h1">Ingreso</h1><form id="checkin-form" class="salon-form">'
    +formField('visitor_name','Nombre','','text','Nombre de la persona')
    +choices('source','¿Por dónde entró?',sources,'Promotor con ruleta',false,true)
    +'<div id="source-person" class="salon-fieldset"><h2 id="source-person-title">¿Quién la trajo?</h2>'
    +'<input id="source-filter" class="salon-input" type="search" placeholder="Filtrar personal…" autocomplete="off">'
    +'<div class="salon-choices two salon-person-options" id="source-options"></div></div>'
    +choices('continues','¿Siguió adelante?',['Sí, sigue el recorrido',...exitReasons],'Sí, sigue el recorrido',false,false)
    +'<div class="salon-sticky-save"><p>Se va a guardar a tu nombre: <strong>'+esc(state.user.name)+'</strong>.</p>'
    +'<button class="salon-primary" type="submit" id="checkin-submit">Registrar el ingreso</button></div></form>');
  const form=document.getElementById('checkin-form');
  const personSearch=document.getElementById('source-filter');
  let selectedPerson='';
  function showPersonOptions(){
    const channel=new FormData(form).get('source');
    const names=channel==='Vino a ver a su asesor'
      ? state.users.filter(u=>u.role==='asesor').map(u=>u.name) : promoterRoster;
    document.getElementById('source-person-title').textContent=channel==='Vino a ver a su asesor'
      ? '¿A quién vino a ver?' : '¿Quién la trajo?';
    const query=personSearch.value.trim().toLowerCase();
    document.getElementById('source-options').innerHTML=names.filter(name=>name.toLowerCase().includes(query))
      .map(name=>'<label class="salon-choice"><input type="radio" name="promoter" value="'+esc(name)+'"'
        +(selectedPerson===name?' checked':'')+'><span class="salon-choice-circle">✓</span><span>'+esc(name)+'</span></label>').join('');
  }
  function update(){
    const channel=new FormData(form).get('source');
    document.getElementById('source-person').hidden=!['Promotor con ruleta','Vino a ver a su asesor'].includes(channel);
    showPersonOptions();
    const next=new FormData(form).get('continues')==='Sí, sigue el recorrido';
    document.getElementById('checkin-submit').textContent=next?'Registrar el ingreso':'Registrar que no pasó';
  }
  form.addEventListener('change',event=>{
    if(event.target.name==='promoter') selectedPerson=event.target.value;
    if(event.target.name==='source') {selectedPerson='';personSearch.value='';}
    update();
  });
  personSearch.addEventListener('input',showPersonOptions);
  update();
  form.onsubmit=async e=>{
    e.preventDefault();const f=new FormData(form);
    const continues=f.get('continues')==='Sí, sigue el recorrido';
    try{
      await api('/visits',{method:'POST',body:JSON.stringify({visitor_name:String(f.get('visitor_name')||'').trim(),
        source:f.get('source'),promoter:f.get('promoter')||'',continues,
        exit_reason:continues?'':f.get('continues')})});
      status('Ingreso registrado.','success');await home();
    }catch(error){status(error.message);}
  };
  wire('home-tools',()=>renderTools());
}
function renderTools() {
  page('<h1>Herramientas</h1><p>Recepción · Liniers</p>'
    +'<button class="salon-person" data-action="start-reception">Ingreso <span>›</span></button>');
  wire('start-reception',renderReception);
}
function formField(key,title,value='',type='text',placeholder='—'){
  return '<div class="space-y-1.5 salon-field"><label for="input-'+esc(key)+'" class="'+uiOriginal.label+'">'+esc(title)+'</label>'
    +'<input class="'+uiOriginal.input+'" id="input-'+esc(key)+'" autocomplete="off"'
    +' type="'+esc(type)+'" name="'+esc(key)+'" placeholder="'+esc(placeholder)+'"'
    +' value="'+esc(value??'')+'"'+(type==='number'?' min="0" step="1" inputmode="numeric"':'')+'></div>';
}
function choices(key,title,values,current=null,multi=false,columns=false,description=''){
  const listClass=columns?'grid grid-cols-2 gap-1.5':'flex flex-wrap gap-2';
  const wide=!columns&&values.length<=4&&String(key)==='outcome';
  const optionClass=wide?uiOriginal.choiceLarge:uiOriginal.choice;
  return '<fieldset class="scroll-mt-28 space-y-3 salon-fieldset"><legend class="space-y-1">'
    +'<span class="block text-lg leading-snug font-medium">'+esc(title)+'</span>'
    +(description?'<small class="text-muted-foreground text-salon-meta">'+esc(description)+'</small>':'')
    +'</legend><div class="'+listClass+' salon-options">'
    +values.map(value=>{
      const checked=multi?Array.isArray(current)&&current.includes(value):current===value;
      return '<label class="'+optionClass+' salon-choice'+(checked?' is-checked':'')+'">'
        +'<input class="sr-only" type="'+(multi?'checkbox':'radio')+'" name="'+esc(key)+'" value="'+esc(value)+'"'+(checked?' checked':'')+'>'
        +'<span aria-hidden="true" class="flex size-[22px] shrink-0 items-center justify-center rounded-pill border transition-colors border-border bg-surface salon-choice-indicator">'+checkMark+'</span>'
        +'<span class="min-w-0"><span class="block leading-snug">'+esc(value)+'</span></span>'
        +'</label>';
    }).join('')+'</div></fieldset>';
}
function openVisit(id) {
  try{
    state.current=await api('/visits/'+encodeURIComponent(id));
    state.answers=state.current.fulltest_json||{};
    state.chapter=0;
    renderVisit();
  }catch(error){status(error.message);}
}
function renderVisit() {
  const v=state.current;if(!v)return home();
  let content='<button class="salon-back" data-action="back-queue">← '+esc(roleLabels[state.view])+'</button>';
  if(state.view==='pretest')content+=pretestPage(v);
  if(state.view==='fulltest')content+=fulltestPage(v);
  if(state.view==='enrutador')content+=routingPage(v);
  if(state.view==='asesor')content+=conversionPage(v);
  page(content,state.view==='fulltest');
  wire('back-queue',()=>{state.current=null;home();});
  if(state.view==='pretest')bindPretest(v);
  if(state.view==='fulltest')bindFulltest(v);
  if(state.view==='enrutador')bindRouting(v);
  if(state.view==='asesor')bindConversion(v);
}
function personTitle(title,v,detail) {
  const first=String(v.visitor_name||'').split(' ')[0];
  return '<div class="space-y-1 salon-intro"><h1 class="'+uiOriginal.h1+'">'+esc(title)+'</h1>'
    +'<p class="'+uiOriginal.muted+'">Con '+esc(first)+'. '+esc(detail)+'</p>'
    +'<p class="'+uiOriginal.meta+'">'+timeline(v)+'</p></div>';
}
function pretestPage(v) {
  const a=v.pretest_json||{},parts=v.visitor_name.trim().split(/\s+/);
  const given=parts[0]||'',last=parts.slice(1).join(' ');
  return personTitle('Pre-test',v,'Ninguna pregunta es obligatoria.')
    +'<form class="salon-form" id="pretest-form"><div class="salon-grid">'
    +formField('given','Nombre',given,'text','Nombre')
    +formField('family','Apellido',last,'text','Apellido')+'</div>'
    +formField('phone','Teléfono · se puede dejar vacío',v.phone||'','tel','+54')
    +pretest.map(q=>choices(q.key,q.label,q.options,a[q.key])).join('')
    +'<div class="salon-sticky-save"><p>Queda tomado por <b>'+esc(state.user.name)+'</b> → visita de '+esc(v.visitor_name)+'.</p>'
    +'<button class="salon-primary" type="submit">Guardar el pre-test</button></div></form>';
}
function bindPretest(v){
  document.getElementById('pretest-form').onsubmit=async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget),answers={};
    pretest.forEach(q=>answers[q.key]=f.get(q.key)||null);
    const name=[f.get('given'),f.get('family')].filter(Boolean).join(' ').trim();
    try {
      await api('/visits/'+v.id+'/pretest',{method:'PUT',body:JSON.stringify({
        visitor_name:name,phone:f.get('phone')||'',answers,
      })});
      status('Pre-test guardado.','success');await home();
    }catch(error){status(error.message);}
  };
}
function fulltestQuestion(q, a) {
  const [key,title,options,mode]=q;
  return Array.isArray(options)?choices(key,title,options,a[key],mode==='multi'):
    formField(key,title,a[key]??'',options==='number'?'number':options==='email'?'email':'text');
}
function optionalQuestions(a){
  const x=[];
  if(a.tiene_ahorros==='Sí')x.push(['ahorro_efectivo_ars','Efectivo en pesos','number'],['ahorro_efectivo_usd','Efectivo en dólares','number'],['ahorro_vehiculos_usd','Vehículos en dólares','number'],['ahorro_propiedades_usd','Propiedades en dólares','number']);
  if(['Casa','PH'].includes(a.tipo_propiedad))x.push(['viviria_en_departamento','¿Podrías vivir en un departamento?',['Sí, totalmente.','Sí, podría ser.','No creo.','No, ni loco.']]);
  if(['Relación de dependencia','Independiente'].includes(a.situacion_laboral))x.push(['trabajo_en_blanco','¿Estás en blanco?',['Sí','No','En parte','No contestó']],['trabajo','¿De qué trabajás?','text']);
  if(a.quien_decide==='Yo y alguien más')x.push(['acompanante_presente','¿Está presente la otra persona?',yesNoUnknown]);
  return x;
}
function chapterQuestions(){
  const n=state.chapter;
  const extra=optionalQuestions(state.answers).filter(q=>
    (n===1&&q[0]==='viviria_en_departamento')||
    (n===2&&q[0].startsWith('ahorro_'))||
    (n===3&&['trabajo_en_blanco','trabajo','acompanante_presente'].includes(q[0])));
  return [...fields[n].questions,...extra];
}
function fulltestPage(v){
  const names=['Conociendo a la persona','La propiedad soñada','Punto de partida','¿Disponible para ser dueño/a?','Últimas preguntas'];
  const tally=fields.flatMap(c=>c.questions).filter(q=>{
    const a=state.answers[q[0]];
    return a!==null&&a!==undefined&&a!==''&&(!Array.isArray(a)||a.length>0);
  }).length;
  return '<div class="salon-operated">Operando: <strong>'+esc(state.user.name)+'</strong></div>'
    +personTitle('Full-test',v,'El Test del Dueño. Ninguna pregunta es obligatoria.')
    +'<form id="fulltest-form" class="salon-form">'
    +'<nav class="salon-chapters" aria-label="Capítulos">'+names.map((name,i)=>'<span class="salon-chapter '+(i===state.chapter?'current':i<state.chapter?'past':'')+'" title="'+esc(name)+'">'+(i+1)+'</span>').join('')+'</nav>'
    +'<div class="salon-chapter-title"><small>Capítulo '+(state.chapter+1)+' de 5</small><h2>'+esc(names[state.chapter])+'</h2><small>'+tally+' de 23 preguntas contestadas</small></div>'
    +chapterQuestions().map(q=>fulltestQuestion(q,state.answers)).join('')
    +'<div class="salon-sticky-save salon-form-actions">'
    +actionButton('Descartar','cancel-test','text')+actionButton('No terminó','save-draft','outline')
    +'<button class="salon-primary" type="submit">'+(state.chapter===4?'Enviar':'Siguiente paso: '+esc(names[state.chapter+1]))+'</button></div></form>';
}
function collectAnswers(){
  const form=document.getElementById('fulltest-form');if(!form)return;
  const f=new FormData(form);
  for(const q of chapterQuestions()){
    if(q[3]==='multi')state.answers[q[0]]=f.getAll(q[0]);
    else {
      const v=f.get(q[0]);
      if(v!==null)state.answers[q[0]]=q[2]==='number'?(v===''?null:Number(v)):(v||null);
    }
  }
}
function bindFulltest(v){
  const form=document.getElementById('fulltest-form');
  form.querySelectorAll('input').forEach(el=>{
    if(['tiene_ahorros','tipo_propiedad','situacion_laboral','quien_decide'].includes(el.name))
      el.addEventListener('change',()=>{collectAnswers();renderVisit();});
  });
  wire('cancel-test',()=>{if(confirm('¿Descartar los cambios no guardados?'))home();});
  const save=async complete=>{
    collectAnswers();
    try{await api('/visits/'+v.id+'/fulltest',{method:'PUT',body:JSON.stringify({answers:state.answers,complete})});return true;}
    catch(error){status(error.message);return false;}
  };
  wire('save-draft',async()=>{if(await save(false)){status('Borrador guardado.','success');await home();}});
  form.onsubmit=async e=>{
    e.preventDefault();const complete=state.chapter===4;
    if(await save(complete)){
      if(complete){status('Full-test enviado.','success');await home();}
      else{state.chapter++;renderVisit();}
    }
  };
}
const speakersRoster=['Keren Botini','Nicolas Espinosa','Nicole Laquinta','Thomas Nuñez','Katherine Puppo','Priscila Zajama'];
function routingPage(v){
  const advisor=state.users.filter(u=>u.role==='asesor');
  return personTitle('Charla y derivación',v,'Registrá cómo le fue en la charla y, si corresponde, elegí el asesor que la va a atender.')
    +'<form class="salon-form" id="route-form">'
    +choices('outcome','¿Cómo le fue en la charla?',['La vio entera','La vio entera, pero no se deriva','Se fue en medio de la charla','No se quedó'])
    +choices('speaker','¿Quién dio la charla?',speakersRoster)
    +choices('product','¿Qué producto?',['PAI','Pozo'],'PAI')
    +'<fieldset class="salon-fieldset"><legend>¿A qué asesor la derivás?</legend><input class="salon-input" id="advisor-filter" placeholder="Filtrar asesores…" type="search">'
    +'<div id="advisor-list" class="salon-choices advisor-choices">'+advisor.map(u=>'<label class="salon-choice" data-advisor-name="'+esc(u.name.toLowerCase())+'">'
    +'<input type="radio" name="advisor_id" value="'+u.id+'"><span class="salon-choice-circle">✓</span><span>'+esc(u.name)+'</span></label>').join('')+'</div></fieldset>'
    +'<div id="reason-list">'+choices('reason','¿Por qué no continuó?',exitReasons)+'</div>'
    +'<p class="salon-meta">Lo firma tu sesión: <strong>'+esc(state.user.name)+'</strong>, sobre la visita de '+esc(v.visitor_name)+'.</p>'
    +'<button class="salon-primary" type="submit">Confirmar derivación</button></form>';
}
function bindRouting(v){
  const form=document.getElementById('route-form'),filter=document.getElementById('advisor-filter');
  function toggle(){const x=new FormData(form).get('outcome');document.getElementById('reason-list').hidden=x==='La vio entera';}
  form.addEventListener('change',toggle);toggle();
  filter.addEventListener('input',()=>{
    const q=filter.value.toLowerCase();
    form.querySelectorAll('[data-advisor-name]').forEach(x=>x.hidden=!x.dataset.advisorName.includes(q));
  });
  form.onsubmit=async e=>{
    e.preventDefault();const f=new FormData(form);
    const outcomes={'La vio entera':'entera','La vio entera, pero no se deriva':'entera_no_deriva',
      'Se fue en medio de la charla':'se_fue','No se quedó':'no_se_quedo'};
    try{
      await api('/visits/'+v.id+'/route',{method:'PUT',body:JSON.stringify({
        outcome:outcomes[f.get('outcome')],advisor_id:f.get('advisor_id')||null,
        speaker:f.get('speaker'),product:f.get('product'),reason:f.get('reason')||'',
      })});
      status('Derivación registrada.','success');await home();
    }catch(error){status(error.message);}
  };
}
function conversionPage(v){
  return personTitle('Conversión',v,'Confirmá únicamente si la persona se sentó con el asesor.')
    +'<div class="salon-fieldset"><h2>¿La persona se sentó con vos?</h2>'
    +'<div class="salon-choices two">'
    +actionButton('Sí, se sentó','seated-yes','salon-convert-yes')
    +actionButton('No se sentó','seated-no','salon-convert-no')
    +'</div><p class="salon-meta">Esta confirmación no registra ventas ni reservas.</p></div>';
}
function bindConversion(v){
  for(const [name,value] of [['seated-yes',true],['seated-no',false]])
    wire(name,async()=>{
      if(!confirm('¿Confirmás que '+v.visitor_name+(value?' sí se sentó':' no se sentó')+'?'))return;
      try{await api('/visits/'+v.id+'/conversion',{method:'PUT',body:JSON.stringify({seated:value})});
        status('Conversión guardada.','success');await home();}
      catch(error){status(error.message);}
    });
}
function renderAdmin(){
  const results=state.visits, pending=results.filter(x=>x.crm_status==='pendiente').length;
  page('<div class="salon-admin"><div class="salon-intro"><h1>Administración del respaldo</h1>'
    +'<p>Consulta y carga manual de leads. La atención del salón se realiza desde la selección de personas.</p></div>'
    +'<div class="salon-stats"><div><strong>'+results.length+'</strong><small>Visitas registradas</small></div>'
    +'<div><strong>'+pending+'</strong><small>Pendientes de cargar en CRM empresarial</small></div></div>'
    +'<section class="admin-section"><h2>CRM propio</h2>'
    +'<p>No existe ningún envío automático al CRM de Más Dueños.</p>'
    +'<div class="salon-search-tools"><input id="search-leads" class="salon-input" placeholder="Buscar por nombre o teléfono" value="'+esc(state.search)+'">'
    +actionButton('Buscar','search-leads')+'<a class="salon-button" href="/respaldo/api/export">Exportar JSON</a></div>'
    +'<div class="salon-visit-list">'+results.map(x=>'<button class="salon-visit" data-crm="'+esc(x.id)+'">'
    +'<span class="salon-avatar">'+esc(initials(x.visitor_name))+'</span><span class="salon-visit-details"><strong>'+esc(x.visitor_name)+'</strong>'
    +'<small>'+fmt(x.created_at)+' · '+esc(x.phase)+'</small></span>'+tag(x.crm_status)+'</button>').join('')
    +'</div></section>'
    +'<section class="admin-section"><h2>Personal habilitado</h2><p>El personal entra al respaldo seleccionando su nombre. No se utilizan PIN.</p>'
    +'<form id="operator-form" class="salon-form">'
    +formField('name','Nombre del empleado','','text','Nombre y apellido')
    +'<label class="salon-field"><span class="salon-label">Puesto</span><select class="salon-input" name="role">'
    +Object.keys(userRoles).filter(k=>k!=='admin').map(k=>'<option value="'+k+'">'+esc(userRoles[k])+'</option>').join('')+'</select></label>'
    +'<button class="salon-primary">Agregar empleado</button></form>'
    +'<div id="staff-list" class="salon-staff-list">'+state.users.filter(u=>u.role!=='admin').map(u=>'<div class="salon-staff-row" data-staff="'+u.id+'">'
    +'<label class="salon-field"><span class="salon-label">Empleado</span><input class="salon-input" name="name" value="'+esc(u.name)+'"></label>'
    +'<label class="salon-field"><span class="salon-label">Puesto</span><select class="salon-input" name="role">'
    +Object.keys(userRoles).filter(k=>k!=='admin').map(k=>'<option value="'+k+'"'+(u.role===k?' selected':'')+'>'+esc(userRoles[k])+'</option>').join('')+'</select></label>'
    +'<label class="salon-toggle"><input name="active" type="checkbox"'+(u.active?' checked':'')+'> Habilitado</label>'
    +'<button class="salon-button" type="button" data-save-staff="'+u.id+'">Guardar cambios</button>'
    +'</div>').join('')+'</div>'
    +'</section></div>',true);
  wire('search-leads',()=>{state.search=document.getElementById('search-leads').value;home();});
  document.querySelectorAll('[data-crm]').forEach(el=>el.onclick=()=>openCrm(el.dataset.crm));
  document.querySelectorAll('[data-save-staff]').forEach(button=>button.onclick=async()=>{
    const row=button.closest('[data-staff]');
    const payload={name:row.querySelector('[name=name]').value.trim(),
      role:row.querySelector('[name=role]').value,
      active:row.querySelector('[name=active]').checked};
    try{
      await api('/users/'+button.dataset.saveStaff,{method:'PATCH',body:JSON.stringify(payload)});
      state.users=await api('/users');status('Empleado actualizado.','success');renderAdmin();
    }catch(error){status(error.message);}
  });
  document.getElementById('operator-form').onsubmit=async e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));
    try{await api('/users',{method:'POST',body:JSON.stringify(data)});state.users=await api('/users');
      status('Empleado agregado.','success');renderAdmin();}
    catch(error){status(error.message);}
  };
}
async function openCrm(id){
  try{state.current=await api('/visits/'+id);renderCrm();}
  catch(error){status(error.message);}
}
function renderCrm(){
  const v=state.current;if(!v){renderAdmin();return;}
  const printable=(key,obj)=>'<details class="salon-details"><summary>'+esc(key)+'</summary>'
    +'<dl>'+Object.entries(obj||{}).map(([k,val])=>'<dt>'+esc(k)+'</dt><dd>'+esc(Array.isArray(val)?val.join(', '):(val??'—'))+'</dd>').join('')+'</dl></details>';
  page('<button class="salon-back" data-action="back-admin">← Administración</button>'
    +'<div class="salon-intro"><h1>'+esc(v.visitor_name)+'</h1>'+timeline(v)+'</div>'
    +'<section class="admin-section"><h2>Ficha completa del lead</h2>'
    +'<p><strong>Teléfono:</strong> '+esc(v.phone||'No informado')+' · <strong>Promotor:</strong> '+esc(v.promoter||'—')+'</p>'
    +printable('Pre-test',v.pretest_json)+printable('Test del Dueño',v.fulltest_json)
    +printable('Enrutación',v.routing_json)
    +'<p><strong>¿Se sentó con el asesor?</strong> '+(v.seated==null?'Pendiente':v.seated?'Sí':'No')+'</p></section>'
    +'<form id="crm-form" class="admin-section"><h2>Carga manual al CRM empresarial</h2>'
    +'<label class="salon-field"><span class="salon-label">Estado</span><select name="status" class="salon-input">'
    +['pendiente','cargado','no_cargar'].map(s=>'<option value="'+s+'"'+(v.crm_status===s?' selected':'')+'>'+esc(s==='no_cargar'?'No cargar':s[0].toUpperCase()+s.slice(1))+'</option>').join('')+'</select></label>'
    +'<label class="salon-field"><span class="salon-label">Nota interna</span><textarea class="salon-input" name="note">'+esc(v.crm_note||'')+'</textarea></label>'
    +'<p>Esta acción solo marca el estado. Administración carga el lead manualmente fuera del respaldo.</p>'
    +'<button class="salon-primary">Guardar estado</button></form>',true);
  wire('back-admin',()=>{state.current=null;renderAdmin();});
  document.getElementById('crm-form').onsubmit=async e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));
    try{await api('/visits/'+v.id+'/crm',{method:'PUT',body:JSON.stringify(data)});
      status('Estado actualizado.','success');await home();}
    catch(error){status(error.message);}
  };
}
boot();
