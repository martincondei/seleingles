import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInstructionCompletionAnswer,
  expandOfficialAnswerForms,
  isJustificationCorrect,
  isTextAccepted,
  normalizeText
} from "../js/logic/textMatching.js";

test("normalizeText ignores case, punctuation and repeated spaces", () => {
  assert.equal(normalizeText("  It's   TIME! "), "its time");
});

test("isTextAccepted accepts contraction variants", () => {
  assert.equal(
    isTextAccepted("The laundry isn't dry enough to be taken off the clothesline.", [
      "The laundry is not dry enough to be taken off the clothesline."
    ]),
    true
  );
});

test("isTextAccepted expands official optional parentheses", () => {
  assert.equal(isTextAccepted("roots", ["root(s)"]), true);
  assert.equal(isTextAccepted("root", ["root(s)"]), true);
  assert.equal(isTextAccepted("travelled", ["travel(l)ed"]), true);
  assert.equal(isTextAccepted("traveled", ["travel(l)ed"]), true);
  assert.equal(isTextAccepted("remove", ["remov(e/ing)"]), true);
  assert.equal(isTextAccepted("removing", ["remov(e/ing)"]), true);
});

test("isTextAccepted expands official slash alternatives", () => {
  assert.equal(
    isTextAccepted("This is the hospital in which your sister was born", [
      "This is the hospital where / in which your sister was born"
    ]),
    true
  );

  assert.equal(
    isTextAccepted("Jane suggested that we should go to the cinema", [
      "Jane suggested that we (could / should) go to the cinema"
    ]),
    true
  );

  assert.equal(
    isTextAccepted("Jane suggested that we go to the cinema", [
      "Jane suggested that we (could / should) go to the cinema"
    ]),
    true
  );
});

test("isTextAccepted expands official double-slash alternatives", () => {
  assert.equal(
    isTextAccepted("The tickets for the show are already available", [
      "The tickets for the show can already be bought. // The tickets for the show are already on sale / available."
    ]),
    true
  );
});

test("isTextAccepted rejects unrelated answers", () => {
  assert.equal(isTextAccepted("I went home", ["I would have gone home"]), false);
});

test("expandOfficialAnswerForms keeps generated variants bounded", () => {
  assert.ok(expandOfficialAnswerForms("subject + will / can / may + infinitive // subject + present simple").length > 1);
});

test("isJustificationCorrect accepts contained valid text", () => {
  assert.equal(
    isJustificationCorrect("The American Constitution forbade the government from giving out titles of nobility.", [
      {
        validTexts: [
          "the American Constitution forbade the government from giving out titles of nobility"
        ]
      }
    ]),
    true
  );
});

test("isJustificationCorrect accepts optional text from official criteria", () => {
  assert.equal(
    isJustificationCorrect("the costly maintenance of their aging mansions", [
      {
        validTexts: [
          "However, they were desperate for cash due to (economic pressures mostly caused by rural populations moving to the cities and) the costly maintenance of their aging mansions."
        ]
      }
    ]),
    true
  );
});

test("buildInstructionCompletionAnswer joins gap instructions cleanly", () => {
  assert.equal(
    buildInstructionCompletionAnswer({ instruction: "Unless..." }, "Masha gets top marks, she will be disappointed"),
    "Unless Masha gets top marks, she will be disappointed"
  );
});
