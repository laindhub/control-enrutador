const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
const state = {
  snapshot: null,
  selectedClientId: null,
  query: '',
  loading: false,
  pendingReply: null,
  agentActivity: null,
  renderedChatSignature: '',
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  aiMode: $('#welcomeAiMode'),
  retentionAverage: $('#retentionAverage'),
  riskCount: $('#riskCount'),
  activePlans: $('#activePlans'),
  clientCount: $('#welcomeClientCount'),
  search: $('#welcomeSearch'),
  clientList: $('#welcomeClientList'),
  chatEmpty: $('#welcomeChatEmpty'),
  chatContent: $('#welcomeChatContent'),
  chatAvatar: $('#welcomeChatAvatar'),
  chatName: $('#welcomeChatName'),
  chatContact: $('#welcomeChatContact'),
  chatState: $('#welcomeChatState'),
  messageList: $('#welcomeMessageList'),
  replyForm: $('#welcomeReplyForm'),
  replyInput: $('#welcomeReplyInput'),
  retentionEmpty: $('#welcomeRetentionEmpty'),
  retentionContent: $('#welcomeRetentionContent'),
  detailName: $('#welcomeDetailName'),
  riskBadge: $('#welcomeRiskBadge'),
  scoreRing: $('#welcomeScoreRing'),
  retentionScore: $('#welcomeRetentionScore'),
  retentionLabel: $('#welcomeRetentionLabel'),
  nextAction: $('#welcomeNextAction'),
  planProgress: $('#welcomePlanProgress'),
  planBar: $('#welcomePlanBar'),
  planTarget: $('#welcomePlanTarget'),
  usdReference: $('#welcomeUsdReference'),
  paidAmount: $('#welcomePaidAmount'),
  contributionCount: $('#welcomeContributionCount'),
  lastPayment: $('#welcomeLastPayment'),
  monthlyBase: $('#welcomeMonthlyBase'),
  advisor: $('#welcomeAdvisor'),
  occupation: $('#welcomeOccupation'),
  phone: $('#welcomePhone'),
  email: $('#welcomeEmail'),
  objective: $('#welcomeObjective'),
  context: $('#welcomeContext'),
  notesCount: $('#welcomeNotesCount'),
  notesList: $('#welcomeNotesList'),
  handleButton: $('#welcomeHandleButton'),
  videoButton: $('#sendWelcomeVideo'),
  regenerate: $('#regenerateWelcome'),
  toast: $('#welcomeToast'),
};

bindEvents();
await refresh({ first: true });

function bindEvents() {
  elements.search.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderClientList();
  });
  elements.replyForm.addEventListener('submit', sendClientReply);
  document.querySelectorAll('[data-advance-days]').forEach((button) => {
    button.addEventListener('click', () => advanceTime(button));
  });
  elements.handleButton.addEventListener('click', handleClient);
  elements.videoButton.addEventListener('click', sendWelcomeVideo);
  elements.regenerate.addEventListener('click', regenerateClients);
  $('#showWelcomeRetention').addEventListener('click', () => setMobileView('retention'));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => setMobileView(button.dataset.go)));
  document.querySelectorAll('.welcome-mobile-nav [data-view]').forEach((button) => {
    button.addEventListener('click', () => setMobileView(button.dataset.view));
  });
  window.addEventListener('online', () => refresh({ silent: true }));
  window.addEventListener('pageshow', () => refresh({ silent: true }));
}

async function refresh({ first = false, silent = false } = {}) {
  if (state.loading && !first) return;
  try {
    const snapshot = await api('/api/demo-ai/welcome/snapshot', { timeoutMs: 20_000 });
    state.snapshot = snapshot;
    if (!state.selectedClientId || !snapshot.clients.some(({ id }) => id === state.selectedClientId)) {
      state.selectedClientId = snapshot.clients[0]?.id || null;
    }
    render();
  } catch (error) {
    if (!silent) toast(error.message, true);
  }
}

function render() {
  const snapshot = state.snapshot;
  if (!snapshot) return;
  elements.aiMode.textContent = snapshot.ai.mode;
  elements.retentionAverage.textContent = `${snapshot.metrics.retentionAverage}%`;
  elements.riskCount.textContent = snapshot.metrics.riskCount;
  elements.activePlans.textContent = snapshot.metrics.activePlans;
  elements.clientCount.textContent = snapshot.clients.length;
  renderClientList();
  renderSelectedClient();
}

function renderClientList() {
  const clients = state.snapshot?.clients || [];
  const query = normalize(state.query);
  const filtered = clients
    .filter((client) => !query || normalize([
      client.name,
      client.phone,
      client.email,
      client.context,
      client.objective,
      client.welcomeAdvisor,
    ].join(' ')).includes(query))
    .sort((a, b) => riskOrder(a) - riskOrder(b) || a.retentionScore - b.retentionScore || a.name.localeCompare(b.name));

  elements.clientList.innerHTML = filtered.length
    ? filtered.map((client) => `<button type="button" class="welcome-client-row ${client.id === state.selectedClientId ? 'active' : ''}" data-client-id="${escapeAttr(client.id)}">
        <span class="welcome-avatar">${escapeHtml(client.initials)}</span>
        <span class="welcome-client-copy"><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.objective)}</small><em>${formatMoney(client.plan.totalPaidArs)} aportados · ${client.plan.progressPercent}% del plan</em></span>
        <span class="welcome-client-score ${escapeAttr(client.riskLevel)}"><b>${client.retentionScore}%</b><small>${riskLabel(client.riskLevel)}</small></span>
      </button>`).join('')
    : '<div class="welcome-list-empty">No encontramos clientes con ese criterio.</div>';

  elements.clientList.querySelectorAll('[data-client-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedClientId = button.dataset.clientId;
      state.renderedChatSignature = '';
      renderClientList();
      renderSelectedClient();
      if (window.innerWidth <= 900) setMobileView('chat');
    });
  });
}

function renderSelectedClient() {
  const client = selectedClient();
  elements.chatEmpty.hidden = Boolean(client);
  elements.chatContent.hidden = !client;
  elements.retentionEmpty.hidden = Boolean(client);
  elements.retentionContent.hidden = !client;
  if (!client) return;

  const typing = agentIsTyping(client);
  elements.chatAvatar.textContent = client.initials;
  elements.chatName.textContent = client.name;
  elements.chatContact.textContent = `${client.phone} · ${client.welcomeAdvisor}`;
  elements.chatState.textContent = typing ? 'Escribiendo…' : client.status === 'human' ? 'Atención personal' : 'Plan activo';
  elements.replyInput.placeholder = `Responder como ${firstName(client.name)}`;
  elements.replyInput.disabled = client.status === 'human';
  document.querySelectorAll('[data-advance-days]').forEach((button) => {
    button.disabled = state.loading || client.status === 'human';
  });
  const sentVideoCount = client.messages.filter((item) => item.video?.id).length;
  elements.videoButton.disabled = state.loading
    || client.status === 'thinking'
    || sentVideoCount >= Number(state.snapshot?.ai?.videoFollowUpCount || 1);
  elements.videoButton.textContent = sentVideoCount >= Number(state.snapshot?.ai?.videoFollowUpCount || 1)
    ? 'Videos enviados'
    : '▶ Video';

  elements.detailName.textContent = client.name;
  elements.riskBadge.textContent = riskLabel(client.riskLevel);
  elements.riskBadge.className = client.riskLevel;
  elements.scoreRing.style.setProperty('--score', client.retentionScore);
  elements.retentionScore.textContent = `${client.retentionScore}%`;
  elements.retentionLabel.textContent = retentionLabel(client.retentionScore);
  elements.nextAction.textContent = client.nextAction;
  elements.planProgress.textContent = `${client.plan.progressPercent}%`;
  elements.planBar.style.width = `${client.plan.progressPercent}%`;
  elements.planTarget.textContent = formatMoney(client.plan.targetDownPaymentArs);
  elements.usdReference.textContent = formatMoney(client.plan.usdReferenceArs);
  elements.paidAmount.textContent = formatMoney(client.plan.totalPaidArs);
  elements.contributionCount.textContent = `${client.plan.contributionCount} aportes`;
  elements.lastPayment.textContent = relativeDate(client.plan.lastPaymentAt);
  elements.monthlyBase.textContent = `${formatMoney(client.plan.monthlyBaseArs)} + ajuste CAC`;
  elements.advisor.textContent = client.welcomeAdvisor;
  elements.occupation.textContent = capitalize(client.occupation);
  elements.phone.textContent = client.phone;
  elements.email.textContent = client.email;
  elements.objective.textContent = client.objective;
  elements.context.textContent = client.context;
  elements.notesCount.textContent = client.notes.length;
  elements.notesList.innerHTML = client.notes.map((item) => `<article class="${escapeAttr(item.tone)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p><time>${formatDateTime(item.createdAt)}</time></article>`).join('');
  elements.handleButton.hidden = client.status === 'human';
  elements.handleButton.disabled = state.loading;

  renderMessages(client);
}

function renderMessages(client) {
  const optimistic = optimisticReplyFor(client);
  const typing = agentIsTyping(client);
  const signature = JSON.stringify({
    id: client.id,
    status: client.status,
    typing,
    optimistic,
    messages: client.messages.map(({ id, role, text, createdAt, generatedBy, clientRequestId, video }) => ({
      id,
      role,
      text,
      createdAt,
      generatedBy,
      clientRequestId,
      videoId: video?.id,
    })),
  });
  if (signature === state.renderedChatSignature) return;
  state.renderedChatSignature = signature;

  const messages = client.messages.map((item) => {
    if (item.role === 'time') return `<div class="welcome-time-passage">⌛ ${escapeHtml(item.text)}</div>`;
    const generated = '';
    const video = item.video
      ? `<figure class="welcome-video-card"><video controls playsinline preload="metadata" aria-label="${escapeAttr(item.video.title)}"><source src="${escapeAttr(item.video.src)}" type="video/mp4">Tu navegador no puede reproducir este video.</video><figcaption><strong>▶ ${escapeHtml(item.video.title)}</strong><span>Video de acompañamiento · ${escapeHtml(item.video.durationLabel || '')}</span></figcaption></figure>`
      : '';
    return `<article class="welcome-message ${escapeAttr(item.role)}">${video}<p>${escapeHtml(item.text)}</p><footer>${generated}<time>${formatTime(item.createdAt)}${item.role === 'agent' ? ' ✓✓' : ''}</time></footer></article>`;
  }).join('');

  const optimisticMessage = optimistic
    ? `<article class="welcome-message client optimistic ${optimistic.status}"><p>${escapeHtml(optimistic.text)}</p><footer><span>${optimistic.status === 'failed' ? 'Sin respuesta · podés reenviar' : 'Enviado · esperando respuesta'}</span><time>${formatTime(optimistic.createdAt)}</time></footer></article>`
    : '';
  const typingIndicator = typing
    ? '<div class="welcome-typing" role="status"><div><i></i><i></i><i></i></div><span>Escribiendo…</span></div>'
    : '';

  elements.messageList.innerHTML = `<div class="welcome-day-label">DEMOSTRACIÓN · CONVERSACIÓN FICTICIA</div>${messages}${optimisticMessage}${typingIndicator}`;
  requestAnimationFrame(() => { elements.messageList.scrollTop = elements.messageList.scrollHeight; });
}

async function sendClientReply(event) {
  event.preventDefault();
  const client = selectedClient();
  const text = elements.replyInput.value.trim();
  if (!client || !text || state.loading || client.status === 'human') return;

  const previous = state.pendingReply;
  const reusing = previous?.clientId === client.id && previous.text === text;
  const requestId = reusing ? previous.requestId : createRequestId();
  state.pendingReply = {
    clientId: client.id,
    text,
    requestId,
    createdAt: reusing ? previous.createdAt : Date.now(),
    status: 'sending',
  };
  state.agentActivity = { clientId: client.id, kind: 'reply' };
  state.loading = true;
  elements.replyInput.value = '';
  elements.replyForm.querySelector('button').disabled = true;
  renderSelectedClient();

  try {
    const response = await api(`/api/demo-ai/welcome/clients/${encodeURIComponent(client.id)}/reply`, {
      method: 'POST',
      body: { text, requestId },
      timeoutMs: 35_000,
    });
    state.pendingReply = null;
    state.agentActivity = null;
    mergeClient(response.client);
    render();
  } catch (error) {
    if (state.pendingReply?.requestId === requestId) state.pendingReply.status = 'failed';
    state.agentActivity = null;
    elements.replyInput.value = text;
    renderSelectedClient();
    toast(`${error.message} El mensaje quedó visible y podés reenviarlo sin duplicarlo.`, true);
  } finally {
    state.loading = false;
    elements.replyForm.querySelector('button').disabled = false;
    elements.replyInput.focus();
  }
}

async function advanceTime(button) {
  const client = selectedClient();
  if (!client || state.loading || client.status === 'human') return;
  const days = Number(button.dataset.advanceDays);
  state.loading = true;
  state.agentActivity = { clientId: client.id, kind: 'followup' };
  renderSelectedClient();
  try {
    const result = await api(`/api/demo-ai/welcome/clients/${encodeURIComponent(client.id)}/advance-time`, {
      method: 'POST',
      body: { days },
      timeoutMs: 35_000,
    });
    state.agentActivity = null;
    mergeClient(result.client);
    render();
    const labels = {
      waiting: 'Se decidió esperar para no ser invasivo.',
      followup: 'Se generó un seguimiento preventivo.',
      risk: 'Se detectó riesgo y se recomendó intervención personal.',
    };
    toast(labels[result.outcome] || 'Tiempo simulado.');
  } catch (error) {
    state.agentActivity = null;
    renderSelectedClient();
    toast(error.message, true);
  } finally {
    state.loading = false;
  }
}

async function sendWelcomeVideo() {
  const client = selectedClient();
  if (!client || state.loading) return;
  state.loading = true;
  state.agentActivity = { clientId: client.id, kind: 'video' };
  elements.videoButton.disabled = true;
  renderSelectedClient();
  try {
    const response = await api(`/api/demo-ai/welcome/clients/${encodeURIComponent(client.id)}/send-video`, {
      method: 'POST',
      timeoutMs: 50_000,
    });
    state.agentActivity = null;
    mergeClient(response.client);
    render();
    const video = [...response.client.messages].reverse().find((item) => item.video)?.video;
    toast(video ? `Se compartió “${video.title}”.` : 'Se compartió el video.');
  } catch (error) {
    state.agentActivity = null;
    renderSelectedClient();
    toast(error.message, true);
  } finally {
    state.loading = false;
    renderSelectedClient();
  }
}

async function handleClient() {
  const client = selectedClient();
  if (!client || state.loading) return;
  state.loading = true;
  elements.handleButton.disabled = true;
  try {
    const response = await api(`/api/demo-ai/welcome/clients/${encodeURIComponent(client.id)}/handle`, { method: 'POST' });
    mergeClient(response.client);
    render();
    toast(`${client.welcomeAdvisor} tomó el seguimiento personal.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.loading = false;
    elements.handleButton.disabled = false;
  }
}

async function regenerateClients() {
  if (state.loading) return;
  if (!window.confirm('¿Generar otros 20 clientes ficticios? Se reemplazará esta muestra de Bienvenida.')) return;
  state.loading = true;
  elements.regenerate.disabled = true;
  try {
    state.snapshot = await api('/api/demo-ai/welcome/reset', { method: 'POST', timeoutMs: 20_000 });
    state.selectedClientId = state.snapshot.clients[0]?.id || null;
    state.pendingReply = null;
    state.agentActivity = null;
    state.renderedChatSignature = '';
    render();
    setMobileView('clients');
    toast('Se generaron 20 clientes ficticios nuevos.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    state.loading = false;
    elements.regenerate.disabled = false;
  }
}

function mergeClient(client) {
  if (!state.snapshot || !client) return;
  state.snapshot.clients = state.snapshot.clients.map((item) => item.id === client.id ? client : item);
  recalculateMetrics();
  state.renderedChatSignature = '';
}

function recalculateMetrics() {
  const clients = state.snapshot?.clients || [];
  if (!clients.length) return;
  state.snapshot.metrics.retentionAverage = Math.round(clients.reduce((sum, item) => sum + item.retentionScore, 0) / clients.length);
  state.snapshot.metrics.riskCount = clients.filter((item) => item.riskLevel === 'high').length;
  state.snapshot.metrics.attentionCount = clients.filter((item) => item.riskLevel === 'medium').length;
  state.snapshot.metrics.activePlans = clients.filter((item) => item.status !== 'closed').length;
}

function selectedClient() {
  return state.snapshot?.clients.find(({ id }) => id === state.selectedClientId) || null;
}

function optimisticReplyFor(client) {
  const pending = state.pendingReply;
  if (!pending || pending.clientId !== client.id) return null;
  const stored = client.messages.some((item) => item.clientRequestId && item.clientRequestId === pending.requestId);
  return stored ? null : pending;
}

function agentIsTyping(client) {
  return client.status === 'thinking'
    || state.agentActivity?.clientId === client.id
    || state.pendingReply?.clientId === client.id && state.pendingReply.status === 'sending';
}

function setMobileView(view) {
  if ((view === 'chat' || view === 'retention') && !selectedClient() && state.snapshot?.clients.length) {
    state.selectedClientId = state.snapshot.clients[0].id;
    render();
  }
  document.body.dataset.view = view;
  document.querySelectorAll('.welcome-mobile-nav [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
}

async function api(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 25_000);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
      credentials: 'same-origin',
      cache: 'no-store',
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo completar la acción.');
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('La respuesta está demorando demasiado. Podés volver a intentarlo.');
    if (error instanceof TypeError) throw new Error('Se perdió la conexión. Volvé a intentarlo cuando se restablezca.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function riskOrder(client) {
  return ({ high: 0, medium: 1, low: 2 })[client.riskLevel] ?? 3;
}

function riskLabel(level) {
  return ({ high: 'Riesgo alto', medium: 'Atención', low: 'Estable' })[level] || 'Revisar';
}

function retentionLabel(score) {
  if (score >= 85) return 'Vínculo estable';
  if (score >= 70) return 'Necesita acompañamiento';
  return 'Riesgo de desvinculación';
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function relativeDate(value) {
  const days = Math.max(0, Math.round((Date.now() - Number(value || 0)) / 86_400_000));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Hace 1 día';
  return `Hace ${days} días`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(Number(value)));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(Number(value)));
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() || `welcome-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || 'cliente';
}

function capitalize(value) {
  const text = String(value || '');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : '';
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\`/g, '&#096;');
}

let toastTimer;
function toast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', isError);
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 4_800);
}
