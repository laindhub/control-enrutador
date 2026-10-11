(() => {
  'use strict';
  if (location.origin !== 'https://liniers.xn--somosmasdueos-skb.com' || window.__mdActivityIntegration) return;
  window.__mdActivityIntegration = true;
  const touchStyle = document.createElement('style');
  touchStyle.textContent = '*{-webkit-tap-highlight-color:transparent}button,a,summary,[role="button"]{-webkit-user-select:none;user-select:none}:focus:not(:focus-visible){outline:none}';
  document.documentElement.append(touchStyle);
  touchStyle.textContent += '[data-md-activity-tab="sales"]>:not(#md-activity-tabs):not(#md-activity-tabs-spacer):not(#md-sales-integration):not(:has(#md-sales-integration)){display:none!important}[data-md-activity-tab="sales"] :has(#md-sales-integration)>:not(#md-sales-integration):not(:has(#md-sales-integration)){display:none!important}#md-activity-tabs{display:flex;gap:0;border-bottom:1px solid #e5e5e5;margin:0 0 24px}#md-activity-tabs button{flex:1;padding:16px 12px;border:0;border-bottom:2px solid transparent;background:white;color:#666;font:inherit;font-weight:500;cursor:pointer}#md-activity-tabs button[aria-selected="true"]{color:#111;border-bottom-color:#111}';
  // Compact always-visible activity switch immediately below the salon header.
  touchStyle.textContent += '#md-activity-tabs{position:fixed!important;left:0;right:0;width:100%;height:44px;min-height:44px;z-index:90;box-sizing:border-box;margin:0!important;padding:0 16px!important;display:flex!important;align-items:stretch;border-bottom:1px solid #e6e6e6;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.04)}#md-activity-tabs button{height:44px;min-height:44px;padding:0 10px!important;font-size:14px!important;line-height:42px;font-weight:500;border-radius:0!important}#md-activity-tabs-spacer{display:block!important;height:48px;min-height:48px;width:100%;flex-shrink:0;pointer-events:none}';
  let activityMain;
  const ownOrigin = 'https://masduenos.laind.io';
  let scheduled = false;
  let modalStyle, rootOverflow, sectionMinHeight;
  function modal(frame, open) {
    if (open === Boolean(window.__mdSalesModalOpen)) return;
    window.__mdSalesModalOpen = open;
    if (!frame) {
      document.documentElement.style.overflow = rootOverflow || '';
      return;
    }
    if (open) {
      modalStyle = frame.style.cssText;
      sectionMinHeight = frame.parentElement.style.minHeight;
      frame.parentElement.style.minHeight = frame.parentElement.getBoundingClientRect().height + 'px';
      rootOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      frame.style.cssText = 'position:fixed;inset:0;display:block;width:100vw;height:100dvh;border:0;background:white;z-index:2147483647';
    } else {
      frame.style.cssText = modalStyle;
      frame.parentElement.style.minHeight = sectionMinHeight;
      document.documentElement.style.overflow = rootOverflow;
    }
  }
  window.__mdCloseSalesModal = () => {
    const frame = document.getElementById('md-sales-frame');
    if (frame) frame.contentWindow.postMessage({type:'md-sales-close-dialog'}, ownOrigin);
  };
  function monitor(frame, attempt = 0) {
    clearTimeout(frame.mdRetryTimer);
    frame.mdRetryTimer = setTimeout(() => {
      if (document.getElementById('md-sales-frame') !== frame || frame.dataset.ready === '1') return;
      frame.src = ownOrigin + '/presentador/integrado?area='+ (activityMain?.dataset.mdActivityTab || 'leads') +'&retry=' + Date.now();
      monitor(frame, attempt + 1);
    }, Math.min(30000, 5000 * 2 ** Math.min(attempt, 3)));
  }
  function sendSource(frame) {
    if (!frame || !activityMain) return;
    const originalText = [...activityMain.children].filter(el => !['md-activity-tabs','md-sales-integration'].includes(el.id)).map(el => el.innerText || el.textContent || '').join(' ');
    const count = originalText.match(/Derivaciones\s+([\d.]+)/i);
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const month = originalText.match(/mi mes\s*[·•-]?\s*([a-z]+)\s*(?:de\s*)?(\d{4})/i);
    const monthIndex = months.indexOf(month?.[1]?.toLowerCase());
    const header = document.querySelector('header');
    const labels = header ? [...header.querySelectorAll('span,p,div,button')].map(el=>el.textContent.trim()).filter(text=>/·\s*Liniers/.test(text)).sort((a,b)=>a.length-b.length) : [];
    const sourceLabel = labels[0]?.split('·')[0].trim().replace(/^[A-Z]{2}\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/, '');
    if (!count || !month || monthIndex < 0 || !sourceLabel) return;
    const data = {type:'md-lead-source', month:month[2]+'-'+String(monthIndex+1).padStart(2,'0'),quantity:Number(count[1].replace(/\./g,'')),sourceLabel};
    const key=JSON.stringify(data);
    if(frame.dataset.sourceSent===key)return;
    frame.dataset.sourceSent=key;
    frame.contentWindow.postMessage(data,ownOrigin);
  }
  // The salon can render a long React activity timeline. Keep our metrics above
  // "lo que hice" while leaving the original statistics and history untouched.
  function activityHistoryAnchor(main) {
    const nodes = main.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div');
    const title = node => (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const heading = [...nodes].find(node => title(node) === 'lo que hice' &&
      ![...node.children].some(child => title(child) === 'lo que hice'));
    if (!heading) return null;
    let anchor = heading;
    while (anchor.parentElement && anchor.parentElement !== main) {
      const parent = anchor.parentElement;
      const text = (parent.textContent || '').toLowerCase();
      // Do not move the integration ahead of the salon's existing monthly totals.
      if (/\bmi mes\b|\bpasos hoy\b|\bderivaciones\b|de lo que hice/.test(text)) break;
      anchor = parent;
    }
    return anchor;
  }
  function placeIntegration(main, section) {
    const history = activityHistoryAnchor(main);
    if (history && history.parentElement) {
      const parent = history.parentElement;
      if (section.parentElement !== parent || section.nextElementSibling !== history)
        parent.insertBefore(section, history);
    } else if (section.parentElement !== main || main.lastElementChild !== section) {
      main.append(section);
    }
  }
  function positionActivityTabs(tabs) {
    // On phones, the first-party header can vary in height with font and safe areas.
    // Its viewport bottom is the exact position where our fixed strip starts.
    const bottom = document.querySelector('header')?.getBoundingClientRect()?.bottom;
    const top = Number.isFinite(bottom) ? Math.max(0, Math.round(bottom)) : 72;
    const value = top + 'px';
    if (tabs.style.top !== value) tabs.style.top = value;
  }
  function sync() {
    scheduled = false;
    const existing = document.getElementById('md-sales-integration');
    if (location.pathname.replace(/\/$/, '') !== '/floor/activity') {
      if (window.__mdSalesModalOpen) modal(document.getElementById('md-sales-frame'), false);
      if (existing) existing.remove();
      document.getElementById('md-activity-tabs')?.remove();
      document.getElementById('md-activity-tabs-spacer')?.remove();
      if (activityMain) delete activityMain.dataset.mdActivityTab;
      activityMain = undefined;
      return;
    }
    let main = document.querySelector('main');
    if (!main) {
      const title = [...document.querySelectorAll('h1,h2')].find(h => h.textContent.trim() === 'Mi actividad');
      main = title?.parentElement?.parentElement;
    }
    if (!main) return;
    activityMain = main;
    let tabs = document.getElementById('md-activity-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'md-activity-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', 'Mi actividad');
      main.dataset.mdActivityTab = 'leads';
      for (const [key, label] of [['leads','Leads'],['sales','Ventas']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(key === 'leads'));
        button.addEventListener('click', () => {
          main.dataset.mdActivityTab = key;
          for (const child of tabs.children) child.setAttribute('aria-selected', String(child === button));
          const frame=document.getElementById('md-sales-frame');
          if(frame)frame.contentWindow.postMessage({type:'md-activity-area',area:key},ownOrigin);
          sendSource(frame);
          window.dispatchEvent(new Event('resize'));
        });
        tabs.append(button);
      }
      main.prepend(tabs);
    } else if (main.firstElementChild !== tabs) main.prepend(tabs);
    // Keep an in-flow spacer so the pinned tabs never cover the CRM's own metrics.
    let spacer = document.getElementById('md-activity-tabs-spacer');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = 'md-activity-tabs-spacer';
      spacer.setAttribute('aria-hidden', 'true');
    }
    if (tabs.nextElementSibling !== spacer) {
      if (tabs.nextElementSibling) main.insertBefore(spacer, tabs.nextElementSibling);
      else main.append(spacer);
    }
    positionActivityTabs(tabs);
    if (existing) {
      // React can add history entries at any time; keep the panel before the timeline.
      placeIntegration(main, existing);
      sendSource(document.getElementById('md-sales-frame'));
      return;
    }
    const section = document.createElement('section');
    section.id = 'md-sales-integration';
    section.setAttribute('aria-label', 'Mis ventas y comisiones');
    section.style.cssText = 'margin:0;padding:0 0 12px;width:100%;min-width:0';
    const heading = document.createElement('h2');
    heading.textContent = 'Mis ventas y comisiones';
    heading.hidden = true;
    heading.style.cssText = 'font:inherit;font-size:24px;font-weight:600;margin:0 0 8px;color:#111';
    const frame = document.createElement('iframe');
    const status = document.createElement('p');
    status.id = 'md-sales-loading';
    status.textContent = 'Conectando tus ventas…';
    status.setAttribute('role', 'status');
    status.style.cssText = 'margin:12px 0;color:#666;font:inherit';
    frame.id = 'md-sales-frame';
    frame.title = 'Ventas, carpetas y pagos';
    if (window.__mdSalesPrepared !== false) frame.src = ownOrigin + '/presentador/integrado?area=leads';
    frame.style.cssText = 'display:block;width:100%;height:360px;border:0;background:white';
    section.append(heading, status, frame);
    placeIntegration(main, section);
    if (frame.src) monitor(frame);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }
  new MutationObserver(schedule).observe(document.documentElement, {childList:true,subtree:true,characterData:true});
  window.addEventListener('popstate', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', () => {
    const tabs = document.getElementById('md-activity-tabs');
    if (tabs) positionActivityTabs(tabs);
  }, {passive:true});
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function(...args) { const result=original.apply(this,args); schedule(); return result; };
  }
  window.addEventListener('message', event => {
    const frame = document.getElementById('md-sales-frame');
    if (!frame || event.origin !== ownOrigin || event.source !== frame.contentWindow) return;
    if(event.data?.type==='md-leads-ready'){
      delete frame.dataset.sourceSent;
      frame.contentWindow.postMessage({type:'md-activity-area',area:activityMain?.dataset.mdActivityTab||'leads'},ownOrigin);
      sendSource(frame);
    }
    if (event.data?.type === 'md-sales-dialog' && typeof event.data.open === 'boolean') modal(frame, event.data.open);
    if (event.data?.type === 'md-sales-height' && Number.isFinite(event.data.height)) {
      frame.dataset.ready = '1';
      clearTimeout(frame.mdRetryTimer);
      const status = document.getElementById('md-sales-loading');
      if (status) status.hidden = true;
      if (!window.__mdSalesModalOpen) frame.style.height = Math.max(260, Math.min(16000, event.data.height)) + 'px';
    }
  });
  window.addEventListener('md-sales-connected', () => {
    const frame = document.getElementById('md-sales-frame');
    if (frame) {
      frame.dataset.ready = '0';
      frame.src = ownOrigin + '/presentador/integrado?area='+ (activityMain?.dataset.mdActivityTab || 'leads') +'&t=' + Date.now();
      monitor(frame);
    }
  });
  window.addEventListener('md-sales-prepared', () => {
    const frame = document.getElementById('md-sales-frame');
    if (frame && !frame.getAttribute('src')) {
      frame.src = ownOrigin + '/presentador/integrado?area=leads';
      monitor(frame);
    }
  });
  schedule();
})();
