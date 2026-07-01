import {
  buildRecommendations,
  formatAttemptDate,
  formatElapsedTime,
  getAttemptGrade,
  getPendingMistakes,
  getProgressSummary,
  getReadingSkillInsights,
  getSectionAverages,
  getUseTopicInsights,
  getWrongQuestionInsights
} from "../logic/progress.js";
import { escapeHtml } from "./dom.js";

function stat(value, label) {
  return `
    <div class="metric">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderRecommendationList(recommendations) {
  return recommendations.map(item => `
    <button class="recommendation" type="button" data-action="${escapeHtml(item.action)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.body)}</span>
    </button>
  `).join("");
}

function renderRecentAttempts(attempts) {
  if (!attempts.length) {
    return `<p class="empty-state">Todavía no hay intentos terminados. Haz el primero y aquí aparecerá tu historial.</p>`;
  }

  return `
    <ul class="attempt-list">
      ${attempts.slice(0, 6).map(attempt => {
        const elapsed = formatElapsedTime(attempt.elapsedSeconds);
        return `
          <li>
            <div>
              <strong>${escapeHtml(attempt.targetName)}</strong>
              <span>${escapeHtml(attempt.mode)} · ${formatAttemptDate(attempt.date)}${elapsed ? ` · ${elapsed}` : ""}</span>
            </div>
            <b>${getAttemptGrade(attempt).toFixed(2)}</b>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function renderInsights(insights) {
  if (!insights.length) {
    return `<p class="empty-state compact">Aún no hay patrones de error. Termina un intento para activar el diagnóstico.</p>`;
  }

  return `
    <div class="insight-list">
      ${insights.slice(0, 4).map(insight => `
        <div class="insight">
          <span>${escapeHtml(insight.section)}</span>
          <strong>${escapeHtml(insight.type)}</strong>
          <small>${insight.count} fallos</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderGroupedInsights(title, insights) {
  if (!insights.length) {
    return `
      <div class="diagnostic-block">
        <strong>${escapeHtml(title)}</strong>
        <p class="empty-state compact">Sin fallos acumulados.</p>
      </div>
    `;
  }

  return `
    <div class="diagnostic-block">
      <strong>${escapeHtml(title)}</strong>
      <div class="insight-list compact-list">
        ${insights.slice(0, 5).map(insight => `
          <div class="insight">
            <span>${escapeHtml(insight.label)}</span>
            <small>${insight.count} fallos</small>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

export function renderDashboard(container, { attempts, inventory, onAction, onResetAnalytics }) {
  const summary = getProgressSummary(attempts);
  const averages = getSectionAverages(attempts);
  const recommendations = buildRecommendations(attempts);
  const insights = getWrongQuestionInsights(attempts);
  const useTopicInsights = getUseTopicInsights(attempts);
  const readingSkillInsights = getReadingSkillInsights(attempts);
  const pendingMistakes = getPendingMistakes(attempts);
  const yearRange = inventory.years?.length
    ? `${Math.min(...inventory.years)}-${Math.max(...inventory.years)}`
    : "Sin años";

  container.innerHTML = `
    <section class="screen dashboard-screen">
      <div class="hero-product">
        <div>
          <p class="eyebrow">Selectividad English Prep</p>
          <h1>Entrena con exámenes reales y mejora por patrones.</h1>
          <p>Reading, Use of English, simulacros, revisión de fallos y progreso local en una sola herramienta.</p>
          <div class="hero-actions">
            <button class="button button-primary" type="button" data-action="random">Empezar simulacro</button>
            <button class="button button-secondary" type="button" data-action="specific">Elegir examen</button>
          </div>
        </div>
        <div class="hero-metrics">
          ${stat(String(inventory.exams), "Exámenes")}
          ${stat(String(inventory.readings), "Readings")}
          ${stat(String(inventory.useBlocks), "Bloques Use")}
          ${stat(yearRange, "Años")}
        </div>
      </div>

      <div class="dashboard-layout">
        <section class="panel">
          <div class="section-title-row">
            <div>
              <p class="eyebrow">Progreso</p>
              <h2>Tu panel</h2>
            </div>
            <div class="panel-actions">
              <span class="${summary.trend >= 0 ? "trend-up" : "trend-down"}">${summary.trend >= 0 ? "+" : ""}${summary.trend.toFixed(2)}</span>
              <button class="button button-ghost button-small" type="button" data-reset-analytics>Reiniciar analíticas</button>
            </div>
          </div>
          <div class="stats-grid">
            ${stat(String(summary.totalAttempts), "Intentos")}
            ${stat(summary.averageGrade.toFixed(2), "Nota media")}
            ${stat(summary.bestGrade.toFixed(2), "Mejor nota")}
            ${stat(`${summary.averageAccuracy.toFixed(0)}%`, "Acierto medio")}
          </div>
          <div class="skill-bars">
            <div><span>Reading</span><progress value="${averages.reading || 0}" max="100"></progress><b>${(averages.reading || 0).toFixed(0)}%</b></div>
            <div><span>Use of English</span><progress value="${averages.useOfEnglish || 0}" max="100"></progress><b>${(averages.useOfEnglish || 0).toFixed(0)}%</b></div>
          </div>
        </section>

        <section class="panel">
          <div class="section-title-row">
            <div>
              <p class="eyebrow">Siguiente paso</p>
              <h2>Recomendaciones</h2>
            </div>
          </div>
          <div class="recommendation-list">
            ${renderRecommendationList(recommendations)}
          </div>
        </section>
      </div>

      <section class="panel">
        <div class="section-title-row">
          <div>
            <p class="eyebrow">Practicar</p>
            <h2>Modos de estudio</h2>
          </div>
        </div>
        <div class="mode-grid">
          <button class="mode-card primary" type="button" data-action="specific">
            <span>01</span>
            <strong>Examen concreto</strong>
            <p>Elige año, convocatoria y modelo exacto para practicar con intención.</p>
          </button>
          <button class="mode-card" type="button" data-action="random">
            <span>02</span>
            <strong>Simulacro aleatorio</strong>
            <p>Filtra por años y deja que la app genere un intento distinto.</p>
          </button>
          <button class="mode-card" type="button" data-action="practice_reading">
            <span>03</span>
            <strong>Reading enfocado</strong>
            <p>Trabaja textos, true/false, vocabulario y justificación.</p>
          </button>
          <button class="mode-card" type="button" data-action="practice_use">
            <span>04</span>
            <strong>Use of English</strong>
            <p>Practica transformaciones, pasivas, reported speech y gramática.</p>
          </button>
          <button class="mode-card" type="button" data-action="mistakes">
            <span>${pendingMistakes.length}</span>
            <strong>Revisión de fallos</strong>
            <p>Consulta tus errores guardados y decide qué reforzar después.</p>
          </button>
        </div>
      </section>

      <div class="dashboard-layout">
        <section class="panel">
          <div class="section-title-row">
            <div>
              <p class="eyebrow">Historial</p>
              <h2>Intentos recientes</h2>
            </div>
          </div>
          ${renderRecentAttempts(attempts)}
        </section>

        <section class="panel">
          <div class="section-title-row">
            <div>
              <p class="eyebrow">Diagnóstico</p>
              <h2>Patrones de fallo</h2>
            </div>
          </div>
          ${renderInsights(insights)}
          <div class="diagnostic-grid">
            ${renderGroupedInsights("Use of English por tema", useTopicInsights)}
            ${renderGroupedInsights("Reading por habilidad", readingSkillInsights)}
          </div>
        </section>
      </div>
    </section>
  `;

  container.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", () => onAction(button.dataset.action));
  });

  container.querySelector("[data-reset-analytics]")?.addEventListener("click", () => {
    onResetAnalytics?.();
  });
}
