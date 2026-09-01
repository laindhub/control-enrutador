const ACTIVE_COUNT_STATUSES = new Set(['derived', 'confirmed']);
const TERMINAL_STATUSES = new Set(['confirmed', 'na', 'left_before', 'left_during']);

export class DemoStoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export class DemoStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.reset();
  }

  reset(actor = 'Sistema demo') {
    const now = this.now();
    this.leads = seedLeads(now);
    this.audit = [];
    this.advisorsInitialized = false;
    this.writeAudit('demo.reset', actor, 'Se restauraron los datos ficticios.');
  }

  routerSnapshot({ room, advisors }) {
    this.initializeAdvisorAssignments(advisors);
    const normalizedRoom = room === 'charla2' ? 'charla2' : 'charla1';
    const advisorStats = this.advisorStats(advisors);
    const leads = this.leads
      .filter((lead) => lead.status === normalizedRoom)
      .sort((left, right) => left.enteredStageAt - right.enteredStageAt)
      .map((lead) => ({
        ...clone(lead),
        recommendation: this.recommendAdvisor(lead, advisorStats),
      }));
    const standby = this.leads
      .filter((lead) => lead.status === 'derived')
      .sort((left, right) => left.derivedAt - right.derivedAt)
      .map(clone);

    return {
      room: normalizedRoom,
      leads,
      standby,
      advisors: advisorStats,
      totals: {
        charla1: this.leads.filter((lead) => lead.status === 'charla1').length,
        charla2: this.leads.filter((lead) => lead.status === 'charla2').length,
        derived: this.leads.filter((lead) => lead.status === 'derived').length,
      },
    };
  }

  advisorSnapshot({ advisorName, advisors }) {
    this.initializeAdvisorAssignments(advisors);
    const pending = this.leads
      .filter((lead) => lead.advisorName === advisorName && lead.status === 'derived')
      .sort((left, right) => left.derivedAt - right.derivedAt)
      .map(clone);
    const history = this.leads
      .filter((lead) => lead.advisorName === advisorName && TERMINAL_STATUSES.has(lead.status))
      .sort((left, right) => (right.resolvedAt || 0) - (left.resolvedAt || 0))
      .map(clone);

    return {
      advisorName,
      pending,
      history,
      count: this.countForAdvisor(advisorName),
    };
  }

  adminSnapshot({ advisors }) {
    this.initializeAdvisorAssignments(advisors);
    const advisorStats = this.advisorStats(advisors);
    const statusCounts = Object.fromEntries(
      ['charla1', 'charla2', 'derived', 'confirmed', 'na', 'left_before', 'left_during']
        .map((status) => [status, this.leads.filter((lead) => lead.status === status).length]),
    );

    return {
      totals: {
        people: this.leads.length,
        waiting: statusCounts.charla1 + statusCounts.charla2,
        pendingAdvisor: statusCounts.derived,
        confirmed: statusCounts.confirmed,
        lost: statusCounts.na + statusCounts.left_before + statusCounts.left_during,
      },
      statusCounts,
      advisors: advisorStats,
      leads: [...this.leads]
        .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
        .map(clone),
      audit: this.audit.slice(0, 80).map(clone),
    };
  }

  derive({ leadId, advisorName, operatorName, advisors }) {
    this.initializeAdvisorAssignments(advisors);
    const lead = this.requireLead(leadId);
    if (!['charla1', 'charla2'].includes(lead.status)) {
      throw new DemoStoreError('La persona ya no está disponible para derivar.', 409);
    }
    if (!advisors.some((advisor) => advisor.name === advisorName)) {
      throw new DemoStoreError('El asesor seleccionado no está disponible.', 409);
    }
    const pendingAssignment = this.leads.find(
      (item) => item.advisorName === advisorName && item.status === 'derived',
    );
    if (pendingAssignment) {
      throw new DemoStoreError(
        `${advisorName} todavía tiene a ${pendingAssignment.name} en standby.`,
        409,
      );
    }

    const previousStage = lead.status;
    const timestamp = this.now();
    lead.status = 'derived';
    lead.advisorName = advisorName;
    lead.routedBy = operatorName;
    lead.derivedAt = timestamp;
    lead.updatedAt = timestamp;
    lead.resolvedAt = null;
    lead.rejectionReason = null;
    lead.sourceStage = previousStage;
    this.writeAudit(
      'lead.derived',
      operatorName,
      `${lead.name} fue derivada a ${advisorName} desde ${stageLabel(previousStage)}.`,
      lead.id,
    );
    return clone(lead);
  }

  updateAppearance({ leadId, appearance, operatorName }) {
    const lead = this.requireLead(leadId);
    lead.appearance = cleanText(appearance, 240);
    lead.updatedAt = this.now();
    this.writeAudit('lead.appearance_updated', operatorName, `Se actualizó la referencia visual de ${lead.name}.`, lead.id);
    return clone(lead);
  }

  markDeparted({ leadId, operatorName, moment }) {
    const lead = this.requireLead(leadId);
    if (!['charla1', 'charla2'].includes(lead.status)) {
      throw new DemoStoreError('La persona ya no está disponible para cerrar el seguimiento.', 409);
    }
    const timestamp = this.now();
    lead.status = moment === 'before' ? 'left_before' : 'left_during';
    lead.resolvedAt = timestamp;
    lead.updatedAt = timestamp;
    lead.routedBy = operatorName;
    this.writeAudit(
      'lead.departed',
      operatorName,
      `${lead.name} ${moment === 'before' ? 'no se quedó a la charla' : 'se retiró antes de terminar la charla'}.`,
      lead.id,
    );
    return clone(lead);
  }

  answerAssignment({ leadId, advisorName, confirmed, reason = 'perdidos_liniers' }) {
    const lead = this.requireLead(leadId);
    if (lead.advisorName !== advisorName) throw new DemoStoreError('La derivación pertenece a otro asesor.', 403);
    if (lead.status !== 'derived') throw new DemoStoreError('La derivación ya fue respondida.', 409);

    const timestamp = this.now();
    lead.status = confirmed ? 'confirmed' : 'na';
    lead.rejectionReason = confirmed ? null : normalizeReason(reason);
    lead.resolvedAt = timestamp;
    lead.updatedAt = timestamp;
    this.writeAudit(
      confirmed ? 'assignment.confirmed' : 'assignment.rejected',
      advisorName,
      confirmed
        ? `${advisorName} confirmó el asesoramiento de ${lead.name}.`
        : `${advisorName} marcó a ${lead.name} como N/A.`,
      lead.id,
    );
    return clone(lead);
  }

  correctAssignment({ leadId, advisorName, confirmed, reason = 'perdidos_liniers' }) {
    const lead = this.requireLead(leadId);
    if (lead.advisorName !== advisorName) throw new DemoStoreError('La derivación pertenece a otro asesor.', 403);
    if (!['confirmed', 'na'].includes(lead.status)) {
      throw new DemoStoreError('La derivación todavía no tiene una respuesta para corregir.', 409);
    }

    const previousStatus = lead.status;
    lead.status = confirmed ? 'confirmed' : 'na';
    lead.rejectionReason = confirmed ? null : normalizeReason(reason);
    lead.updatedAt = this.now();
    lead.resolvedAt = lead.updatedAt;
    this.writeAudit(
      'assignment.corrected',
      advisorName,
      `${advisorName} corrigió ${lead.name}: ${statusLabel(previousStatus)} → ${statusLabel(lead.status)}.`,
      lead.id,
    );
    return clone(lead);
  }

  updateRejectionReason({ leadId, advisorName, reason }) {
    const lead = this.requireLead(leadId);
    if (lead.advisorName !== advisorName || lead.status !== 'na') {
      throw new DemoStoreError('Solo se puede cambiar el motivo de una derivación N/A.', 409);
    }
    lead.rejectionReason = normalizeReason(reason);
    lead.updatedAt = this.now();
    this.writeAudit('assignment.reason_updated', advisorName, `Se cambió el motivo de ${lead.name}.`, lead.id);
    return clone(lead);
  }

  advisorStats(advisors) {
    const performanceOrder = performanceRank(advisors);
    return advisors.map((advisor) => {
      const pendingAssignment = this.leads.find(
        (lead) => lead.advisorName === advisor.name && lead.status === 'derived',
      );
      return {
        id: advisor.id,
        name: advisor.name,
        team: advisor.team,
        count: this.countForAdvisor(advisor.name),
        performanceRank: performanceOrder.findIndex((name) => name === advisor.name) + 1,
        available: !pendingAssignment,
        standbyLeadName: pendingAssignment?.name || null,
      };
    });
  }

  countForAdvisor(advisorName) {
    return this.leads.filter(
      (lead) => lead.advisorName === advisorName && ACTIVE_COUNT_STATUSES.has(lead.status),
    ).length;
  }

  recommendAdvisor(lead, advisorStats) {
    if (!advisorStats.length) return null;
    const performance = performanceRank(advisorStats);
    const candidates = advisorStats.filter((advisor) => advisor.available);
    if (!candidates.length) return null;
    if (lead.potability >= 64) {
      candidates.sort((left, right) => performance.indexOf(left.name) - performance.indexOf(right.name));
      return {
        ...candidates[0],
        reason: `Potabilidad ${lead.potability}: prioridad al mejor rendimiento disponible`,
      };
    }
    candidates.sort((left, right) => left.count - right.count || left.name.localeCompare(right.name, 'es'));
    return { ...candidates[0], reason: 'Equilibrio: menor cantidad de derivaciones' };
  }

  initializeAdvisorAssignments(advisors) {
    if (this.advisorsInitialized || !advisors.length) return;
    const ranked = performanceRank(advisors);
    const first = ranked[0] || advisors[0].name;
    const second = ranked[1] || first;
    for (const lead of this.leads) {
      if (lead.advisorSeed === 'first') lead.advisorName = first;
      if (lead.advisorSeed === 'second') lead.advisorName = second;
      delete lead.advisorSeed;
    }
    this.advisorsInitialized = true;
  }

  requireLead(leadId) {
    const lead = this.leads.find((item) => item.id === String(leadId));
    if (!lead) throw new DemoStoreError('La persona demo no existe.', 404);
    return lead;
  }

  writeAudit(action, actor, message, leadId = null) {
    this.audit.unshift({
      id: `${this.now()}-${this.audit.length + 1}`,
      action,
      actor,
      message,
      leadId,
      createdAt: this.now(),
    });
  }
}

export const demoStore = new DemoStore();

function seedLeads(now) {
  const base = [
    demoLead('demo-1', 'Lucía Fernández', '11 5555-0101', 'charla1', 78, now - minutes(18), {
      host: 'Valerie Aredes', presenter: 'Priscila', appearance: 'Campera beige, cartera negra.', urgency: 'Lo antes posible', income: '$1.800.000', idealHome: 'Casa', apartment: true, decision: 'Yo y alguien más', companionPresent: true,
    }),
    demoLead('demo-2', 'Bruno Sosa', '11 5555-0102', 'charla1', 55, now - minutes(11), {
      host: 'Iara Fernández', presenter: 'Thomas', appearance: 'Remera azul, vino solo.', urgency: 'Me gustaría pero no es urgente', income: '$950.000', idealHome: 'Departamento', apartment: true, decision: 'Solo', companionPresent: false,
    }),
    demoLead('demo-3', 'Camila Ríos', '11 5555-0103', 'charla2', 91, now - minutes(24), {
      host: 'Valerie Aredes', presenter: 'Nahuel', appearance: 'Buzo gris, acompañada por su pareja.', urgency: 'Lo antes posible', income: '$2.300.000', idealHome: 'Casa', apartment: false, decision: 'Yo y alguien más', companionPresent: true,
    }),
    demoLead('demo-4', 'Martín Silva', '11 5555-0104', 'charla2', 46, now - minutes(8), {
      host: 'Iara Fernández', presenter: 'Keren', appearance: 'Camisa blanca, mochila verde.', urgency: 'No urgente', income: '$1.100.000', idealHome: 'PH', apartment: false, decision: 'Solo', companionPresent: false,
    }),
    demoLead('demo-5', 'Paula Medina', '11 5555-0105', 'derived', 84, now - minutes(70), {
      host: 'Valerie Aredes', presenter: 'Priscila', appearance: 'Tapado negro, lentes.', urgency: 'Lo antes posible', income: '$2.000.000', idealHome: 'Departamento', apartment: true, decision: 'Yo y alguien más', companionPresent: true, advisorSeed: 'first', derivedAt: now - minutes(42), routedBy: 'Nicole', sourceStage: 'charla1',
    }),
    demoLead('demo-6', 'Diego Acosta', '11 5555-0106', 'derived', 67, now - minutes(45), {
      host: 'Iara Fernández', presenter: 'Thomas', appearance: 'Campera roja, gorra negra.', urgency: 'Me gustaría pero no es urgente', income: '$1.400.000', idealHome: 'Casa', apartment: true, decision: 'Solo', companionPresent: false, advisorSeed: 'second', derivedAt: now - minutes(12), routedBy: 'Keren', sourceStage: 'charla2',
    }),
    demoLead('demo-7', 'Sofía Herrera', '11 5555-0107', 'confirmed', 72, now - minutes(110), {
      host: 'Valerie Aredes', presenter: 'Priscila', appearance: 'Sweater bordó.', urgency: 'Lo antes posible', income: '$1.650.000', idealHome: 'Departamento', apartment: true, decision: 'Solo', companionPresent: false, advisorSeed: 'first', derivedAt: now - minutes(85), resolvedAt: now - minutes(50), routedBy: 'Nicole', sourceStage: 'charla1',
    }),
    demoLead('demo-8', 'Federico Luna', '11 5555-0108', 'na', 39, now - minutes(95), {
      host: 'Iara Fernández', presenter: 'Keren', appearance: 'Chomba verde.', urgency: 'No urgente', income: '$880.000', idealHome: 'Casa', apartment: false, decision: 'Yo y alguien más', companionPresent: false, advisorSeed: 'second', derivedAt: now - minutes(65), resolvedAt: now - minutes(30), routedBy: 'Keren', sourceStage: 'charla2', rejectionReason: 'perdidos_liniers',
    }),
  ];
  return base;
}

function demoLead(id, name, phone, status, potability, enteredStageAt, extra) {
  return {
    id,
    name,
    phone,
    email: `${id}@ejemplo.demo`,
    age: 30 + Number(id.at(-1)),
    status,
    potability,
    enteredStageAt,
    updatedAt: extra.resolvedAt || extra.derivedAt || enteredStageAt,
    advisorName: null,
    derivedAt: null,
    resolvedAt: null,
    routedBy: null,
    rejectionReason: null,
    sourceStage: null,
    ...extra,
  };
}

function performanceRank(advisors) {
  const preferred = ['samuel lee', 'matias gomez'];
  return [...advisors]
    .sort((left, right) => {
      const leftIndex = preferred.indexOf(normalizeName(left.name));
      const rightIndex = preferred.indexOf(normalizeName(right.name));
      const leftRank = leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const rightRank = rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return leftRank - rightRank
        || Number(left.sort_order || left.performanceRank || 0) - Number(right.sort_order || right.performanceRank || 0)
        || left.name.localeCompare(right.name, 'es');
    })
    .map((advisor) => advisor.name);
}

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizeReason(value) {
  const valid = new Set(['perdidos_liniers', 'nunca_llego', 'otro_asesor', 'se_retiro', 'error_derivacion']);
  return valid.has(value) ? value : 'perdidos_liniers';
}

function cleanText(value, limit) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, limit);
}

function stageLabel(status) {
  return status === 'charla2' ? 'Charla 2' : 'Charla 1';
}

function statusLabel(status) {
  return status === 'confirmed' ? 'Confirmada' : 'N/A';
}

function minutes(value) {
  return value * 60 * 1000;
}

function clone(value) {
  return structuredClone(value);
}
