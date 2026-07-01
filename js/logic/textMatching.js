const CONTRACTION_EQUIVALENCES = [
  ["aren't", "are not"],
  ["can't", "cannot"],
  ["can't", "can not"],
  ["couldn't", "could not"],
  ["didn't", "did not"],
  ["doesn't", "does not"],
  ["don't", "do not"],
  ["hadn't", "had not"],
  ["hasn't", "has not"],
  ["haven't", "have not"],
  ["he'll", "he will"],
  ["he's been", "he has been"],
  ["he's", "he is"],
  ["i'd rather", "i would rather"],
  ["i'll", "i will"],
  ["i'm", "i am"],
  ["i've", "i have"],
  ["isn't", "is not"],
  ["it'll", "it will"],
  ["it's been", "it has been"],
  ["it's", "it is"],
  ["let's", "let us"],
  ["mightn't", "might not"],
  ["mustn't", "must not"],
  ["shan't", "shall not"],
  ["she'll", "she will"],
  ["she's been", "she has been"],
  ["she's", "she is"],
  ["shouldn't", "should not"],
  ["that's", "that is"],
  ["there's been", "there has been"],
  ["there's", "there is"],
  ["they'll", "they will"],
  ["they're", "they are"],
  ["they've", "they have"],
  ["wasn't", "was not"],
  ["we'll", "we will"],
  ["we're", "we are"],
  ["we've", "we have"],
  ["weren't", "were not"],
  ["what's", "what is"],
  ["where's", "where is"],
  ["who's", "who is"],
  ["won't", "will not"],
  ["wouldn't", "would not"],
  ["you'll", "you will"],
  ["you're", "you are"],
  ["you've", "you have"]
];

const MAX_OFFICIAL_VARIANTS = 5000;
const MAX_SLASH_SIDE_TOKENS = 4;

export function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addLimitedVariant(set, value) {
  if (set.size < MAX_OFFICIAL_VARIANTS) set.add(value);
}

function splitOfficialAnswerAlternatives(text) {
  return String(text || "")
    .split(/\s*\/\/\s*/g)
    .map(value => value.trim())
    .filter(Boolean);
}

function findClosingParenthesis(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function expandSlashedMorphology(before, content, after) {
  if (!content.includes("/") || !/[A-Za-z]$/.test(before)) return null;
  if (/\s/.test(content.trim())) return null;

  return content
    .split("/")
    .map(part => `${before}${part}${after}`);
}

function expandOptionalParentheses(text) {
  const openIndex = String(text).indexOf("(");
  if (openIndex === -1) return [text];

  const closeIndex = findClosingParenthesis(text, openIndex);
  if (closeIndex === -1) return [text];

  const before = text.slice(0, openIndex);
  const content = text.slice(openIndex + 1, closeIndex);
  const after = text.slice(closeIndex + 1);
  const variants = new Set();
  const morphologyVariants = expandSlashedMorphology(before, content, after);

  if (morphologyVariants) {
    morphologyVariants.forEach(value =>
      expandOptionalParentheses(value).forEach(variant => addLimitedVariant(variants, variant))
    );
    return Array.from(variants);
  }

  [`${before}${after}`, `${before}${content}${after}`].forEach(value =>
    expandOptionalParentheses(value).forEach(variant => addLimitedVariant(variants, variant))
  );

  return Array.from(variants);
}

function tokenizeSlashExpression(text) {
  return String(text || "")
    .replace(/\//g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function expandFirstSlashExpression(tokens) {
  const slashIndex = tokens.indexOf("/");
  if (slashIndex === -1) return [];

  const variants = new Set();
  const maxLeft = Math.min(MAX_SLASH_SIDE_TOKENS, slashIndex);
  const maxRight = Math.min(MAX_SLASH_SIDE_TOKENS, tokens.length - slashIndex - 1);

  for (let leftSize = 1; leftSize <= maxLeft; leftSize += 1) {
    for (let rightSize = 1; rightSize <= maxRight; rightSize += 1) {
      addLimitedVariant(variants, [
        ...tokens.slice(0, slashIndex),
        ...tokens.slice(slashIndex + rightSize + 1)
      ].join(" "));

      addLimitedVariant(variants, [
        ...tokens.slice(0, slashIndex - leftSize),
        ...tokens.slice(slashIndex + 1)
      ].join(" "));
    }
  }

  if (!variants.size) {
    addLimitedVariant(variants, tokens.filter(token => token !== "/").join(" "));
  }

  return Array.from(variants);
}

function expandSlashAlternatives(text) {
  const pending = [String(text || "")];
  const variants = new Set();

  while (pending.length && variants.size < MAX_OFFICIAL_VARIANTS) {
    const current = pending.shift();
    const tokens = tokenizeSlashExpression(current);

    if (!tokens.includes("/")) {
      addLimitedVariant(variants, current);
      continue;
    }

    expandFirstSlashExpression(tokens).forEach(value => {
      if (value.includes("/")) pending.push(value);
      else addLimitedVariant(variants, value);
    });
  }

  return Array.from(variants);
}

export function expandOfficialAnswerForms(text) {
  const variants = new Set();

  splitOfficialAnswerAlternatives(text).forEach(answer =>
    expandOptionalParentheses(answer).forEach(parenthesesVariant =>
      expandSlashAlternatives(parenthesesVariant).forEach(slashVariant =>
        addLimitedVariant(variants, slashVariant)
      )
    )
  );

  return Array.from(variants);
}

export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePhrase(text, from, to) {
  return text.replace(
    new RegExp(`(^|\\s)${escapeRegExp(from)}(?=\\s|$)`, "g"),
    `$1${to}`
  );
}

function shouldSkipExpandedToContractedForm(form, expanded) {
  return /\bis$/.test(expanded) &&
    new RegExp(`(^|\\s)${escapeRegExp(expanded)}\\s+been(?=\\s|$)`).test(form);
}

export function expandFlexibleAnswerForms(text) {
  const rawText = String(text || "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  const forms = new Set([rawText]);

  CONTRACTION_EQUIVALENCES.forEach(([contracted, expanded]) => {
    Array.from(forms).forEach(form => {
      forms.add(replacePhrase(form, contracted, expanded));
      if (!shouldSkipExpandedToContractedForm(form, expanded)) {
        forms.add(replacePhrase(form, expanded, contracted));
      }
    });
  });

  return Array.from(forms);
}

export function getComparableTexts(text) {
  return expandOfficialAnswerForms(text)
    .flatMap(expandFlexibleAnswerForms)
    .map(normalizeText)
    .filter(value => !/\b(?:he|she|it|that|there|what|where|who) is been\b/.test(value))
    .filter(Boolean);
}

export function isTextAccepted(userText, validAnswers = []) {
  const userForms = new Set(getComparableTexts(userText));
  if (!userForms.size) return false;

  return validAnswers.some(answer =>
    getComparableTexts(answer).some(validForm => userForms.has(validForm))
  );
}

export function isTextAcceptedAsContaining(userText, validText) {
  const userForms = getComparableTexts(userText);
  const validForms = getComparableTexts(validText);
  if (!userForms.length || !validForms.length) return false;

  return userForms.some(userForm =>
    validForms.some(validForm =>
      userForm === validForm ||
      userForm.includes(validForm) ||
      (userForm.split(" ").length >= 6 && validForm.includes(userForm))
    )
  );
}

export function isJustificationCorrect(userText, validJustifications = []) {
  if (!getComparableTexts(userText).length) return false;

  return validJustifications.some(justification => {
    const validTexts = Array.isArray(justification.validTexts) && justification.validTexts.length
      ? justification.validTexts
      : [justification.text || ""];

    return validTexts.some(text => isTextAcceptedAsContaining(userText, text || ""));
  });
}

export function textHasGap(text = "") {
  return /\.{3}|…/.test(String(text));
}

export function instructionHasCompletionGap(question) {
  return question?.type !== "mcq" && textHasGap(question?.instruction || "");
}

export function splitTextAtFirstGap(text = "") {
  const value = String(text);
  const match = value.match(/\.{3}|…/);
  if (!match) {
    return { before: value, after: "" };
  }

  return {
    before: value.slice(0, match.index),
    after: value.slice(match.index + match[0].length)
  };
}

export function joinSentenceParts(before, completion, after = "") {
  const cleanCompletion = String(completion || "").trim();
  const needsBeforeSpace = before &&
    cleanCompletion &&
    !/\s$/.test(before) &&
    !/^[,.;:!?)]/.test(cleanCompletion);
  const needsAfterSpace = cleanCompletion &&
    after &&
    !/\s$/.test(cleanCompletion) &&
    !/^\s|^[,.;:!?)]/.test(after);

  return `${before}${needsBeforeSpace ? " " : ""}${cleanCompletion}${needsAfterSpace ? " " : ""}${after}`.trim();
}

export function buildInstructionCompletionAnswer(question, completion) {
  const { before, after } = splitTextAtFirstGap(question.instruction || "");
  return joinSentenceParts(before, completion, after);
}
