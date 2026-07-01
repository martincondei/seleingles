import {
  EXAM_MODE,
  FLOW,
  buildInventory,
  getAvailableYears,
  getExamById,
  getExamsForYear,
  getPracticeReadingCandidates,
  getPracticeUseCandidates,
  getPracticeWritingCandidates,
  getRandomExamCandidates,
  loadExamPayload,
  loadExamsIndex,
  loadSingleReadingPayload,
  loadUsePayload,
  loadWritingPayload,
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
let practiceWritingCriteria = null;
let lastRandomExamId = null;
let lastPracticeReadingKey = null;
let lastPracticeUseExamId = null;
let lastPracticeWritingExamId = null;
let setupState = {
  selectedYear: null,
  selectedExamId: null,
  selectedReadingId: null,
  selectedModel: EXAM_MODE.legacyNew
};

const WRITING_CORRECTOR_VIEW = "writing_corrector";

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
      if (target === "reading") renderSectionHub("reading");
      if (target === "use") renderSectionHub("use");
      if (target === WRITING_CORRECTOR_VIEW) renderSectionHub("writing");
      if (target === "specific") renderSectionHub("exam");
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
  if (action === "section_reading") renderSectionHub("reading");
  if (action === "section_use") renderSectionHub("use");
  if (action === "section_writing") renderSectionHub("writing");
  if (action === "section_exam") renderSectionHub("exam");
  if (action === "reading_specific") renderReadingSpecificSetup();
  if (action === "reading_random") renderPracticeSetup("reading");
  if (action === "use_specific") renderUseSpecificSetup();
  if (action === "use_random") renderPracticeSetup("use");
  if (action === "writing_specific") renderWritingSpecificSetup();
  if (action === "writing_random") renderWritingRandomSetup();
  if (action === FLOW.specific) renderSpecificSetup();
  if (action === FLOW.random) renderRandomSetup();
  if (action === FLOW.reading) renderPracticeSetup("reading");
  if (action === FLOW.use) renderPracticeSetup("use");
  if (action === WRITING_CORRECTOR_VIEW) renderSectionHub("writing");
  if (action === FLOW.mistakes) renderMistakesView();
}

function renderSectionHub(kind) {
  const config = getSectionConfig(kind);
  setView(config.view, config.title);
  timer.reset();
  currentSession = null;
  currentResults = null;

  app.innerHTML = `
    <section class="screen section-hub-screen">
      <div class="setup-header">
        <div>
          <button class="button button-ghost button-small" type="button" data-action="dashboard">Volver</button>
          <p class="eyebrow">${escapeHtml(config.eyebrow)}</p>
          <h1>${escapeHtml(config.title)}</h1>
          <p>${escapeHtml(config.body)}</p>
        </div>
      </div>
      <div class="section-mode-grid">
        <button class="mode-card primary" type="button" data-action="${escapeHtml(config.specificAction)}">
          <span>01</span>
          <strong>Examen concreto</strong>
          <p>${escapeHtml(config.specificText)}</p>
        </button>
        <button class="mode-card" type="button" data-action="${escapeHtml(config.randomAction)}">
          <span>02</span>
          <strong>Aleatorio</strong>
          <p>${escapeHtml(config.randomText)}</p>
        </button>
      </div>
    </section>
  `;

  app.querySelector('[data-action="dashboard"]').addEventListener("click", renderDashboardView);
  app.querySelectorAll(".section-mode-grid [data-action]").forEach(button => {
    button.addEventListener("click", () => handleDashboardAction(button.dataset.action));
  });
}

function getSectionConfig(kind) {
  const configs = {
    reading: {
      view: "reading",
      eyebrow: "Reading",
      title: "Practicar Reading",
      body: "Elige una convocatoria exacta o deja que la app seleccione un texto de los años que quieras practicar.",
      specificAction: "reading_specific",
      randomAction: "reading_random",
      specificText: "Selecciona año, convocatoria y, en 2023/2024, el reading 1 o 2.",
      randomText: "Selecciona años y recibe un reading aleatorio de esa bolsa."
    },
    use: {
      view: "use",
      eyebrow: "Use of English",
      title: "Practicar Use of English",
      body: "Trabaja solo la parte de gramática con formato oficial según el año elegido.",
      specificAction: "use_specific",
      randomAction: "use_random",
      specificText: "Selecciona año y convocatoria. En 2023/2024 entregarás 6 preguntas de 12.",
      randomText: "Selecciona años y recibe un bloque aleatorio con sus reglas oficiales."
    },
    writing: {
      view: WRITING_CORRECTOR_VIEW,
      eyebrow: "Writing",
      title: "Writing Corrector",
      body: "Carga un enunciado real y prueba la interfaz de corrección simulada, sin API conectada todavía.",
      specificAction: "writing_specific",
      randomAction: "writing_random",
      specificText: "Selecciona año y convocatoria para cargar sus dos enunciados de writing.",
      randomText: "Selecciona años y recibe una convocatoria aleatoria con sus prompts."
    },
    exam: {
      view: "specific",
      eyebrow: "Examen completo",
      title: "Practicar examen completo",
      body: "Haz Reading y Use of English juntos, por convocatoria exacta o como simulacro aleatorio.",
      specificAction: FLOW.specific,
      randomAction: FLOW.random,
      specificText: "Elige año, convocatoria y modelo antes de empezar.",
      randomText: "Filtra años y modelo para generar un simulacro completo."
    }
  };

  return configs[kind] || configs.exam;
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

function renderReadingSpecificSetup(selectedYear = setupState.selectedYear) {
  const years = getAvailableYears(examsIndex);
  const year = selectedYear || years[0];
  const exams = getExamsForYear(examsIndex, year).filter(exam => exam.reading?.length);
  const selectedExamId = exams.some(exam => exam.id === setupState.selectedExamId)
    ? setupState.selectedExamId
    : exams[0]?.id;
  const selectedExam = getExamById(examsIndex, selectedExamId);
  const readings = selectedExam?.reading || [];
  const selectedReadingId = readings.some(reading => reading.id === setupState.selectedReadingId)
    ? setupState.selectedReadingId
    : readings[0]?.id;

  setupState = {
    ...setupState,
    selectedYear: year,
    selectedExamId,
    selectedReadingId
  };

  renderSetupShell({
    view: "reading",
    eyebrow: "Reading concreto",
    title: "Elige el reading exacto",
    body: "Selecciona año y convocatoria. En 2023 y 2024 puedes elegir entre los dos readings del modelo antiguo.",
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
      <label class="field-label">
        <span>Reading</span>
        <select name="readingId" id="readingSelect">
          ${readings.map(reading => `<option value="${escapeHtml(reading.id)}" ${reading.id === selectedReadingId ? "selected" : ""}>${escapeHtml(reading.title)}</option>`).join("")}
        </select>
      </label>
    `,
    onSubmit: formData => {
      const exam = getExamById(examsIndex, formData.get("examId"));
      const reading = (exam?.reading || []).find(item => item.id === formData.get("readingId"));
      startSpecificReading(exam, reading);
    }
  });

  app.querySelector("#yearSelect").addEventListener("change", event => {
    setupState.selectedExamId = null;
    setupState.selectedReadingId = null;
    renderReadingSpecificSetup(Number(event.target.value));
  });
  app.querySelector("#examSelect").addEventListener("change", event => {
    setupState.selectedExamId = event.target.value;
    setupState.selectedReadingId = null;
    renderReadingSpecificSetup(year);
  });
  app.querySelector("#readingSelect").addEventListener("change", event => {
    setupState.selectedReadingId = event.target.value;
  });
}

function renderUseSpecificSetup(selectedYear = setupState.selectedYear) {
  const years = getAvailableYears(examsIndex);
  const year = selectedYear || years[0];
  const exams = getExamsForYear(examsIndex, year).filter(exam => exam.useOfEnglish?.file);
  const selectedExamId = exams.some(exam => exam.id === setupState.selectedExamId)
    ? setupState.selectedExamId
    : exams[0]?.id;

  setupState = {
    ...setupState,
    selectedYear: year,
    selectedExamId
  };

  renderSetupShell({
    view: "use",
    eyebrow: "Use of English concreto",
    title: "Elige el bloque exacto",
    body: "En 2023 y 2024 se usa el modelo antiguo: selecciona 6 preguntas de 12 dentro del intento.",
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
      <p class="form-note">${Number(year) < 2025 ? "Modelo antiguo: entregarás 6 preguntas de 12." : "Modelo actual: escogerás el bloque oficial que quieras entregar."}</p>
    `,
    onSubmit: formData => {
      startSpecificUse(getExamById(examsIndex, formData.get("examId")));
    }
  });

  app.querySelector("#yearSelect").addEventListener("change", event => {
    setupState.selectedExamId = null;
    renderUseSpecificSetup(Number(event.target.value));
  });
  app.querySelector("#examSelect").addEventListener("change", event => {
    setupState.selectedExamId = event.target.value;
  });
}

function renderWritingSpecificSetup(selectedYear = setupState.selectedYear) {
  const years = getAvailableYears(examsIndex);
  const year = selectedYear || years[0];
  const exams = getExamsForYear(examsIndex, year).filter(exam => exam.writing?.file);
  const selectedExamId = exams.some(exam => exam.id === setupState.selectedExamId)
    ? setupState.selectedExamId
    : exams[0]?.id;

  setupState = {
    ...setupState,
    selectedYear: year,
    selectedExamId
  };

  renderSetupShell({
    view: WRITING_CORRECTOR_VIEW,
    eyebrow: "Writing concreto",
    title: "Elige el writing exacto",
    body: "Carga los enunciados oficiales de una convocatoria y usa el corrector simulado sobre tu respuesta.",
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
    `,
    onSubmit: formData => {
      startSpecificWriting(getExamById(examsIndex, formData.get("examId")));
    }
  });

  app.querySelector("#yearSelect").addEventListener("change", event => {
    setupState.selectedExamId = null;
    renderWritingSpecificSetup(Number(event.target.value));
  });
  app.querySelector("#examSelect").addEventListener("change", event => {
    setupState.selectedExamId = event.target.value;
  });
}

function renderWritingRandomSetup() {
  const years = practiceWritingCriteria?.years || getAvailableYears(examsIndex);

  renderSetupShell({
    view: WRITING_CORRECTOR_VIEW,
    eyebrow: "Writing aleatorio",
    title: "Genera un writing aleatorio",
    body: "Selecciona de qué años quieres practicar y la app cargará una convocatoria con sus enunciados reales.",
    innerHtml: `
      <div class="setup-section">
        <h2>Años disponibles</h2>
        <div class="check-grid">${renderYearCheckboxes("year", years)}</div>
      </div>
    `,
    onSubmit: formData => {
      const selectedYears = formData.getAll("year").map(Number);
      if (!selectedYears.length) {
        showToast("Elige al menos un año.", "warning");
        return;
      }

      practiceWritingCriteria = { years: selectedYears };
      startNextPracticeWriting();
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

async function startSpecificReading(exam, reading) {
  if (!exam || !reading) {
    showToast("No se encontró el reading seleccionado.", "error");
    return;
  }

  try {
    const payload = await loadSingleReadingPayload(exam, reading);
    currentSession = createSessionState(payload, {
      flow: FLOW.reading,
      examMode: EXAM_MODE.reading,
      modeLabel: "Reading concreto",
      goalLabel: Number(exam.year) < 2025 ? "Modelo antiguo" : "Modelo actual",
      title: reading.title,
      description: `${exam.label}. Trabaja comprensión lectora, true/false y vocabulario.`,
      visibleSections: ["reading"],
      canSkip: false
    });
    renderCurrentSession(true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function startSpecificUse(exam) {
  if (!exam) {
    showToast("No se encontró el bloque seleccionado.", "error");
    return;
  }

  try {
    const payload = await loadUsePayload(exam);
    const isLegacy = Number(exam.year) < 2025;
    currentSession = createSessionState(payload, {
      flow: FLOW.use,
      examMode: isLegacy ? EXAM_MODE.legacyOld : EXAM_MODE.use,
      modeLabel: "Use of English concreto",
      goalLabel: isLegacy ? "Modelo antiguo" : "Modelo actual",
      title: exam.useOfEnglish.title,
      description: isLegacy
        ? `${exam.label}. Selecciona exactamente 6 preguntas para entregar.`
        : `${exam.label}. Escoge el bloque oficial que quieras entregar.`,
      visibleSections: ["use"],
      canSkip: false
    });
    renderCurrentSession(true);
  } catch (error) {
    showToast(error.message, "error");
  }
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
    const isLegacy = Number(choice.exam.year) < 2025;
    currentSession = createSessionState(payload, {
      flow: FLOW.use,
      examMode: isLegacy ? EXAM_MODE.legacyOld : EXAM_MODE.use,
      modeLabel: "Use of English enfocado",
      goalLabel: isLegacy ? "Modelo antiguo" : "Parte 2",
      title: choice.exam.useOfEnglish.title,
      description: isLegacy
        ? `${choice.exam.label}. Selecciona exactamente 6 preguntas para entregar.`
        : `${choice.exam.label}. Escoge el bloque oficial que quieras entregar.`,
      visibleSections: ["use"],
      canSkip: true
    });
    renderCurrentSession(true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function startSpecificWriting(exam) {
  if (!exam) {
    showToast("No se encontró el writing seleccionado.", "error");
    return;
  }

  try {
    const payload = await loadWritingPayload(exam);
    renderWritingCorrectorView(payload);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function startNextPracticeWriting() {
  const criteria = practiceWritingCriteria || { years: getAvailableYears(examsIndex) };
  const candidates = getPracticeWritingCandidates(examsIndex, criteria);
  const choice = pickRandomItem(candidates, lastPracticeWritingExamId, item => item.key);
  if (!choice) {
    showToast("No hay writings disponibles con esos criterios.", "warning");
    return;
  }

  try {
    lastPracticeWritingExamId = choice.key;
    const payload = await loadWritingPayload(choice.exam);
    renderWritingCorrectorView({
      ...payload,
      canSkip: true
    });
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

function renderWritingCorrectorView({ exam = null, writing = null, canSkip = false } = {}) {
  timer.reset();
  currentSession = null;
  currentResults = null;
  setView(WRITING_CORRECTOR_VIEW, "Writing Corrector");
  const prompts = writing?.prompts || [];
  const initialPrompt = prompts[0]?.prompt || "";
  const sourceLabel = exam?.label || "Enunciado manual";

  app.innerHTML = `
    <section class="screen writing-screen">
      <div class="setup-header">
        <div>
          <button class="button button-ghost button-small" type="button" data-action="writing-hub">Volver</button>
          <p class="eyebrow">Writing Corrector</p>
          <h1>Corrige tu writing con rúbrica</h1>
          <p>${escapeHtml(sourceLabel)}. Introduce o ajusta el enunciado y tu respuesta para ver una evaluación simulada.</p>
        </div>
        ${canSkip ? '<button class="button button-secondary" type="button" data-action="skip-writing">Otro writing similar</button>' : ""}
      </div>

      <div class="writing-layout">
        <form class="panel writing-form" id="writingCorrectorForm">
          ${prompts.length ? `
            <label class="field-label">
              <span>Enunciado oficial</span>
              <select name="officialPrompt" id="officialPromptSelect">
                ${prompts.map((prompt, index) => `<option value="${index}">${escapeHtml(prompt.id)} · ${escapeHtml(prompt.prompt)}</option>`).join("")}
              </select>
            </label>
          ` : ""}

          <label class="field-label">
            <span>Enunciado del writing</span>
            <textarea class="field-textarea writing-textarea" name="writingPrompt" placeholder="Ejemplo: Write an opinion essay about the advantages and disadvantages of social media.">${escapeHtml(initialPrompt)}</textarea>
          </label>

          <label class="field-label">
            <span>Tu writing</span>
            <textarea class="field-textarea writing-textarea writing-textarea-large" name="studentWriting" placeholder="Escribe aquí tu texto en inglés."></textarea>
          </label>

          <div class="form-actions">
            <button class="button button-primary" type="submit">Corregir writing</button>
            <button class="button button-secondary" type="button" data-action="clear-writing">Limpiar</button>
          </div>
        </form>

        <section class="panel writing-results" id="writingResults" aria-live="polite">
          ${renderWritingEmptyState()}
        </section>
      </div>
    </section>
  `;

  const form = app.querySelector("#writingCorrectorForm");
  const results = app.querySelector("#writingResults");

  app.querySelector('[data-action="writing-hub"]').addEventListener("click", () => renderSectionHub("writing"));
  app.querySelector('[data-action="skip-writing"]')?.addEventListener("click", startNextPracticeWriting);
  app.querySelector("#officialPromptSelect")?.addEventListener("change", event => {
    const prompt = prompts[Number(event.target.value)]?.prompt || "";
    form.elements.writingPrompt.value = prompt;
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    correctWritingWithApi(form, results, { exam, writing });
  });

  app.querySelector('[data-action="clear-writing"]').addEventListener("click", () => {
    form.reset();
    if (initialPrompt) form.elements.writingPrompt.value = initialPrompt;
    results.innerHTML = renderWritingEmptyState();
  });
}

async function correctWritingWithApi(form, results, context = {}) {
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const prompt = String(formData.get("writingPrompt") || "").trim();
  const writing = String(formData.get("studentWriting") || "").trim();

  if (!prompt || !writing) {
    showToast("Escribe el enunciado y tu writing para probar la corrección.", "info");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Corrigiendo...";
  results.innerHTML = renderWritingLoadingState();

  try {
    const response = await fetch("/api/writing-correction", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        writingPrompt: prompt,
        studentWriting: writing
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "No se pudo corregir el writing.");
    }

    results.innerHTML = renderWritingResult(payload);
    persistWritingAttempt(payload, {
      ...context,
      prompt
    });
    showToast("Writing corregido.", "info");
  } catch (error) {
    results.innerHTML = renderWritingErrorState(error.message);
    showToast(error.message, "warning");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Corregir writing";
  }
}

function persistWritingAttempt(result, { exam = null, writing = null, prompt = "" } = {}) {
  const stats = buildWritingStats(result);
  const targetName = exam?.label || writing?.title || "Writing";
  const wrongQuestions = (result.main_errors || []).map((error, index) => ({
    section: "Writing",
    id: `W${index + 1}`,
    type: "Writing error",
    topic: "Errores principales",
    prompt: error.original || prompt,
    userAnswer: error.original || "No disponible",
    correctAnswer: error.correction || "No disponible"
  }));

  saveProgressAttempt({
    id: `writing-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: new Date().toISOString(),
    mode: "Writing",
    targetId: exam?.id || writing?.id || "writing",
    targetName,
    score: stats.score,
    maxScore: stats.maxScore,
    correctCount: 0,
    failureCount: wrongQuestions.length,
    totalQuestions: 1,
    percentage: stats.percentage,
    sectionBreakdown: buildSectionBreakdown(null, null, stats),
    wrongQuestions,
    elapsedSeconds: null
  });
}

function buildWritingStats(result) {
  const score = Number(result.final_score || 0);
  const maxScore = Number(result.max_score || 3);
  return {
    kind: "writing",
    score,
    maxScore,
    correct: score,
    failures: (result.main_errors || []).length,
    total: maxScore,
    percentage: maxScore > 0 ? (score / maxScore) * 100 : 0,
    wrongQuestions: []
  };
}

function renderWritingEmptyState() {
  return `
    <div class="writing-empty">
      <p class="eyebrow">Resultado</p>
      <h2>Esperando corrección</h2>
      <p class="empty-state">Cuando pulses “Corregir writing”, enviaremos el enunciado y tu texto al backend seguro para obtener la evaluación con rúbrica.</p>
    </div>
  `;
}

function renderWritingLoadingState() {
  return `
    <div class="writing-empty">
      <p class="eyebrow">Corrección</p>
      <h2>Analizando writing</h2>
      <p class="empty-state">Estamos evaluando el texto con la rúbrica. No se generará una versión reescrita completa.</p>
    </div>
  `;
}

function renderWritingErrorState(message) {
  return `
    <div class="writing-empty">
      <p class="eyebrow">No se pudo corregir</p>
      <h2>Revisa la configuración</h2>
      <p class="empty-state">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderWritingResult(result) {
  return `
    <div class="writing-result-head">
      <div>
        <p class="eyebrow">Resultado OpenAI</p>
        <h2>${formatWritingScore(result.final_score)} / ${formatWritingScore(result.max_score)}</h2>
      </div>
      <span class="status-pill">API conectada</span>
    </div>

    <div class="writing-summary-grid">
      ${renderWritingMetric("Nota final", `${formatWritingScore(result.final_score)} / ${formatWritingScore(result.max_score)}`)}
      ${renderWritingMetric("Palabras", result.word_count)}
      ${renderWritingMetric("Penalización extensión", result.length_penalty)}
    </div>

    <section class="writing-block">
      <h3>Desglose de la rúbrica</h3>
      <div class="rubric-grid">
        ${renderRubricCard("Contenido", result.rubric.content, [
          ["Adecuación al tema", result.rubric.content.topic_relevance],
          ["Organización", result.rubric.content.organization]
        ])}
        ${renderRubricCard("Expresión", result.rubric.expression, [
          ["Gramática", result.rubric.expression.grammar],
          ["Vocabulario", result.rubric.expression.vocabulary],
          ["Ortografía y puntuación", result.rubric.expression.spelling_punctuation]
        ])}
      </div>
    </section>

    <section class="writing-block">
      <h3>Comentario general</h3>
      <p>${escapeHtml(result.general_comment)}</p>
    </section>

    <section class="writing-block">
      <h3>Errores principales</h3>
      <div class="table-scroll">
        <table class="writing-error-table">
          <thead>
            <tr>
              <th>Original</th>
              <th>Corrección</th>
              <th>Explicación</th>
            </tr>
          </thead>
          <tbody>
            ${result.main_errors.map(error => `
              <tr>
                <td>${escapeHtml(error.original)}</td>
                <td>${escapeHtml(error.correction)}</td>
                <td>${escapeHtml(error.explanation)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="writing-block">
      <h3>Consejos para mejorar</h3>
      <ul class="writing-tip-list">
        ${result.improvement_tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join("")}
      </ul>
    </section>

    <section class="writing-block">
      <h3>Recursos útiles</h3>
      <div class="resource-grid">
        <article class="resource-card">
          <strong>Conectores</strong>
          <div class="resource-tags">
            ${result.useful_resources.connectors.map(connector => `<span>${escapeHtml(connector)}</span>`).join("")}
          </div>
        </article>
        <article class="resource-card">
          <strong>Gramática</strong>
          <ul>
            ${result.useful_resources.grammar_focus.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </article>
        <article class="resource-card resource-card-wide">
          <strong>Vocabulario</strong>
          <div class="vocabulary-suggestions">
            ${result.useful_resources.vocabulary_suggestions.map(item => `
              <p><b>${escapeHtml(item.basic)}</b>: ${item.better_options.map(option => escapeHtml(option)).join(", ")}</p>
            `).join("")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderWritingMetric(label, value) {
  return `
    <div class="writing-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function renderRubricCard(title, section, items) {
  return `
    <article class="rubric-card">
      <header>
        <strong>${escapeHtml(title)}</strong>
        <span>${formatWritingScore(section.score)} / ${formatWritingScore(section.max)}</span>
      </header>
      ${items.map(([label, item]) => `
        <div class="rubric-item">
          <div>
            <strong>${escapeHtml(label)}</strong>
            <span>${formatWritingScore(item.score)} / ${formatWritingScore(item.max)}</span>
          </div>
          <p>${escapeHtml(item.comment)}</p>
        </div>
      `).join("")}
    </article>
  `;
}

function formatWritingScore(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
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
