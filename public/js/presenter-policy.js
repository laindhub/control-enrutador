(() => {
 const form=document.getElementById('lead-policy-form');if(!form)return;
 const status=document.getElementById('lead-policy-status'),refresh=document.getElementById('lead-policy-refresh');
 const month=form.elements.namedItem('month'),save=form.querySelector('[type=submit]');
 let loadedMonth='',loading=false,saving=false,sequence=0;
 function message(text,error=false){status.textContent=text;status.className=error?'form-error':'muted';}
 function controls(disabled){form.querySelectorAll('input,button').forEach(node=>node.disabled=disabled);refresh.disabled=disabled;}
 async function api(path,body){
  const response=await fetch('/api/presenters'+path,{method:body?'POST':'GET',credentials:'same-origin',signal:AbortSignal.timeout(25000),
   headers:{'Content-Type':'application/json','x-csrf-token':document.querySelector('meta[name="csrf-token"]').content},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo guardar el esquema.');return result;
 }
 async function load(){
  if(saving)return;const request=++sequence;loading=true;controls(true);message('Cargando metas…');
  try{
   const state=await api('/lead-policy'+(month.value?'?month='+encodeURIComponent(month.value):''));if(request!==sequence)return;
   month.value=state.month;loadedMonth=state.month;
   for(const [key,value]of Object.entries(state.policy)){
    const input=form.elements.namedItem(key);if(input)input.value=key==='basic'||key==='basicRate'?state.policy.basic>0?value:'':value;
   }
   message(state.policy.basic>0?'Esquema cargado. Los cambios se aplicarán desde el mes elegido.':'Básico todavía no está configurado. Completá su meta y valor antes de guardar; los cálculos actuales se mantienen.');
  }catch(error){if(request===sequence){loadedMonth='';message('No se pudieron cargar las metas. '+error.message,true);}}
  finally{if(request===sequence){loading=false;controls(false);save.disabled=loadedMonth!==month.value;}}
 }
 month.addEventListener('change',load);refresh.addEventListener('click',load);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(loading||saving||loadedMonth!==month.value)return;
  const body=Object.fromEntries(new FormData(form));
  const b=Number(body.basic),u=Number(body.unlock),e=Number(body.elite);
  if(b>u||u>e){message('Las metas deben seguir el orden Básico, Desbloqueo y Élite.',true);return;}
  if(Number(body.basicRate)>Number(body.baseRate)||Number(body.baseRate)>Number(body.eliteRate)){
   message('Los valores deben seguir el orden Básico, Desbloqueo y Élite.',true);return;
  }
  saving=true;controls(true);message('Guardando metas…');
  try{
   await api('/lead-policy',body);message('Básico, Desbloqueo y Élite guardados para '+body.month+'.');
   window.dispatchEvent(new CustomEvent('md-lead-policy-updated',{detail:{month:body.month}}));
  }catch(error){message('No se pudo confirmar el guardado. Actualizá para comprobar el esquema antes de reintentar. '+error.message,true);}
  finally{saving=false;controls(false);}
 });
 load();
})();
