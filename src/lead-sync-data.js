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
export function normalizeDetail(detail) {
  const value = label => detail.fields.find(field => field.label === label)?.value || null;
  return { name: detail.name || null, phone: normalizePhone(value('Teléfono')), advisor: value('Derivada a'), promoter: value('La trajo'), fields: detail.fields, timeline: detail.timeline, summary: detail.summary };
}
