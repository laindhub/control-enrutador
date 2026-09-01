const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const role = document.body.dataset.demoRole;
const modal = document.querySelector('#demoModal');
const modalContent = document.querySelector('#demoModalContent');
const toast = document.querySelector('#toast');
let snapshot = null;
let currentRoom = 'charla1';
let loading = false;

document.querySelector('#demoModalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });

document.querySelectorAll('[data-room]').forEach((button) => {
  button.addEventListener('click', () => {
    currentRoom = button.dataset.room;
    document.querySelectorAll('[data-room]').forEach((item) => item.classList.toggle('active', item === button));
    loadSnapshot();
  });
});

document.querySelector('#demoReset')?.addEventListener('click', async () => {
  if (!window.confirm('¿Restaurar todos los datos ficticios de la demo?')) return;
  try {
    await api('/api/demo/reset', { method: 'POST', body: '{}' });
    showToast('Datos demo restaurados.');
    await loadSnapshot();
  } catch (error) {
    showToast(error.message, true);
  }
});

const socket = globalThis.io({ transports: ['polling'] });
socket.on('demo:changed', () => loadSnapshot());

async function loadSnapshot() {
  if (loading) return;
  loading = true;
  try {
    snapshot = await api(`/api/demo/snapshot${role === 'router' ? `?room=${currentRoom}` : ''}`);
    if (role === 'router') renderRouter(snapshot);
    if (role === 'advisor') renderAdvisor(snapshot);
    if (role === 'admin') renderAdmin(snapshot);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    loading = false;
  }
}

function renderRouter(data) {
  document.querySelector('#charla1Count').textContent = data.totals.charla1;
  document.querySelector('#charla2Count').textContent = data.totals.charla2;
  const queue = document.querySelector('#demoQueue');
  const empty = document.querySelector('#demoQueueEmpty');
  queue.replaceChildren(...data.leads.map(routerCard));
  queue.hidden = data.leads.length === 0;
  empty.hidden = data.leads.length > 0;
  const standby = data.standby || [];
  const standbyList = document.querySelector('#demoStandbyList');
  standbyList.replaceChildren(...standby.map(standbyCard));
  document.querySelector('#demoStandbyCount').textContent = standby.length;
  document.querySelector('#demoStandbyEmpty').hidden = standby.length > 0;
  document.querySelector('#demoAdvisorBalance').replaceChildren(...data.advisors.map(balanceItem));
}

function routerCard(lead) {
  const card = document.createElement('article');
  card.className = 'demo-lead-card';
  card.innerHTML = `
    <div class="demo-card-top">
      <div><h2>${escapeHtml(lead.name)}</h2><div class="demo-card-meta">${escapeHtml(lead.phone)} · Host: ${escapeHtml(lead.host)}</div></div>
      <span class="potability-pill ${lead.potability >= 64 ? 'high' : ''}">${lead.potability}</span>
    </div>
    <p class="demo-appearance">${lead.appearance ? escapeHtml(lead.appearance) : 'Sin descripción visual todavía.'}</p>
    <div class="demo-card-footer"><span class="demo-wait">En charla hace ${formatElapsed(lead.enteredStageAt)}</span><button class="demo-open-button" type="button">Revisar y derivar</button></div>
  `;
  card.querySelector('button').addEventListener('click', () => openRouterLead(lead));
  return card;
}

function balanceItem(advisor) {
  const item = document.createElement('div');
  item.className = 'demo-balance-item';
  item.innerHTML = `<span>${escapeHtml(advisor.name)}</span><strong>${advisor.count}</strong>`;
  return item;
}

function standbyCard(lead) {
  const card = document.createElement('article');
  card.className = `demo-standby-card delay-${delayLevel(lead.derivedAt)}`;
  card.innerHTML = `
    <div class="demo-standby-person"><strong>${escapeHtml(lead.name)}</strong><span>${stageLabel(lead.sourceStage)} · Enrutó ${escapeHtml(lead.routedBy)}</span></div>
    <div class="demo-standby-advisor"><span>Asesor</span><strong>${escapeHtml(lead.advisorName)}</strong></div>
    <div class="demo-standby-time"><span>STANDBY</span><strong>${formatElapsed(lead.derivedAt)}</strong></div>
  `;
  return card;
}

function openRouterLead(lead) {
  const recommendation = lead.recommendation;
  modalContent.innerHTML = `
    <div class="demo-person-head"><div><p class="eyebrow">${stageLabel(lead.status)} · POTABILIDAD ${lead.potability}</p><h2 id="demoModalTitle">${escapeHtml(lead.name)}</h2><p>${escapeHtml(lead.phone)} · Host: ${escapeHtml(lead.host)}</p></div><span class="potability-pill ${lead.potability >= 64 ? 'high' : ''}">${lead.potability}</span></div>
    ${detailGrid(lead, false)}
    <label class="demo-note-field">Descripción visual<textarea id="demoAppearance" maxlength="240">${escapeHtml(lead.appearance || '')}</textarea></label>
    <button id="saveAppearance" class="button button-secondary button-block" type="button">Guardar descripción</button>
    ${recommendation ? `<div class="demo-recommendation"><strong>Recomendado: ${escapeHtml(recommendation.name)}</strong><br><small>${escapeHtml(recommendation.reason)}</small></div>` : '<div class="alert alert-error">No hay asesores disponibles en la demo.</div>'}
    <div id="demoAdvisorOptions" class="demo-advisor-options"></div>
    <div class="demo-depart-actions"><button data-moment="before" type="button">No se quedó a la charla</button><button data-moment="during" type="button">Se retiró antes de terminar</button></div>
  `;
  document.querySelector('#saveAppearance').addEventListener('click', async () => {
    try {
      await api(`/api/demo/leads/${lead.id}/appearance`, {
        method: 'PATCH',
        body: JSON.stringify({ appearance: document.querySelector('#demoAppearance').value }),
      });
      showToast('Descripción visual guardada.');
    } catch (error) {
      showToast(error.message, true);
    }
  });
  const options = document.querySelector('#demoAdvisorOptions');
  options.replaceChildren(...snapshot.advisors.map((advisor) => advisorOption(lead, advisor, recommendation)));
  document.querySelectorAll('[data-moment]').forEach((button) => button.addEventListener('click', () => markDeparted(lead, button.dataset.moment)));
  openModal();
}

async function markDeparted(lead, moment) {
  try {
    await api(`/api/demo/leads/${lead.id}/depart`, {
      method: 'POST',
      body: JSON.stringify({ moment }),
    });
    closeModal();
    showToast(moment === 'before' ? 'Registrado: no se quedó a la charla.' : 'Registrado: se retiró antes de terminar.');
    await loadSnapshot();
  } catch (error) {
    showToast(error.message, true);
  }
}

function advisorOption(lead, advisor, recommendation) {
  const button = document.createElement('button');
  const recommended = recommendation?.name === advisor.name;
  button.className = `demo-advisor-option ${recommended ? 'recommended' : ''}`;
  button.type = 'button';
  button.disabled = !advisor.available;
  const detail = advisor.available
    ? `${recommended ? 'RECOMENDADO · ' : ''}${advisor.count} deriv.`
    : `EN STANDBY · ${advisor.standbyLeadName}`;
  button.innerHTML = `<strong>${escapeHtml(advisor.name)}</strong><span>${escapeHtml(detail)}</span>`;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api(`/api/demo/leads/${lead.id}/derive`, {
        method: 'POST',
        body: JSON.stringify({ advisorName: advisor.name }),
      });
      closeModal();
      showToast(`${lead.name} fue derivada a ${advisor.name}.`);
      await loadSnapshot();
    } catch (error) {
      closeModal();
      showToast(error.message, true);
      await loadSnapshot();
    }
  });
  return button;
}

function renderAdvisor(data) {
  document.querySelector('#demoAdvisorCount').textContent = data.count;
  const assignments = document.querySelector('#demoAssignments');
  const empty = document.querySelector('#demoAssignmentsEmpty');
  assignments.replaceChildren(...data.pending.map(assignmentCard));
  assignments.hidden = data.pending.length === 0;
  empty.hidden = data.pending.length > 0;
  const history = document.querySelector('#demoAdvisorHistory');
  history.replaceChildren(...data.history.map(historyRow));
  if (!data.history.length) history.innerHTML = '<p class="muted">Todavía no hay confirmaciones en esta sesión demo.</p>';
}

function assignmentCard(lead) {
  const delay = delayLevel(lead.derivedAt);
  const card = document.createElement('article');
  card.className = `demo-assignment-card delay-${delay}`;
  card.innerHTML = `
    <div><h2>${escapeHtml(lead.name)}</h2><p>Potabilidad ${lead.potability} · ${stageLabel(lead.sourceStage)} · Enrutó ${escapeHtml(lead.routedBy)}</p></div>
    <div class="demo-delay-badge"><strong>${formatElapsed(lead.derivedAt)}</strong><button type="button">Ver ficha</button></div>
  `;
  card.querySelector('button').addEventListener('click', () => openAdvisorLead(lead));
  return card;
}

function openAdvisorLead(lead) {
  modalContent.innerHTML = `
    <div class="demo-person-head"><div><p class="eyebrow">DERIVACIÓN · ${formatElapsed(lead.derivedAt)}</p><h2 id="demoModalTitle">${escapeHtml(lead.name)}</h2><p>${escapeHtml(lead.phone)} · ${escapeHtml(lead.email)}</p></div><span class="potability-pill high">${lead.potability}</span></div>
    ${detailGrid(lead, true)}
    <div class="demo-answer-actions"><button id="answerNo" class="demo-answer-no" type="button">No fue asesorada por mí</button><button id="answerYes" class="demo-answer-yes" type="button">Sí, fue asesorada</button></div>
  `;
  document.querySelector('#answerYes').addEventListener('click', () => answerLead(lead, true));
  document.querySelector('#answerNo').addEventListener('click', () => answerLead(lead, false));
  openModal();
}

async function answerLead(lead, confirmed) {
  try {
    await api(`/api/demo/leads/${lead.id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ confirmed, reason: 'perdidos_liniers' }),
    });
    closeModal();
    showToast(confirmed ? 'Asesoramiento confirmado.' : 'Marcado como N/A · Perdidos Liniers.');
    await loadSnapshot();
  } catch (error) {
    showToast(error.message, true);
  }
}

function historyRow(lead) {
  const row = document.createElement('div');
  row.className = 'demo-history-row';
  row.innerHTML = `
    <div><strong>${escapeHtml(lead.name)}</strong><p>${lead.status === 'confirmed' ? 'Asesoramiento confirmado' : reasonLabel(lead.rejectionReason)}</p></div>
    <div class="demo-history-actions"><span class="demo-status ${lead.status}">${lead.status === 'confirmed' ? 'CONFIRMADA' : 'N/A'}</span>${lead.status === 'na' ? '<button class="demo-correct-button reason" type="button">Motivo</button>' : ''}<button class="demo-correct-button toggle" type="button">${lead.status === 'confirmed' ? 'Corregir a N/A' : 'Confirmar'}</button></div>
  `;
  row.querySelector('.toggle').addEventListener('click', () => correctLead(lead, lead.status !== 'confirmed'));
  row.querySelector('.reason')?.addEventListener('click', () => openReasonPicker(lead));
  return row;
}

async function correctLead(lead, confirmed) {
  try {
    await api(`/api/demo/leads/${lead.id}/correct`, {
      method: 'POST',
      body: JSON.stringify({ confirmed, reason: 'perdidos_liniers' }),
    });
    showToast('Confirmación corregida.');
    await loadSnapshot();
  } catch (error) {
    showToast(error.message, true);
  }
}

function openReasonPicker(lead) {
  const reasons = [
    ['perdidos_liniers', 'Perdidos Liniers'],
    ['nunca_llego', 'Nunca llegó conmigo'],
    ['otro_asesor', 'Fue con otro asesor'],
    ['se_retiro', 'Se retiró antes de ser atendida'],
    ['error_derivacion', 'Error de derivación'],
  ];
  modalContent.innerHTML = `<p class="eyebrow">CAMBIAR MOTIVO</p><h2 id="demoModalTitle">${escapeHtml(lead.name)}</h2><div id="reasonOptions" class="demo-advisor-options"></div>`;
  const container = document.querySelector('#reasonOptions');
  container.replaceChildren(...reasons.map(([value, label]) => {
    const button = document.createElement('button');
    button.className = `demo-advisor-option ${lead.rejectionReason === value ? 'recommended' : ''}`;
    button.type = 'button';
    button.innerHTML = `<strong>${escapeHtml(label)}</strong>`;
    button.addEventListener('click', async () => {
      try {
        await api(`/api/demo/leads/${lead.id}/reason`, { method: 'PATCH', body: JSON.stringify({ reason: value }) });
        closeModal();
        showToast('Motivo actualizado.');
        await loadSnapshot();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    return button;
  }));
  openModal();
}

function renderAdmin(data) {
  const metrics = [
    ['Personas', data.totals.people],
    ['En charlas', data.totals.waiting],
    ['En standby', data.totals.pendingAdvisor],
    ['Confirmadas', data.totals.confirmed],
    ['N/A y retiradas', data.totals.lost],
  ];
  document.querySelector('#demoMetrics').innerHTML = metrics.map(([label, value]) => `<article class="demo-metric"><span>${label}</span><strong>${value}</strong></article>`).join('');
  renderFunnel(data);
  document.querySelector('#demoAdminAdvisors').replaceChildren(...data.advisors.map(balanceItem));
  document.querySelector('#demoAdminLeads').innerHTML = data.leads.map((lead) => `<div class="demo-admin-row"><div><strong>${escapeHtml(lead.name)}</strong><p>${escapeHtml(lead.phone)} · ${lead.advisorName ? `Asesor: ${escapeHtml(lead.advisorName)}` : stageLabel(lead.status)}</p></div><span class="demo-status ${lead.status === 'confirmed' ? 'confirmed' : lead.status === 'na' ? 'na' : ''}">${statusLabel(lead.status)}</span></div>`).join('');
  document.querySelector('#demoAudit').innerHTML = data.audit.map((item) => `<div class="demo-audit-row"><strong>${escapeHtml(item.actor)}</strong><p>${escapeHtml(item.message)} · ${formatClock(item.createdAt)}</p></div>`).join('');
}

function renderFunnel(data) {
  const items = [
    ['Charla 1', data.statusCounts.charla1],
    ['Charla 2', data.statusCounts.charla2],
    ['Standby', data.statusCounts.derived],
    ['Confirmadas', data.statusCounts.confirmed],
    ['N/A', data.statusCounts.na],
  ];
  const max = Math.max(1, ...items.map(([, value]) => value));
  document.querySelector('#demoFunnel').innerHTML = items.map(([label, value]) => `<div class="demo-funnel-row"><span>${label}</span><div class="demo-funnel-track"><div class="demo-funnel-fill" style="width:${(value / max) * 100}%"></div></div><strong>${value}</strong></div>`).join('');
}

function detailGrid(lead, full) {
  const details = [
    ['Edad', `${lead.age} años`],
    ['Casa ideal', lead.idealHome],
    ['Urgencia', lead.urgency],
    ['Decisión', lead.decision],
    ['Acompañante presente', lead.companionPresent ? 'Sí' : 'No'],
    ['Presentador', lead.presenter],
  ];
  if (full) details.splice(1, 0, ['Correo', lead.email], ['Ingresos', lead.income], ['Viviría en departamento', lead.apartment ? 'Sí' : 'No']);
  return `<div class="demo-detail-grid">${details.map(([label, value]) => `<div class="demo-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>`;
}

function delayLevel(derivedAt) {
  const age = (Date.now() - Number(derivedAt)) / 60000;
  if (age >= 60) return 'black';
  if (age >= 40) return 'red';
  if (age >= 30) return 'yellow';
  return 'green';
}

function formatElapsed(timestamp) {
  const totalMinutes = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 60000));
  if (totalMinutes < 60) return `${totalMinutes} MIN`;
  return `${Math.floor(totalMinutes / 60)} H ${totalMinutes % 60} MIN`;
}

function formatClock(timestamp) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function stageLabel(status) {
  const labels = { charla1: 'Charla 1', charla2: 'Charla 2', derived: 'Standby', confirmed: 'Confirmada', na: 'N/A', left_before: 'Se retiró antes', left_during: 'Se retiró durante la charla' };
  return labels[status] || 'Seguimiento';
}

function statusLabel(status) {
  return stageLabel(status).toUpperCase();
}

function reasonLabel(reason) {
  const labels = { perdidos_liniers: 'Perdidos Liniers', nunca_llego: 'Nunca llegó conmigo', otro_asesor: 'Fue con otro asesor', se_retiro: 'Se retiró antes de ser atendida', error_derivacion: 'Error de derivación' };
  return labels[reason] || labels.perdidos_liniers;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken, ...(options.headers || {}) },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'No se pudo completar la operación demo.');
  return payload;
}

function openModal() {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.hidden = true;
  modalContent.replaceChildren();
  document.body.style.overflow = '';
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

loadSnapshot();
setInterval(loadSnapshot, 30_000);
