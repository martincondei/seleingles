const PROGRESS_STORAGE_KEY = "englishSelectividadProgressAttempts";
const MAX_STORED_ATTEMPTS = 100;

function storageAvailable() {
  return typeof localStorage !== "undefined";
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, toNumber(value)));
}

export function loadProgressAttempts() {
  if (!storageAvailable()) return [];

  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const attempts = raw ? JSON.parse(raw) : [];
    return Array.isArray(attempts) ? attempts : [];
  } catch {
    return [];
  }
}

export function saveProgressAttempt(attempt) {
  if (!storageAvailable()) return [];

  const attempts = loadProgressAttempts();
  const normalizedAttempt = normalizeAttempt(attempt);
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

export function clearProgressAttempts() {
  if (storageAvailable()) {
    localStorage.removeItem(PROGRESS_STORAGE_KEY);
  }
}

export function normalizeAttempt(attempt) {
  return {
    ...attempt,
    date: attempt.date || new Date().toISOString(),
    percentage: clampPercent(attempt.percentage),
    score: toNumber(attempt.score),
    maxScore: toNumber(attempt.maxScore),
    correctCount: toNumber(attempt.correctCount),
    failureCount: toNumber(attempt.failureCount),
    totalQuestions: toNumber(attempt.totalQuestions),
    elapsedSeconds: attempt.elapsedSeconds == null ? null : toNumber(attempt.elapsedSeconds),
    sectionBreakdown: attempt.sectionBreakdown || null,
    wrongQuestions: Array.isArray(attempt.wrongQuestions) ? attempt.wrongQuestions : []
  };
}

export function getAttemptGrade(attempt) {
  const maxScore = toNumber(attempt?.maxScore);
  return maxScore > 0 ? (toNumber(attempt.score) / maxScore) * 10 : 0;
}

export function getProgressSummary(attempts = loadProgressAttempts()) {
  if (!attempts.length) {
    return {
      totalAttempts: 0,
      averageGrade: 0,
      bestGrade: 0,
      averageAccuracy: 0,
      lastAttempt: null,
      trend: 0,
      totalStudySeconds: 0
    };
  }

  const grades = attempts.map(getAttemptGrade);
  const recent = grades.slice(0, 3);
  const previous = grades.slice(3, 6);
  const average = values => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

  return {
    totalAttempts: attempts.length,
    averageGrade: average(grades),
    bestGrade: Math.max(...grades),
    averageAccuracy: average(attempts.map(attempt => clampPercent(attempt.percentage))),
    lastAttempt: attempts[0],
    trend: previous.length ? average(recent) - average(previous) : 0,
    totalStudySeconds: attempts.reduce((sum, attempt) => sum + toNumber(attempt.elapsedSeconds), 0)
  };
}

export function getSectionAverages(attempts = loadProgressAttempts()) {
  const sections = {
    reading: [],
    useOfEnglish: [],
    writing: []
  };

  attempts.forEach(attempt => {
    const breakdown = attempt.sectionBreakdown || {};
    Object.keys(sections).forEach(key => {
      if (breakdown[key]) {
        sections[key].push(clampPercent(breakdown[key].percentage));
      }
    });
  });

  return Object.fromEntries(
    Object.entries(sections).map(([key, values]) => [
      key,
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
    ])
  );
}

export function getWrongQuestionInsights(attempts = loadProgressAttempts()) {
  const counts = new Map();

  attempts.forEach(attempt => {
    (attempt.wrongQuestions || []).forEach(question => {
      const key = `${question.section || "General"}:${question.type || "pregunta"}`;
      const current = counts.get(key) || {
        section: question.section || "General",
        type: question.type || "pregunta",
        count: 0,
        examples: []
      };
      current.count += 1;
      if (current.examples.length < 3) {
        current.examples.push(question);
      }
      counts.set(key, current);
    });
  });

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

function addGroupedCount(counts, key, item, labelKey) {
  if (!key) return;
  const current = counts.get(key) || {
    label: key,
    count: 0,
    examples: []
  };
  current.count += 1;
  if (current.examples.length < 3) current.examples.push(item);
  counts.set(key, {
    ...current,
    [labelKey]: key
  });
}

export function getUseTopicInsights(attempts = loadProgressAttempts()) {
  const counts = new Map();

  attempts.forEach(attempt => {
    (attempt.wrongQuestions || []).forEach(question => {
      if (question.section === "Use of English") {
        addGroupedCount(counts, question.topic || question.type || "Use of English", question, "topic");
      }
    });
  });

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export function getReadingSkillInsights(attempts = loadProgressAttempts()) {
  const counts = new Map();

  attempts.forEach(attempt => {
    (attempt.wrongQuestions || []).forEach(question => {
      if (question.section === "Reading") {
        addGroupedCount(counts, question.skill || "Reading", question, "skill");
      }
    });
  });

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export function getPendingMistakes(attempts = loadProgressAttempts()) {
  return attempts
    .flatMap(attempt =>
      (attempt.wrongQuestions || []).map(question => ({
        ...question,
        attemptId: attempt.id,
        attemptDate: attempt.date,
        targetName: attempt.targetName
      }))
    )
    .slice(0, 40);
}

export function buildRecommendations(attempts = loadProgressAttempts()) {
  const summary = getProgressSummary(attempts);
  const sections = getSectionAverages(attempts);
  const recommendations = [];

  if (!attempts.length) {
    return [
      {
        title: "Haz un diagnóstico inicial",
        body: "Empieza con un simulacro aleatorio para detectar qué secciones necesitan más trabajo.",
        action: "random"
      },
      {
        title: "Calienta con Reading",
        body: "Un reading corto crea una primera medición sin comprometer una sesión larga.",
        action: "practice_reading"
      }
    ];
  }

  if (sections.reading && sections.reading < 70) {
    recommendations.push({
      title: "Refuerza comprensión lectora",
      body: "Tu media de Reading está por debajo del 70%. Practica true/false con justificación y vocabulario contextual.",
      action: "practice_reading"
    });
  }

  if (sections.useOfEnglish && sections.useOfEnglish < 70) {
    recommendations.push({
      title: "Entrena Use of English",
      body: "Hay margen de mejora en transformaciones y gramática. Haz bloques cortos y revisa las respuestas alternativas.",
      action: "practice_use"
    });
  }

  if (sections.writing && sections.writing < 70) {
    recommendations.push({
      title: "Mejora el Writing",
      body: "Tu media de Writing está por debajo del 70%. Practica una redacción con rúbrica y revisa errores concretos.",
      action: "section_writing"
    });
  }

  if (summary.trend < -0.5) {
    recommendations.push({
      title: "Baja la carga un momento",
      body: "Tu tendencia reciente ha bajado. Prueba una práctica enfocada antes de volver a un examen completo.",
      action: "practice_use"
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      title: "Sube a modo simulacro",
      body: "Tu progreso es estable. Practica un examen completo con timer y condiciones reales.",
      action: "specific"
    });
  }

  return recommendations.slice(0, 3);
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
