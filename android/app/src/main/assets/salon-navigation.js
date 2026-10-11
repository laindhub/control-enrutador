(() => {
  'use strict';
  if (location.protocol !== 'https:' || location.hostname !== 'liniers.xn--somosmasdueos-skb.com' ||
      window.__masDuenosSalesNavigation) return;
  window.__masDuenosSalesNavigation = true;
  // Delegation survives SPA rerenders. Only a navigation control labelled exactly “Yo” is changed.
  document.addEventListener('click', event => {
    if (!/^\/floor(?:\/|$)/.test(location.pathname)) return;
    const control = event.target.closest('a, button, [role="tab"], [role="button"]');
    if (!control || control.closest('form') || control.hasAttribute('download')) return;
    const label = (control.innerText || control.textContent || '').trim();
    if (label !== 'Yo' && control.getAttribute('aria-label') !== 'Yo') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = 'https://masduenos.laind.io/presentador';
  }, true);
})();
