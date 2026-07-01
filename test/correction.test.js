import test from "node:test";
import assert from "node:assert/strict";
import { correctReading, correctUse } from "../js/logic/correction.js";

test("correctReading scores mcq, tf and word questions", () => {
  const reading = {
    questions: [
      { id: "A1", type: "mcq", prompt: "Pick", options: { A: "One", B: "Two" }, answer: ["B"], points: 0.5 },
      {
        id: "A2",
        type: "tf",
        prompt: "True?",
        answer: [true],
        justification: [{ validTexts: ["the text says yes"] }],
        points: 0.5
      },
      { id: "A3", type: "word", prompt: "Word", answer: ["roots"], points: 0.25 }
    ]
  };

  const stats = correctReading(reading, {
    A1: "B",
    A2: "true",
    A2_justification: "The text says yes.",
    A3: "Roots"
  });

  assert.equal(stats.score, 1.25);
  assert.equal(stats.correct, 3);
  assert.equal(stats.failures, 0);
});

test("correctReading tags wrong questions by reading skill", () => {
  const reading = {
    questions: [
      { id: "A1", type: "word", prompt: "Word", answer: ["roots"], points: 0.25 },
      {
        id: "A2",
        type: "tf",
        prompt: "True?",
        answer: [true],
        justification: [{ validTexts: ["the text says yes"] }],
        points: 0.5
      }
    ]
  };

  const stats = correctReading(reading, {
    A1: "bad",
    A2: "false",
    A2_justification: "wrong"
  });

  assert.equal(stats.wrongQuestions[0].skill, "Vocabulario");
  assert.equal(stats.wrongQuestions[1].skill, "Comprensión lectora");
});

test("correctUse validates choose-any group count", () => {
  const use = {
    blockRules: { chooseAny: true, questionsToAnswer: 2 },
    questions: [
      { id: "B1", type: "text", task: "rewrite", prompt: "A", answers: ["A"], points: 0.5 },
      { id: "B2", type: "text", task: "rewrite", prompt: "B", answers: ["B"], points: 0.5 }
    ]
  };

  const result = correctUse(use, { B1: "A" }, { chooseAny: true, selectedUseGroups: ["B1"] });
  assert.equal(result.valid, false);
});

test("correctUse scores selected groups", () => {
  const use = {
    blockRules: { chooseAny: true, questionsToAnswer: 2 },
    questions: [
      { id: "B1", type: "text", task: "rewrite", prompt: "A", answers: ["A"], points: 0.5 },
      { id: "B2", type: "mcq", prompt: "B", options: { A: "bad", B: "good" }, answer: ["B"], points: 0.5 }
    ]
  };

  const result = correctUse(
    use,
    { B1: "A", B2: "B" },
    { chooseAny: true, selectedUseGroups: ["B1", "B2"] }
  );

  assert.equal(result.valid, true);
  assert.equal(result.score, 1);
  assert.equal(result.correct, 2);
});

test("correctUse tags wrong questions by grammar topic", () => {
  const use = {
    blocks: [{ id: "option_1", questionIds: ["B1"] }],
    questions: [
      {
        id: "B1",
        type: "text",
        task: "passive",
        topic: "Voz pasiva",
        prompt: "They built the house.",
        answers: ["The house was built"],
        points: 0.5
      }
    ]
  };

  const result = correctUse(use, { B1: "Bad answer" }, { activeUseBlockId: "option_1" });

  assert.equal(result.valid, true);
  assert.equal(result.wrongQuestions[0].topic, "Voz pasiva");
  assert.equal(result.questionResults[0].topic, "Voz pasiva");
});
