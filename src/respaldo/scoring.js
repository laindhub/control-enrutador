const text = (a, key) => a?.[key] ?? null;
const num = (a, key) => {
  const n = Number(a?.[key]);
  return a?.[key] == null || a[key] === '' || !Number.isFinite(n) ? null : n;
};

export function scoreFullTest(a = {}) {
  let points = 0;
  const age = num(a, 'age');
  if (age !== null) points += age <= 25 ? 6 : age <= 35 ? 8 : age <= 45 ? 7 : age <= 55 ? 6 : age <= 64 ? 4 : 0;
  points += ({
    'Muy urgente': 9, 'Urgente': 8,
    'Me gustaría pero no es urgente': 5, 'Poco urgente': 4, 'Cero urgente': 2,
  })[text(a, 'urgencia')] ?? 0;
  points += ({
    'Sí, ya fui estafado': 0, 'Sí, aunque nunca fui estafado': 4,
    'Un poco': 6, 'No me preocupa': 10,
  })[text(a, 'miedo_estafas')] ?? 0;
  points += a.conoce_spazios === 'Sí' ? 8 : 5;
  points += a.conoce_tapiola === 'Sí' ? 8 : 5;
  points += ({
    'Relación de dependencia': 6, 'Independiente': 5,
    'Jubilado': 0, 'Desempleado': 0,
  })[text(a, 'situacion_laboral')] ?? 0;
  if (a.tipo_propiedad === 'Departamento') points += 7;
  else if (a.tipo_propiedad === 'Casa' || a.tipo_propiedad === 'PH') {
    points += ({
      'Sí, totalmente.': 6, 'Sí, podría ser.': 5, 'No creo.': 4, 'No, ni loco.': 3,
    })[text(a, 'viviria_en_departamento')] ?? 0;
  }
  const loc = a.ubicacion_sonada ?? a.ubicaciones;
  const locations = Array.isArray(loc) ? loc : typeof loc === 'string' ? loc.split(',') : [];
  points += locations.some(x => String(x).includes('Oeste')) ? 6 : 3;
  points += a.tiene_ahorros === 'Sí' ? 7 : 5;
  const cuota = num(a, 'cuota_posible_ars') ?? 0;
  points += cuota > 200000 ? 6 : cuota === 200000 ? 5 : 0;
  if (a.quien_decide === 'Yo solo') points += 7;
  else if (a.quien_decide === 'Yo y alguien más') points += a.acompanante_presente === 'Sí' ? 6 : 3;
  return { points, qualifies: cuota >= 170000, quota: cuota };
}
