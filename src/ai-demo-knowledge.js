export const SALES_KNOWLEDGE = Object.freeze({
  brand: 'Más Dueños es una marca comercial de Spazios para el acompañamiento mediante Metroterra.',
  metroterra: 'Metroterra acompaña a personas que todavía no reúnen el anticipo para llegar a su departamento de Spazios mediante un plan de ahorro adaptado.',
  segment: 'Los leads de este seguimiento no cuentan actualmente con el anticipo de USD 10.000. Quienes ya lo tienen se derivan directamente al sector de asesores de POZO.',
  goal: 'El objetivo comercial es coordinar una reunión presencial para que la persona comprenda el plan y, si decide avanzar, realice su primer aporte por canales oficiales.',
  firstPayment: 'La cuota base informada para la demo es de ARS 200.000. La primera tiene una bonificación de ARS 100.000, por lo que se puede comenzar con ARS 100.000.',
  adjustment: 'La cuota base se actualiza mes a mes según el índice CAC. No se conoce de antemano el importe exacto de meses futuros.',
  contributions: 'Después de cubrir la base vigente, la persona decide si aporta más. Puede realizar aportes adicionales o más de un depósito en el mismo mes.',
  account: 'El ahorro se deposita en un CVU a nombre de la persona y es administrado mediante un fideicomiso. Nunca se solicita transferir dinero a un asesor ni por el chat.',
  financing: 'La financiación puede extenderse hasta 30 años. La cuota depende de la ubicación y el valor del m² de la zona, el plazo elegido y el proyecto, incluyendo su tamaño y comodidades.',
  amenities: 'Según la información suministrada para la demo, los edificios incluyen como base salón de eventos, quincho con parrilla, cochera y piscina en la terraza.',
  unknownConnection: 'No está documentado en esta demo el mecanismo contractual exacto que conecta el ahorro acumulado con la adquisición en pozo. Debe explicarlo un asesor en la reunión.',
});

export const PROJECT_CATALOG = Object.freeze([
  project('GREEN I', 'Fischetti 4943', 'Caseros', 'Terminado', 'Semi-contado'),
  project('GREEN II', 'Bonifacini 4864', 'Caseros', 'Terminado', 'Semi-contado'),
  project('MEDITERRANEO', 'Wenceslao de Tata 4927', 'Caseros', 'Terminado', 'Semi-contado'),
  project('GARDEN', 'Lisandro Medina 2176', 'Caseros', 'Terminado', 'Semi-contado'),
  project('ALPES', 'Belgrano 4325', 'Caseros', 'Terminado', 'Semi-contado'),
  project('CUBIK', 'Bonifacini 4444', 'Caseros', 'Construcción', '2027'),
  project('MIRAGE SABATTINI', 'Sabattini 4560', 'Caseros', 'Construcción', '2028'),
  project('MIRAGE ALBERDI', 'Alberdi 4551', 'Caseros', 'Construcción', '2028'),
  project('ZEN', 'Belgrano 4445', 'Caseros', 'Pozo', '2029'),
  project('PANORAMIC', 'Alfonsina Storni 1731', 'Santos Lugares', 'Terminado', 'Semi-contado'),
  project('COLONIAL', 'Maquinista Gallini 3744', 'Santos Lugares', 'Terminado', 'Semi-contado'),
  project('CERASO', 'Dr. Carbone 3481', 'Santos Lugares', 'Terminado', 'Semi-contado'),
  project('PALMS', 'Bonifacini 4179', 'Santos Lugares', 'Terminado', 'Semi-contado'),
  project('ECLIPSE ALMAFUERTE', 'Almafuerte 3521', 'Santos Lugares', 'Terminado', 'Semi-contado'),
  project('ECLIPSE DORREGO', 'Dorrego 3543', 'Santos Lugares', 'Terminado', 'Semi-contado'),
  project('SENECA', 'Séneca 2250', 'Santos Lugares', 'Construcción', '2027'),
  project('SODERIA', 'Av. La Plata 3976', 'Santos Lugares', 'Construcción', '2028'),
  project('VIDRIERIA', 'Alpatacal 3620', 'Santos Lugares', 'Pozo', '2028'),
  project('VELT', 'Bonifacini 3957', 'Santos Lugares', 'Pozo', '2029'),
  project('POLO', 'Batallán 3419', 'Sáenz Peña', 'Terminado', 'Semi-contado'),
  project('JAZZ', 'Beaztley 1135', 'Sáenz Peña', 'Terminado', 'Semi-contado'),
  project('BOTTEGA', 'Beaztley 570', 'Sáenz Peña', 'Terminado', 'Semi-contado'),
  project('BLANC', 'Roberto Lage 870', 'Sáenz Peña', 'Pozo', '2027'),
  project('ROYALE', '12 de Octubre 2164', 'Martín Coronado', 'Terminado', 'Semi-contado'),
  project('CHALETS', 'Panamá 7030', 'Martín Coronado', 'Construcción', '2026'),
  project('CAPRI', 'Gral. Alvear 1171', 'Ituzaingó', 'Construcción', '2026'),
  project('VIVAIO', 'Av. Rivadavia 21554', 'Ituzaingó', 'Construcción', '2028'),
  project('GOLF', 'San Pedro 1426', 'Villa Raffo', 'Terminado', 'Semi-contado'),
  project('VIVANTI', 'San Pedro 1226', 'Villa Raffo', 'Pozo', '2031'),
  project('BLACK', 'Allende 4442', 'Devoto - CABA', 'Construcción', '2027'),
  project('POETAS', 'P. Calderón de la Barca 3065', 'Devoto - CABA', 'Pozo', '2028'),
  project('VIVANT', 'Núñez 2737', 'Núñez - CABA', 'Pozo', '2027'),
  project('LUMIA', 'Nahuel Huapi 5246', 'Villa Urquiza - CABA', 'Pozo', '2029'),
  project('FADER', 'Fader 6255', 'Villa Real - CABA', 'Pozo', '2031'),
  project('HIDALGO', 'Hidalgo 665', 'Caballito - CABA', 'Pozo', '2031'),
  project('VIVANTI LIMA', 'Lima 1515', 'Constitución - CABA', 'Pozo', '2033'),
  project('ALMA', 'Perón 3538', 'Almagro - CABA', 'Pozo', '2033'),
  project('LA BOCA', 'Av. Almirante Brown', 'La Boca', 'Pozo', '2033'),
  project('HUSER', 'Mercedes 2346', 'Monte Castro', 'Pozo', '2033'),
]);

export function promptKnowledge() {
  return {
    confirmedFacts: SALES_KNOWLEDGE,
    projectCatalog: PROJECT_CATALOG,
    catalogNotice: 'Catálogo interno actualizado el 11/09/2026. Estado, entrega, disponibilidad y valores deben confirmarse con un asesor antes de presentarlos como vigentes.',
  };
}

function project(name, address, locality, status, delivery) {
  return Object.freeze({ name, address, locality, status, delivery });
}
