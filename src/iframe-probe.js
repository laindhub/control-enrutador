// The experiment only allows the exact public CRM origin as a framed document.
// This does not bypass the CRM's own X-Frame-Options, CSP or cookie restrictions.
export const CRM_ORIGIN = 'https://liniers.xn--somosmasdueos-skb.com';
export const CRM_TEST_URL = CRM_ORIGIN + '/floor';

export function cspForCrmIframe(currentCsp = '') {
  const directives = String(currentCsp || '').split(';').map(value => value.trim())
    .filter(Boolean).filter(value => !/^frame-src(?:\\s|$)/i.test(value));
  directives.push('frame-src ' + CRM_ORIGIN);
  return directives.join('; ');
}
