(() => {
  'use strict';
  if (location.origin !== 'https://liniers.xn--somosmasdueos-skb.com' || window.__mdActivityIntegration) return;
  window.__mdActivityIntegration = true;
  const ownOrigin = 'https://masduenos.laind.io';
  let scheduled = false;
  function monitor(frame, attempt = 0) {
    clearTimeout(frame.mdRetryTimer);
    frame.mdRetryTimer = setTimeout(() => {
      if (document.getElementById('md-sales-frame') !== frame || frame.dataset.ready === '1') return;
      frame.src = ownOrigin + '/presentador/integrado?retry=' + Date.now();
      monitor(frame, attempt + 1);
    }, Math.min(30000, 5000 * 2 ** Math.min(attempt, 3)));
  }
  function sync() {
    scheduled = false;
    const existing = document.getElementById('md-sales-integration');
    if (location.pathname.replace(/\/$/, '') !== '/floor/activity') {
      if (existing) existing.remove();
      return;
    }
    let main = document.querySelector('main');
    if (!main) {
      const title = [...document.querySelectorAll('h1,h2')].find(h => h.textContent.trim() === 'Mi actividad');
      main = title?.parentElement?.parentElement;
    }
    if (!main) return;
    if (existing) {
      // React can append its activity after our section while the route finishes loading.
      if (main.lastElementChild !== existing) main.append(existing);
      return;
    }
    const section = document.createElement('section');
    section.id = 'md-sales-integration';
    section.setAttribute('aria-label', 'Mis ventas y comisiones');
    section.style.cssText = 'margin:32px 0 0;padding:28px 0 12px;border-top:1px solid #e5e5e5;width:100%;min-width:0';
    const heading = document.createElement('h2');
    heading.textContent = 'Mis ventas y comisiones';
    heading.style.cssText = 'font:inherit;font-size:24px;font-weight:600;margin:0 0 8px;color:#111';
    const frame = document.createElement('iframe');
    const status = document.createElement('p');
    status.id = 'md-sales-loading';
    status.textContent = 'Conectando tus ventas…';
    status.setAttribute('role', 'status');
    status.style.cssText = 'margin:12px 0;color:#666;font:inherit';
    frame.id = 'md-sales-frame';
    frame.title = 'Ventas, carpetas y pagos';
    if (window.__mdSalesPrepared !== false) frame.src = ownOrigin + '/presentador/integrado';
    frame.style.cssText = 'display:block;width:100%;height:360px;border:0;background:white';
    section.append(heading, status, frame);
    main.append(section);
    if (frame.src) monitor(frame);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }
  new MutationObserver(schedule).observe(document.documentElement, {childList:true,subtree:true});
  window.addEventListener('popstate', schedule);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function(...args) { const result=original.apply(this,args); schedule(); return result; };
  }
  window.addEventListener('message', event => {
    const frame = document.getElementById('md-sales-frame');
    if (!frame || event.origin !== ownOrigin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'md-sales-height' && Number.isFinite(event.data.height)) {
      frame.dataset.ready = '1';
      clearTimeout(frame.mdRetryTimer);
      const status = document.getElementById('md-sales-loading');
      if (status) status.hidden = true;
      frame.style.height = Math.max(260, Math.min(16000, event.data.height)) + 'px';
    }
  });
  window.addEventListener('md-sales-connected', () => {
    const frame = document.getElementById('md-sales-frame');
    if (frame) {
      frame.dataset.ready = '0';
      frame.src = ownOrigin + '/presentador/integrado?t=' + Date.now();
      monitor(frame);
    }
  });
  window.addEventListener('md-sales-prepared', () => {
    const frame = document.getElementById('md-sales-frame');
    if (frame && !frame.getAttribute('src')) {
      frame.src = ownOrigin + '/presentador/integrado';
      monitor(frame);
    }
  });
  schedule();
})();
