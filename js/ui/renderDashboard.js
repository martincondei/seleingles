import {
  buildRecommendations,
  formatAttemptDate,
  formatElapsedTime,
  getAttemptGrade,
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
  container.innerHTML = `
    <section class="screen dashboard-screen">
      <div class="hero-product">
        <div>
          <p class="eyebrow">Selectividad English Prep</p>
          <h1>Entrena con exámenes reales y mejora por patrones.</h1>
          <p>Reading, Use of English, Writing, examen completo y progreso local en una sola herramienta.</p>
          <div class="hero-actions">
            <button class="button button-primary" type="button" data-action="section_exam">Examen completo</button>
            <button class="button button-secondary" type="button" data-action="section_reading">Practicar Reading</button>
          </div>
        </div>
        <div class="hero-metrics">
          ${stat(String(inventory.exams), "Exámenes")}
          ${stat(String(inventory.readings), "Readings")}
          ${stat(String(inventory.useBlocks), "Bloques Use")}
          ${stat(String(inventory.writingBlocks || 0), "Writings")}
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
            <div><span>Writing</span><progress value="${averages.writing || 0}" max="100"></progress><b>${(averages.writing || 0).toFixed(0)}%</b></div>
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
          <button class="mode-card primary" type="button" data-action="section_reading">
            <span>01</span>
            <strong>Reading</strong>
            <p>Elige un reading concreto o genera uno aleatorio por años.</p>
          </button>
          <button class="mode-card" type="button" data-action="section_use">
            <span>02</span>
            <strong>Use of English</strong>
            <p>Practica gramática con el formato oficial de cada convocatoria.</p>
          </button>
          <button class="mode-card" type="button" data-action="section_writing">
            <span>03</span>
            <strong>Writing</strong>
            <p>Carga enunciados reales y revisa tu texto con rúbrica.</p>
          </button>
          <button class="mode-card" type="button" data-action="section_exam">
            <span>04</span>
            <strong>Examen completo</strong>
            <p>Haz Reading y Use juntos como convocatoria concreta o simulacro.</p>
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
