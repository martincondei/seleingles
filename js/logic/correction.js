import {
  buildInstructionCompletionAnswer,
  instructionHasCompletionGap,
  isJustificationCorrect,
  isTextAccepted
} from "./textMatching.js";

export const SECTION_LABELS = {
  reading: "Reading",
  use: "Use of English"
};

export function getQuestionKind(question) {
  return question.task || question.type || "pregunta";
}

const USE_TOPIC_LABELS = {
  active_voice: "Voz pasiva",
  causative: "Voz pasiva",
  comparison: "Estructura de las oraciones",
  complete: "Estructura de las oraciones",
  conditional: "Condicionales",
  direct_speech: "Reported Speech",
  error_correction: "Estructura de las oraciones",
  modal: "Verbos modales",
  passive: "Voz pasiva",
  relative: "Relative Clauses",
  reported_speech: "Reported Speech",
  rewrite: "Estructura de las oraciones",
  verb_form: "Tiempos verbales",
  wh_question: "Estructura de las oraciones",
  word_order: "Estructura de las oraciones"
};

const READING_SKILL_LABELS = {
  mcq: "Comprensión lectora",
  tf: "Comprensión lectora",
  word: "Vocabulario"
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getResponse(responses, name) {
  if (!responses) return "";
  if (responses instanceof FormData) return responses.get(name) || "";
  return responses[name] || "";
}

function getSelectedResponse(responses, name) {
  return String(getResponse(responses, name) || "");
}

function getTextResponse(responses, name) {
  return String(getResponse(responses, name) || "").trim();
}

function formatOptionsAnswer(question, letters = []) {
  return asArray(letters)
    .map(letter => {
      const text = question.options?.[letter];
      return text ? `(${letter}) ${text}` : `(${letter})`;
    })
    .join(" / ");
}

function getReadingUserAnswer(question, responses) {
  if (question.type === "mcq") {
    const selected = getSelectedResponse(responses, question.id);
    return selected ? formatOptionsAnswer(question, [selected]) : null;
  }

  if (question.type === "tf") {
    const selected = getSelectedResponse(responses, question.id);
    const justification = getTextResponse(responses, `${question.id}_justification`);
    return [selected ? selected.toUpperCase() : "", justification].filter(Boolean).join(" · ") || null;
  }

  return getTextResponse(responses, question.id) || null;
}

function getReadingCorrectAnswer(question) {
  if (question.type === "mcq") {
    return formatOptionsAnswer(question, question.answer);
  }

  if (question.type === "tf") {
    return question.answer?.length ? String(question.answer[0]).toUpperCase() : null;
  }

  return asArray(question.answer).join(" / ") || null;
}

function getUseUserAnswer(question, responses) {
  if (question.type === "mcq") {
    const selected = getSelectedResponse(responses, question.id);
    return selected ? formatOptionsAnswer(question, [selected]) : null;
  }

  const value = getTextResponse(responses, question.id);
  if (!value) return null;

  return instructionHasCompletionGap(question)
    ? buildInstructionCompletionAnswer(question, value)
    : value;
}

function getUseCorrectAnswer(question) {
  if (requiresManualUseCorrection(question)) {
    return question.manualCorrection?.structure || null;
  }

  if (question.type === "mcq") {
    return formatOptionsAnswer(question, question.answer);
  }

  return asArray(question.answers).join(" / ") || null;
}

function getReadingSkill(question) {
  return question.skill || READING_SKILL_LABELS[question.type] || "Reading";
}

function getUseTopic(question) {
  return question.topic || USE_TOPIC_LABELS[getQuestionKind(question)] || "Use of English";
}

function buildWrongQuestion(section, question, responses, options = {}) {
  const isReading = section === SECTION_LABELS.reading;
  const metadata = isReading
    ? { skill: getReadingSkill(question) }
    : { topic: getUseTopic(question) };

  return {
    section,
    id: question.id,
    type: getQuestionKind(question),
    ...metadata,
    prompt: question.prompt || "",
    userAnswer: isReading ? getReadingUserAnswer(question, responses) : getUseUserAnswer(question, responses),
    correctAnswer: isReading ? getReadingCorrectAnswer(question) : getUseCorrectAnswer(question),
    manual: Boolean(options.manual),
    points: Number(question.points || 0),
    groupId: options.groupId || question.groupId || null
  };
}

function buildStats(section, values) {
  const total = Number(values.total || 0);
  const correct = Number(values.correct || 0);
  const score = Number(values.score || 0);
  const maxScore = Number(values.maxScore || 0);

  return {
    section,
    score,
    maxScore,
    correct,
    failures: Math.max(0, total - correct),
    total,
    percentage: total > 0 ? (correct / total) * 100 : 0,
    wrongQuestions: values.wrongQuestions || [],
    questionResults: values.questionResults || [],
    manualItems: values.manualItems || [],
    groups: values.groups || [],
    aggregateBy: values.aggregateBy || "question"
  };
}

export function correctReading(reading, responses) {
  let score = 0;
  let correctCount = 0;
  const wrongQuestions = [];
  const questionResults = [];

  asArray(reading?.questions).forEach(question => {
    let correct = false;
    let details = {};

    if (question.type === "mcq") {
      const selected = getSelectedResponse(responses, question.id);
      correct = Boolean(selected) && asArray(question.answer).includes(selected);
    } else if (question.type === "word") {
      correct = isTextAccepted(getTextResponse(responses, question.id), question.answer || []);
    } else if (question.type === "tf") {
      const selected = getSelectedResponse(responses, question.id);
      const justification = getTextResponse(responses, `${question.id}_justification`);
      const selectedAnswerCorrect = Boolean(selected) && question.answer?.[0] === (selected === "true");
      const justificationCorrect = isJustificationCorrect(justification, question.justification || []);
      correct = selectedAnswerCorrect && justificationCorrect;
      details = { selectedAnswerCorrect, justificationCorrect };
    }

    if (correct) {
      score += Number(question.points || 0);
      correctCount += 1;
    } else {
      wrongQuestions.push(buildWrongQuestion(SECTION_LABELS.reading, question, responses));
    }

    questionResults.push({
      id: question.id,
      status: correct ? "correct" : "incorrect",
      section: SECTION_LABELS.reading,
      correctAnswer: getReadingCorrectAnswer(question),
      skill: getReadingSkill(question),
      details
    });
  });

  return buildStats(SECTION_LABELS.reading, {
    score,
    maxScore: asArray(reading?.questions).reduce((sum, question) => sum + Number(question.points || 0), 0),
    correct: correctCount,
    total: asArray(reading?.questions).length,
    wrongQuestions,
    questionResults
  });
}

export function requiresManualUseCorrection(question) {
  return Boolean(question?.manualCorrection);
}

function isUseAnswerCorrect(question, responses) {
  if (question.type === "mcq") {
    const selected = getSelectedResponse(responses, question.id);
    return Boolean(selected) && asArray(question.answer).includes(selected);
  }

  const validAnswers = asArray(question.answers);
  const answer = instructionHasCompletionGap(question)
    ? buildInstructionCompletionAnswer(question, getTextResponse(responses, question.id))
    : getTextResponse(responses, question.id);

  return isTextAccepted(answer, validAnswers);
}

function isUseQuestionAnswered(question, responses) {
  if (question.type === "mcq") {
    return Boolean(getSelectedResponse(responses, question.id));
  }

  return Boolean(getTextResponse(responses, question.id));
}

function getQuestionGroupId(question) {
  return question.groupId || String(question.id || "").split(".")[0];
}

function getQuestionsByIds(useData, questionIds) {
  const ids = new Set(questionIds);
  return asArray(useData?.questions).filter(question => ids.has(question.id));
}

function getSelectedQuestionSet(useData, options) {
  if (options.practiceAll) {
    return asArray(useData.questions);
  }

  if (options.chooseAny) {
    const selectedGroups = new Set(options.selectedUseGroups || []);
    return asArray(useData.questions).filter(question => selectedGroups.has(getQuestionGroupId(question)));
  }

  const block = asArray(useData.blocks).find(item => item.id === options.activeUseBlockId) || useData.blocks?.[0];
  return block ? getQuestionsByIds(useData, block.questionIds || []) : [];
}

function getExpectedSelectedGroups(useData) {
  return Number(useData?.blockRules?.questionsToAnswer || 6);
}

export function correctUse(useData, responses, options = {}) {
  const chooseAny = Boolean(options.chooseAny);
  const practiceAll = Boolean(options.practiceAll);

  if (chooseAny && !practiceAll) {
    const expected = getExpectedSelectedGroups(useData);
    if ((options.selectedUseGroups || []).length !== expected) {
      return {
        valid: false,
        message: `Debes elegir exactamente ${expected} preguntas de Use of English para entregar.`
      };
    }
  }

  const selectedQuestions = getSelectedQuestionSet(useData, options);
  const aggregateBy = chooseAny || practiceAll ? "group" : "question";
  const groupMap = new Map();
  let score = 0;
  let correctQuestions = 0;
  const wrongQuestions = [];
  const questionResults = [];
  const manualItems = [];

  selectedQuestions.forEach(question => {
    const groupId = getQuestionGroupId(question);
    if (!groupMap.has(groupId)) groupMap.set(groupId, []);

    if (!practiceAll && !chooseAny && !isUseQuestionAnswered(question, responses) && !requiresManualUseCorrection(question)) {
      // Empty answers in official block mode should still be marked wrong.
    }

    if (requiresManualUseCorrection(question)) {
      const manualItem = {
        id: question.id,
        section: SECTION_LABELS.use,
        groupId,
        topic: getUseTopic(question),
        points: Number(question.points || 0),
        prompt: question.manualCorrection?.prompt || "Autocorrección",
        structure: question.manualCorrection?.structure || ""
      };
      manualItems.push(manualItem);
      wrongQuestions.push(buildWrongQuestion(SECTION_LABELS.use, question, responses, { manual: true, groupId }));
      questionResults.push({
        id: question.id,
        section: SECTION_LABELS.use,
        status: "manual",
        correctAnswer: getUseCorrectAnswer(question),
        topic: getUseTopic(question),
        manualItem
      });
      groupMap.get(groupId).push({ id: question.id, correct: false, manual: true, points: manualItem.points });
      return;
    }

    const correct = isUseAnswerCorrect(question, responses);
    if (correct) {
      score += Number(question.points || 0);
      correctQuestions += 1;
    } else {
      wrongQuestions.push(buildWrongQuestion(SECTION_LABELS.use, question, responses, { groupId }));
    }

    questionResults.push({
      id: question.id,
      section: SECTION_LABELS.use,
      status: correct ? "correct" : "incorrect",
      correctAnswer: getUseCorrectAnswer(question),
      topic: getUseTopic(question)
    });
    groupMap.get(groupId).push({ id: question.id, correct, manual: false, points: Number(question.points || 0) });
  });

  const groups = Array.from(groupMap.entries()).map(([id, questions]) => ({
    id,
    questionIds: questions.map(question => question.id),
    questions
  }));

  const correctGroups = groups.filter(group =>
    group.questions.length && group.questions.every(question => question.correct)
  ).length;

  return {
    valid: true,
    ...buildStats(SECTION_LABELS.use, {
      score,
      maxScore: selectedQuestions.reduce((sum, question) => sum + Number(question.points || 0), 0),
      correct: aggregateBy === "group" ? correctGroups : correctQuestions,
      total: aggregateBy === "group" ? groups.length : selectedQuestions.length,
      wrongQuestions,
      questionResults,
      manualItems,
      groups,
      aggregateBy
    })
  };
}

export function applyManualScores(stats, manualScores = {}) {
  if (!stats?.manualItems?.length) return stats;
  const scoreMap = manualScores instanceof Map
    ? manualScores
    : new Map(Object.entries(manualScores));

  const manualScore = stats.manualItems.reduce(
    (sum, item) => sum + Number(scoreMap.get(item.id) || 0),
    0
  );
  const score = stats.score + manualScore;
  let correct = stats.correct;

  if (stats.aggregateBy === "group") {
    correct = stats.groups.filter(group =>
      group.questions.length && group.questions.every(question =>
        question.correct || (question.manual && Number(scoreMap.get(question.id) || 0) > 0)
      )
    ).length;
  } else {
    correct += stats.manualItems.filter(item => Number(scoreMap.get(item.id) || 0) > 0).length;
  }

  const wrongQuestions = stats.wrongQuestions.filter(question =>
    !(question.manual && Number(scoreMap.get(question.id) || 0) > 0)
  );

  return {
    ...stats,
    score,
    correct,
    failures: Math.max(0, stats.total - correct),
    percentage: stats.total > 0 ? (correct / stats.total) * 100 : 0,
    wrongQuestions
  };
}

export function combineSectionStats(sections) {
  const activeSections = sections.filter(Boolean);
  const score = activeSections.reduce((sum, section) => sum + Number(section.score || 0), 0);
  const maxScore = activeSections.reduce((sum, section) => sum + Number(section.maxScore || 0), 0);
  const correct = activeSections.reduce((sum, section) => sum + Number(section.correct || 0), 0);
  const total = activeSections.reduce((sum, section) => sum + Number(section.total || 0), 0);

  return {
    section: "Total",
    score,
    maxScore,
    correct,
    failures: Math.max(0, total - correct),
    total,
    percentage: total > 0 ? (correct / total) * 100 : 0,
    wrongQuestions: activeSections.flatMap(section => section.wrongQuestions || [])
  };
}
