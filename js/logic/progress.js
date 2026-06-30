const PROGRESS_STORAGE_KEY = "englishSelectividadProgressAttempts";
const MAX_STORED_ATTEMPTS = 50;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, toNumber(value)));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function loadProgressAttempts() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const attempts = raw ? JSON.parse(raw) : [];
    return Array.isArray(attempts) ? attempts : [];
  } catch {
    return [];
  }
}

export function saveProgressAttempt(attempt) {
  const attempts = loadProgressAttempts();
  const normalizedAttempt = {
    ...attempt,
    percentage: clampPercent(attempt.percentage),
    score: toNumber(attempt.score),
    maxScore: toNumber(attempt.maxScore),
    correctCount: toNumber(attempt.correctCount),
    failureCount: toNumber(attempt.failureCount),
    totalQuestions: toNumber(attempt.totalQuestions),
    totalCorrect: toNumber(attempt.totalCorrect ?? attempt.correctCount),
    totalWrong: toNumber(attempt.totalWrong ?? attempt.failureCount),
    sectionBreakdown: attempt.sectionBreakdown || null,
    wrongQuestions: Array.isArray(attempt.wrongQuestions) ? attempt.wrongQuestions : []
  };

  const existingIndex = attempts.findIndex(item => item.id === normalizedAttempt.id);
  if (existingIndex >= 0) {
    attempts[existingIndex] = normalizedAttempt;
  } else {
    attempts.unshift(normalizedAttempt);
  }

  const trimmed = attempts
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, MAX_STORED_ATTEMPTS);

  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function getProgressSummary(attempts = loadProgressAttempts()) {
  if (!attempts.length) {
    return {
      totalAttempts: 0,
      averageGrade: 0,
      bestGrade: 0,
      averageAccuracy: 0,
      lastAttempt: null
    };
  }

  const grades = attempts.map(attempt => {
    const score = toNumber(attempt.score);
    const maxScore = toNumber(attempt.maxScore);
    return maxScore > 0 ? (score / maxScore) * 10 : 0;
  });
  const averageGrade = grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  const bestGrade = Math.max(...grades);
  const averageAccuracy = attempts.reduce(
    (sum, attempt) => sum + clampPercent(attempt.percentage),
    0
  ) / attempts.length;

  return {
    totalAttempts: attempts.length,
    averageGrade,
    bestGrade,
    averageAccuracy,
    lastAttempt: attempts[0]
  };
}

export function formatAttemptDate(dateValue) {
  if (!dateValue) return "Sin fecha";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Sin fecha";

  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatElapsedTime(seconds) {
  if (!Number.isFinite(Number(seconds))) return "";
  const totalSeconds = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function renderProgress(container, attempts = loadProgressAttempts()) {
  if (!container) return;

  const summary = getProgressSummary(attempts);
  const lastAttemptText = summary.lastAttempt
    ? `${formatAttemptDate(summary.lastAttempt.date)} · ${escapeHtml(summary.lastAttempt.targetName)}`
    : "Sin intentos";

  const latestAttempts = attempts.slice(0, 6);
  const listHtml = latestAttempts.length
    ? latestAttempts.map(attempt => {
      const elapsed = formatElapsedTime(attempt.elapsedSeconds);
      const elapsedText = elapsed ? ` · ${elapsed}` : "";
      const score = toNumber(attempt.score);
      const maxScore = toNumber(attempt.maxScore);
      const percentage = clampPercent(attempt.percentage);
      const correct = toNumber(attempt.correctCount);
      const failures = toNumber(attempt.failureCount);
      const total = toNumber(attempt.totalQuestions);
      return `
        <li class="progress-attempt">
          <span>
            <strong>${escapeHtml(attempt.targetName)}</strong>
            <small>${escapeHtml(attempt.mode)} · ${formatAttemptDate(attempt.date)}${elapsedText}</small>
            <small>${correct} aciertos · ${failures} fallos · ${total} preguntas</small>
          </span>
          <span>${score.toFixed(2)} / ${maxScore.toFixed(2)} · ${percentage.toFixed(0)}%</span>
        </li>
      `;
    }).join("")
    : `<li class="progress-empty">Aún no has terminado ningún intento.</li>`;

  container.innerHTML = `
    <div class="progress-stats">
      <div><span>${summary.totalAttempts}</span><small>Intentos</small></div>
      <div><span>${summary.averageGrade.toFixed(2)}</span><small>Nota media</small></div>
      <div><span>${summary.bestGrade.toFixed(2)}</span><small>Mejor nota</small></div>
      <div><span>${summary.averageAccuracy.toFixed(0)}%</span><small>Acierto medio</small></div>
    </div>
    <p class="progress-last"><strong>Último intento:</strong> ${lastAttemptText}</p>
    <ul class="progress-list">${listHtml}</ul>
  `;
}
