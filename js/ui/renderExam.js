import { isChooseAnyUseMode, getUseModeDescriptor } from "../logic/examGenerator.js";
import { escapeHtml } from "./dom.js";
import { instructionHasCompletionGap, textHasGap } from "../logic/textMatching.js";

function createExpandingTextarea(name, placeholder = "") {
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.placeholder = placeholder;
  textarea.rows = 1;
  textarea.className = "field field-textarea expanding-answer";

  const resize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  textarea.addEventListener("input", resize);
  requestAnimationFrame(resize);
  return textarea;
}

function createInlineGapInput(name, placeholder = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.name = name;
  input.placeholder = placeholder;
  input.className = "inline-gap-answer";

  const resize = () => {
    const textLength = Math.max(input.value.length, input.placeholder.length, 8);
    input.style.width = `${Math.min(textLength + 1, 72)}ch`;
  };

  input.addEventListener("input", resize);
  requestAnimationFrame(resize);
  return input;
}

function appendTextWithUnderline(parent, text, underlinedWords) {
  const phrases = Array.isArray(underlinedWords)
    ? underlinedWords
    : underlinedWords
      ? [underlinedWords]
      : [];

  if (!phrases.length) {
    parent.append(text);
    return;
  }

  let cursor = 0;
  const matches = phrases
    .map(phrase => {
      const start = String(text).indexOf(phrase);
      return start >= 0 ? { phrase, start, end: start + phrase.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (!matches.length) {
    parent.append(text);
    return;
  }

  matches.forEach(match => {
    if (match.start < cursor) return;
    parent.append(String(text).slice(cursor, match.start));
    const underline = document.createElement("u");
    underline.textContent = String(text).slice(match.start, match.end);
    parent.appendChild(underline);
    cursor = match.end;
  });

  parent.append(String(text).slice(cursor));
}

function appendPromptWithInlineGap(parent, question) {
  const parts = String(question.prompt || "").split(/(\.{3}|…)/);
  let insertedAnswer = false;

  parts.forEach(part => {
    if (part === "..." || part === "…") {
      if (question.type === "mcq") {
        const gap = document.createElement("span");
        gap.className = "inline-gap-placeholder";
        gap.setAttribute("aria-label", "hueco");
        parent.appendChild(gap);
        return;
      }

      if (!insertedAnswer) {
        parent.appendChild(createInlineGapInput(question.id, "respuesta"));
        insertedAnswer = true;
      } else {
        const gap = document.createElement("span");
        gap.className = "inline-gap-placeholder";
        parent.appendChild(gap);
      }
      return;
    }

    appendTextWithUnderline(parent, part, question.underlinedWords);
  });
}

function appendUsePrompt(parent, question) {
  if (textHasGap(question.prompt)) {
    appendPromptWithInlineGap(parent, question);
  } else {
    appendTextWithUnderline(parent, question.prompt || "", question.underlinedWords);
  }

  if (!question.instruction) return;
  parent.append(" ");

  if (!instructionHasCompletionGap(question)) {
    parent.append(question.instruction);
    return;
  }

  const parts = String(question.instruction || "").split(/(\.{3}|…)/);
  let insertedAnswer = false;

  parts.forEach(part => {
    if (part === "..." || part === "…") {
      if (!insertedAnswer) {
        parent.appendChild(createInlineGapInput(question.id, "completa"));
        insertedAnswer = true;
      } else {
        const gap = document.createElement("span");
        gap.className = "inline-gap-placeholder";
        parent.appendChild(gap);
      }
      return;
    }

    parent.append(part);
  });
}

function renderChoiceOptions(container, question) {
  Object.entries(question.options || {}).forEach(([key, value]) => {
    const label = document.createElement("label");
    label.className = "answer-choice";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = question.id;
    input.value = key;

    const text = document.createElement("span");
    text.textContent = `(${key}) ${value}`;

    label.append(input, text);
    container.appendChild(label);
  });
}

function renderReadingQuestion(question) {
  const wrapper = document.createElement("article");
  wrapper.className = "question";
  wrapper.dataset.id = question.id;

  const prompt = document.createElement("p");
  prompt.className = "question-prompt";
  prompt.innerHTML = `<strong>${escapeHtml(question.id)}</strong>. ${escapeHtml(question.prompt)}`;
  wrapper.appendChild(prompt);

  if (question.type === "mcq") {
    renderChoiceOptions(wrapper, question);
  } else if (question.type === "tf") {
    ["true", "false"].forEach(value => {
      const label = document.createElement("label");
      label.className = "answer-choice";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = question.id;
      input.value = value;
      label.append(input, document.createTextNode(value.toUpperCase()));
      wrapper.appendChild(label);
    });
    wrapper.appendChild(createExpandingTextarea(`${question.id}_justification`, "Copia la frase que justifica tu respuesta"));
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.name = question.id;
    input.className = "field";
    input.placeholder = "Respuesta";
    wrapper.appendChild(input);
  }

  return wrapper;
}

function renderReadingSection(session, handlers) {
  const section = document.createElement("section");
  section.className = "work-panel";
  section.dataset.section = "reading";

  section.innerHTML = `
    <div class="panel-title-row">
      <div>
        <span class="eyebrow">Parte 1</span>
        <h2>Reading</h2>
      </div>
      <span class="score-pill">4 puntos</span>
    </div>
  `;

  if (session.readings.length > 1 && session.examMode === "legacy_old") {
    const field = document.createElement("label");
    field.className = "compact-field";
    field.innerHTML = "<span>Reading que entrego</span>";
    const select = document.createElement("select");
    select.name = "activeReading";
    session.readings.forEach(reading => {
      const option = document.createElement("option");
      option.value = reading.id;
      option.textContent = reading.title;
      option.selected = reading.id === session.activeReadingId;
      select.appendChild(option);
    });
    select.addEventListener("change", () => handlers.onReadingChange(select.value));
    field.appendChild(select);
    section.appendChild(field);
  }

  const reading = session.readings.find(item => item.id === session.activeReadingId) || session.readings[0];
  if (!reading) return section;

  const block = document.createElement("div");
  block.className = "reading-block";
  block.innerHTML = `
    <h3>${escapeHtml(reading.title)}</h3>
    <p class="reading-text">${escapeHtml(reading.text)}</p>
  `;
  reading.questions.forEach(question => block.appendChild(renderReadingQuestion(question)));
  section.appendChild(block);

  return section;
}

function getQuestionGroupId(question) {
  return question.groupId || String(question.id || "").split(".")[0];
}

function renderUseGroupHeader(groupId, session, handlers) {
  const header = document.createElement("div");
  header.className = "use-group-title";

  if (session.chooseAny) {
    const label = document.createElement("label");
    label.className = "use-delivery-choice";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = session.selectedUseGroups.includes(groupId);
    input.addEventListener("change", () => handlers.onUseGroupToggle(groupId, input.checked));
    label.append(input, document.createTextNode(`Entregar ${groupId}`));
    header.appendChild(label);
  } else {
    header.textContent = groupId;
  }

  return header;
}

function renderUseQuestion(question, session, handlers) {
  const wrapper = document.createElement("article");
  wrapper.className = question.groupId ? "question use-subquestion" : "question";
  wrapper.dataset.id = question.id;

  const prompt = document.createElement("p");
  prompt.className = "question-prompt";

  if (session.chooseAny && !question.groupId) {
    const groupId = getQuestionGroupId(question);
    prompt.appendChild(renderUseGroupHeader(groupId, session, handlers));
  }

  const strong = document.createElement("strong");
  strong.textContent = question.id;
  prompt.append(strong, ". ");
  appendUsePrompt(prompt, question);
  wrapper.appendChild(prompt);

  if (question.type === "mcq") {
    renderChoiceOptions(wrapper, question);
  } else if (!textHasGap(question.prompt) && !instructionHasCompletionGap(question)) {
    wrapper.appendChild(createExpandingTextarea(question.id, "Escribe tu respuesta"));
  } else {
    const hint = document.createElement("p");
    hint.className = "inline-gap-hint";
    hint.textContent = instructionHasCompletionGap(question)
      ? "Escribe solo lo necesario para completar la frase."
      : "Escribe tu respuesta en el hueco de la frase.";
    wrapper.appendChild(hint);
  }

  return wrapper;
}

function renderUseQuestions(parent, questions, session, handlers) {
  const renderedGroups = new Set();

  questions.forEach(question => {
    const groupId = getQuestionGroupId(question);
    if (question.groupId && !renderedGroups.has(groupId)) {
      renderedGroups.add(groupId);
      parent.appendChild(renderUseGroupHeader(groupId, session, handlers));
    }
    parent.appendChild(renderUseQuestion(question, session, handlers));
  });
}

function renderUseSection(session, handlers) {
  const section = document.createElement("section");
  section.className = "work-panel";
  section.dataset.section = "use";
  const descriptor = getUseModeDescriptor({ examMode: session.examMode, useData: session.use });
  const chooseAnyCounter = session.chooseAny
    ? `<p class="selection-counter">Preguntas elegidas: ${session.selectedUseGroups.length} / ${session.expectedUseGroups}</p>`
    : "";

  section.innerHTML = `
    <div class="panel-title-row">
      <div>
        <span class="eyebrow">Parte 2</span>
        <h2>Use of English</h2>
        <p>${escapeHtml(descriptor.description)}</p>
      </div>
      <span class="score-pill">3 puntos</span>
    </div>
    ${chooseAnyCounter}
  `;

  if (!session.use) return section;

  if (!session.chooseAny && !session.practiceAll && session.use?.blocks?.length) {
    const field = document.createElement("label");
    field.className = "compact-field";
    field.innerHTML = "<span>Bloque que entrego</span>";
    const select = document.createElement("select");
    select.name = "activeUseBlock";
    session.use.blocks.forEach(block => {
      const option = document.createElement("option");
      option.value = block.id;
      option.textContent = block.label;
      option.selected = block.id === session.activeUseBlockId;
      select.appendChild(option);
    });
    select.addEventListener("change", () => handlers.onUseBlockChange(select.value));
    field.appendChild(select);
    section.appendChild(field);
  }

  const blocksToRender = session.chooseAny || session.practiceAll
    ? [{ id: "all", label: descriptor.label, questionIds: session.use.questions.map(question => question.id) }]
    : session.use.blocks || [];

  blocksToRender.forEach(block => {
    const blockElement = document.createElement("div");
    blockElement.className = "use-block";
    blockElement.dataset.block = block.id;
    const isActive = session.chooseAny || session.practiceAll || block.id === session.activeUseBlockId;
    if (!isActive) blockElement.hidden = true;

    const title = document.createElement("h3");
    title.textContent = block.label;
    blockElement.appendChild(title);

    const ids = new Set(block.questionIds || []);
    const questions = session.use.questions.filter(question => ids.has(question.id));
    renderUseQuestions(blockElement, questions, session, handlers);
    section.appendChild(blockElement);
  });

  return section;
}

function renderSessionMeta(session) {
  const meta = document.createElement("div");
  meta.className = "session-meta";
  const items = [
    ["Modo", session.modeLabel],
    ["Convocatoria", session.exam?.label || "Práctica"],
    ["Objetivo", session.goalLabel]
  ];

  meta.innerHTML = items.map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
  return meta;
}

export function renderExamView(container, session, handlers) {
  container.innerHTML = "";

  const shell = document.createElement("section");
  shell.className = "screen work-screen";

  const form = document.createElement("form");
  form.id = "examForm";
  form.className = "work-form";
  form.noValidate = true;
  form.addEventListener("submit", event => {
    event.preventDefault();
    handlers.onSubmit(new FormData(form));
  });

  const header = document.createElement("div");
  header.className = "work-header";
  header.innerHTML = `
    <div>
      <button class="button button-ghost button-small" type="button" data-action="back">Volver</button>
      <p class="eyebrow">${escapeHtml(session.modeLabel)}</p>
      <h1>${escapeHtml(session.title)}</h1>
      <p>${escapeHtml(session.description)}</p>
    </div>
    <div class="timer-card" id="timerCard">
      <span>Tiempo</span>
      <strong id="timerDisplay">00:00</strong>
    </div>
  `;
  header.querySelector('[data-action="back"]').addEventListener("click", handlers.onBack);

  shell.append(header, renderSessionMeta(session));

  if (session.visibleSections.includes("reading")) {
    form.appendChild(renderReadingSection(session, handlers));
  }

  if (session.visibleSections.includes("use")) {
    form.appendChild(renderUseSection(session, handlers));
  }

  const actions = document.createElement("div");
  actions.className = "sticky-actions";
  actions.innerHTML = `
    <button class="button button-primary" type="submit">Corregir intento</button>
    ${session.canSkip ? '<button class="button button-secondary" type="button" data-action="skip">Otro intento similar</button>' : ""}
    <button class="button button-ghost" type="button" data-action="dashboard">Inicio</button>
  `;
  actions.querySelector('[data-action="dashboard"]').addEventListener("click", handlers.onHome);
  actions.querySelector('[data-action="skip"]')?.addEventListener("click", handlers.onSkip);
  form.appendChild(actions);

  shell.appendChild(form);
  const resultsMount = document.createElement("div");
  resultsMount.id = "resultsMount";
  shell.appendChild(resultsMount);
  container.appendChild(shell);
}

export function renderInlineFeedback(statsList = []) {
  document.querySelectorAll(".feedback").forEach(item => item.remove());
  const results = statsList
    .filter(Boolean)
    .flatMap(stats => stats.questionResults || []);

  results.forEach(result => {
    const question = document.querySelector(`.question[data-id="${CSS.escape(result.id)}"]`);
    if (!question) return;

    const feedback = document.createElement("div");
    feedback.className = `feedback feedback-${result.status}`;

    if (result.status === "correct") {
      feedback.textContent = "Correcto.";
    } else if (result.status === "manual") {
      feedback.innerHTML = `
        <strong>Autocorrección pendiente.</strong>
        <p>Comprueba la estructura esperada: ${escapeHtml(result.correctAnswer || "No disponible")}</p>
      `;
    } else {
      const detail = result.details?.selectedAnswerCorrect && !result.details?.justificationCorrect
        ? "<p>La opción TRUE/FALSE es correcta, pero la justificación no coincide con el criterio.</p>"
        : "";
      feedback.innerHTML = `
        <strong>Revisar.</strong>
        ${detail}
        <p>Respuesta correcta: ${escapeHtml(result.correctAnswer || "No disponible")}</p>
      `;
    }

    question.appendChild(feedback);
  });
}

export function createSessionState(payload, options) {
  const use = payload.use;
  const chooseAny = use && !options.practiceAll
    ? isChooseAnyUseMode({ examMode: options.examMode, useData: use })
    : false;
  const firstReadingId = payload.readings[0]?.id || null;
  const firstUseBlockId = use?.blocks?.[0]?.id || null;

  return {
    ...payload,
    flow: options.flow,
    examMode: options.examMode,
    modeLabel: options.modeLabel,
    goalLabel: options.goalLabel,
    title: options.title,
    description: options.description,
    visibleSections: options.visibleSections,
    canSkip: Boolean(options.canSkip),
    practiceAll: Boolean(options.practiceAll),
    activeReadingId: options.activeReadingId || firstReadingId,
    activeUseBlockId: options.activeUseBlockId || firstUseBlockId,
    selectedUseGroups: options.selectedUseGroups || [],
    chooseAny,
    expectedUseGroups: Number(use?.blockRules?.questionsToAnswer || 6)
  };
}
