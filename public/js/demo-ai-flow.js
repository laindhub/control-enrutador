(() => {
  'use strict';

  const svg = document.getElementById('operationsFlowMap');
  const tokenLayer = document.getElementById('flowTokenLayer');
  if (!svg || !tokenLayer) return;

  const names = ['Lucía', 'Martín', 'Camila', 'Julián', 'Rocío', 'Santiago', 'Valentina', 'Federico', 'Carolina', 'Mariano', 'Florencia', 'Nicolás'];
  const questions = ['el anticipo obligatorio', 'cómo se ajusta la cuota por CAC', 'los plazos de financiación', 'la fecha de entrega del proyecto', 'cómo continuar con su plan de ahorro'];
  const state = {
    running: true,
    speed: 1,
    active: 0,
    timer: null,
    minutes: 9 * 60,
    counts: { reception: 0, pretest: 0, host: 0, charla1: 0, charla2: 0, direct: 0, routing: 0, advisory: 0, 'sales-followup': 0, retention: 0 },
    messages: 0,
    answers: 0,
    alerts: 0,
    retentionActions: 0,
  };

  const byId = (id) => document.getElementById(id);
  const toggleButton = byId('flowToggle');
  const resetButton = byId('flowReset');
  const activity = byId('flowActivity');
  const currentAction = byId('flowCurrentAction');
  const intelligenceCore = byId('intelligenceCore');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clockText() {
    const hours = Math.floor(state.minutes / 60) % 24;
    const minutes = state.minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function updateDashboard() {
    document.querySelectorAll('[data-count]').forEach((label) => { label.textContent = state.counts[label.dataset.count] || 0; });
    byId('kpiArrivals').textContent = state.counts.reception;
    byId('kpiPretests').textContent = state.counts.pretest;
    byId('kpiAdvisories').textContent = state.counts.advisory;
    byId('kpiSales').textContent = state.counts.retention;
    byId('kpiFollowups').textContent = state.counts['sales-followup'] + state.counts.retention;
    const conversion = state.counts.advisory ? Math.round((state.counts.retention / state.counts.advisory) * 100) : 0;
    byId('kpiConversion').textContent = `${conversion}% de conversión`;
    byId('engineMessages').textContent = state.messages;
    byId('engineAnswers').textContent = state.answers;
    byId('engineAlerts').textContent = state.alerts;
    byId('engineRetention').textContent = state.retentionActions;
    byId('flowClock').textContent = clockText();
  }

  function activateStage(stage) {
    const node = svg.querySelector(`[data-stage="${stage}"]`);
    if (!node) return;
    node.classList.add('is-active');
    window.setTimeout(() => node.classList.remove('is-active'), 650 / state.speed);
  }

  function arrive(stage) {
    state.counts[stage] = (state.counts[stage] || 0) + 1;
    activateStage(stage);
    updateDashboard();
  }

  function animateAlongPath(pathId, color = '#f4bd5f') {
    const path = byId(pathId);
    if (!path) return Promise.resolve();
    const token = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    token.setAttribute('r', '8');
    token.setAttribute('fill', color);
    token.setAttribute('stroke', '#f7fffd');
    token.setAttribute('stroke-width', '2');
    token.setAttribute('class', 'flow-token');
    tokenLayer.appendChild(token);
    const length = path.getTotalLength();
    const duration = reducedMotion ? 80 : 680 / state.speed;

    return new Promise((resolve) => {
      let startedAt = 0;
      function frame(timestamp) {
        if (!startedAt) startedAt = timestamp;
        const progress = Math.min(1, (timestamp - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const point = path.getPointAtLength(length * eased);
        token.setAttribute('cx', point.x);
        token.setAttribute('cy', point.y);
        if (progress < 1) return window.requestAnimationFrame(frame);
        token.remove();
        resolve();
      }
      window.requestAnimationFrame(frame);
    });
  }

  async function move(pathId, stage, color) {
    await animateAlongPath(pathId, color);
    arrive(stage);
    await new Promise((resolve) => window.setTimeout(resolve, 170 / state.speed));
  }

  function addActivity(icon, text) {
    const item = document.createElement('li');
    item.innerHTML = `<b>${icon}</b><span></span><time>${clockText()}</time>`;
    item.querySelector('span').textContent = text;
    activity.prepend(item);
    while (activity.children.length > 6) activity.lastElementChild.remove();
  }

  function intelligentAction(text, icon = '✦') {
    currentAction.textContent = text;
    intelligenceCore.classList.add('is-thinking');
    window.setTimeout(() => intelligenceCore.classList.remove('is-thinking'), 900 / state.speed);
    addActivity(icon, text);
  }

  function scheduleIntelligentFollowUp(person, sold) {
    if (sold) {
      state.retentionActions += 1;
      state.messages += 1;
      intelligentAction(`Bienvenida iniciada para ${person}: se envió el primer contacto y quedó programado el control de aportes.`, '♥');
      if (Math.random() < .45) {
        window.setTimeout(() => {
          state.answers += 1;
          intelligentAction(`${person} consultó por ${questions[Math.floor(Math.random() * questions.length)]}; recibió una respuesta contextual.`, '?');
          updateDashboard();
        }, 900 / state.speed);
      }
    } else {
      state.messages += 1;
      intelligentAction(`Seguimiento comercial de ${person}: mensaje personalizado enviado según su pre-test y la charla.`, '↗');
      const outcome = Math.random();
      window.setTimeout(() => {
        if (outcome < .52) {
          state.answers += 1;
          intelligentAction(`${person} respondió y preguntó por ${questions[Math.floor(Math.random() * questions.length)]}; conversación continuada.`, '↵');
        } else if (outcome < .78) {
          state.alerts += 1;
          intelligentAction(`Aumentó el interés de ${person}. Caso derivado al asesor con el resumen de la conversación.`, '!');
        } else {
          intelligentAction(`${person} todavía no respondió. Próximo contacto reprogramado sin insistencia.`, '◷');
        }
        updateDashboard();
      }, 1000 / state.speed);
    }
    updateDashboard();
  }

  async function spawnPerson() {
    if (!state.running || state.active >= 3) return;
    state.active += 1;
    const person = names[Math.floor(Math.random() * names.length)];
    const routePick = Math.random();
    const route = routePick < .42 ? 'charla1' : routePick < .75 ? 'charla2' : 'direct';
    const routeLabel = route === 'charla1' ? 'Charla 1' : route === 'charla2' ? 'Charla 2' : 'pase directo';

    try {
      arrive('reception');
      addActivity('•', `${person} ingresó por recepción.`);
      await move('path-reception-pretest', 'pretest');
      await move('path-pretest-host', 'host');
      intelligentAction(`Pre-test de ${person} interpretado: el host recomienda ${routeLabel}.`, '⌁');
      await move(`path-host-${route}`, route);
      await move(`path-${route}-routing`, 'routing');
      addActivity('→', `${person} fue asignado al asesor disponible con su contexto.`);
      await move('path-routing-advisory', 'advisory', '#26b8d2');
      await move('path-advisory-decision', 'decision', '#f4bd5f');

      const saleChance = route === 'direct' ? .36 : route === 'charla2' ? .31 : .24;
      const sold = Math.random() < saleChance;
      if (sold) {
        await move('path-decision-retention', 'retention', '#26b8d2');
        addActivity('✓', `${person} ingresó al plan en su primera visita.`);
      } else {
        await move('path-decision-sales', 'sales-followup', '#19c98d');
        addActivity('◷', `${person} continúa en seguimiento para venta.`);
      }
      state.minutes += 8 + Math.floor(Math.random() * 11);
      scheduleIntelligentFollowUp(person, sold);
    } finally {
      state.active -= 1;
    }
  }

  function scheduleNext() {
    window.clearTimeout(state.timer);
    if (!state.running) return;
    state.timer = window.setTimeout(() => {
      spawnPerson();
      scheduleNext();
    }, 1850 / state.speed);
  }

  function setRunning(running) {
    state.running = running;
    toggleButton.textContent = running ? 'Pausar' : 'Continuar';
    byId('activityStatus').textContent = running ? 'EN VIVO' : 'EN PAUSA';
    if (running) scheduleNext(); else window.clearTimeout(state.timer);
  }

  function resetSimulation() {
    window.clearTimeout(state.timer);
    Object.keys(state.counts).forEach((key) => { state.counts[key] = 0; });
    state.messages = 0;
    state.answers = 0;
    state.alerts = 0;
    state.retentionActions = 0;
    state.minutes = 9 * 60;
    activity.innerHTML = '';
    tokenLayer.innerHTML = '';
    currentAction.textContent = 'Analizando recorridos y esperando actividad…';
    updateDashboard();
    addActivity('✦', 'Simulación del día iniciada. El circuito está listo.');
    setRunning(true);
    window.setTimeout(spawnPerson, 300);
  }

  toggleButton.addEventListener('click', () => setRunning(!state.running));
  resetButton.addEventListener('click', resetSimulation);
  document.querySelectorAll('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => {
      state.speed = Number(button.dataset.speed) || 1;
      document.querySelectorAll('[data-speed]').forEach((item) => item.classList.toggle('is-active', item === button));
      if (state.running) scheduleNext();
    });
  });

  updateDashboard();
  addActivity('✦', 'El motor de seguimiento está observando el recorrido completo.');
  window.setTimeout(spawnPerson, 450);
  scheduleNext();
})();
