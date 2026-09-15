import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const TARGET_DOWN_PAYMENT_USD = 10_000;

const FIRST_NAMES = ['Camila', 'Julián', 'Andrea', 'Martín', 'Lucía', 'Santiago', 'Valentina', 'Nicolás', 'Florencia', 'Matías', 'Carolina', 'Federico', 'Agustina', 'Leandro', 'Micaela', 'Gonzalo', 'Natalia', 'Sebastián', 'Rocío', 'Emanuel'];
const LAST_NAMES = ['Benítez', 'Romero', 'Vega', 'Sosa', 'Fernández', 'Acosta', 'Medina', 'Pereyra', 'Roldán', 'Suárez', 'Giménez', 'Molina', 'Navarro', 'López', 'Herrera', 'Castro', 'Silva', 'Torres', 'Ruiz', 'Cabrera'];
const OCCUPATIONS = ['enfermera', 'empleado administrativo', 'docente', 'comerciante', 'técnica de laboratorio', 'chofer', 'diseñadora', 'operario industrial', 'peluquera', 'vendedor', 'cocinera', 'electricista'];
const OBJECTIVES = [
  'dejar de alquilar y construir estabilidad',
  'tener un hogar propio para su familia',
  'ordenar el ahorro para llegar al anticipo',
  'mudarse con su pareja cuando complete el proceso',
  'invertir en una propiedad para su futuro',
  'tener más previsibilidad que alquilando',
];
const CONCERNS = [
  'Le preocupa sostener el aporte mensual cuando aparecen gastos imprevistos.',
  'Quiere entender mejor cómo impacta el índice CAC en la cuota base.',
  'Necesita acompañamiento para mantener la constancia sin sentirse presionado.',
  'Está motivado, pero a veces posterga el aporte por prioridades familiares.',
  'Consulta seguido cómo ver sus movimientos y el saldo acumulado.',
  'Tuvo un mes difícil y quiere conversar antes de tomar una decisión.',
  'Valora recibir recordatorios breves y explicaciones claras.',
  'Quiere saber cuándo corresponde pasar a conversar con el equipo de POZO.',
];
const TEAM = ['Sofía Méndez', 'Valentina Costa', 'Marina Quiroga', 'Nuria Pereyra'];
const CLIENT_REPLIES = [
  'Gracias por escribirme. Este mes se me complicó un poco, pero quiero seguir.',
  'Vengo bien, aunque todavía no termino de entender el ajuste por CAC.',
  'Me sirve que me acompañen porque quiero mantenerme constante.',
  'Quería consultar si pueden decirme cuánto llevo aportado hasta ahora.',
  'Estoy organizándome para volver a aportar en los próximos días.',
  'Tuve algunos gastos inesperados y necesito ver cómo continuar.',
];

export class WelcomeDemoStore {
  constructor({ now = () => Date.now(), generate = generateWelcomeReply } = {}) {
    this.now = now;
    this.generate = generate;
    this.clients = generateWelcomeClients(now());
  }

  restore(clients) {
    if (!Array.isArray(clients) || !clients.length) return;
    this.clients = clients.map((client) => normalizeClient(client, this.now()));
  }

  reset() {
    this.clients = generateWelcomeClients(this.now());
    return this.snapshot();
  }

  snapshot() {
    const clients = this.clients.map((client) => structuredClone(client));
    const retentionAverage = Math.round(clients.reduce((sum, client) => sum + client.retentionScore, 0) / Math.max(1, clients.length));
    const riskCount = clients.filter((client) => client.riskLevel === 'high').length;
    const attentionCount = clients.filter((client) => client.riskLevel === 'medium').length;
    return {
      generatedAt: this.now(),
      metrics: {
        retentionAverage,
        activePlans: clients.filter((client) => client.status !== 'closed').length,
        riskCount,
        attentionCount,
        totalPaidArs: clients.reduce((sum, client) => sum + Number(client.plan.totalPaidArs || 0), 0),
      },
      clients,
      ai: {
        enabled: Boolean(config.groq.apiKey),
        model: config.groq.model,
        mode: config.groq.apiKey ? 'IA conectada' : 'Respuestas de demostración',
      },
    };
  }

  getClient(id) {
    const client = this.clients.find((item) => item.id === id);
    if (!client) throw new WelcomeDemoError('No encontramos ese cliente de Bienvenida.', 404);
    return client;
  }

  async receiveClientMessage(id, rawText, rawRequestId = '') {
    const client = this.getClient(id);
    const text = clean(rawText, 800);
    const requestId = clean(rawRequestId, 100);
    if (!text) throw new WelcomeDemoError('Escribí un mensaje del cliente.', 400);

    const existingInbound = requestId
      ? client.messages.find((item) => item.role === 'client' && item.clientRequestId === requestId)
      : null;
    const existingReply = requestId
      ? client.messages.find((item) => item.role === 'agent' && item.replyToRequestId === requestId)
      : null;
    if (existingReply) return structuredClone(client);

    const receivedAt = existingInbound?.createdAt || eventTime(client, this.now());
    if (!existingInbound) {
      client.messages.push(message('client', text, receivedAt, {
        sender: client.name,
        clientRequestId: requestId || null,
      }));
      client.notes.unshift(note('Mensaje recibido', summarize(text, 150), receivedAt, 'neutral'));
    }

    client.status = 'thinking';
    client.updatedAt = receivedAt;
    try {
      const result = await this.generate({ kind: 'reply', client, history: client.messages });
      const repliedAt = eventTime(client, this.now());
      client.messages.push(message('agent', result.message, repliedAt, {
        sender: client.welcomeAdvisor,
        generatedBy: result.generatedBy || null,
        replyToRequestId: requestId || null,
      }));
      applyRetentionResult(client, result, repliedAt);
      client.notes.unshift(note(
        result.requiresHuman ? 'Intervención recomendada' : 'Seguimiento IA',
        result.note || 'Se respondió al cliente y se actualizó su estado de retención.',
        repliedAt,
        result.requiresHuman ? 'risk' : 'success',
      ));
      return structuredClone(client);
    } catch (error) {
      client.status = 'error';
      client.notes.unshift(note('Error de respuesta', publicError(error), this.now(), 'risk'));
      throw error;
    }
  }

  async advanceTime(id, rawDays) {
    const client = this.getClient(id);
    const days = clampNumber(rawDays, 1, 30, 1);
    if (client.status === 'human') throw new WelcomeDemoError('El caso está siendo atendido personalmente.', 409);
    const previousAt = eventTime(client, this.now());
    const simulatedAt = previousAt + days * 24 * 60 * 60 * 1000;
    client.simulatedAt = simulatedAt;
    client.updatedAt = simulatedAt;
    client.messages.push(message('time', `Pasaron ${days} ${days === 1 ? 'día' : 'días'}`, simulatedAt));

    const daysSincePayment = Math.max(0, Math.round((simulatedAt - Number(client.plan.lastPaymentAt)) / 86_400_000));
    client.plan.daysSinceLastPayment = daysSincePayment;
    const penalty = days >= 15 ? 12 : days >= 7 ? 7 : days >= 3 ? 3 : 1;
    client.retentionScore = clampNumber(client.retentionScore - penalty, 20, 99, client.retentionScore);
    updateRisk(client);

    if (days < 7 || client.status === 'closed') {
      client.nextAction = days < 3 ? 'Esperar y acompañar sin invadir' : 'Revisar si necesita ayuda con su próximo aporte';
      client.notes.unshift(note('Tiempo simulado', `Pasaron ${days} días sin nueva interacción. La IA decidió no insistir todavía.`, simulatedAt));
      return { client: structuredClone(client), outcome: 'waiting' };
    }

    client.status = 'thinking';
    try {
      const result = await this.generate({ kind: 'followup', client, history: client.messages, elapsedDays: days });
      const sentAt = eventTime(client, simulatedAt);
      client.messages.push(message('agent', result.message, sentAt, {
        sender: client.welcomeAdvisor,
        generatedBy: result.generatedBy || null,
      }));
      applyRetentionResult(client, result, sentAt);
      client.notes.unshift(note('Seguimiento preventivo', result.note || 'Se retomó el contacto para prevenir una posible baja.', sentAt, client.riskLevel === 'high' ? 'risk' : 'neutral'));
      return { client: structuredClone(client), outcome: result.requiresHuman ? 'risk' : 'followup' };
    } catch (error) {
      client.status = 'error';
      client.notes.unshift(note('Error de seguimiento', publicError(error), this.now(), 'risk'));
      throw error;
    }
  }

  markHandled(id) {
    const client = this.getClient(id);
    client.status = 'human';
    client.requiresHuman = false;
    client.retentionScore = Math.max(client.retentionScore, 70);
    client.nextAction = `Seguimiento personal asignado a ${client.welcomeAdvisor}`;
    client.updatedAt = eventTime(client, this.now());
    client.notes.unshift(note('Intervención personal', `${client.welcomeAdvisor} tomó el seguimiento del caso.`, client.updatedAt, 'success'));
    updateRisk(client);
    return structuredClone(client);
  }
}

export class WelcomeDemoError extends Error {
  constructor(messageText, status = 400) {
    super(messageText);
    this.status = status;
    this.publicMessage = messageText;
  }
}

function generateWelcomeClients(now) {
  return FIRST_NAMES.map((first, index) => {
    const name = `${first} ${LAST_NAMES[index]}`;
    const contributionCount = randomInt(1, 32);
    const averageContribution = randomInt(190_000, 500_000);
    const usdReferenceArs = config.welcomeDemo.usdReferenceArs;
    const targetDownPaymentArs = Math.round(TARGET_DOWN_PAYMENT_USD * usdReferenceArs);
    const totalPaidArs = Math.min(
      contributionCount * averageContribution,
      Math.floor(targetDownPaymentArs * 0.96),
    );
    const progressPercent = calculatePlanProgress(totalPaidArs, usdReferenceArs);
    const missedPayments = weightedChoice([0, 0, 0, 1, 1, 2, 3]);
    const lastPaymentDays = missedPayments >= 2 ? randomInt(42, 88) : missedPayments === 1 ? randomInt(24, 45) : randomInt(2, 22);
    const retentionScore = clampNumber(95 - missedPayments * 13 - Math.max(0, lastPaymentDays - 20) / 3 + randomInt(-5, 5), 38, 98, 80);
    const createdAt = now - randomInt(45, 520) * 86_400_000;
    const lastPaymentAt = now - lastPaymentDays * 86_400_000;
    const welcomeAdvisor = TEAM[index % TEAM.length];
    const occupation = OCCUPATIONS[index % OCCUPATIONS.length];
    const objective = OBJECTIVES[index % OBJECTIVES.length];
    const context = `${capitalize(occupation)}. ${CONCERNS[index % CONCERNS.length]} Busca ${objective}.`;
    const client = {
      id: randomUUID(),
      name,
      initials: `${first[0]}${LAST_NAMES[index][0]}`,
      phone: `+54 9 11 5${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
      email: `${slug(first)}.${slug(LAST_NAMES[index])}@demo.com`,
      occupation,
      objective,
      context,
      welcomeAdvisor,
      status: 'active',
      riskLevel: 'low',
      retentionScore,
      requiresHuman: false,
      nextAction: 'Mantener un contacto cercano y revisar su próximo aporte',
      createdAt,
      updatedAt: now - randomInt(1, 12) * 86_400_000,
      simulatedAt: now,
      plan: {
        status: 'Activo',
        startedAt: createdAt,
        contributionCount,
        totalPaidArs,
        monthlyBaseArs: 200_000,
        firstContributionBonusArs: 100_000,
        progressPercent,
        targetDownPaymentUsd: TARGET_DOWN_PAYMENT_USD,
        targetDownPaymentArs,
        usdReferenceArs,
        lastPaymentAt,
        nextPaymentAt: lastPaymentAt + 30 * 86_400_000,
        daysSinceLastPayment: lastPaymentDays,
        missedPayments,
        cacAdjusted: true,
        cvuOwnedByClient: true,
      },
      historyVersion: 2,
      messages: [],
      notes: [
        note('Contexto inicial', context, now - randomInt(8, 20) * 86_400_000),
        note('Estado del plan', `Registra ${contributionCount} aportes y un avance estimado del ${progressPercent}% hacia su meta configurada.`, now - randomInt(2, 7) * 86_400_000, 'neutral'),
      ],
    };
    client.messages = seedMessages({ client, now, index });
    updateRisk(client);
    return client;
  });
}

function seedMessages({ client, now, index }) {
  const start = now - randomInt(12, 35) * 86_400_000;
  const hour = 60 * 60_000;
  const day = 24 * hour;
  const sender = { sender: client.welcomeAdvisor };
  const customer = { sender: client.name };
  const name = firstName(client.name);
  const advisor = firstName(client.welcomeAdvisor);
  const objective = objectiveForConversation(client.objective);
  const paid = formatArs(client.plan.totalPaidArs);
  const target = formatArs(client.plan.targetDownPaymentArs);
  const progress = client.plan.progressPercent;
  const contributions = client.plan.contributionCount;

  const opening = message(
    'agent',
    `Hola ${name}, ¿cómo estás? Soy ${advisor}, del equipo de Bienvenida. Te escribo para saber cómo venís con el plan y si hay algo que necesites revisar.`,
    start,
    sender,
  );

  const scenarios = [
    [
      message('client', 'Este mes se me juntaron varios gastos y no sé si voy a poder organizarme igual que antes.', start + 18 * 60_000, customer),
      message('agent', `Gracias por avisarme, ${name}. No quiero que tomes una decisión apurada ni prometerte cambios por mensaje. Si te parece, revisamos tu situación y vemos qué información necesitás para ordenar el próximo aporte.`, start + 31 * 60_000, sender),
      message('time', 'Pasaron 3 días', start + 3 * day),
      message('client', 'Creo que la semana que viene voy a tener un panorama más claro.', start + 3 * day + 22 * 60_000, customer),
      message('agent', 'Perfecto, te doy ese espacio. La semana que viene vuelvo a consultarte y, si necesitás revisar movimientos o condiciones de tu caso, lo vemos con una persona del equipo.', start + 3 * day + 36 * 60_000, sender),
    ],
    [
      message('client', '¿Me explicás por qué la cuota ya no es exactamente la misma que al principio?', start + 16 * 60_000, customer),
      message('agent', 'Sí. La base informada es de $200.000 y se actualiza por el índice CAC, por eso cambia con el tiempo. Si querés conocer el importe exacto de tu próximo aporte, primero tenemos que revisar el dato vigente de tu cuenta.', start + 29 * 60_000, sender),
      message('time', 'Pasó 1 día', start + day),
      message('client', 'Entiendo. ¿Eso significa que ya elegí un departamento?', start + day + 20 * 60_000, customer),
      message('agent', `No. Durante esta etapa estás ahorrando para reunir el anticipo obligatorio de USD 10.000. Recién al completarlo pasás al equipo de POZO para evaluar una propiedad, la financiación y la firma correspondiente.`, start + day + 33 * 60_000, sender),
    ],
    [
      message('client', 'Vengo cumpliendo, pero me cuesta mantener la constancia todos los meses.', start + 17 * 60_000, customer),
      message('agent', `Te entiendo. Ya llevás ${contributions} aportes y eso muestra que venís sosteniendo el proceso. Podemos acompañarte con recordatorios breves, sin estar escribiéndote de más. ¿Qué momento del mes te resulta más útil?`, start + 30 * 60_000, sender),
      message('time', 'Pasaron 4 días', start + 4 * day),
      message('client', 'Me sirve que me recuerden cerca de fin de mes, después de cobrar.', start + 4 * day + 18 * 60_000, customer),
      message('agent', 'Perfecto, lo dejo registrado así. Si en algún mes necesitás consultar algo antes, podés escribirme por acá.', start + 4 * day + 28 * 60_000, sender),
    ],
    [
      message('client', '¿Podés decirme cuánto llevo aportado hasta ahora?', start + 15 * 60_000, customer),
      message('agent', `En esta demostración figuran ${paid} acumulados en ${contributions} aportes. Sobre la referencia configurada de ${target} para alcanzar USD 10.000, representa aproximadamente un ${progress}% del objetivo.`, start + 27 * 60_000, sender),
      message('client', '¿Cuando llegue al cien por ciento ya me entregan el departamento?', start + 39 * 60_000, customer),
      message('agent', 'No de manera inmediata. Completar el anticipo permite pasar al equipo de POZO; allí se revisan proyectos disponibles, financiación y condiciones antes de firmar un boleto. La entrega depende del año informado para el proyecto elegido.', start + 52 * 60_000, sender),
    ],
    [
      message('client', 'Estoy organizándome para volver a aportar el viernes.', start + 19 * 60_000, customer),
      message('agent', `Buenísimo, ${name}. Cuando lo hagas, verificá que el movimiento sea al CVU que está a tu nombre. Si después querés revisar cómo quedó registrado, escribime y lo vemos.`, start + 32 * 60_000, sender),
      message('time', 'Pasaron 2 días', start + 2 * day),
      message('client', '¿Puedo hacer otro aporte en el mismo mes si me sobra algo?', start + 2 * day + 16 * 60_000, customer),
      message('agent', 'Sí, podés realizar aportes adicionales en el mismo mes. La base se actualiza por CAC y, por encima de eso, podés aportar más para avanzar a tu ritmo hacia el anticipo.', start + 2 * day + 29 * 60_000, sender),
    ],
    [
      message('client', 'Tuve un gasto inesperado y estoy pensando si seguir o dejar el plan.', start + 14 * 60_000, customer),
      message('agent', `Gracias por decírmelo antes de decidir, ${name}. Quiero entender bien qué se te complicó. Yo no puedo cambiar condiciones ni prometer una excepción, pero sí pedir que revisen tu caso personalmente.`, start + 28 * 60_000, sender),
      message('client', 'Prefiero hablarlo antes de tomar una decisión definitiva.', start + 43 * 60_000, customer),
      message('agent', `De acuerdo. Voy a dejar tu caso marcado para revisarlo personalmente y sin presión. La idea es que tengas información clara antes de decidir.`, start + 55 * 60_000, sender),
    ],
    [
      message('client', '¿Cuándo me corresponde hablar con el equipo de POZO?', start + 16 * 60_000, customer),
      message('agent', `Cuando hayas completado el anticipo obligatorio de USD 10.000. Hoy la demostración registra ${paid}, equivalente aproximadamente al ${progress}% con la referencia configurada.`, start + 29 * 60_000, sender),
      message('client', 'Entonces los $200.000 mensuales no son la cuota de un departamento.', start + 42 * 60_000, customer),
      message('agent', 'Exactamente. Es un aporte de ahorro para construir el anticipo; todavía no elegís ni reservás una unidad y tampoco firmás un boleto. Esa etapa comienza después, con POZO.', start + 54 * 60_000, sender),
    ],
    [
      message('client', 'Quiero saber si puedo adelantar más dinero algunos meses.', start + 17 * 60_000, customer),
      message('agent', 'Sí. Además de la base mensual ajustada por CAC, podés realizar aportes adicionales al CVU a tu nombre, incluso más de una vez en el mes.', start + 30 * 60_000, sender),
      message('time', 'Pasaron 5 días', start + 5 * day),
      message('client', `Mi idea es avanzar más rápido porque ${objective}.`, start + 5 * day + 16 * 60_000, customer),
      message('agent', 'Tiene sentido. Los aportes adicionales pueden acercarte antes al anticipo, pero no equivalen a reservar un departamento. Cuando completes los USD 10.000, POZO revisará con vos las opciones y condiciones disponibles.', start + 5 * day + 29 * 60_000, sender),
    ],
  ];

  return [opening, ...scenarios[index % scenarios.length]];
}

async function generateWelcomeReply({ kind, client, history, elapsedDays = 0 }) {
  if (!config.groq.apiKey) return fallbackWelcomeReply({ kind, client, history, elapsedDays });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        temperature: 0.65,
        max_completion_tokens: 520,
        messages: [
          { role: 'system', content: welcomeSystemPrompt() },
          {
            role: 'user',
            content: JSON.stringify({
              task: kind === 'followup' ? `Seguimiento preventivo tras ${elapsedDays} días` : 'Responder al último mensaje del cliente',
              client: {
                name: client.name,
                advisor: client.welcomeAdvisor,
                objective: client.objective,
                interpretedContext: interpretClientContext(client),
                retentionScore: client.retentionScore,
                riskLevel: client.riskLevel,
                plan: {
                  totalPaidArs: client.plan.totalPaidArs,
                  progressPercent: client.plan.progressPercent,
                  contributionCount: client.plan.contributionCount,
                  targetDownPaymentArs: client.plan.targetDownPaymentArs,
                  usdReferenceArs: client.plan.usdReferenceArs,
                  daysSinceLastPayment: client.plan.daysSinceLastPayment,
                  missedPayments: client.plan.missedPayments,
                },
              },
              history: history
                .filter(({ role }) => role === 'client' || role === 'agent')
                .slice(-5)
                .map(({ role, text }) => ({ role, text: clean(text, 260) })),
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const details = await response.text();
      const error = new Error(`El servicio de IA respondió ${response.status}: ${details.slice(0, 160)}`);
      error.groqStatus = response.status;
      throw error;
    }
    const payload = await response.json();
    const parsed = parseJson(payload.choices?.[0]?.message?.content || '');
    if (!parsed.message) throw new Error('La IA no devolvió un mensaje utilizable.');
    return {
      message: cleanMessage(parsed.message, 700),
      note: clean(parsed.note, 500),
      requiresHuman: parsed.requiresHuman === true,
      retentionDelta: clampNumber(parsed.retentionDelta, -20, 15, 0),
      intent: clean(parsed.intent, 50),
      nextAction: clean(parsed.nextAction, 180),
      generatedBy: 'Generado por IA',
    };
  } catch (error) {
    if (!isRecoverable(error)) throw error;
    const fallback = fallbackWelcomeReply({ kind, client, history, elapsedDays });
    fallback.generatedBy = 'Respaldo automático';
    return fallback;
  }
}

function welcomeSystemPrompt() {
  return `Sos el asistente virtual del equipo de Bienvenida de Más Dueños/Metroterra, marcas vinculadas a Spazios. Hablás con personas que YA forman parte del plan de ahorro. Tu función es acompañar, informar, escuchar y prevenir bajas; no volver a venderles el ingreso.

Respondé en español rioplatense, cercano, humano y poco insistente. Interpretá los datos internos: nunca copies la ficha ni enumeres el contexto. Reconocé primero lo que la persona dijo y hacé una sola pregunta útil.

Información confirmada: el ahorro se deposita en un CVU a nombre de la persona y es administrado mediante un fideicomiso. La primera cuota promocional puede ser ARS 100.000; luego existe una base de ARS 200.000 ajustada por índice CAC. La persona puede aportar más, incluso varias veces en un mes. El objetivo es reunir el anticipo obligatorio de USD 10.000. Hasta completarlo no elige ni reserva un departamento, no ingresa a financiación y no firma boleto. Al completarlo corresponde derivar a POZO para explicar financiación y formalización.

Nunca prometas congelar cuotas, devolver dinero, pausar obligaciones, eliminar ajustes, reservar unidades, otorgar financiación especial ni garantizar plazos. Si consulta contratos, rescisión, retiros, reintegros, deuda exacta, movimientos que no figuran o quiere abandonar, requiresHuman=true. Si expresa una dificultad temporal, acompañá sin juzgar y ofrecé revisar el caso con una persona.

Respondé exclusivamente JSON válido con message, note, requiresHuman, retentionDelta (entero de -20 a 15), intent y nextAction.`;
}

function fallbackWelcomeReply({ kind, client, history, elapsedDays }) {
  if (kind === 'followup') {
    return {
      message: `Hola ${firstName(client.name)}, ¿cómo estás? Pasaron unos días y quería saber cómo venís con el plan. No es para apurarte: si apareció alguna duda o se te complicó organizar el próximo aporte, contame y vemos qué necesitás revisar.`,
      note: `Se retomó el contacto después de ${elapsedDays} días para detectar dudas o riesgo de baja sin ejercer presión.`,
      requiresHuman: false,
      retentionDelta: 1,
      intent: 'seguimiento preventivo',
      nextAction: 'Esperar respuesta y revisar si necesita intervención personal',
      generatedBy: 'Modo demo local',
    };
  }
  const latest = normalizeText([...history].reverse().find(({ role }) => role === 'client')?.text || '');
  if (/baja|cancel|salir|dejar el plan|no quiero seguir|devol/.test(latest)) {
    return {
      message: `Entiendo, ${firstName(client.name)}. Gracias por decírmelo con claridad. No quiero darte una respuesta automática sobre algo tan importante. Voy a dejar registrado lo que planteás para que ${firstName(client.welcomeAdvisor)} revise tu caso y pueda hablarlo con vos personalmente. ¿Preferís que te contacten por llamada o por este chat?`,
      note: 'El cliente manifestó intención de abandonar o consultar una baja. Se solicita intervención personal.',
      requiresHuman: true,
      retentionDelta: -15,
      intent: 'riesgo de baja',
      nextAction: 'Contactar personalmente y revisar las condiciones del caso',
      generatedBy: 'Modo demo local',
    };
  }
  if (/no puedo|complic|gasto|plata|dinero|aporte|pagar/.test(latest)) {
    return {
      message: `Gracias por contármelo, ${firstName(client.name)}. Entiendo que pueden aparecer meses más difíciles. No voy a prometerte un cambio de condiciones por acá, pero sí podemos revisar tu situación para que tengas información clara antes de decidir. ¿Querés que ${firstName(client.welcomeAdvisor)} te contacte y lo vean juntos?`,
      note: 'El cliente manifestó una dificultad para sostener el aporte. Se ofreció revisión personal sin prometer cambios.',
      requiresHuman: true,
      retentionDelta: -6,
      intent: 'dificultad de pago',
      nextAction: 'Revisar la situación de aportes con el cliente',
      generatedBy: 'Modo demo local',
    };
  }
  if (/cac|ajuste|cuota/.test(latest)) {
    return {
      message: `Claro, ${firstName(client.name)}. La base informada del plan es de ARS 200.000 y se actualiza por el índice CAC, por eso puede cambiar con el tiempo. Como tu consulta puede depender de movimientos concretos de tu plan, prefiero que revisemos tus datos antes de darte una cifra. ¿Querés que te contacten para verlo?`,
      note: 'Se explicó el ajuste general por CAC y se evitó calcular una cuota personal sin revisar el caso.',
      requiresHuman: true,
      retentionDelta: 2,
      intent: 'consulta sobre CAC',
      nextAction: 'Confirmar la información personal del plan',
      generatedBy: 'Modo demo local',
    };
  }
  return {
    message: `Gracias por escribir, ${firstName(client.name)}. Tengo presente que tu objetivo es ${objectiveForConversation(client.objective)}. La idea es acompañarte y aclarar lo que necesites para que puedas tomar decisiones con información. ¿Qué parte del plan te gustaría revisar hoy?`,
    note: 'Se respondió al cliente y se abrió una pregunta para identificar su necesidad actual.',
    requiresHuman: false,
    retentionDelta: 3,
    intent: 'consulta general',
    nextAction: 'Continuar el acompañamiento según su respuesta',
    generatedBy: 'Modo demo local',
  };
}

function applyRetentionResult(client, result, at) {
  client.retentionScore = clampNumber(client.retentionScore + Number(result.retentionDelta || 0), 20, 99, client.retentionScore);
  client.requiresHuman = result.requiresHuman === true;
  client.status = client.requiresHuman ? 'attention' : 'active';
  client.nextAction = result.nextAction || (client.requiresHuman ? 'Intervención personal recomendada' : 'Continuar acompañamiento');
  client.lastIntent = result.intent || 'consulta';
  client.updatedAt = at;
  updateRisk(client);
}

function updateRisk(client) {
  if (client.requiresHuman || client.retentionScore < 65 || client.plan.missedPayments >= 2) client.riskLevel = 'high';
  else if (client.retentionScore < 80 || client.plan.missedPayments === 1) client.riskLevel = 'medium';
  else client.riskLevel = 'low';
}

function normalizeClient(client, now) {
  const normalized = structuredClone(client);
  const storedMessages = Array.isArray(normalized.messages) ? normalized.messages : [];
  normalized.messages = storedMessages.filter((item) => !isLegacyInternalContextMessage(item));
  normalized.notes = Array.isArray(normalized.notes) ? normalized.notes : [];
  normalized.plan = normalized.plan || {};
  normalized.plan.targetDownPaymentUsd = TARGET_DOWN_PAYMENT_USD;
  normalized.plan.usdReferenceArs = positiveNumber(normalized.plan.usdReferenceArs, config.welcomeDemo.usdReferenceArs);
  normalized.plan.targetDownPaymentArs = Math.round(TARGET_DOWN_PAYMENT_USD * normalized.plan.usdReferenceArs);
  normalized.plan.progressPercent = calculatePlanProgress(normalized.plan.totalPaidArs, normalized.plan.usdReferenceArs);
  const planNote = normalized.notes.find(({ title }) => title === 'Estado del plan');
  if (planNote) {
    planNote.text = `Registra ${Number(normalized.plan.contributionCount || 0)} aportes y un avance calculado del ${normalized.plan.progressPercent}% hacia el anticipo de USD 10.000.`;
  }
  if (shouldUpgradeSeedHistory(normalized)) {
    normalized.messages = seedMessages({ client: normalized, now, index: historyScenarioIndex(normalized) });
    normalized.historyVersion = 2;
  }
  normalized.retentionScore = clampNumber(normalized.retentionScore, 20, 99, 75);
  normalized.simulatedAt = Number(normalized.simulatedAt || now);
  updateRisk(normalized);
  return normalized;
}

function objectiveForConversation(value) {
  return clean(value, 180)
    .replace(/\bsu familia\b/gi, 'tu familia')
    .replace(/\bsu pareja\b/gi, 'tu pareja')
    .replace(/\bsu futuro\b/gi, 'tu futuro');
}

function formatArs(value) {
  return `$ ${Math.round(Number(value) || 0).toLocaleString('es-AR')}`;
}

function shouldUpgradeSeedHistory(client) {
  if (Number(client.historyVersion || 0) >= 2) return false;
  if (client.messages.length > 4) return false;
  return !client.messages.some((item) => (
    item?.clientRequestId
    || item?.replyToRequestId
    || item?.generatedBy
    || item?.role === 'time'
  ));
}

function historyScenarioIndex(client) {
  const context = String(client.context || '');
  const concernIndex = CONCERNS.findIndex((concern) => context.includes(concern));
  if (concernIndex >= 0) return concernIndex;
  return [...String(client.name || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 8;
}

function calculatePlanProgress(totalPaidArs, usdReferenceArs) {
  const targetArs = TARGET_DOWN_PAYMENT_USD * positiveNumber(usdReferenceArs, config.welcomeDemo.usdReferenceArs);
  if (!targetArs) return 0;
  return Math.max(0, Math.min(100, Math.round((positiveNumber(totalPaidArs, 0) / targetArs) * 100)));
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function isLegacyInternalContextMessage(item) {
  if (item?.role !== 'client') return false;
  const text = clean(item?.text, 500);
  return CONCERNS.some((concern) => clean(concern, 500) === text);
}

function eventTime(client, now) {
  return Math.max(Number(now || 0), Number(client.simulatedAt || 0), Number(client.updatedAt || 0) + 1);
}

function message(role, text, createdAt, extra = {}) {
  return { id: randomUUID(), role, text, createdAt, ...extra };
}

function note(title, text, createdAt, tone = 'neutral') {
  return { id: randomUUID(), title, text, createdAt, tone };
}

function interpretClientContext(client) {
  const context = normalizeText(`${client.context} ${client.objective}`);
  if (/familia|hij/.test(context)) return 'quiere construir estabilidad para su familia';
  if (/pareja/.test(context)) return 'quiere sostener el proceso para proyectar un hogar con su pareja';
  if (/alquil/.test(context)) return 'quiere dejar de alquilar y necesita sostener un ahorro posible';
  if (/imprevisto|mes dificil|gasto/.test(context)) return 'tuvo gastos imprevistos y necesita acompañamiento sin presión';
  return 'quiere ordenar el ahorro y avanzar con constancia hacia su anticipo';
}

function parseJson(raw) {
  const cleaned = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\`\`\`(?:json)?|\`\`\`$/gim, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Respuesta JSON inválida.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function isRecoverable(error) {
  return error?.name === 'TimeoutError'
    || error instanceof TypeError
    || [429, 500, 502, 503, 504].includes(Number(error?.groqStatus))
    || /Respuesta JSON inválida|no devolvió un mensaje/i.test(String(error?.message || ''));
}

function publicError(error) {
  if (Number(error?.groqStatus) === 429) return 'El servicio de IA alcanzó temporalmente su límite de uso.';
  if (error?.name === 'TimeoutError') return 'El servicio de IA demoró demasiado en responder.';
  return clean(error?.message || 'No se pudo generar la respuesta.', 180);
}

function cleanMessage(value, limit) {
  return String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit);
}

function clean(value, limit) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function summarize(value, limit) {
  const text = clean(value, limit + 1);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '¿cómo estás?';
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function slug(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
}

function capitalize(value) {
  const text = String(value || '');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : '';
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedChoice(items) {
  return items[randomInt(0, items.length - 1)];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}
