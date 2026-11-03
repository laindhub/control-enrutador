(() => {
  'use strict';
  if (location.origin !== 'https://liniers.xn--somosmasdueos-skb.com') return;
  if (window.__mdUnifiedNavigation) { window.__mdOpenUnifiedTab?.(); return; }
  window.__mdUnifiedNavigation = true;
  const labels=['puestos','hoy','yo'];
  const normalize=node=>(node.textContent||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
  let controls=[],scheduled=false,lastNotified='';
  const notify=(tab,force=false)=>{
    // The assignment screen has a fixed native Salón selection. Never navigate its
    // main frame just to report a tab: that can abort a streamed Next.js response.
    if (window.__mdUnifiedHideOnly) return;
    if (!labels.includes(tab)||(!force&&lastNotified===tab)) return;
    lastNotified=tab;
    location.href='masduenos://tab/'+tab;
  };
  window.__mdOpenUnifiedTab=()=>{
    const target=window.__mdUnifiedDestination;
    if (!labels.includes(target)) return;
    const node=controls.find(item=>normalize(item)===target);
    if (!node) return; // Keep the request pending through login/React rendering.
    window.__mdUnifiedDestination='';
    node.click();
    notify(target,true);
  };
  function sync(){
    scheduled=false;
    const candidates=[...document.querySelectorAll('a,button,[role="link"],[role="tab"]')];
    let nav=document.querySelector('[data-md-unified-nav="1"]');
    if(!nav){
      const starts=candidates.filter(item=>normalize(item)==='puestos');
      for(const start of starts){
        for(let node=start.parentElement;node&&node!==document.body;node=node.parentElement){
          if(node.tagName==='MAIN')break;
          const rect=node.getBoundingClientRect();
          if(rect.height>180)break;
          if(rect.height<30||rect.bottom<innerHeight-180)continue;
          const local=[...node.querySelectorAll('a,button,[role="link"],[role="tab"]')];
          if(labels.every(label=>local.some(item=>normalize(item)===label))){nav=node;break;}
        }
        if(nav)break;
      }
    }
    if(!nav){controls=[];return;}
    const local=[...nav.querySelectorAll('a,button,[role="link"],[role="tab"]')];
    controls=labels.map(label=>local.find(item=>normalize(item)===label));
    if(controls.some(item=>!item)){controls=[];return;}
    // Hide only the small bottom dock, never the CRM page or a form.
    if(nav.dataset.mdUnifiedNav!=='1'){
      nav.dataset.mdUnifiedNav='1';nav.removeAttribute('data-md-visits-bottom-nav');
      document.querySelector('[data-md-visits-scroll-content]')?.removeAttribute('data-md-visits-scroll-content');
      nav.style.setProperty('display','none','important');
    }
    for(const node of controls){
      if(node.dataset.mdUnifiedControl)continue;
      node.dataset.mdUnifiedControl='1';
      node.addEventListener('click',()=>notify(normalize(node)));
    }
    const path=location.pathname.replace(/\/$/,'');
    const selected=controls.find(node=>node.getAttribute('aria-current')==='page'||node.getAttribute('aria-selected')==='true'||
      (node.getAttribute('href')&&new URL(node.getAttribute('href'),location.href).pathname.replace(/\/$/,'')===path));
    if(selected)notify(normalize(selected));
    else if(path==='/floor/activity')notify('hoy');
    window.__mdOpenUnifiedTab();
  }
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(sync);}};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('popstate',schedule);
  for(const method of ['pushState','replaceState']){
    const original=history[method];
    history[method]=function(...args){const result=original.apply(this,args);schedule();return result;};
  }
  schedule();
})();
