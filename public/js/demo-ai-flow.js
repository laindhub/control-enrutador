(() => {
  'use strict';

  const svg = document.getElementById('operationsFlowMap');
  const tokenLayer = document.getElementById('flowTokenLayer');
  const constellationLayer = document.getElementById('flowConstellationLayer');
  const graphIntelligence = document.getElementById('graphIntelligence');
  if (!svg || !tokenLayer || !constellationLayer) return;

  const graphAnchors = {
    reception: [120, 92], pretest: [340, 92], host: [560, 92],
    charla1: [800, 52], charla2: [800, 164], direct: [800, 276],
    routing: [1050, 164], advisory: [1050, 368], decision: [760, 368],
    'sales-followup': [510, 542], retention: [1015, 542],
  };
  const renderedConstellation = new Map();

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
    dayFinished: false,
    directReserved: 0,
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
    const talks = state.counts.charla1 + state.counts.charla2;
    const advisorFromTalk = Math.max(0, state.counts.advisory - state.counts.direct);
    byId('kpiTalks').textContent = talks;
    byId('kpiDirectPasses').textContent = `${state.counts.direct} pases directos`;
    byId('kpiAdvisories').textContent = state.counts.advisory;
    byId('kpiAdvisorRate').textContent = `${talks ? Math.round((advisorFromTalk / talks) * 100) : 0}% de quienes tuvieron charla`;
    byId('kpiSales').textContent = state.counts.retention;
    byId('kpiFollowups').textContent = state.counts['sales-followup'] + state.counts.retention;
    const conversion = state.counts.advisory ? Math.round((state.counts.retention / state.counts.advisory) * 100) : 0;
    byId('kpiConversion').textContent = `${conversion}% de asesorías · objetivo buen día: 5`;
    byId('engineMessages').textContent = state.messages;
    byId('engineAnswers').textContent = state.answers;
    byId('engineAlerts').textContent = state.alerts;
    byId('engineRetention').textContent = state.retentionActions;
    byId('flowClock').textContent = clockText();
    renderConstellation();
  }

  function constellationClass(stage) {
    if (stage === 'retention') return 'retention';
    if (stage === 'sales-followup' || stage === 'routing' || stage === 'advisory') return 'hot';
    if (stage === 'decision' || stage === 'direct') return 'warm';
    return '';
  }

  function renderConstellation() {
    Object.entries(graphAnchors).forEach(([stage, [anchorX, anchorY]], stageIndex) => {
      const target = Math.min(18, Math.ceil((state.counts[stage] || 0) / (stage === 'reception' ? 4 : 2)));
      const rendered = renderedConstellation.get(stage) || 0;
      for (let index = rendered; index < target; index += 1) {
        const ring = Math.floor(index / 7);
        const position = index % 7;
        const topCluster = anchorY < 110;
        const angle = topCluster
          ? (.12 * Math.PI) + ((position / 7) * Math.PI * .78) + (ring * .09)
          : ((position / 7) * Math.PI * 2) + (stageIndex * .61) + (ring * .28);
        const radius = 50 + (ring * 18) + ((index % 3) * 4);
        const x = anchorX + Math.cos(angle) * radius;
        const y = anchorY + Math.sin(angle) * radius;
        const className = constellationClass(stage);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', anchorX);
        line.setAttribute('y1', anchorY);
        line.setAttribute('x2', x);
        line.setAttribute('y2', y);
        line.setAttribute('class', `flow-constellation-link ${className}`);
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('r', String(2.8 + ((index + stageIndex) % 3) * .7));
        dot.setAttribute('class', `flow-constellation-dot ${className}`);
        dot.style.animationDelay = `${((index + stageIndex) % 9) * 90}ms`;
        constellationLayer.append(line, dot);
      }
      renderedConstellation.set(stage, target);
    });
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
    graphIntelligence?.classList.add('is-thinking');
    window.setTimeout(() => intelligenceCore.classList.remove('is-thinking'), 900 / state.speed);
    window.setTimeout(() => graphIntelligence?.classList.remove('is-thinking'), 900 / state.speed);
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
    if (!state.running || state.dayFinished || state.active >= 3) return;
    state.active += 1;
    const person = names[Math.floor(Math.random() * names.length)];
    const directAllowed = state.counts.direct + state.directReserved < 10;
    const routePick = Math.random();
    const route = directAllowed && routePick < .045 ? 'direct' : routePick < .54 ? 'charla1' : 'charla2';
    if (route === 'direct') state.directReserved += 1;
    const routeLabel = route === 'charla1' ? 'Charla 1' : route === 'charla2' ? 'Charla 2' : 'pase directo';

    try {
      arrive('reception');
      addActivity('•', `${person} ingresó por recepción.`);
      await move('path-reception-pretest', 'pretest');
      await move('path-pretest-host', 'host');
      intelligentAction(`Pre-test de ${person} interpretado: el host recomienda ${routeLabel}.`, '⌁');
      await move(`path-host-${route}`, route);
      if (route === 'direct') state.directReserved = Math.max(0, state.directReserved - 1);

      if (route !== 'direct' && Math.random() >= .35) {
        await move(`path-${route}-followup`, 'sales-followup', '#19c98d');
        addActivity('◷', `${person} finalizó la charla sin pasar al asesor y continúa en seguimiento.`);
        state.minutes += 3 + Math.floor(Math.random() * 3);
        scheduleIntelligentFollowUp(person, false);
        finishPersonIfDayEnded();
        return;
      }

      await move(`path-${route}-routing`, 'routing');
      addActivity('→', `${person} fue asignado al asesor disponible con su contexto.`);
      await move('path-routing-advisory', 'advisory', '#26b8d2');
      await move('path-advisory-decision', 'decision', '#f4bd5f');

      const nextSalesMilestone = (state.counts.retention + 1) * 11;
      const sold = state.counts.retention < 5 && (state.counts.advisory >= nextSalesMilestone || Math.random() < .015);
      if (sold) {
        await move('path-decision-retention', 'retention', '#26b8d2');
        addActivity('✓', `${person} ingresó al plan en su primera visita.`);
      } else {
        await move('path-decision-sales', 'sales-followup', '#19c98d');
        addActivity('◷', `${person} continúa en seguimiento para venta.`);
      }
      state.minutes += 3 + Math.floor(Math.random() * 3);
      scheduleIntelligentFollowUp(person, sold);
      finishPersonIfDayEnded();
    } finally {
      state.active -= 1;
    }
  }

  function finishPersonIfDayEnded() {
    if (state.minutes < 19 * 60 || state.dayFinished) return;
    state.minutes = 19 * 60;
    state.dayFinished = true;
    setRunning(false);
    currentAction.textContent = `Jornada completa: ${state.counts.advisory} asesorías, ${state.counts.retention} ventas y ${state.counts.direct} pases directos.`;
    addActivity('■', 'Finalizó la simulación de 10 horas. Podés reiniciarla para ver otro día.');
    updateDashboard();
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
    state.dayFinished = false;
    state.directReserved = 0;
    activity.innerHTML = '';
    tokenLayer.innerHTML = '';
    constellationLayer.innerHTML = '';
    renderedConstellation.clear();
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
