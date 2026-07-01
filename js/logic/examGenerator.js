const DATA_ROOT = "./js/data";

export const FLOW = {
  specific: "specific",
  random: "random",
  reading: "practice_reading",
  use: "practice_use",
  writing: "practice_writing",
  mistakes: "mistakes"
};

export const EXAM_MODE = {
  legacyOld: "legacy_old",
  legacyNew: "legacy_new",
  current: "current",
  reading: "practice_reading",
  use: "practice_use"
};

export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${path}`);
  }
  return response.json();
}

export async function loadExamsIndex() {
  return loadJson(`${DATA_ROOT}/exams/index.json`);
}

export async function loadDataFile(relativePath) {
  return loadJson(`${DATA_ROOT}/${relativePath}`);
}

export function getAvailableYears(examsIndex) {
  return [...new Set((examsIndex?.exams || []).map(exam => exam.year))]
    .sort((a, b) => b - a);
}

export function getExamsForYear(examsIndex, year) {
  return (examsIndex?.exams || []).filter(exam => Number(exam.year) === Number(year));
}

export function getExamById(examsIndex, examId) {
  return (examsIndex?.exams || []).find(exam => exam.id === examId) || null;
}

export function getDefaultExamMode(exam) {
  return Number(exam?.year) >= 2025 ? EXAM_MODE.current : EXAM_MODE.legacyNew;
}

export function resolveExamMode(exam, requestedMode) {
  if (requestedMode === EXAM_MODE.legacyOld && Number(exam?.year) >= 2025) {
    return EXAM_MODE.current;
  }

  return requestedMode || getDefaultExamMode(exam);
}

export function isChooseAnyUseMode({ examMode, useData }) {
  return Boolean(useData?.blockRules?.chooseAny) || examMode === EXAM_MODE.legacyOld;
}

export function getUseModeDescriptor({ examMode, useData }) {
  if (isChooseAnyUseMode({ examMode, useData })) {
    return {
      kind: "choose_any",
      label: "Elige 6 preguntas",
      description: "Selecciona exactamente seis grupos para entregar, como en el modelo antiguo."
    };
  }

  if (useData?.blockRules?.mustChooseOne) {
    return {
      kind: "choose_block",
      label: "Elige un bloque",
      description: "Escoge Option 1 u Option 2 antes de enviar."
    };
  }

  return {
    kind: "all",
    label: "Todas las preguntas",
    description: "Responde el bloque completo."
  };
}

export function getRandomExamCandidates(examsIndex, criteria) {
  return (examsIndex?.exams || []).filter(exam => {
    const yearMatches = criteria.years.includes(Number(exam.year));
    const modelMatches = criteria.model !== EXAM_MODE.legacyOld || Number(exam.year) < 2025;
    return yearMatches && modelMatches;
  });
}

export function pickRandomItem(items, previousKey, keySelector = item => item.id) {
  if (!items.length) return null;
  if (items.length === 1) return items[0];

  const filtered = items.filter(item => keySelector(item) !== previousKey);
  const pool = filtered.length ? filtered : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getPracticeReadingCandidates(examsIndex, criteria) {
  return (examsIndex?.exams || [])
    .filter(exam => criteria.years.includes(Number(exam.year)))
    .flatMap(exam =>
      (exam.reading || []).map(reading => ({
        exam,
        reading,
        key: `${exam.id}:${reading.id}`
      }))
    );
}

export function getPracticeUseCandidates(examsIndex, criteria) {
  return (examsIndex?.exams || [])
    .filter(exam => criteria.years.includes(Number(exam.year)))
    .map(exam => ({
      exam,
      key: exam.id
    }));
}

export function getPracticeWritingCandidates(examsIndex, criteria) {
  return (examsIndex?.exams || [])
    .filter(exam => criteria.years.includes(Number(exam.year)) && exam.writing?.file)
    .map(exam => ({
      exam,
      writing: exam.writing,
      key: exam.id
    }));
}

export async function loadExamPayload(exam) {
  const readings = [];
  for (const reading of exam.reading || []) {
    readings.push(await loadDataFile(reading.file));
  }

  const use = exam.useOfEnglish?.file
    ? await loadDataFile(exam.useOfEnglish.file)
    : null;

  return { exam, readings, use };
}

export async function loadSingleReadingPayload(exam, readingMeta) {
  return {
    exam,
    readings: [await loadDataFile(readingMeta.file)],
    use: null
  };
}

export async function loadUsePayload(exam) {
  return {
    exam,
    readings: [],
    use: await loadDataFile(exam.useOfEnglish.file)
  };
}

export async function loadWritingPayload(exam) {
  return {
    exam,
    writing: await loadDataFile(exam.writing.file)
  };
}

export function buildInventory(examsIndex) {
  const exams = examsIndex?.exams || [];
  const readings = exams.reduce((sum, exam) => sum + (exam.reading || []).length, 0);
  const useBlocks = exams.filter(exam => Boolean(exam.useOfEnglish)).length;
  const writingBlocks = exams.filter(exam => Boolean(exam.writing)).length;
  const years = getAvailableYears(examsIndex);

  return {
    exams: exams.length,
    readings,
    useBlocks,
    writingBlocks,
    years
  };
}
