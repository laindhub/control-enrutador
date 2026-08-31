const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const grid = document.querySelector('#advisorGrid');
const emptyState = document.querySelector('#emptyState');
const priorityBanner = document.querySelector('#priorityBanner');
const editToggle = document.querySelector('#editToggle');
const connectionStatus = document.querySelector('#connectionStatus');
const toast = document.querySelector('#toast');
let editMode = false;
let loading = false;
let reloadTimer;

const socket = globalThis.io({ transports: ['polling'] });
socket.on('connect', () => {
  connectionStatus.hidden = true;
  scheduleReload(50);
});
socket.on('disconnect', () => { connectionStatus.hidden = false; });
socket.on('dashboard:changed', () => scheduleReload(120));

editToggle.addEventListener('click', () => {
  editMode = !editMode;
  editToggle.textContent = editMode ? 'Terminar edición' : 'Editar';
  editToggle.classList.toggle('button-primary', editMode);
  editToggle.classList.toggle('button-secondary', !editMode);
  loadDashboard();
});

document.querySelector('#changeOperator').addEventListener('click', async () => {
  if (!(await confirmAction('Cambiar enrutador', 'Se volverá a preguntar quién está operando.'))) return;
  await api('/api/operator', { method: 'DELETE' });
  window.location.assign('/operator');
});

async function loadDashboard() {
  if (loading) return;
  loading = true;
  try {
    const data = await api(`/api/dashboard${editMode ? '?edit=1' : ''}`);
    renderDashboard(data);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    loading = false;
  }
}

function renderDashboard(data) {
  const currentIds = new Set(data.advisors.map(({ id }) => Number(id)));
  const advisors = editMode ? data.correctionAdvisors : data.advisors;
  grid.replaceChildren(...advisors.map((advisor) => advisorCard(advisor, currentIds)));
  emptyState.hidden = advisors.length > 0;
  grid.hidden = advisors.length === 0;

  if (data.priorityNames.length) {
    priorityBanner.innerHTML = `<strong>Priorizar:</strong> ${escapeHtml(formatNames(data.priorityNames))}`;
    priorityBanner.hidden = false;
  } else {
    priorityBanner.hidden = true;
  }
}

function advisorCard(advisor, currentIds) {
  const article = document.createElement('article');
  article.className = `advisor-card level-${advisor.level}`;
  const activeNow = currentIds.has(Number(advisor.id));
  article.innerHTML = `
    <div class="advisor-meta">
      <h2 class="advisor-name">${escapeHtml(advisor.name)}</h2>
      <div class="advisor-team">${escapeHtml(advisor.team)} · ${advisor.start_time}–${advisor.end_time}</div>
      <div class="last-time">${advisor.last_at ? `Última: ${formatTime(advisor.last_at)}` : 'Sin atenciones hoy'}</div>
    </div>
    <div class="counter-block">
      <span class="count">${advisor.count}</span>
      <div class="counter-actions">
        ${editMode ? '<button class="counter-button minus" type="button" aria-label="Restar atención">−</button>' : ''}
        ${activeNow ? '<button class="counter-button plus" type="button" aria-label="Sumar atención">+</button>' : ''}
      </div>
    </div>
    ${advisor.priority ? '<span class="priority-tag">PRIORIDAD</span>' : ''}
  `;
  article.querySelector('.plus')?.addEventListener('click', () => addAttention(advisor));
  article.querySelector('.minus')?.addEventListener('click', () => decrementAttention(advisor));
  return article;
}

async function addAttention(advisor) {
  if (!(await confirmAction('Sumar atención', `¿Confirmás una atención para ${advisor.name}?`))) return;
  try {
    await postAttention(advisor.id, false);
    showToast(`Atención agregada a ${advisor.name}.`);
  } catch (error) {
    if (!error.payload?.requiresRecentConfirmation) return showToast(error.message, true);
    const last = error.payload.lastAttention;
    const accepted = await confirmAction(
      'Atención reciente',
      `Se registró otra atención para ${last.advisorName} hace menos de 3 minutos. ¿Son grupos diferentes?`,
    );
    if (!accepted) return;
    try {
      await postAttention(advisor.id, true);
      showToast(`Atención agregada a ${advisor.name}.`);
    } catch (secondError) {
      showToast(secondError.message, true);
    }
  }
  await loadDashboard();
}

async function postAttention(advisorId, acknowledgeRecent) {
  return api('/api/attentions', {
    method: 'POST',
    body: JSON.stringify({ advisorId, acknowledgeRecent }),
  });
}

async function decrementAttention(advisor) {
  if (advisor.count < 1) return showToast('No hay atenciones para corregir.', true);
  if (!(await confirmAction('Corregir contador', `Se anulará la última atención de ${advisor.name}. Esta acción quedará en la auditoría.`))) return;
  try {
    await api('/api/attentions/decrement', {
      method: 'POST',
      body: JSON.stringify({ advisorId: advisor.id }),
    });
    showToast(`Se corrigió el contador de ${advisor.name}.`);
    await loadDashboard();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      ...(options.headers || {}),
    },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'No se pudo completar la operación.');
    error.payload = payload;
    throw error;
  }
  return payload;
}

function confirmAction(title, message) {
  const modal = document.querySelector('#confirmModal');
  const accept = document.querySelector('#confirmAccept');
  const cancel = document.querySelector('#confirmCancel');
  document.querySelector('#confirmTitle').textContent = title;
  document.querySelector('#confirmMessage').textContent = message;
  modal.hidden = false;
  accept.focus();
  return new Promise((resolve) => {
    const finish = (value) => {
      modal.hidden = true;
      accept.removeEventListener('click', onAccept);
      cancel.removeEventListener('click', onCancel);
      resolve(value);
    };
    const onAccept = () => finish(true);
    const onCancel = () => finish(false);
    accept.addEventListener('click', onAccept);
    cancel.addEventListener('click', onCancel);
  });
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function scheduleReload(delay) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(loadDashboard, delay);
}

function formatTime(value) {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatNames(names) {
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

loadDashboard();
setInterval(loadDashboard, 60_000);
