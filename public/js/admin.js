const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const toast = document.querySelector('#toast');
let auditPage = 1;
let scheduleState = null;

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => selectTab(button.dataset.tab));
});

document.querySelectorAll('[data-range]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-range]').forEach((item) => item.classList.toggle('active', item === button));
    applyQuickRange(button.dataset.range);
    loadReport();
  });
});

document.querySelector('#applyRange').addEventListener('click', loadReport);
document.querySelector('#exportExcel').addEventListener('click', () => {
  const { from, to } = reportRange();
  window.location.assign(`/api/admin/export.xlsx?from=${from}&to=${to}`);
});

document.querySelector('#previousWeek').addEventListener('click', () => shiftWeek(-7));
document.querySelector('#nextWeek').addEventListener('click', () => shiftWeek(7));
document.querySelector('#weekPicker').addEventListener('change', loadSchedule);
document.querySelector('#saveSchedule').addEventListener('click', saveSchedule);
document.querySelector('#copyPrevious').addEventListener('click', copyPreviousSchedule);
document.querySelector('#moreAudit').addEventListener('click', () => { auditPage += 1; loadAudit(false); });

document.querySelector('#addAdvisor').addEventListener('submit', (event) => addPerson(event, 'advisors'));
document.querySelector('#addOperator').addEventListener('submit', (event) => addPerson(event, 'operators'));

const socket = globalThis.io({ transports: ['polling'] });
socket.on('dashboard:changed', () => {
  if (document.querySelector('#tab-dashboard').classList.contains('active')) loadReport();
});

function selectTab(name) {
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${name}`));
  if (name === 'schedule') loadSchedule();
  if (name === 'people') loadPeople();
  if (name === 'audit') { auditPage = 1; loadAudit(true); }
  if (name === 'dashboard') loadReport();
}

async function loadReport() {
  const { from, to } = reportRange();
  try {
    const report = await api(`/api/admin/reports?from=${from}&to=${to}`);
    renderMetrics(report.stats);
    renderBars('#advisorReport', report.advisors, 'count');
    renderBars('#operatorReport', report.operators, 'count');
    renderHourly(report.hourly);
    renderAttentionDetails(report.recentDetails || []);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderAttentionDetails(items) {
  const container = document.querySelector('#attentionDetail');
  if (!items.length) {
    container.innerHTML = '<p class="muted">Sin registros en el período.</p>';
    return;
  }
  container.replaceChildren(...items.map((item) => {
    const row = document.createElement('div');
    row.className = `attention-row ${item.voided_at ? 'inactive' : ''}`;
    row.innerHTML = `<div><strong>${escapeHtml(item.advisor_name)}</strong><small>${escapeHtml(item.operator_name)} · ${formatIsoDateTime(item.created_at_local)}</small></div><span>${item.voided_at ? 'Corregida' : 'Válida'}</span>${item.voided_at ? '' : '<button class="switch-button" type="button">Corregir</button>'}`;
    row.querySelector('button')?.addEventListener('click', async () => {
      if (!confirm(`¿Corregir la atención de ${item.advisor_name}? Esta acción quedará auditada.`)) return;
      try {
        await api(`/api/admin/attentions/${item.id}/void`, { method: 'POST', body: '{}' });
        showToast('Atención corregida.');
        await loadReport();
      } catch (error) {
        showToast(error.message, true);
      }
    });
    return row;
  }));
}

function renderMetrics(stats) {
  const metrics = [
    ['Atenciones', stats.total],
    ['Promedio diario', stats.averageDaily],
    ['Mayor total', stats.highest],
    ['Diferencia', stats.spread],
    ['Correcciones', stats.corrections],
  ];
  document.querySelector('#metricCards').innerHTML = metrics
    .map(([label, value]) => `<article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>`)
    .join('');
}

function renderBars(selector, items, valueKey) {
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey])));
  document.querySelector(selector).innerHTML = items.length
    ? items.map((item) => `<div class="bar-item"><span>${escapeHtml(item.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(Number(item[valueKey]) / max) * 100}%"></div></div><strong>${item[valueKey]}</strong></div>`).join('')
    : '<p class="muted">Sin datos en el período.</p>';
}

function renderHourly(items) {
  const max = Math.max(1, ...items.map(({ count }) => count));
  document.querySelector('#hourlyReport').innerHTML = items
    .map(({ hour, count }) => `<div class="hour-column" title="${count} atenciones"><div class="hour-bar" style="height:${Math.max(2, (count / max) * 100)}%"></div><span>${hour}h</span></div>`)
    .join('');
}

async function loadSchedule(weekOverride) {
  const week = weekOverride || document.querySelector('#weekPicker').value || todayIso();
  try {
    scheduleState = await api(`/api/admin/schedule?week=${week}`);
    document.querySelector('#weekPicker').value = scheduleState.monday;
    renderSchedule(scheduleState);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderSchedule(state) {
  const byCell = new Map(state.entries.map((entry) => [`${entry.advisor_id}:${entry.work_date}`, `${entry.start_time}-${entry.end_time}`]));
  const headers = state.days.map((day) => `<th>${capitalize(new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)))}</th>`).join('');
  const rows = state.advisors.map((advisor) => {
    const cells = state.days.map((day) => scheduleSelect(advisor.id, day, byCell.get(`${advisor.id}:${day}`) || '')).join('');
    return `<tr><td class="advisor-cell"><strong>${escapeHtml(advisor.name)}</strong><small>${escapeHtml(advisor.team)}</small></td>${cells}</tr>`;
  }).join('');
  document.querySelector('#scheduleTable').innerHTML = `<thead><tr><th>Asesor</th>${headers}</tr></thead><tbody>${rows}</tbody>`;
  document.querySelectorAll('.schedule-select').forEach((select) => {
    select.addEventListener('change', () => {
      if (select.value !== 'custom') return;
      const value = prompt('Ingresá el horario como HH:MM-HH:MM', '10:00-19:00');
      if (!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) {
        select.value = '';
        return showToast('El horario personalizado no es válido.', true);
      }
      const option = new Option(value, value, true, true);
      select.add(option, 1);
      select.value = value;
    });
  });
}

function scheduleSelect(advisorId, date, selected) {
  const presets = ['', '10:00-19:00', '11:00-20:00', '12:00-21:00'];
  const values = selected && !presets.includes(selected) ? ['', selected, ...presets.slice(1)] : presets;
  const options = values.map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value || 'No trabaja'}</option>`).join('');
  return `<td><select class="schedule-select" data-advisor="${advisorId}" data-date="${date}">${options}<option value="custom">Otro…</option></select></td>`;
}

async function saveSchedule() {
  const entries = [...document.querySelectorAll('.schedule-select')]
    .filter((select) => select.value && select.value !== 'custom')
    .map((select) => {
      const [start, end] = select.value.split('-');
      return { advisorId: Number(select.dataset.advisor), date: select.dataset.date, start, end };
    });
  try {
    await api('/api/admin/schedule', {
      method: 'PUT',
      body: JSON.stringify({ monday: scheduleState.monday, entries }),
    });
    showToast('Horarios guardados.');
    await loadSchedule(scheduleState.monday);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function copyPreviousSchedule() {
  if (!scheduleState) return;
  const previousMonday = addDays(scheduleState.monday, -7);
  try {
    const previous = await api(`/api/admin/schedule?week=${previousMonday}`);
    const offsetByDate = new Map(previous.days.map((date, index) => [date, index]));
    scheduleState.entries = previous.entries.map((entry) => ({
      ...entry,
      work_date: scheduleState.days[offsetByDate.get(entry.work_date)],
    }));
    renderSchedule(scheduleState);
    showToast('Semana anterior copiada. Revisá y pulsá Guardar horarios.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadPeople() {
  try {
    const data = await api('/api/admin/people');
    renderPeople('#advisorPeople', data.advisors, 'advisors');
    renderPeople('#operatorPeople', data.operators, 'operators');
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderPeople(selector, people, kind) {
  const container = document.querySelector(selector);
  container.replaceChildren(...people.map((person) => {
    const row = document.createElement('div');
    row.className = `person-row ${person.active ? '' : 'inactive'}`;
    row.innerHTML = `<input class="person-name" value="${escapeAttribute(person.name)}" aria-label="Nombre">${kind === 'advisors' ? `<input class="person-team" value="${escapeAttribute(person.team)}" aria-label="Equipo">` : '<span></span>'}<div><button class="switch-button save-person" type="button">Guardar</button> <button class="switch-button toggle-person" type="button">${person.active ? 'Desactivar' : 'Activar'}</button></div>`;
    row.querySelector('.save-person').addEventListener('click', () => updatePerson(person, kind, row, Boolean(person.active)));
    row.querySelector('.toggle-person').addEventListener('click', () => updatePerson(person, kind, row, !person.active));
    return row;
  }));
}

async function addPerson(event, kind) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  try {
    await api(`/api/admin/people/${kind}`, { method: 'POST', body: JSON.stringify(body) });
    form.reset();
    if (kind === 'advisors') form.elements.team.value = 'Ventas';
    showToast('Persona agregada.');
    await loadPeople();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function updatePerson(person, kind, row, active) {
  const body = {
    name: row.querySelector('.person-name').value,
    team: row.querySelector('.person-team')?.value,
    active,
  };
  try {
    await api(`/api/admin/people/${kind}/${person.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    showToast('Cambios guardados.');
    await loadPeople();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadAudit(reset) {
  try {
    const data = await api(`/api/admin/audit?page=${auditPage}`);
    const container = document.querySelector('#auditList');
    if (reset) container.replaceChildren();
    container.insertAdjacentHTML('beforeend', data.rows.map(auditItem).join(''));
    document.querySelector('#moreAudit').hidden = data.rows.length < 50;
  } catch (error) {
    showToast(error.message, true);
  }
}

function auditItem(item) {
  const labels = {
    'attention.created': 'Atención registrada',
    'attention.voided': 'Atención corregida',
    'attention.admin_voided': 'Atención corregida por administración',
    'schedule.week_replaced': 'Cronograma semanal actualizado',
    'advisors.created': 'Asesor agregado',
    'advisors.updated': 'Asesor modificado',
    'operators.created': 'Enrutador agregado',
    'operators.updated': 'Enrutador modificado',
  };
  const who = item.operator_name || item.username || 'Sistema';
  const details = item.details?.originalOperatorName ? `Registro original de ${item.details.originalOperatorName}.` : '';
  return `<article class="audit-item"><strong>${labels[item.action] || escapeHtml(item.action)}</strong><small>${escapeHtml(who)} · ${formatDateTime(item.created_at)}</small>${details ? `<p>${escapeHtml(details)}</p>` : ''}</article>`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken, ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la operación.');
  return payload;
}

function applyQuickRange(type) {
  const today = new Date();
  let from = new Date(today);
  let to = new Date(today);
  if (type === 'yesterday') { from.setDate(from.getDate() - 1); to = new Date(from); }
  if (type === 'week') { const day = (from.getDay() + 6) % 7; from.setDate(from.getDate() - day); }
  if (type === 'month') from.setDate(1);
  document.querySelector('#reportFrom').value = localIso(from);
  document.querySelector('#reportTo').value = localIso(to);
}

function reportRange() {
  return { from: document.querySelector('#reportFrom').value, to: document.querySelector('#reportTo').value };
}

function shiftWeek(days) {
  const current = document.querySelector('#weekPicker').value || todayIso();
  loadSchedule(addDays(current, days));
}

function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localIso(date);
}

function localIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayIso() { return localIso(new Date()); }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function formatDateTime(value) { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(`${String(value).replace(' ', 'T')}Z`)); }
function formatIsoDateTime(value) { return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : ''; }

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

applyQuickRange('today');
document.querySelector('#weekPicker').value = todayIso();
loadReport();
