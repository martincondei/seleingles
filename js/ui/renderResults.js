import { applyManualScores, combineSectionStats } from "../logic/correction.js";
import { getGrade, getResultTone, getNextActionFromStats } from "../logic/statistics.js";
import { escapeHtml } from "./dom.js";

function formatNumber(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function renderStatCard(value, label) {
  return `
    <div class="stat-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderSectionResult(label, stats) {
  if (!stats) return "";
  const details = stats.kind === "writing" || label === "Writing"
    ? `${formatNumber(stats.percentage, 0)}% · ${stats.failures} errores principales`
    : `${stats.correct} aciertos · ${stats.failures} fallos · ${stats.total} preguntas · ${formatNumber(stats.percentage, 0)}%`;

  return `
    <div class="section-result">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${formatNumber(stats.score)} / ${formatNumber(stats.maxScore)}</span>
      </div>
      <p>${details}</p>
    </div>
  `;
}

function renderWrongQuestions(wrongQuestions) {
  if (!wrongQuestions.length) {
    return `<p class="empty-state compact">No hay fallos registrados en este intento.</p>`;
  }

  return `
    <ul class="wrong-question-list">
      ${wrongQuestions.map(question => `
        <li>
          <div class="wrong-question-head">
            <strong>${escapeHtml(question.section)} · ${escapeHtml(question.id)}</strong>
            <span>${escapeHtml(question.topic || question.skill || question.type)}</span>
          </div>
          <p><b>Enunciado:</b> ${escapeHtml(question.prompt || "No disponible")}</p>
          <p><b>Tu respuesta:</b> ${escapeHtml(question.userAnswer || "Sin respuesta")}</p>
          <p><b>Respuesta correcta:</b> ${escapeHtml(question.correctAnswer || "No disponible")}</p>
        </li>
      `).join("")}
    </ul>
  `;
}

function getGroupedFailures(wrongQuestions, section, field) {
  const counts = new Map();

  wrongQuestions
    .filter(question => question.section === section)
    .forEach(question => {
      const label = question[field] || question.type || section;
      counts.set(label, (counts.get(label) || 0) + 1);
    });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function renderFailureDiagnostics(wrongQuestions) {
  const useTopics = getGroupedFailures(wrongQuestions, "Use of English", "topic");
  const readingSkills = getGroupedFailures(wrongQuestions, "Reading", "skill");

  if (!useTopics.length && !readingSkills.length) return "";

  const renderItems = items => items.length
    ? items.slice(0, 5).map(item => `
      <div class="insight">
        <span>${escapeHtml(item.label)}</span>
        <small>${item.count} fallos</small>
      </div>
    `).join("")
    : `<p class="empty-state compact">Sin fallos en esta parte.</p>`;

  return `
    <section class="diagnostic-panel">
      <div class="section-title-row">
        <div>
          <p class="eyebrow">Diagnóstico</p>
          <h3>Dónde has fallado más</h3>
        </div>
      </div>
      <div class="diagnostic-grid">
        <div class="diagnostic-block">
          <strong>Use of English por tema</strong>
          <div class="insight-list compact-list">${renderItems(useTopics)}</div>
        </div>
        <div class="diagnostic-block">
          <strong>Reading por habilidad</strong>
          <div class="insight-list compact-list">${renderItems(readingSkills)}</div>
        </div>
      </div>
    </section>
  `;
}

function renderManualCorrection(useStats, manualScores) {
  const manualItems = useStats?.manualItems || [];
  if (!manualItems.length) return "";

  return `
    <section class="manual-review">
      <div class="section-title-row">
        <div>
          <p class="eyebrow">Autocorrección</p>
          <h3>Preguntas abiertas</h3>
        </div>
      </div>
      <div class="manual-list">
        ${manualItems.map(item => {
          const selected = Number(manualScores.get(item.id) || 0) > 0;
          return `
            <article class="manual-item">
              <div>
                <strong>${escapeHtml(item.id)}</strong>
                <p>${escapeHtml(item.prompt)}</p>
                <small>${escapeHtml(item.structure)}</small>
              </div>
              <div class="segmented-actions" role="group" aria-label="Autocorregir ${escapeHtml(item.id)}">
                <button class="button button-small ${selected ? "button-primary" : "button-secondary"}" type="button" data-manual-id="${escapeHtml(item.id)}" data-score="${item.points}">Correcta</button>
                <button class="button button-small ${selected ? "button-secondary" : "button-primary"}" type="button" data-manual-id="${escapeHtml(item.id)}" data-score="0">Incorrecta</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

export function renderResults(container, options) {
  const manualScores = options.manualScores || new Map();
  const readingStats = options.readingStats;
  const useStats = applyManualScores(options.useStats, manualScores);
  const writingStats = options.writingStats;
  const totalStats = combineSectionStats([readingStats, useStats, writingStats]);
  const grade = getGrade(totalStats);
  const nextAction = getNextActionFromStats(readingStats, useStats);
  const wrongQuestions = totalStats.wrongQuestions || [];

  container.innerHTML = `
    <section class="results-panel">
      <div class="results-hero">
        <div>
          <p class="eyebrow">${escapeHtml(getResultTone(grade))}</p>
          <h2>${formatNumber(grade)} / 10</h2>
          <p>${escapeHtml(options.session?.exam?.label || options.session?.title || "Intento")}</p>
        </div>
        <div class="result-score-box">
          <span>${formatNumber(totalStats.score)} / ${formatNumber(totalStats.maxScore)}</span>
          <small>Puntuación corregida</small>
        </div>
      </div>

      <div class="stats-grid">
        ${renderStatCard(String(totalStats.correct), "Aciertos")}
        ${renderStatCard(String(totalStats.failures), "Fallos")}
        ${renderStatCard(`${formatNumber(totalStats.percentage, 0)}%`, "Precisión")}
        ${renderStatCard(String(totalStats.total), "Preguntas")}
      </div>

      <div class="section-result-grid">
        ${renderSectionResult("Reading", readingStats)}
        ${renderSectionResult("Use of English", useStats)}
        ${renderSectionResult("Writing", writingStats)}
      </div>

      ${renderFailureDiagnostics(wrongQuestions)}

      ${renderManualCorrection(options.useStats, manualScores)}

      <section class="wrong-question-panel">
        <div class="section-title-row">
          <div>
            <p class="eyebrow">Revisión</p>
            <h3>Preguntas falladas</h3>
          </div>
          <span>${wrongQuestions.length}</span>
        </div>
        ${renderWrongQuestions(wrongQuestions)}
      </section>

      <div class="result-actions">
        <button class="button button-primary" type="button" data-result-action="${escapeHtml(nextAction)}">Practicar lo recomendado</button>
        <button class="button button-secondary" type="button" data-result-action="retry">Repetir intento</button>
        <button class="button button-ghost" type="button" data-result-action="dashboard">Volver al panel</button>
      </div>
    </section>
  `;

  container.querySelectorAll("[data-manual-id]").forEach(button => {
    button.addEventListener("click", () => {
      options.onManualScore?.(button.dataset.manualId, Number(button.dataset.score || 0));
    });
  });

  container.querySelectorAll("[data-result-action]").forEach(button => {
    button.addEventListener("click", () => {
      options.onAction?.(button.dataset.resultAction);
    });
  });

  return {
    totalStats,
    readingStats,
    useStats,
    writingStats,
    wrongQuestions
  };
}
