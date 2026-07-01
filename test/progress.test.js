import test from "node:test";
import assert from "node:assert/strict";
import {
  getReadingSkillInsights,
  getUseTopicInsights
} from "../js/logic/progress.js";

test("progress insights group Use errors by topic", () => {
  const attempts = [
    {
      wrongQuestions: [
        { section: "Use of English", topic: "Voz pasiva", type: "passive" },
        { section: "Use of English", topic: "Voz pasiva", type: "passive" },
        { section: "Use of English", topic: "Condicionales", type: "conditional" },
        { section: "Reading", skill: "Vocabulario", type: "word" }
      ]
    }
  ];

  const insights = getUseTopicInsights(attempts);

  assert.equal(insights[0].topic, "Voz pasiva");
  assert.equal(insights[0].count, 2);
  assert.equal(insights[1].topic, "Condicionales");
});

test("progress insights group Reading errors by skill", () => {
  const attempts = [
    {
      wrongQuestions: [
        { section: "Reading", skill: "Comprensión lectora", type: "tf" },
        { section: "Reading", skill: "Vocabulario", type: "word" },
        { section: "Reading", skill: "Vocabulario", type: "word" },
        { section: "Use of English", topic: "Relative Clauses", type: "relative" }
      ]
    }
  ];

  const insights = getReadingSkillInsights(attempts);

  assert.equal(insights[0].skill, "Vocabulario");
  assert.equal(insights[0].count, 2);
  assert.equal(insights[1].skill, "Comprensión lectora");
});
