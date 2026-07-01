import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = join(root, "js", "data");
const errors = [];
const allowedUseTopics = new Set([
  "Condicionales",
  "Construcción de palabras",
  "Estructura de las oraciones",
  "Oraciones subordinadas adverbiales",
  "Preposiciones",
  "Relative Clauses",
  "Reported Speech",
  "Tiempos verbales",
  "Verb + -ing form or infinitive",
  "Verbos modales",
  "Voz pasiva"
]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${path}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function validateQuestion(file, question, section) {
  assert(question.id, `${file}: pregunta sin id`);
  assert(question.type, `${file}: ${question.id || "sin id"} sin type`);
  assert(typeof question.prompt === "string", `${file}: ${question.id} sin prompt`);
  assert(Number.isFinite(Number(question.points)), `${file}: ${question.id} sin points numérico`);

  if (question.type === "mcq") {
    assert(question.options && typeof question.options === "object", `${file}: ${question.id} mcq sin options`);
    assert(Array.isArray(question.answer) && question.answer.length, `${file}: ${question.id} mcq sin answer`);
  }

  if (section === "reading" && question.type === "tf") {
    assert(Array.isArray(question.answer) && question.answer.length, `${file}: ${question.id} tf sin answer`);
    assert(Array.isArray(question.justification), `${file}: ${question.id} tf sin justification`);
  }

  if (section === "use" && question.type !== "mcq" && !question.manualCorrection) {
    assert(Array.isArray(question.answers), `${file}: ${question.id} text sin answers`);
  }

  if (section === "use") {
    assert(typeof question.topic === "string" && question.topic.trim(), `${file}: ${question.id} sin topic`);
    assert(allowedUseTopics.has(question.topic), `${file}: ${question.id} topic no permitido: ${question.topic}`);
  }
}

function validateWriting(file, data) {
  assert(data?.id, `${file}: sin id`);
  assert(data?.examId, `${file}: sin examId`);
  assert(Number.isFinite(Number(data?.year)), `${file}: sin year numérico`);
  assert(Number.isFinite(Number(data?.points)), `${file}: sin points numérico`);
  assert(Number.isFinite(Number(data?.minWords)), `${file}: sin minWords numérico`);
  assert(typeof data?.instructions === "string" && data.instructions.trim(), `${file}: sin instructions`);
  assert(Array.isArray(data?.prompts) && data.prompts.length, `${file}: sin prompts[]`);

  for (const prompt of data?.prompts || []) {
    assert(prompt.id, `${file}: prompt sin id`);
    assert(typeof prompt.prompt === "string" && prompt.prompt.trim(), `${file}: ${prompt.id} sin prompt`);
  }
}

const examsIndexPath = join(dataRoot, "exams", "index.json");
const examsIndex = readJson(examsIndexPath);
assert(Array.isArray(examsIndex?.exams), "El índice de exámenes no contiene exams[]");

for (const exam of examsIndex?.exams || []) {
  assert(exam.id, "Examen sin id");
  assert(exam.year, `${exam.id}: sin year`);
  assert(exam.label, `${exam.id}: sin label`);
  assert(Array.isArray(exam.reading) && exam.reading.length, `${exam.id}: sin readings`);
  assert(exam.useOfEnglish?.file, `${exam.id}: sin useOfEnglish.file`);
  assert(exam.writing?.file, `${exam.id}: sin writing.file`);

  for (const reading of exam.reading || []) {
    const file = join(dataRoot, reading.file);
    assert(existsSync(file), `${exam.id}: no existe ${reading.file}`);
    const data = readJson(file);
    assert(data?.id, `${reading.file}: sin id`);
    assert(typeof data?.text === "string", `${reading.file}: sin text`);
    assert(Array.isArray(data?.questions), `${reading.file}: sin questions[]`);
    for (const question of data?.questions || []) {
      validateQuestion(reading.file, question, "reading");
    }
  }

  const useFile = join(dataRoot, exam.useOfEnglish.file);
  assert(existsSync(useFile), `${exam.id}: no existe ${exam.useOfEnglish.file}`);
  const useData = readJson(useFile);
  assert(useData?.id, `${exam.useOfEnglish.file}: sin id`);
  assert(Array.isArray(useData?.questions), `${exam.useOfEnglish.file}: sin questions[]`);
  assert(Array.isArray(useData?.blocks), `${exam.useOfEnglish.file}: sin blocks[]`);
  const questionIds = new Set((useData?.questions || []).map(question => question.id));
  for (const block of useData?.blocks || []) {
    assert(block.id, `${exam.useOfEnglish.file}: bloque sin id`);
    assert(Array.isArray(block.questionIds), `${exam.useOfEnglish.file}: ${block.id} sin questionIds[]`);
    for (const questionId of block.questionIds || []) {
      assert(questionIds.has(questionId), `${exam.useOfEnglish.file}: ${block.id} referencia ${questionId} inexistente`);
    }
  }
  for (const question of useData?.questions || []) {
    validateQuestion(exam.useOfEnglish.file, question, "use");
  }

  const writingFile = join(dataRoot, exam.writing.file);
  assert(existsSync(writingFile), `${exam.id}: no existe ${exam.writing.file}`);
  const writingData = readJson(writingFile);
  validateWriting(exam.writing.file, writingData);
}

const writingIndexPath = join(dataRoot, "writing", "index.json");
const writingIndex = readJson(writingIndexPath);
assert(Array.isArray(writingIndex?.items), "El índice de writing no contiene items[]");

const examIds = new Set((examsIndex?.exams || []).map(exam => exam.id));
for (const item of writingIndex?.items || []) {
  assert(item.id, "Writing index: item sin id");
  assert(item.examId && examIds.has(item.examId), `${item.id || "writing"}: examId inexistente`);
  assert(item.file, `${item.id || "writing"}: sin file`);
  assert(existsSync(join(dataRoot, "writing", item.file)), `${item.id}: no existe writing/${item.file}`);
}

if (errors.length) {
  console.error(`Validación fallida con ${errors.length} error(es):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Datos validados: ${examsIndex.exams.length} exámenes.`);
