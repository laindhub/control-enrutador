(() => {
  if (location.origin !== 'https://liniers.xn--somosmasdueos-skb.com') return JSON.stringify({login:false,authenticated:false});
  const visible = node => node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const main = document.querySelector('main') || document.body;
  const text = main?.innerText || '';
  const attended = [...(main?.querySelectorAll('button') || [])].some(node => visible(node) && /^Atendidas/i.test((node.textContent || '').trim()));
  const pin = [...document.querySelectorAll('input[type="password"],input[name="pin"],input[autocomplete="current-password"]')].some(visible);
  const loginForm = [...document.querySelectorAll('form[action]')].some(node => visible(node) && /\/floor\/login\/?$/.test(new URL(node.action,location.href).pathname));
  const profilePrompt = /(?:eleg[ií]|seleccion[aá])\s+(?:tu\s+)?(?:usuario|perfil)|iniciar sesi[oó]n|ingres[aá]\s+(?:tu\s+)?pin/i.test(text);
  const profileControls = [...(main?.querySelectorAll('button,[role="button"],select') || [])].some(visible);
  // The profile chooser need not contain a form or PIN field yet. A login route
  // must be shown immediately, including React client-side redirects.
  const login = /^\/floor\/login\/?$/.test(location.pathname) || pin || loginForm || (!attended && profilePrompt && profileControls);
  const visit = /^\/floor\/visits\/[0-9a-f-]{36}(?:\/full-test)?\/?$/i.test(location.pathname) && visible(main?.querySelector('h1'));
  return JSON.stringify({login,authenticated:!login && (attended || visit)});
})()
