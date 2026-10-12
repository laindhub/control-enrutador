(() => {
  const frame=document.getElementById('crm-frame');
  const status=document.getElementById('load-status');
  const result=document.getElementById('result');
  const floor=document.getElementById('go-floor');
  const visits=document.getElementById('go-visits');
  const link=document.getElementById('open-crm');
  if(!frame||!status||!result||!floor||!visits||!link)return;
  const origin='https://liniers.xn--somosmasdueos-skb.com';
  let timedOut;
  function setRoute(route) {
    const url=origin+(route==='visits'?'/floor/visits':'/floor');
    floor.setAttribute('aria-pressed',String(route!=='visits'));
    visits.setAttribute('aria-pressed',String(route==='visits'));
    status.textContent='Intentando cargar '+(route==='visits'?'Hoy':'Salón')+'…';
    result.textContent='Marcá lo que ves para interpretar la prueba.';
    frame.src=url;
    link.href=url;
    clearTimeout(timedOut);
    timedOut=setTimeout(()=>{
      status.textContent='Si la pantalla sigue vacía, comprobá si aparece un mensaje de bloqueo o rechazo.';
    },12000);
  }
  floor.addEventListener('click',()=>setRoute('floor'));
  visits.addEventListener('click',()=>setRoute('visits'));
  frame.addEventListener('load',()=>{
    clearTimeout(timedOut);
    status.textContent='El navegador procesó la carga. Revisá visualmente si aparece el CRM: este evento no confirma que funcione.';
  });
  frame.addEventListener('error',()=>{
    clearTimeout(timedOut);
    status.textContent='No se pudo procesar la carga del iframe. Probá abrir el CRM por separado.';
  });
  const messages={
    visible:'Resultado: el CRM parece poder visualizarse en un iframe. Ahora comprobá el inicio de sesión y la navegación completa; manipular su contenido con JavaScript sigue restringido por el navegador.',
    login:'Resultado: la incrustación parece funcionar, pero la autenticación podría depender de cookies de terceros. Probá iniciar sesión en una pestaña independiente y repetí la prueba.',
    blocked:'Resultado: el CRM no se muestra dentro del iframe. Podría estar prohibida la incrustación mediante CSP / X-Frame-Options o existir otro bloqueo. Abrilo directamente para comparar.'
  };
  document.querySelectorAll('[data-result]').forEach(button=>{
    button.addEventListener('click',()=>{result.textContent=messages[button.dataset.result]||'';});
  });
  setRoute('floor');
})();
