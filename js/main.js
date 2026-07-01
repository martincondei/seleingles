import {
  EXAM_MODE,
  FLOW,
  buildInventory,
  getAvailableYears,
  getExamById,
  getExamsForYear,
  getPracticeReadingCandidates,
  getPracticeUseCandidates,
  getRandomExamCandidates,
  loadExamPayload,
  loadExamsIndex,
  loadSingleReadingPayload,
  loadUsePayload,
  pickRandomItem,
  resolveExamMode
} from "./logic/examGenerator.js";
import {
  applyManualScores,
  combineSectionStats,
  correctReading,
  correctUse
} from "./logic/correction.js";
import {
  clearProgressAttempts,
  getPendingMistakes,
  loadProgressAttempts,
  saveProgressAttempt
} from "./logic/progress.js";
import { buildSectionBreakdown } from "./logic/statistics.js";
import { escapeHtml, getFormResponses, scrollToTop, setViewTitle, showToast } from "./ui/dom.js";
import { renderDashboard } from "./ui/renderDashboard.js";
import { createSessionState, renderExamView, renderInlineFeedback } from "./ui/renderExam.js";
import { renderResults } from "./ui/renderResults.js";
import { createTimer, formatTimer } from "./ui/timer.js";

const app = document.getElementById("app");
const nav = document.getElementById("topNav");

let examsIndex = null;
let currentView = "dashboard";
let currentSession = null;
let currentResults = null;
let randomCriteria = null;
let practiceReadingCriteria = null;
let practiceUseCriteria = null;
let lastRandomExamId = null;
let lastPracticeReadingKey = null;
let lastPracticeUseExamId = null;
let setupState = {
  selectedYear: null,
  selectedExamId: null,
  selectedModel: EXAM_MODE.legacyNew
};

const timer = createTimer({
  onTick: seconds => updateTimerDisplay(seconds)
});

function updateTimerDisplay(seconds) {
  const display = document.getElementById("timerDisplay");
  if (display) display.textContent = formatTimer(seconds);
}

async function boot() {
  try {
    examsIndex = await loadExamsIndex();
    setupNavigation();
    renderDashboardView();
  } catch (error) {
    app.innerHTML = `
      <section class="screen panel">
        <p class="eyebrow">Error de carga</p>
        <h1>No se pudo iniciar la aplicación</h1>
        <p>${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

function setupNavigation() {
  nav.querySelectorAll("[data-nav]").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.nav;
      if (target === "dashboard") renderDashboardView();
      if (target === "specific") renderSpecificSetup();
      if (target === "random") renderRandomSetup();
      if (target === "mistakes") renderMistakesView();
    });
  });
}

function setActiveNav(view) {
  nav.querySelectorAll("[data-nav]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.nav === view);
  });
}

function setView(view, title) {
  currentView = view;
  setActiveNav(view);
  setViewTitle(title);
  scrollToTop();
}

function attempts() {
  return loadProgressAttempts();
}

function renderDashboardView() {
  timer.reset();
  currentSession = null;
  currentResults = null;
  setView("dashboard", "Panel");
  renderDashboard(app, {
    attempts: attempts(),
    inventory: buildInventory(examsIndex),
    onAction: handleDashboardAction,
    onResetAnalytics: handleResetAnalytics
  });
}

function handleResetAnalytics() {
  if (!window.confirm("¿Reiniciar las analíticas y el historial de intentos? Esta acción no se puede deshacer.")) {
    return;
  }

  clearProgressAttempts();
  showToast("Analíticas reiniciadas.", "info");
  renderDashboardView();
}

function handleDashboardAction(action) {
  if (action === FLOW.specific) renderSpecificSetup();
  if (action === FLOW.random) renderRandomSetup();
  if (action === FLOW.reading) renderPracticeSetup("reading");
  if (action === FLOW.use) renderPracticeSetup("use");
  if (action === FLOW.mistakes) renderMistakesView();
}

function renderSetupShell({ view, eyebrow, title, body, innerHtml, onSubmit }) {
  setView(view, title);
  app.innerHTML = `
    <section class="screen setup-screen">
      <div class="setup-header">
        <div>
          <button class="button button-ghost button-small" type="button" data-action="dashboard">Volver</button>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(body)}</p>
        </div>
      </div>
      <form class="panel setup-form" id="setupForm">
        ${innerHtml}
        <div class="form-actions">
          <button class="button button-primary" type="submit">Empezar</button>
          <button class="button button-secondary" type="button" data-action="dashboard">Cancelar</button>
        </div>
      </form>
    </section>
  `;

  app.querySelectorAll('[data-action="dashboard"]').forEach(button => {
    button.addEventListener("click", renderDashboardView);
  });
  app.querySelector("#setupForm").addEventListener("submit", event => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  });
}

function renderSpecificSetup(selectedYear = setupState.selectedYear) {
  const years = getAvailableYears(examsIndex);
  const year = selectedYear || years[0];
  const exams = getExamsForYear(examsIndex, year);
  const selectedExamId = exams.some(exam => exam.id === setupState.selectedExamId)
    ? setupState.selectedExamId
    : exams[0]?.id;
  const selectedExam = getExamById(examsIndex, selectedExamId);
  const isCurrent = Number(selectedExam?.year) >= 2025;
  setupState = {
    selectedYear: year,
    selectedExamId,
    selectedModel: isCurrent ? EXAM_MODE.current : setupState.selectedModel || EXAM_MODE.legacyNew
  };

  renderSetupShell({
    view: "specific",
    eyebrow: "Examen concreto",
    title: "Practica una convocatoria exacta",
    body: "Elige año, examen y modelo. Ideal para preparar una prueba específica o repetir una convocatoria.",
    innerHtml: `
      <div class="form-grid">
        <label class="field-label">
          <span>Año</span>
          <select name="year" id="yearSelect">
            ${years.map(item => `<option value="${item}" ${Number(item) === Number(year) ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </label>
        <label class="field-label">
          <span>Convocatoria</span>
          <select name="examId" id="examSelect">
            ${exams.map(exam => `<option value="${escapeHtml(exam.id)}" ${exam.id === selectedExamId ? "selected" : ""}>${escapeHtml(exam.label)}</option>`).join("")}
          </select>
        </label>
      </div>
      <fieldset class="choice-set" ${isCurrent ? "disabled" : ""}>
        <legend>Modelo</legend>
        ${renderModelChoices(setupState.selectedModel, isCurrent)}
      </fieldset>
      ${isCurrent ? '<p class="form-note">Las convocatorias de 2025 usan directamente el modelo nuevo.</p>' : ""}
    `,
    onSubmit: formData => {
      const exam = getExamById(examsIndex, formData.get("examId"));
      const requestedMode = formData.get("model") || getDefaultModelForExam(exam);
      startFullExam(exam, {
        flow: FLOW.specific,
        examMode: resolveExamMode(exam, requestedMode),
        modeLabel: "Examen concreto",
        canSkip: false
      });
    }
  });

  app.querySelector("#yearSelect").addEventListener("change", event => {
    setupState.selectedExamId = null;
    renderSpecificSetup(Number(event.target.value));
  });
  app.querySelector("#examSelect").addEventListener("change", event => {
    setupState.selectedExamId = event.target.value;
    renderSpecificSetup(year);
  });
  app.querySelectorAll('input[name="model"]').forEach(input => {
    input.addEventListener("change", () => {
      setupState.selectedModel = input.value;
    });
  });
}

function getDefaultModelForExam(exam) {
  return Number(exam?.year) >= 2025 ? EXAM_MODE.current : EXAM_MODE.legacyNew;
}

function renderModelChoices(selectedModel, isCurrent = false) {
  const currentSelected = isCurrent ? EXAM_MODE.current : selectedModel;
  return `
    <label class="radio-card">
      <input type="radio" name="model" value="${EXAM_MODE.legacyNew}" ${currentSelected !== EXAM_MODE.legacyOld ? "checked" : ""}>
      <span><strong>Modelo nuevo</strong><small>Reading asignado y elección de un bloque de Use of English.</small></span>
    </label>
    <label class="radio-card">
      <input type="radio" name="model" value="${EXAM_MODE.legacyOld}" ${currentSelected === EXAM_MODE.legacyOld ? "checked" : ""}>
      <span><strong>Modelo antiguo</strong><small>Elegir reading y seleccionar 6 preguntas de Use of English.</small></span>
    </label>
  `;
}

function renderYearCheckboxes(inputName, selectedYears = getAvailableYears(examsIndex)) {
  const selected = new Set(selectedYears.map(Number));
  return getAvailableYears(examsIndex).map(year => `
    <label class="check-card">
      <input type="checkbox" name="${escapeHtml(inputName)}" value="${year}" ${selected.has(Number(year)) ? "checked" : ""}>
      <span><strong>${year}</strong><small>Incluido</small></span>
    </label>
  `).join("");
}

function renderRandomSetup() {
  const years = randomCriteria?.years || getAvailableYears(examsIndex);
  const model = randomCriteria?.model || EXAM_MODE.legacyNew;

  renderSetupShell({
    view: "random",
    eyebrow: "Simulacro aleatorio",
    title: "Genera un intento distinto",
    body: "Filtra años y modelo para simular variedad sin salir del formato oficial.",
    innerHtml: `
      <div class="setup-section">
        <h2>Años disponibles</h2>
        <div class="check-grid">${renderYearCheckboxes("year", years)}</div>
      </div>
      <fieldset class="choice-set">
        <legend>Modelo</legend>
        ${renderModelChoices(model)}
      </fieldset>
    `,
    onSubmit: formData => {
      const selectedYears = formData.getAll("year").map(Number);
      const selectedModel = formData.get("model");
      if (!selectedYears.length) {
        showToast("Elige al menos un año.", "warning");
        return;
      }
      if (selectedModel === EXAM_MODE.legacyOld && selectedYears.includes(2025)) {
        showToast("2025 no está disponible con modelo antiguo.", "warning");
        return;
      }

      randomCriteria = { years: selectedYears, model: selectedModel };
      startNextRandomExam();
    }
  });
}

function renderPracticeSetup(kind) {
  const criteria = kind === "reading" ? practiceReadingCriteria : practiceUseCriteria;
  const view = kind === "reading" ? FLOW.reading : FLOW.use;
  const title = kind === "reading" ? "Reading enfocado" : "Use of English enfocado";
  const body = kind === "reading"
    ? "Recibe un texto aleatorio de los años seleccionados y trabaja solo comprensión lectora."
    : "Recibe un bloque aleatorio y practica transformaciones y gramática sin la parte de reading.";

  renderSetupShell({
    view,
    eyebrow: "Práctica enfocada",
    title,
    body,
    innerHtml: `
      <div class="setup-section">
        <h2>Años disponibles</h2>
        <div class="check-grid">${renderYearCheckboxes("year", criteria?.years || getAvailableYears(examsIndex))}</div>
      </div>
    `,
    onSubmit: formData => {
      const years = formData.getAll("year").map(Number);
      if (!years.length) {
        showToast("Elige al menos un año.", "warning");
        return;
      }

      if (kind === "reading") {
        practiceReadingCriteria = { years };
        startNextPracticeReading();
      } else {
        practiceUseCriteria = { years };
        startNextPracticeUse();
      }
    }
  });
}

async function startFullExam(exam, options) {
  if (!exam) {
    showToast("No se encontró el examen seleccionado.", "error");
    return;
  }

  try {
    const payload = await loadExamPayload(exam);
    const modeLabel = options.modeLabel || "Examen";
    currentSession = createSessionState(payload, {
      flow: options.flow,
      examMode: options.examMode,
      modeLabel,
      goalLabel: options.examMode === EXAM_MODE.legacyOld ? "Modelo antiguo" : "Modelo nuevo",
      title: exam.label,
      description: "Resuelve Reading y Use of English. Al corregir, se guardará tu progreso y se generará un diagnóstico.",
      visibleSections: ["reading", "use"],
      canSkip: Boolean(options.canSkip)
    });
    renderCurrentSession(true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function startNextRandomExam() {
  const criteria = randomCriteria || {
    years: getAvailableYears(examsIndex),
    model: EXAM_MODE.legacyNew
  };
  const candidates = getRandomExamCandidates(examsIndex, criteria);
  const exam = pickRandomItem(candidates, lastRandomExamId);
  if (!exam) {
    showToast("No hay exámenes disponibles con esos criterios.", "warning");
    return;
  }

  lastRandomExamId = exam.id;
  startFullExam(exam, {
    flow: FLOW.random,
    examMode: resolveExamMode(exam, criteria.model),
    modeLabel: "Simulacro aleatorio",
    canSkip: true
  });
}

async function startNextPracticeReading() {
  const criteria = practiceReadingCriteria || { years: getAvailableYears(examsIndex) };
  const candidates = getPracticeReadingCandidates(examsIndex, criteria);
  const choice = pickRandomItem(candidates, lastPracticeReadingKey, item => item.key);
  if (!choice) {
    showToast("No hay readings disponibles con esos criterios.", "warning");
    return;
  }

  try {
    lastPracticeReadingKey = choice.key;
    const payload = await loadSingleReadingPayload(choice.exam, choice.reading);
    currentSession = createSessionState(payload, {
      flow: FLOW.reading,
      examMode: EXAM_MODE.reading,
      modeLabel: "Reading enfocado",
      goalLabel: "Parte 1",
      title: choice.reading.title,
      description: `${choice.exam.label}. Trabaja comprensión, true/false y vocabulario.`,
      visibleSections: ["reading"],
      canSkip: true
    });
    renderCurrentSession(true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function startNextPracticeUse() {
  const criteria = practiceUseCriteria || { years: getAvailableYears(examsIndex) };
  const candidates = getPracticeUseCandidates(examsIndex, criteria);
  const choice = pickRandomItem(candidates, lastPracticeUseExamId, item => item.key);
  if (!choice) {
    showToast("No hay bloques de Use of English disponibles con esos criterios.", "warning");
    return;
  }

  try {
    lastPracticeUseExamId = choice.key;
    const payload = await loadUsePayload(choice.exam);
    currentSession = createSessionState(payload, {
      flow: FLOW.use,
      examMode: EXAM_MODE.use,
      modeLabel: "Use of English enfocado",
      goalLabel: "Parte 2",
      title: choice.exam.useOfEnglish.title,
      description: `${choice.exam.label}. Se corrigen todos los grupos para detectar patrones de gramática.`,
      visibleSections: ["use"],
      practiceAll: true,
      canSkip: true
    });
    renderCurrentSession(true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderCurrentSession(restartTimer = false) {
  if (!currentSession) return;
  currentResults = null;
  setView("work", currentSession.title);
  renderExamView(app, currentSession, {
    onSubmit: handleSubmitAttempt,
    onBack: renderDashboardView,
    onHome: renderDashboardView,
    onSkip: handleSkipCurrent,
    onReadingChange: readingId => {
      currentSession.activeReadingId = readingId;
      renderCurrentSession(false);
    },
    onUseBlockChange: blockId => {
      currentSession.activeUseBlockId = blockId;
      renderCurrentSession(false);
    },
    onUseGroupToggle: (groupId, checked) => {
      updateUseGroupSelection(groupId, checked);
      renderCurrentSession(false);
    }
  });

  if (restartTimer) {
    timer.start();
  } else {
    updateTimerDisplay(timer.getElapsedSeconds());
  }
}

function updateUseGroupSelection(groupId, checked) {
  const selected = currentSession.selectedUseGroups.filter(id => id !== groupId);

  if (checked) {
    if (selected.length >= currentSession.expectedUseGroups) {
      showToast(`Solo puedes elegir ${currentSession.expectedUseGroups} grupos.`, "warning");
      return;
    }
    selected.push(groupId);
  }

  currentSession.selectedUseGroups = selected;
}

function handleSkipCurrent() {
  if (currentSession?.flow === FLOW.random) startNextRandomExam();
  if (currentSession?.flow === FLOW.reading) startNextPracticeReading();
  if (currentSession?.flow === FLOW.use) startNextPracticeUse();
}

function handleSubmitAttempt(formData) {
  if (!currentSession) return;
  const responses = getFormResponses(document.getElementById("examForm")) || Object.fromEntries(formData.entries());
  let readingStats = null;
  let useStats = null;

  if (currentSession.visibleSections.includes("reading")) {
    const reading = currentSession.readings.find(item => item.id === currentSession.activeReadingId) || currentSession.readings[0];
    readingStats = correctReading(reading, responses);
  }

  if (currentSession.visibleSections.includes("use")) {
    const result = correctUse(currentSession.use, responses, {
      chooseAny: currentSession.chooseAny,
      practiceAll: currentSession.practiceAll,
      activeUseBlockId: currentSession.activeUseBlockId,
      selectedUseGroups: currentSession.selectedUseGroups
    });

    if (!result.valid) {
      showToast(result.message, "warning");
      return;
    }
    useStats = result;
  }

  timer.stop();
  currentResults = {
    id: currentResults?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    readingStats,
    useStats,
    manualScores: new Map()
  };

  renderInlineFeedback([readingStats, useStats]);
  renderAttemptResults();
  persistCurrentAttempt();
  document.getElementById("resultsMount")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAttemptResults() {
  const resultsMount = document.getElementById("resultsMount");
  if (!resultsMount || !currentResults) return;

  renderResults(resultsMount, {
    session: currentSession,
    readingStats: currentResults.readingStats,
    useStats: currentResults.useStats,
    manualScores: currentResults.manualScores,
    onManualScore: (questionId, score) => {
      currentResults.manualScores.set(questionId, score);
      renderAttemptResults();
      persistCurrentAttempt();
    },
    onAction: handleResultAction
  });
}

function handleResultAction(action) {
  if (action === "dashboard") {
    renderDashboardView();
    return;
  }

  if (action === "retry") {
    renderCurrentSession(true);
    return;
  }

  handleDashboardAction(action);
}

function persistCurrentAttempt() {
  if (!currentResults || !currentSession) return;

  const useStats = applyManualScores(currentResults.useStats, currentResults.manualScores);
  const totalStats = combineSectionStats([currentResults.readingStats, useStats]);

  saveProgressAttempt({
    id: currentResults.id,
    date: new Date().toISOString(),
    mode: currentSession.modeLabel,
    targetId: currentSession.exam?.id || currentSession.title,
    targetName: currentSession.exam?.label || currentSession.title,
    score: totalStats.score,
    maxScore: totalStats.maxScore,
    correctCount: totalStats.correct,
    failureCount: totalStats.failures,
    totalQuestions: totalStats.total,
    percentage: totalStats.percentage,
    sectionBreakdown: buildSectionBreakdown(currentResults.readingStats, useStats),
    wrongQuestions: totalStats.wrongQuestions,
    elapsedSeconds: timer.getElapsedSeconds()
  });
}

function renderMistakesView() {
  timer.reset();
  setView("mistakes", "Revisión de fallos");
  const mistakes = getPendingMistakes(attempts());

  app.innerHTML = `
    <section class="screen review-screen">
      <div class="setup-header">
        <div>
          <button class="button button-ghost button-small" type="button" data-action="dashboard">Volver</button>
          <p class="eyebrow">Revisión inteligente</p>
          <h1>Banco de fallos</h1>
          <p>Estos son los errores acumulados en tus intentos recientes. Úsalos para decidir el siguiente bloque de práctica.</p>
        </div>
        <button class="button button-secondary" type="button" data-action="clear">Reiniciar progreso</button>
      </div>

      <div class="review-actions">
        <button class="button button-primary" type="button" data-action="practice_use">Practicar Use of English</button>
        <button class="button button-secondary" type="button" data-action="practice_reading">Practicar Reading</button>
        <button class="button button-secondary" type="button" data-action="random">Simulacro aleatorio</button>
      </div>

      <section class="panel">
        ${mistakes.length ? renderMistakeList(mistakes) : '<p class="empty-state">No tienes fallos guardados. Termina un intento y aparecerán aquí.</p>'}
      </section>
    </section>
  `;

  app.querySelector('[data-action="dashboard"]').addEventListener("click", renderDashboardView);
  app.querySelector('[data-action="clear"]').addEventListener("click", () => {
    clearProgressAttempts();
    showToast("Progreso reiniciado.", "info");
    renderMistakesView();
  });
  app.querySelectorAll(".review-actions [data-action]").forEach(button => {
    button.addEventListener("click", () => handleDashboardAction(button.dataset.action));
  });
}

function renderMistakeList(mistakes) {
  return `
    <ul class="wrong-question-list review-list">
      ${mistakes.map(item => `
        <li>
          <div class="wrong-question-head">
            <strong>${escapeHtml(item.section)} · ${escapeHtml(item.id)}</strong>
            <span>${escapeHtml(item.type)}</span>
          </div>
          <p><b>Origen:</b> ${escapeHtml(item.targetName || "Intento")} · ${escapeHtml(new Date(item.attemptDate).toLocaleDateString("es"))}</p>
          <p><b>Enunciado:</b> ${escapeHtml(item.prompt || "No disponible")}</p>
          <p><b>Tu respuesta:</b> ${escapeHtml(item.userAnswer || "Sin respuesta")}</p>
          <p><b>Respuesta correcta:</b> ${escapeHtml(item.correctAnswer || "No disponible")}</p>
        </li>
      `).join("")}
    </ul>
  `;
}

boot();
