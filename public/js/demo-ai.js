const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
const state = { snapshot: null, selectedLeadId: null, query: '', loading: false, refreshing: null };
const $ = (selector) => document.querySelector(selector);

document.body.dataset.view = 'leads';

const elements = {
  aiMode: $('#aiMode'),
  activeCount: $('#activeCount'),
  handoffCount: $('#handoffCount'),
  leadList: $('#leadList'),
  leadSearch: $('#leadSearch'),
  chatEmpty: $('#chatEmpty'),
  chatContent: $('#chatContent'),
  chatAvatar: $('#chatAvatar'),
  chatName: $('#chatName'),
  chatPhone: $('#chatPhone'),
  chatState: $('#chatState'),
  messageList: $('#messageList'),
  replyForm: $('#replyForm'),
  replyInput: $('#replyInput'),
  opportunityEmpty: $('#opportunityEmpty'),
  opportunityContent: $('#opportunityContent'),
  opportunityName: $('#opportunityName'),
  opportunityStatus: $('#opportunityStatus'),
  interestValue: $('#interestValue'),
  interestBar: $('#interestBar'),
  interestLabel: $('#interestLabel'),
  handoffCard: $('#handoffCard'),
  handoffReason: $('#handoffReason'),
  handleButton: $('#handleButton'),
  detailAdvisor: $('#detailAdvisor'),
  detailObjective: $('#detailObjective'),
  detailBuilding: $('#detailBuilding'),
  detailNextAction: $('#detailNextAction'),
  notesCount: $('#notesCount'),
  notesList: $('#notesList'),
  leadModal: $('#leadModal'),
  leadForm: $('#leadForm'),
  advisorSelect: $('#advisorSelect'),
  toast: $('#aiToast'),
};

bindEvents();
await refresh({ first: true });
setInterval(renderTimeSensitiveFields, 1_000);
setInterval(() => {
  if (!state.loading) refresh();
}, 2_000);

function bindEvents() {
  $('#newLeadButton').addEventListener('click', openLeadModal);
  $('#closeLeadModal').addEventListener('click', closeLeadModal);
  $('#cancelLeadModal').addEventListener('click', closeLeadModal);
  elements.leadModal.addEventListener('click', (event) => {
    if (event.target === elements.leadModal) closeLeadModal();
  });
  elements.leadSearch.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderLeadList();
  });
  elements.leadForm.addEventListener('submit', createLead);
  elements.replyForm.addEventListener('submit', sendLeadReply);
  document.querySelectorAll('[data-advance-hours]').forEach((button) => button.addEventListener('click', () => advanceTime(button)));
  elements.handleButton.addEventListener('click', handleHandoff);
  $('#showOpportunity').addEventListener('click', () => setMobileView('opportunity'));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => setMobileView(button.dataset.go)));
  document.querySelectorAll('.ai-mobile-nav [data-view]').forEach((button) => button.addEventListener('click', () => setMobileView(button.dataset.view)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.leadModal.hidden) closeLeadModal();
  });
}

async function refresh({ first = false } = {}) {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const snapshot = await api('/api/demo-ai/snapshot');
      state.snapshot = snapshot;
      if (!state.selectedLeadId || !snapshot.leads.some((lead) => lead.id === state.selectedLeadId)) {
        state.selectedLeadId = snapshot.leads[0]?.id || null;
      }
      render();
      if (first && window.innerWidth <= 860) setMobileView('leads');
    } catch (error) {
      toast(error.message, true);
    }
  })();
  try {
    return await state.refreshing;
  } finally {
    state.refreshing = null;
  }
}

function render() {
  if (!state.snapshot) return;
  const { ai, leads } = state.snapshot;
  elements.aiMode.textContent = ai.mode;
  elements.aiMode.prepend(document.createElement('i'));
  elements.aiMode.classList.toggle('connected', ai.enabled);
  elements.activeCount.textContent = leads.filter((lead) => !['human', 'error'].includes(lead.status)).length;
  elements.handoffCount.textContent = leads.filter((lead) => lead.humanHandoff).length;
  renderAdvisorOptions();
  renderLeadList();
  renderSelectedLead();
}

function renderAdvisorOptions() {
  const current = elements.advisorSelect.value;
  const advisors = state.snapshot.advisors.length
    ? state.snapshot.advisors
    : [{ id: 'demo', name: 'Nuria Pereyra' }];
  elements.advisorSelect.innerHTML = advisors.map((advisor) => `<option value="${escapeAttr(advisor.name)}">${escapeHtml(advisor.name)}</option>`).join('');
  if (advisors.some((advisor) => advisor.name === current)) elements.advisorSelect.value = current;
}

function renderLeadList() {
  if (!state.snapshot) return;
  const leads = state.snapshot.leads.filter((lead) => `${lead.name} ${lead.phone}`.toLowerCase().includes(state.query));
  elements.leadList.innerHTML = leads.length
    ? leads.map((lead) => {
        const latest = lead.messages.at(-1);
        const preview = lead.status === 'scheduled'
          ? `Primer contacto ${relativeTime(lead.nextActionAt)}`
          : latest?.text || 'Sin mensajes todavía';
        return `<button class="ai-lead-item ${lead.id === state.selectedLeadId ? 'active' : ''}" data-lead-id="${escapeAttr(lead.id)}" type="button">
          <span class="ai-avatar">${escapeHtml(initials(lead.name))}</span>
          <span class="ai-lead-copy"><strong>${escapeHtml(lead.name)}</strong><p>${escapeHtml(preview)}</p></span>
          <span class="ai-lead-meta"><time>${formatListTime(lead.updatedAt)}</time><i class="ai-mini-status ${escapeAttr(lead.status)}"></i></span>
        </button>`;
      }).join('')
    : '<div class="ai-empty-side"><p>No encontramos oportunidades con ese criterio.</p></div>';
  elements.leadList.querySelectorAll('[data-lead-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedLeadId = button.dataset.leadId;
      renderLeadList();
      renderSelectedLead();
      if (window.innerWidth <= 860) setMobileView('chat');
    });
  });
}

function renderSelectedLead() {
  const lead = selectedLead();
  elements.chatEmpty.hidden = Boolean(lead);
  elements.chatContent.hidden = !lead;
  elements.opportunityEmpty.hidden = Boolean(lead);
  elements.opportunityContent.hidden = !lead;
  if (!lead) return;

  elements.chatAvatar.textContent = initials(lead.name);
  elements.chatName.textContent = lead.name;
  elements.chatPhone.textContent = lead.phone;
  elements.replyInput.placeholder = `Responder como ${firstName(lead.name)}`;
  document.querySelectorAll('[data-advance-hours]').forEach((button) => {
    button.disabled = ['human', 'error', 'cold'].includes(lead.status);
  });
  elements.chatState.textContent = lead.status === 'thinking' ? 'Agente IA escribiendo…' : `Cuenta de ${lead.advisorName}`;
  elements.opportunityName.textContent = lead.name;
  elements.opportunityStatus.textContent = statusLabel(lead.status);
  elements.opportunityStatus.className = `ai-status-chip ${lead.status}`;
  elements.interestValue.textContent = `${lead.interest}%`;
  elements.interestBar.style.width = `${lead.interest}%`;
  elements.interestLabel.textContent = interestLabel(lead.interest);
  elements.detailAdvisor.textContent = lead.advisorName;
  elements.detailObjective.textContent = lead.objective;
  elements.detailBuilding.textContent = lead.buildingName;
  elements.handoffCard.hidden = !lead.humanHandoff;
  elements.handoffReason.textContent = lead.handoffReason;
  elements.notesCount.textContent = lead.notes.length;
  elements.notesList.innerHTML = lead.notes.map((item) => `<article class="ai-note ${escapeAttr(item.tone)}"><strong>${escapeHtml(item.author)}</strong><p>${escapeHtml(item.text)}</p><time>${formatDateTime(item.createdAt)}</time></article>`).join('');
  renderMessages(lead);
  renderTimeSensitiveFields();
}

function renderMessages(lead) {
  const pending = lead.status === 'scheduled'
    ? `<div class="ai-day-label ai-scheduled-banner">Primer mensaje programado ${escapeHtml(relativeTime(lead.nextActionAt))} · <button id="sendNowButton" type="button">Enviar ahora</button></div>`
    : '';
  const bubbles = lead.messages.map((item) => {
    if (item.role === 'time') {
      return `<div class="ai-time-passage"><span>⌛</span>${escapeHtml(item.text)}</div>`;
    }
    const card = item.card ? `<article class="ai-building-card">
      <img src="${escapeAttr(item.card.imageUrl)}" alt="Edificio residencial de demostración">
      <div><strong>${escapeHtml(item.card.title)}</strong><small>${escapeHtml(item.card.address)}</small><a href="${escapeAttr(item.card.mapsUrl)}" target="_blank" rel="noopener noreferrer">⌖ Ver ubicación en Google Maps</a></div>
    </article>` : '';
    const generatedLabel = item.generatedBy
      ? `<span class="ai-generated-label" title="${escapeAttr(item.generationStyle || 'Generado por IA')}">✦ ${escapeHtml(item.generatedBy)}</span>`
      : '';
    return `<article class="ai-bubble ${escapeAttr(item.role)}">${card}<p>${escapeHtml(item.text)}</p><footer>${generatedLabel}<time>${formatTime(item.createdAt)}${item.role === 'advisor' ? '<span class="ai-checks">✓✓</span>' : ''}</time></footer></article>`;
  }).join('');
  const typing = lead.status === 'thinking' ? '<div class="ai-typing" aria-label="El agente está escribiendo"><i></i><i></i><i></i></div>' : '';
  elements.messageList.innerHTML = `<div class="ai-day-label">DEMOSTRACIÓN · HOY</div>${pending}${bubbles}${typing}`;
  $('#sendNowButton')?.addEventListener('click', sendNow);
  requestAnimationFrame(() => { elements.messageList.scrollTop = elements.messageList.scrollHeight; });
}

async function advanceTime(button) {
  const lead = selectedLead();
  if (!lead || state.loading) return;
  state.loading = true;
  const buttons = document.querySelectorAll('[data-advance-hours]');
  buttons.forEach((item) => { item.disabled = true; });
  try {
    const result = await api(`/api/demo-ai/leads/${encodeURIComponent(lead.id)}/advance-time`, {
      method: 'POST',
      body: { hours: Number(button.dataset.advanceHours) },
    });
    if (state.snapshot) {
      state.snapshot.leads = state.snapshot.leads.map((item) => item.id === result.lead.id ? result.lead : item);
      render();
    }
    const messages = {
      waiting: 'El agente decidió esperar para no ser invasivo.',
      followup: 'Qwen generó un nuevo seguimiento por falta de respuesta.',
      closed: 'Qwen cerró la secuencia automática y dejó el lead en pausa.',
    };
    toast(messages[result.outcome] || 'Tiempo simulado.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.loading = false;
    const currentStatus = selectedLead()?.status;
    buttons.forEach((item) => {
      item.disabled = ['human', 'error', 'cold'].includes(currentStatus);
    });
  }
}

function renderTimeSensitiveFields() {
  const lead = selectedLead();
  if (!lead) return;
  elements.detailNextAction.textContent = lead.nextActionAt
    ? `${lead.status === 'scheduled' ? 'Primer mensaje' : 'Próximo seguimiento'} ${relativeTime(lead.nextActionAt, lead.simulatedAt || Date.now())}`
    : nextActionLabel(lead);
  if (lead.status === 'scheduled') {
    const banner = elements.messageList.querySelector('.ai-scheduled-banner');
    if (banner) banner.childNodes[0].textContent = `Primer mensaje programado ${relativeTime(lead.nextActionAt)} · `;
    renderLeadList();
  }
}

async function createLead(event) {
  event.preventDefault();
  if (state.loading) return;
  state.loading = true;
  const submit = elements.leadForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(elements.leadForm));
    const response = await api('/api/demo-ai/leads', { method: 'POST', body: payload });
    state.selectedLeadId = response.lead.id;
    if (state.snapshot) {
      state.snapshot.leads = [response.lead, ...state.snapshot.leads.filter((lead) => lead.id !== response.lead.id)];
      render();
    }
    closeLeadModal();
    await refresh();
    setMobileView('chat');
    toast('Seguimiento iniciado. El primer mensaje quedó programado.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.loading = false;
    submit.disabled = false;
  }
}

async function sendNow() {
  const lead = selectedLead();
  if (!lead || state.loading) return;
  state.loading = true;
  try {
    await api(`/api/demo-ai/leads/${encodeURIComponent(lead.id)}/send-now`, { method: 'POST' });
    await refresh();
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.loading = false;
  }
}

async function sendLeadReply(event) {
  event.preventDefault();
  const lead = selectedLead();
  const text = elements.replyInput.value.trim();
  if (!lead || !text || state.loading) return;
  state.loading = true;
  const button = elements.replyForm.querySelector('[type="submit"]');
  button.disabled = true;
  elements.replyInput.value = '';
  try {
    await api(`/api/demo-ai/leads/${encodeURIComponent(lead.id)}/reply`, { method: 'POST', body: { text } });
    await refresh();
  } catch (error) {
    elements.replyInput.value = text;
    toast(error.message, true);
  } finally {
    state.loading = false;
    button.disabled = false;
    elements.replyInput.focus();
  }
}

async function handleHandoff() {
  const lead = selectedLead();
  if (!lead || state.loading) return;
  state.loading = true;
  try {
    await api(`/api/demo-ai/leads/${encodeURIComponent(lead.id)}/handle`, { method: 'POST' });
    await refresh();
    toast('Conversación asignada al asesor.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.loading = false;
  }
}

function selectedLead() {
  return state.snapshot?.leads.find((lead) => lead.id === state.selectedLeadId) || null;
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || 'el lead';
}

function openLeadModal() {
  elements.leadModal.hidden = false;
  document.body.style.overflow = 'hidden';
  elements.leadForm.elements.name.focus();
}

function closeLeadModal() {
  elements.leadModal.hidden = true;
  document.body.style.overflow = '';
}

function setMobileView(view) {
  if ((view === 'chat' || view === 'opportunity') && !selectedLead() && state.snapshot?.leads.length) {
    state.selectedLeadId = state.snapshot.leads[0].id;
    renderLeadList();
    renderSelectedLead();
  }
  document.body.dataset.view = view;
  document.querySelectorAll('.ai-mobile-nav [data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la acción.');
  return payload;
}

let toastTimer;
function toast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', isError);
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 3_600);
}

function statusLabel(status) {
  return ({ scheduled: 'Programado', thinking: 'IA escribiendo', following: 'En seguimiento', handoff: 'Derivar al asesor', human: 'Atención personal', cold: 'En pausa', error: 'Revisar error' })[status] || 'Seguimiento';
}

function nextActionLabel(lead) {
  if (lead.status === 'handoff') return 'Intervención personal del asesor';
  if (lead.status === 'human') return 'Conversación tomada por el asesor';
  if (lead.status === 'thinking') return 'El agente está preparando una respuesta';
  if (lead.status === 'cold') return 'Secuencia finalizada; puede reactivarse si el lead responde';
  if (lead.status === 'error') return 'Revisar conexión con Groq';
  return 'Esperar respuesta del lead';
}

function interestLabel(value) {
  if (value >= 78) return 'Interés alto: conviene una intervención personal.';
  if (value >= 50) return 'Interés en crecimiento: mantener seguimiento.';
  return 'Etapa inicial: aportar información relevante.';
}

function relativeTime(timestamp, reference = Date.now()) {
  if (!timestamp) return '';
  const seconds = Math.ceil((timestamp - reference) / 1000);
  if (seconds <= 0) return 'en unos segundos';
  if (seconds < 60) return `en ${seconds} s`;
  if (seconds < 60 * 60) return `en ${Math.ceil(seconds / 60)} min`;
  if (seconds < 24 * 60 * 60) return `en ${Math.ceil(seconds / (60 * 60))} h`;
  const days = Math.ceil(seconds / (24 * 60 * 60));
  return `en ${days} ${days === 1 ? 'día' : 'días'}`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(timestamp));
}

function formatListTime(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? formatTime(timestamp) : new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(date);
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
