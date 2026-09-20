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
    dayFinished: false,
    directReserved: 0,
  };

  const byId = (id) => document.getElementById(id);
  const toggleButton = byId('flowToggle');
  const resetButton = byId('flowReset');
  const activity = byId('flowActivity');
  const currentAction = byId('flowCurrentAction');
  const intelligenceCore = byId('intelligenceCore');
  const intelligenceCanvas = byId('intelligenceGraphCanvas');
  const intelligenceNetwork = { context: null, width: 0, height: 0, nodes: [], crossLinks: [], pulses: [], frame: null, startedAt: performance.now(), visibleCount: 24, targetCount: 24, lastRevealAt: 0 };
  const intelligenceHubs = { messages: [.27, .28], answers: [.73, .25], alerts: [.28, .73], retention: [.73, .72] };
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
  }

  function intelligenceValues() { return { messages: state.messages, answers: state.answers, alerts: state.alerts, retention: state.retentionActions }; }

  function seededRandom() {
    seededRandom.seed = (seededRandom.seed * 1664525 + 1013904223) >>> 0;
    return seededRandom.seed / 4294967296;
  }
  seededRandom.seed = 20260920;

  function initializeIntelligenceNetwork() {
    if (!intelligenceCanvas) return;
    intelligenceNetwork.context = intelligenceCanvas.getContext('2d', { alpha: false });
    const groups = [['messages', 115], ['answers', 80], ['alerts', 70], ['retention', 65]];
    groups.forEach(([type, count], groupIndex) => {
      const [hubX, hubY] = intelligenceHubs[type];
      for (let index = 0; index < count; index += 1) {
        const angle = index * 2.399963 + groupIndex * .67;
        const spread = Math.sqrt((index + .7) / count) * .235;
        intelligenceNetwork.nodes.push({
          type,
          baseX: hubX + Math.cos(angle) * spread,
          baseY: hubY + Math.sin(angle) * spread * .72,
          orbitAngle: angle,
          orbitRadius: spread,
          orbitSpeed: (.035 + seededRandom() * .075) * (index % 2 ? 1 : -1),
          phase: seededRandom() * Math.PI * 2,
          drift: .45 + seededRandom() * .85,
          size: .7 + seededRandom() * 1.45,
          highlightUntil: 0,
          x: 0,
          y: 0,
        });
      }
    });
    for (let index = intelligenceNetwork.nodes.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(seededRandom() * (index + 1));
      [intelligenceNetwork.nodes[index], intelligenceNetwork.nodes[swapIndex]] = [intelligenceNetwork.nodes[swapIndex], intelligenceNetwork.nodes[index]];
    }
    for (let index = 0; index < 260; index += 1) {
      const from = Math.floor(seededRandom() * intelligenceNetwork.nodes.length);
      const sameGroup = seededRandom() < .72;
      let to = Math.floor(seededRandom() * intelligenceNetwork.nodes.length);
      if (sameGroup) {
        const type = intelligenceNetwork.nodes[from].type;
        const candidates = intelligenceNetwork.nodes.map((node, nodeIndex) => node.type === type ? nodeIndex : -1).filter((nodeIndex) => nodeIndex >= 0);
        to = candidates[Math.floor(seededRandom() * candidates.length)];
      }
      if (from !== to) intelligenceNetwork.crossLinks.push([from, to]);
    }
    resizeIntelligenceCanvas();
    if (reducedMotion) drawIntelligenceNetwork(performance.now());
    else intelligenceNetwork.frame = window.requestAnimationFrame(drawIntelligenceNetwork);
  }

  function resizeIntelligenceCanvas() {
    if (!intelligenceCanvas || !intelligenceNetwork.context) return;
    const box = intelligenceCanvas.getBoundingClientRect();
    const ratio = Math.min(1.75, window.devicePixelRatio || 1);
    intelligenceNetwork.width = Math.max(280, box.width);
    intelligenceNetwork.height = Math.max(280, box.height);
    intelligenceCanvas.width = Math.round(intelligenceNetwork.width * ratio);
    intelligenceCanvas.height = Math.round(intelligenceNetwork.height * ratio);
    intelligenceNetwork.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function categoryColor(type, alpha = 1) {
    const colors = { messages: [53, 208, 157], answers: [81, 191, 213], alerts: [223, 184, 92], retention: [214, 141, 172] };
    const color = colors[type] || [194, 205, 205];
    return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
  }

  function drawIntelligenceNetwork(timestamp) {
    const context = intelligenceNetwork.context;
    if (!context) return;
    const width = intelligenceNetwork.width;
    const height = intelligenceNetwork.height;
    const elapsed = (timestamp - intelligenceNetwork.startedAt) / 1000;
    if (intelligenceNetwork.visibleCount < intelligenceNetwork.targetCount && timestamp - intelligenceNetwork.lastRevealAt >= Math.max(18, 58 / state.speed)) {
      intelligenceNetwork.visibleCount += 1;
      intelligenceNetwork.lastRevealAt = timestamp;
      const counter = byId('intelligenceNodeCount');
      if (counter) counter.textContent = `${intelligenceNetwork.visibleCount} nodos activos`;
    }
    const visibleNodes = intelligenceNetwork.nodes.slice(0, intelligenceNetwork.visibleCount);
    context.fillStyle = '#0b1114';
    context.fillRect(0, 0, width, height);

    visibleNodes.forEach((node, index) => {
      const [hubX, hubY] = intelligenceHubs[node.type];
      const orbit = node.orbitAngle + elapsed * node.orbitSpeed;
      const breathing = 1 + Math.sin(elapsed * node.drift + node.phase) * .075;
      const driftX = Math.sin(elapsed * node.drift * 1.4 + node.phase) * (.006 + (index % 4) * .0016);
      const driftY = Math.cos(elapsed * node.drift * 1.15 + node.phase) * (.005 + (index % 3) * .0015);
      node.x = (hubX + Math.cos(orbit) * node.orbitRadius * breathing + driftX) * width;
      node.y = (hubY + Math.sin(orbit) * node.orbitRadius * .72 * breathing + driftY) * height;
    });

    context.lineWidth = .55;
    visibleNodes.forEach((node) => {
      const [hubX, hubY] = intelligenceHubs[node.type];
      context.strokeStyle = categoryColor(node.type, .075);
      context.beginPath();
      context.moveTo(hubX * width, hubY * height);
      context.lineTo(node.x, node.y);
      context.stroke();
    });
    context.strokeStyle = 'rgba(175,190,192,.055)';
    intelligenceNetwork.crossLinks.forEach(([from, to]) => {
      if (from >= intelligenceNetwork.visibleCount || to >= intelligenceNetwork.visibleCount) return;
      const start = intelligenceNetwork.nodes[from];
      const end = intelligenceNetwork.nodes[to];
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    });

    const centerX = width * .5;
    const centerY = height * .5;
    Object.entries(intelligenceHubs).forEach(([type, [x, y]]) => {
      context.strokeStyle = categoryColor(type, .24);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(x * width, y * height);
      context.stroke();
    });

    visibleNodes.forEach((node, index) => {
      const highlighted = node.highlightUntil > timestamp;
      const colored = highlighted || index % 11 === 0;
      context.fillStyle = colored ? categoryColor(node.type, highlighted ? 1 : .78) : `rgba(207,218,218,${.38 + (index % 5) * .075})`;
      context.beginPath();
      context.arc(node.x, node.y, node.size + (highlighted ? 1.8 : 0), 0, Math.PI * 2);
      context.fill();
    });

    const values = intelligenceValues();
    Object.entries(intelligenceHubs).forEach(([type, [x, y]]) => {
      const px = x * width;
      const py = y * height;
      context.fillStyle = 'rgba(8,16,19,.92)';
      context.strokeStyle = categoryColor(type, .88);
      context.lineWidth = 1.6;
      context.beginPath(); context.arc(px, py, 9.5, 0, Math.PI * 2); context.fill(); context.stroke();
      context.fillStyle = categoryColor(type, 1);
      context.beginPath(); context.arc(px, py, 4.2, 0, Math.PI * 2); context.fill();
      context.fillStyle = 'rgba(218,230,228,.9)';
      context.font = '800 9px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(String(values[type]), px, py - 14);
    });

    context.shadowColor = 'rgba(49,220,166,.65)';
    context.shadowBlur = 16;
    context.fillStyle = '#1cc38e';
    context.beginPath(); context.arc(centerX, centerY, 12, 0, Math.PI * 2); context.fill();
    context.shadowBlur = 0;
    context.fillStyle = '#fff'; context.font = '900 13px system-ui, sans-serif'; context.fillText('✦', centerX, centerY + 4.5);

    intelligenceNetwork.pulses = intelligenceNetwork.pulses.filter((pulse) => {
      const progress = (timestamp - pulse.startedAt) / pulse.duration;
      if (progress >= 1) return false;
      const hub = intelligenceHubs[pulse.type];
      const target = intelligenceNetwork.nodes[pulse.target];
      let x; let y;
      if (progress < .38) {
        const part = progress / .38;
        x = centerX + (hub[0] * width - centerX) * part;
        y = centerY + (hub[1] * height - centerY) * part;
      } else {
        const part = (progress - .38) / .62;
        x = hub[0] * width + (target.x - hub[0] * width) * part;
        y = hub[1] * height + (target.y - hub[1] * height) * part;
      }
      context.shadowColor = categoryColor(pulse.type, 1); context.shadowBlur = 12;
      context.fillStyle = categoryColor(pulse.type, 1);
      context.beginPath(); context.arc(x, y, 3.5, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0;
      return true;
    });

    if (!reducedMotion) intelligenceNetwork.frame = window.requestAnimationFrame(drawIntelligenceNetwork);
  }

  function intelligenceTypeFor(icon) {
    if (icon === '♥') return 'retention';
    if (icon === '?' || icon === '↵') return 'answers';
    if (icon === '!') return 'alerts';
    return 'messages';
  }

  function triggerIntelligencePulse(type) {
    const matching = intelligenceNetwork.nodes.slice(0, intelligenceNetwork.visibleCount).map((node, index) => node.type === type ? index : -1).filter((index) => index >= 0);
    const target = matching[Math.floor(Math.random() * matching.length)] || 0;
    intelligenceNetwork.pulses.push({ type, target, startedAt: performance.now(), duration: Math.max(520, 1200 / state.speed) });
    for (let index = 0; index < 9; index += 1) {
      const nodeIndex = matching[Math.floor(Math.random() * matching.length)];
      if (intelligenceNetwork.nodes[nodeIndex]) intelligenceNetwork.nodes[nodeIndex].highlightUntil = performance.now() + 900;
    }
    if (reducedMotion) drawIntelligenceNetwork(performance.now());
  }

  function growIntelligenceNetwork(amount = 1) {
    intelligenceNetwork.targetCount = Math.min(intelligenceNetwork.nodes.length, intelligenceNetwork.targetCount + amount);
    if (reducedMotion) {
      intelligenceNetwork.visibleCount = intelligenceNetwork.targetCount;
      const counter = byId('intelligenceNodeCount');
      if (counter) counter.textContent = `${intelligenceNetwork.visibleCount} nodos activos`;
      drawIntelligenceNetwork(performance.now());
    }
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
    growIntelligenceNetwork(stage === 'sales-followup' || stage === 'retention' ? 4 : 2);
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
    const intelligenceType = intelligenceTypeFor(icon);
    growIntelligenceNetwork(intelligenceType === 'messages' ? 9 : 12);
    triggerIntelligencePulse(intelligenceType);
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
    intelligenceNetwork.pulses = [];
    intelligenceNetwork.nodes.forEach((node) => { node.highlightUntil = 0; });
    intelligenceNetwork.visibleCount = 24;
    intelligenceNetwork.targetCount = 24;
    intelligenceNetwork.lastRevealAt = 0;
    const nodeCounter = byId('intelligenceNodeCount');
    if (nodeCounter) nodeCounter.textContent = '24 nodos activos';
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

  initializeIntelligenceNetwork();
  let intelligenceResizeTimer = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(intelligenceResizeTimer);
    intelligenceResizeTimer = window.setTimeout(resizeIntelligenceCanvas, 150);
  });
  updateDashboard();
  addActivity('✦', 'El motor de seguimiento está observando el recorrido completo.');
  window.setTimeout(spawnPerson, 450);
  scheduleNext();
})();
