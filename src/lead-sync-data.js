const VISIT_PATH = /^\/floor\/visits\/([a-f0-9-]{36})(?:\?.*)?$/i;
export function visitId(href) {
  return VISIT_PATH.exec(String(href || ''))?.[1] || null;
}
export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('549') && digits.length > 10) digits = digits.slice(3);
  else if (digits.startsWith('54') && digits.length > 10) digits = digits.slice(2);
  return digits || null;
}
export function argentinaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
// The CRM records the router as an activity: "Keren Botini · como Enrutador".
// A field explicitly naming the router takes priority when supplied by the CRM.
// Preserve existing raw detail JSON: old synchronized visits can be interpreted on read.
export function routerFromLeadDetail(detail) {
  if(!detail || typeof detail!=='object')return null;
  const fields=Array.isArray(detail.fields)?detail.fields:[];
  const direct=fields.find(field=>/^enrutador(?:\/a)?$/i.test(String(field.label||'').trim()))?.value;
  if(typeof direct==='string' && direct.trim())return direct.trim().slice(0,255);
  if(typeof detail.router==='string' && detail.router.trim())return detail.router.trim().slice(0,255);
  const timeline=typeof detail.timeline==='string'?detail.timeline:'';
  const matches=[...timeline.matchAll(/^[ \t]*([^\r\n·•]{2,255}?)\s*[·•]\s*como\s+enrutador\b/gim)];
  return matches.length?matches.at(-1)[1].trim():null;
}
export function normalizeDetail(detail) {
  const fields=Array.isArray(detail.fields)?detail.fields:[];
  const value=label=>fields.find(field=>field.label===label)?.value||null;
  return {name:detail.name||null,phone:normalizePhone(value('Teléfono')),
   advisor:value('Derivada a'),promoter:value('La trajo'),
   router:routerFromLeadDetail(detail),fields,timeline:detail.timeline,summary:detail.summary};
}
