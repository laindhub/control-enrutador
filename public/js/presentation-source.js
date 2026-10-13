export const OFFICIAL_DECK_SIZE = 34_796_967;
export const OFFICIAL_DECK_SHA256 = 'bdb35bfa366b7c2570a36a0d5b1172836765d50796a8e772345b5a5ccf6f25c7';
export const OFFICIAL_DECK_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// Hostinger's startup page may return HTTP 200 and HTML instead of the deck.
export function isOfficialDeckResponse(response, size = OFFICIAL_DECK_SIZE) {
  if (!response?.ok) return false;
  const contentType = (response.headers.get('content-type') || '').split(';',1)[0].trim().toLowerCase();
  if (contentType !== OFFICIAL_DECK_MIME) return false;
  const declaredSize = response.headers.get('content-length');
  return declaredSize == null || (Number.isFinite(Number(declaredSize)) && Number(declaredSize) === size);
}

export async function readVerifiedOfficialDeck(response, {
  size = OFFICIAL_DECK_SIZE,
  sha256 = OFFICIAL_DECK_SHA256,
  subtle = globalThis.crypto?.subtle,
} = {}) {
  if (!isOfficialDeckResponse(response, size)) {
    throw Error('El servidor todavía no entregó el archivo PowerPoint. Reintentá en unos segundos.');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== size) throw Error('La descarga está incompleta. Reintentá en unos segundos.');
  const signature = new Uint8Array(bytes,0,4);
  if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) {
    throw Error('El servidor devolvió un contenido que no es un PPTX válido.');
  }
  if (!subtle?.digest) throw Error('El navegador no permite comprobar la integridad de la presentación.');
  const hash = Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
  if (hash !== sha256) throw Error('La presentación descargada no coincide con el PPTX original.');
  return new Blob([bytes], {type:OFFICIAL_DECK_MIME});
}
