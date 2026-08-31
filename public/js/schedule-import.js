const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const importButton = document.querySelector('#importScheduleJson');
const fileInput = document.querySelector('#scheduleJsonFile');
const weekPicker = document.querySelector('#weekPicker');
const toast = document.querySelector('#toast');

if (importButton && fileInput) {
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', importScheduleJson);
}

async function importScheduleJson() {
  const file = fileInput.files?.[0];
  if (!file) return;

  importButton.disabled = true;
  try {
    const payload = parseImportPayload(JSON.parse(await file.text()));
    const current = await api(`/api/admin/schedule?week=${encodeURIComponent(payload.monday)}`);
    const entries = buildEntries(payload, current);

    const confirmed = confirm(
      `Se importarán ${entries.length} horarios para la semana del ${formatDate(payload.monday)}. ` +
        'LIBRE y ACADEMIA quedarán como “No trabaja”. La semana existente será reemplazada. ¿Continuar?',
    );
    if (!confirmed) return;

    await api('/api/admin/schedule', {
      method: 'PUT',
      body: JSON.stringify({ monday: payload.monday, entries }),
    });

    weekPicker.value = payload.monday;
    weekPicker.dispatchEvent(new Event('change'));
    showToast(`Cronograma importado: ${entries.length} horarios guardados.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    importButton.disabled = false;
    fileInput.value = '';
  }
}

function parseImportPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('El archivo JSON no tiene un formato válido.');
  }
  if (value.version !== undefined && value.version !== 1) {
    throw new Error('La versión del archivo JSON no es compatible.');
  }

  const monday = String(value.monday || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) {
    throw new Error('El JSON debe incluir "monday" con formato AAAA-MM-DD.');
  }
  const mondayDate = new Date(`${monday}T12:00:00Z`);
  if (Number.isNaN(mondayDate.getTime()) || mondayDate.getUTCDay() !== 1) {
    throw new Error('El valor "monday" debe corresponder a un lunes real.');
  }

  if (!Array.isArray(value.advisors) || value.advisors.length === 0) {
    throw new Error('El JSON debe incluir una lista "advisors".');
  }

  const seen = new Set();
  const advisors = value.advisors.map((row, index) => {
    const name = String(row?.name || '').trim();
    if (!name) throw new Error(`Falta el nombre del asesor en la fila ${index + 1}.`);
    const key = normalizeName(name);
    if (seen.has(key)) throw new Error(`El asesor "${name}" aparece más de una vez en el JSON.`);
    seen.add(key);
    if (!Array.isArray(row.days) || row.days.length !== 7) {
      throw new Error(`"${name}" debe tener exactamente 7 valores en "days" (lunes a domingo).`);
    }
    return { name, key, days: row.days.map((shift) => normalizeShift(shift, name)) };
  });

  return { monday, advisors };
}

function buildEntries(payload, current) {
  const activeByName = new Map(current.advisors.map((advisor) => [normalizeName(advisor.name), advisor]));
  const importedByName = new Map(payload.advisors.map((advisor) => [advisor.key, advisor]));

  const unknown = payload.advisors.filter((advisor) => !activeByName.has(advisor.key)).map((advisor) => advisor.name);
  if (unknown.length) {
    throw new Error(`No encuentro estos asesores activos en Personal: ${unknown.join(', ')}.`);
  }

  const missing = current.advisors.filter((advisor) => !importedByName.has(normalizeName(advisor.name))).map((advisor) => advisor.name);
  if (missing.length) {
    throw new Error(`Faltan asesores activos en el JSON: ${missing.join(', ')}.`);
  }

  const entries = [];
  for (const advisor of payload.advisors) {
    const databaseAdvisor = activeByName.get(advisor.key);
    advisor.days.forEach((shift, dayIndex) => {
      if (!shift) return;
      entries.push({
        advisorId: databaseAdvisor.id,
        date: current.days[dayIndex],
        start: shift.start,
        end: shift.end,
      });
    });
  }
  return entries;
}

function normalizeShift(value, advisorName) {
  if (value === null || value === false || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const noWork = normalizeName(raw).replaceAll(' ', '_');
  if (['libre', 'academia', 'no_trabaja', 'no_trabajo', 'off'].includes(noWork)) return null;

  const cleaned = raw.toLowerCase().replace(/\s*hs?\.?$/, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?\s*(?:-|a)\s*([01]?\d|2[0-3])(?::([0-5]\d))?$/);
  if (!match) {
    throw new Error(`Horario inválido para ${advisorName}: "${raw}". Usá, por ejemplo, 10:00-19:00.`);
  }

  const start = `${match[1].padStart(2, '0')}:${match[2] || '00'}`;
  const end = `${match[3].padStart(2, '0')}:${match[4] || '00'}`;
  if (start >= end) throw new Error(`Horario inválido para ${advisorName}: "${raw}".`);
  return { start, end };
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No se pudo importar el cronograma.');
  return payload;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );
}

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}
