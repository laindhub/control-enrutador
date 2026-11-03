(() => {
  if (location.origin !== 'https://liniers.xn--somosmasdueos-skb.com') return false;
  const visible = node => node.getClientRects().length > 0;
  const inputs = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea,[role="radio"],[role="combobox"]')].filter(visible);
  if (/\/floor\/login\/?$/.test(location.pathname)) return inputs.length > 0;
  if (/\/floor\/visits\/[0-9a-f-]{36}\/assignment\/?$/i.test(location.pathname)) {
    // Header/profile controls are already visible in the streamed skeleton.
    // Wait for an actual form field, not the header or document load event.
    const main = document.querySelector('main') || document.body;
    const text = main && visible(main) ? main.innerText.replace(/\s+/g, ' ').trim() : '';
    // A closed visit is a final CRM response, with no form controls to await.
    // Reveal its original notice; closing alone does not prove an assignment
    // was saved by this app, so it must not trigger the completion bridge.
    const closed = /Esta visita está cerrada/i.test(text) && /Ya no admite pasos nuevos/i.test(text);
    // Some CRM versions render the choice cards as custom React controls.
    return closed || inputs.length > 0 || (/¿Cómo le fue en la charla\?/.test(text) && /La vio entera/.test(text));
  }
  const main = document.querySelector('main') || document.body;
  if (!main || document.readyState === 'loading') return false;
  if ([...main.querySelectorAll('.animate-pulse,[data-slot="skeleton"],[aria-busy="true"]')].some(visible)) return false;
  return [...main.querySelectorAll('a,button,input')].some(visible);
})()
