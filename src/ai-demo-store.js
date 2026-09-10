import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const DEFAULT_MAP_URL = 'https://www.google.com/maps/search/?api=1&query=Caseros%2C%20Buenos%20Aires';

export class AiDemoStore {
  constructor({ now = () => Date.now(), generate = generateWithGroq } = {}) {
    this.now = now;
    this.generate = generate;
    this.leads = [];
    this.processing = new Set();
    this.emit = () => {};
    this.reset();
  }

  setEmitter(emit) {
    this.emit = typeof emit === 'function' ? emit : () => {};
  }

  snapshot({ advisors = [] } = {}) {
    return {
      leads: structuredClone(this.leads),
      advisors: advisors.map(({ id, name }) => ({ id, name })),
      ai: {
        enabled: Boolean(config.groq.apiKey),
        model: config.groq.model,
        mode: config.groq.apiKey ? 'Qwen conectado mediante Groq' : 'Respuestas de demostración',
      },
      generatedAt: this.now(),
    };
  }

  createLead(input) {
    const createdAt = this.now();
    const delaySeconds = clampNumber(input.delaySeconds, 5, 300, 12);
    const lead = {
      id: randomUUID(),
      name: clean(input.name, 100) || 'Nuevo lead',
      phone: clean(input.phone, 40) || '+54 9 11 0000-0000',
      advisorName: clean(input.advisorName, 100) || 'Asesor demo',
      objective: clean(input.objective, 180) || 'Conocer opciones para acceder a un departamento',
      buildingName: clean(input.buildingName, 100) || 'Proyecto Caseros Centro',
      buildingAddress: clean(input.buildingAddress, 160) || 'Caseros, Buenos Aires',
      mapsUrl: safeMapUrl(input.mapsUrl),
      context: clean(input.context, 500),
      status: 'scheduled',
      interest: 36,
      humanHandoff: false,
      handoffReason: '',
      createdAt,
      updatedAt: createdAt,
      nextActionAt: createdAt + delaySeconds * 1000,
      messages: [],
      notes: [note('Sistema', `Lead incorporado al seguimiento de ${leadName(input.name)}. Primer contacto programado en ${delaySeconds} segundos.`, createdAt)],
    };
    this.leads.unshift(lead);
    this.emitChange('lead-created', lead.id);
    return structuredClone(lead);
  }

  getLead(id) {
    const lead = this.leads.find((item) => item.id === String(id));
    if (!lead) throw new AiDemoError('La oportunidad demo no existe.', 404);
    return lead;
  }

  async processDue() {
    const due = this.leads.filter((lead) => lead.status === 'scheduled' && lead.nextActionAt <= this.now());
    await Promise.all(due.map((lead) => this.sendInitial(lead.id)));
  }

  async sendInitial(id, { force = false } = {}) {
    const lead = this.getLead(id);
    if (this.processing.has(id)) return structuredClone(lead);
    if (!force && lead.status !== 'scheduled') return structuredClone(lead);
    this.processing.add(id);
    lead.status = 'thinking';
    lead.updatedAt = this.now();
    this.emitChange('ai-thinking', id);
    try {
      const result = await this.generate({ kind: 'initial', lead, history: lead.messages });
      const createdAt = this.now();
      lead.messages.push(message('advisor', result.message, createdAt, {
        sender: lead.advisorName,
        generatedBy: result.generatedBy || null,
        generationStyle: result.generationStyle || null,
        card: {
          imageUrl: '/assets/demo-ai/edificio-demo.webp',
          title: lead.buildingName,
          address: lead.buildingAddress,
          mapsUrl: lead.mapsUrl,
        },
      }));
      lead.notes.unshift(note('Agente IA', result.note || `Se envió una propuesta para visitar ${lead.buildingName}.`, createdAt));
      lead.status = 'following';
      lead.nextActionAt = null;
      lead.updatedAt = createdAt;
      this.emitChange('initial-sent', id);
      return structuredClone(lead);
    } catch (error) {
      lead.status = 'error';
      lead.notes.unshift(note('Sistema', `No se pudo generar el mensaje: ${publicError(error)}`, this.now()));
      this.emitChange('ai-error', id);
      throw error;
    } finally {
      this.processing.delete(id);
    }
  }

  async receiveLeadMessage(id, rawText) {
    const lead = this.getLead(id);
    const text = clean(rawText, 800);
    if (!text) throw new AiDemoError('Escribí una respuesta del lead.', 400);
    const receivedAt = this.now();
    lead.messages.push(message('lead', text, receivedAt, { sender: lead.name }));
    lead.notes.unshift(note('Agente IA', `Mensaje recibido de ${lead.name}: “${text}”`, receivedAt));
    lead.status = 'thinking';
    lead.updatedAt = receivedAt;
    this.emitChange('lead-replied', id);

    const signals = interestSignals(text);
    lead.interest = Math.min(100, lead.interest + signals.delta);
    try {
      const result = await this.generate({ kind: 'reply', lead, history: lead.messages });
      const repliedAt = this.now();
      lead.messages.push(message('advisor', result.message, repliedAt, {
        sender: lead.advisorName,
        generatedBy: result.generatedBy || null,
        generationStyle: result.generationStyle || null,
      }));
      lead.notes.unshift(note('Agente IA', result.note || `Se respondió a ${lead.name} y se actualizó el seguimiento.`, repliedAt));
      const requiresHuman = Boolean(result.requiresHuman) || signals.requiresHuman || lead.interest >= 78;
      lead.humanHandoff = requiresHuman;
      lead.handoffReason = requiresHuman
        ? clean(result.handoffReason, 220) || signals.reason || 'El lead muestra intención concreta de avanzar.'
        : '';
      lead.status = requiresHuman ? 'handoff' : 'following';
      lead.updatedAt = repliedAt;
      if (requiresHuman) {
        lead.notes.unshift(note('Agente IA', `Intervención personal recomendada: ${lead.handoffReason}`, repliedAt, 'priority'));
      }
      this.emitChange(requiresHuman ? 'handoff-requested' : 'ai-replied', id);
      return structuredClone(lead);
    } catch (error) {
      lead.status = 'error';
      lead.notes.unshift(note('Sistema', `No se pudo responder: ${publicError(error)}`, this.now()));
      this.emitChange('ai-error', id);
      throw error;
    }
  }

  markHandled(id) {
    const lead = this.getLead(id);
    lead.humanHandoff = false;
    lead.status = 'human';
    lead.updatedAt = this.now();
    lead.notes.unshift(note(lead.advisorName, 'El asesor tomó la conversación para intervención personal.', lead.updatedAt, 'success'));
    this.emitChange('handoff-handled', id);
    return structuredClone(lead);
  }

  reset() {
    const createdAt = this.now();
    this.leads = [
      {
        id: 'demo-ai-lucia',
        name: 'Lucía Fernández',
        phone: '+54 9 11 5555-0182',
        advisorName: 'Nuria Pereyra',
        objective: 'Dejar de alquilar y conocer opciones de dos ambientes',
        buildingName: 'Proyecto Caseros Centro',
        buildingAddress: 'Caseros, Buenos Aires',
        mapsUrl: DEFAULT_MAP_URL,
        context: 'Visitó la charla. Decide con su pareja y pidió ver una alternativa cerca del tren.',
        status: 'following',
        interest: 58,
        humanHandoff: false,
        handoffReason: '',
        createdAt: createdAt - 26 * 60 * 1000,
        updatedAt: createdAt - 20 * 60 * 1000,
        nextActionAt: null,
        messages: [
          message('advisor', 'Hola Lucía, soy Nuria de Más Dueños. Me quedé pensando en lo que nos contaste sobre buscar algo cerca del tren. Quería mostrarte este proyecto en Caseros. ¿Te gustaría conocerlo algún día de esta semana?', createdAt - 24 * 60 * 1000, {
            sender: 'Nuria Pereyra',
            card: {
              imageUrl: '/assets/demo-ai/edificio-demo.webp',
              title: 'Proyecto Caseros Centro',
              address: 'Caseros, Buenos Aires',
              mapsUrl: DEFAULT_MAP_URL,
            },
          }),
          message('lead', 'Sí, podría verlo el sábado. ¿Se puede por la mañana?', createdAt - 21 * 60 * 1000, { sender: 'Lucía Fernández' }),
          message('advisor', 'Sí, podemos coordinarlo. ¿Te quedaría bien alrededor de las 11? Si me confirmás, le aviso al equipo para reservarte el horario.', createdAt - 20 * 60 * 1000, { sender: 'Nuria Pereyra' }),
        ],
        notes: [
          note('Agente IA', 'La lead respondió positivamente y propuso visitar el proyecto el sábado por la mañana. Se consultó disponibilidad a las 11:00.', createdAt - 20 * 60 * 1000),
          note('Agente IA', 'Se mostró Proyecto Caseros Centro con ubicación en Google Maps y se propuso una visita durante la semana.', createdAt - 24 * 60 * 1000),
          note('Sistema', 'Lead incorporado al seguimiento automático.', createdAt - 26 * 60 * 1000),
        ],
      },
    ];
    this.processing.clear();
    this.emitChange('reset', null);
  }

  emitChange(reason, leadId) {
    this.emit({ reason, leadId, at: this.now() });
  }
}

export class AiDemoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function generateWithGroq({ kind, lead, history }) {
  if (!config.groq.apiKey) return fallbackGeneration({ kind, lead, history });
  const variation = messageVariation(lead, kind);
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.groq.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.groq.model,
      temperature: 0.72,
      max_completion_tokens: 420,
      messages: [
        {
          role: 'system',
          content: `Sos un agente de seguimiento comercial individual de Más Dueños. Escribís mensajes de WhatsApp en español rioplatense, naturales, breves y sin presión. Cada conversación debe sentirse escrita especialmente para esa persona: no uses una plantilla fija ni repitas siempre la misma apertura, estructura o cierre. Usá únicamente los datos relevantes del objetivo y contexto; no enumeres todos. En el primer contacto presentate con el nombre exacto del asesor y Más Dueños, conectá con un detalle concreto del lead y terminá con una sola pregunta útil. No digas solamente “soy de Más Dueños”. No inventes precios, disponibilidad, beneficios, horarios ni características. El contacto ya autorizó esta demostración. Respondé exclusivamente JSON válido con: message (máximo 420 caracteres), note (resumen CRM preciso en tercera persona), requiresHuman (boolean) y handoffReason (string). Si el lead quiere visitar, reservar, pagar, recibir una propuesta concreta o hablar con alguien, requiresHuman debe ser true.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: kind === 'initial' ? 'Primer contacto después de la charla' : 'Responder el último mensaje del lead',
            variation,
            lead: {
              name: lead.name,
              advisor: lead.advisorName,
              objective: lead.objective,
              context: lead.context,
              building: lead.buildingName,
              address: lead.buildingAddress,
            },
            history: history.slice(-8).map(({ role, text }) => ({ role, text })),
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Groq respondió ${response.status}: ${details.slice(0, 180)}`);
  }
  const payload = await response.json();
  const raw = payload.choices?.[0]?.message?.content || '';
  const parsed = parseModelJson(raw);
  if (!parsed.message) throw new Error('Qwen no devolvió un mensaje utilizable.');
  return {
    message: clean(parsed.message, 500),
    note: clean(parsed.note, 600),
    requiresHuman: parsed.requiresHuman === true,
    handoffReason: clean(parsed.handoffReason, 240),
    generatedBy: 'Qwen vía Groq',
    generationStyle: variation.label,
  };
}

function fallbackGeneration({ kind, lead, history }) {
  if (kind === 'initial') {
    return {
      message: `Hola ${firstName(lead.name)}, soy ${firstName(lead.advisorName)} de Más Dueños. Por lo que conversamos, quería mostrarte ${lead.buildingName}, en ${lead.buildingAddress}. ¿Te interesaría conocerlo en los próximos días?`,
      note: `Se inició el seguimiento y se mostró ${lead.buildingName} con su ubicación. Se consultó disponibilidad para coordinar una visita.`,
      requiresHuman: false,
      handoffReason: '',
      generatedBy: 'Modo demo local',
      generationStyle: 'Mensaje de respaldo',
    };
  }
  const latest = history.at(-1)?.text || '';
  const signals = interestSignals(latest);
  if (signals.requiresHuman) {
    return {
      message: `Perfecto, ${firstName(lead.name)}. Me alegra que te interese. Voy a avisarle a ${firstName(lead.advisorName)} para que te contacte y puedan coordinarlo personalmente. ¿Qué horario te queda más cómodo?`,
      note: `El lead manifestó intención concreta de avanzar. Se solicitó un horario de contacto y se recomendó intervención personal del asesor.`,
      requiresHuman: true,
      handoffReason: signals.reason,
      generatedBy: 'Modo demo local',
      generationStyle: 'Mensaje de respaldo',
    };
  }
  return {
    message: `Gracias por contarme, ${firstName(lead.name)}. Lo tengo en cuenta para acompañarte mejor. ¿Qué aspecto te gustaría conocer primero: la ubicación, el proyecto o cómo sería una visita?`,
    note: `Se respondió la consulta del lead y se realizó una pregunta de calificación para continuar el seguimiento.`,
    requiresHuman: false,
    handoffReason: '',
    generatedBy: 'Modo demo local',
    generationStyle: 'Mensaje de respaldo',
  };
}

function messageVariation(lead, kind) {
  const initialStyles = [
    { label: 'Retoma un detalle', instruction: 'Abrí retomando de forma natural un detalle personal o una prioridad que surgió en la charla.' },
    { label: 'Directo y cercano', instruction: 'Sé directo y conversacional: presentate, explicá por qué escribís y hacé una propuesta simple.' },
    { label: 'Consultivo', instruction: 'Empezá con una observación sobre lo que busca el lead y formulá una pregunta que confirme si el proyecto encaja.' },
    { label: 'Breve y espontáneo', instruction: 'Escribí como un WhatsApp breve y espontáneo, sin tono de campaña ni frases comerciales.' },
    { label: 'Orientado al objetivo', instruction: 'Conectá primero con el objetivo principal del lead y después presentá el proyecto como una opción para evaluar.' },
  ];
  const replyStyles = [
    { label: 'Respuesta empática', instruction: 'Respondé primero a lo que acaba de decir y hacé una sola pregunta para avanzar.' },
    { label: 'Calificación suave', instruction: 'Reconocé su respuesta y pedí únicamente el dato más útil que todavía falta.' },
    { label: 'Próximo paso', instruction: 'Contestá con claridad y proponé el próximo paso mínimo, sin presionar.' },
  ];
  const styles = kind === 'initial' ? initialStyles : replyStyles;
  const source = `${lead.id}:${lead.name}:${lead.objective}`;
  const index = [...source].reduce((sum, character) => sum + character.codePointAt(0), 0) % styles.length;
  return styles[index];
}

function parseModelJson(raw) {
  const cleaned = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?|```$/gim, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Respuesta JSON inválida.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function interestSignals(text) {
  const normalized = text.toLowerCase();
  const high = ['quiero ir', 'quiero verlo', 'quiero avanzar', 'me interesa', 'reserv', 'agend', 'visita', 'sábado', 'mañana', 'horario', 'llamame', 'llámame', 'asesor', 'cuánto tengo que'];
  const medium = ['precio', 'cuota', 'ubicación', 'dónde', 'cuando', 'cuándo', 'departamento', 'ambiente'];
  const highMatch = high.find((term) => normalized.includes(term));
  if (highMatch) return { delta: 28, requiresHuman: true, reason: 'El lead expresó interés concreto en visitar, coordinar o avanzar.' };
  if (medium.some((term) => normalized.includes(term))) return { delta: 14, requiresHuman: false, reason: '' };
  return { delta: 5, requiresHuman: false, reason: '' };
}

function message(role, text, createdAt, extra = {}) {
  return { id: randomUUID(), role, text, createdAt, ...extra };
}

function note(author, text, createdAt, tone = 'neutral') {
  return { id: randomUUID(), author, text, createdAt, tone };
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '¿cómo estás?';
}

function clean(value, limit) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function leadName(value) {
  return clean(value, 100) || 'la persona';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function safeMapUrl(value) {
  try {
    const url = new URL(String(value || DEFAULT_MAP_URL));
    if (url.protocol !== 'https:') return DEFAULT_MAP_URL;
    return url.toString();
  } catch {
    return DEFAULT_MAP_URL;
  }
}

function publicError(error) {
  if (error?.name === 'TimeoutError') return 'Groq demoró demasiado en responder.';
  return String(error?.message || 'Error inesperado').slice(0, 220);
}
