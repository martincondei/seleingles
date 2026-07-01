export function getStatsAccuracy(stats) {
  if (!stats?.total) return 0;
  return (Number(stats.correct || 0) / Number(stats.total || 0)) * 100;
}

export function getGrade(stats) {
  if (!stats?.maxScore) return 0;
  return (Number(stats.score || 0) / Number(stats.maxScore || 0)) * 10;
}

export function buildSectionBreakdown(readingStats, useStats) {
  return {
    reading: readingStats ? toBreakdown(readingStats) : null,
    useOfEnglish: useStats ? toBreakdown(useStats) : null
  };
}

export function toBreakdown(stats) {
  return {
    score: Number(stats.score || 0),
    maxScore: Number(stats.maxScore || 0),
    correct: Number(stats.correct || 0),
    wrong: Number(stats.failures || 0),
    total: Number(stats.total || 0),
    percentage: getStatsAccuracy(stats)
  };
}

export function summarizeContent(examsIndex) {
  const exams = examsIndex?.exams || [];
  const years = [...new Set(exams.map(exam => exam.year))].sort((a, b) => a - b);
  const readings = exams.reduce((sum, exam) => sum + (exam.reading || []).length, 0);

  return {
    years,
    exams: exams.length,
    readings,
    useBlocks: exams.filter(exam => Boolean(exam.useOfEnglish)).length
  };
}

export function getResultTone(grade) {
  if (grade >= 8.5) return "Excelente";
  if (grade >= 7) return "Buen trabajo";
  if (grade >= 5) return "Aprobado";
  return "Necesita repaso";
}

export function getNextActionFromStats(readingStats, useStats) {
  const readingAccuracy = getStatsAccuracy(readingStats);
  const useAccuracy = getStatsAccuracy(useStats);

  if (readingStats && (!useStats || readingAccuracy < useAccuracy - 8)) {
    return "practice_reading";
  }

  if (useStats && (!readingStats || useAccuracy < readingAccuracy - 8)) {
    return "practice_use";
  }

  return "random";
}
