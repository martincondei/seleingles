import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const openAiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const maxWritingChars = 7000;
const maxPromptChars = 2000;
const writingSystemPrompt = [
  "Eres un profesor experto de inglés especializado en la corrección del Bloque C: Writing de Selectividad/EBAU.",
  "Tu tarea es corregir el writing de un alumno aplicando estrictamente la rúbrica oficial sobre 3 puntos.",
  "Evalúa de forma exigente, justa y útil para el aprendizaje.",
  "Tu función no es escribir el writing por el alumno: debes evaluar, detectar errores, explicar cómo mejorar y orientar.",
  "No escribas un texto corregido completo.",
  "No escribas una versión mejorada completa.",
  "No reescribas el writing entero del alumno.",
  "Puedes corregir fragmentos breves dentro de la tabla de errores, pero nunca el texto completo.",
  "",
  "RÚBRICA DE CORRECCIÓN",
  "CONTENIDO: máximo 1,25 puntos.",
  "1. Adecuación al tema: máximo 0,5.",
  "0,5: responde a la tarea con variedad de ideas, argumentos u opiniones relevantes.",
  "0,25: responde a la tarea, pero con pocas ideas, argumentos u opiniones relevantes.",
  "0: apenas presenta ideas relevantes o copia ideas del texto.",
  "2. Organización: máximo 0,75.",
  "0,75: utiliza mecanismos lingüísticos que conectan oraciones y párrafos de forma clara: conectores, pronombres, sinónimos, elipsis y concordancia.",
  "0,5: utiliza mecanismos de conexión, pero con presencia de recursos memorizados, poco naturales o no aplicados adecuadamente.",
  "0,25: utiliza escasos mecanismos de conexión, lo que dificulta la comprensión.",
  "0: no utiliza mecanismos de conexión.",
  "",
  "EXPRESIÓN: máximo 1,75 puntos.",
  "3. Repertorio gramatical: máximo 0,75.",
  "0,75: usa variedad de recursos morfosintácticos y construcciones complejas apropiadamente, con algún error puntual.",
  "0,5: usa pocos recursos gramaticales distintos y pocas construcciones complejas; hay errores, pero no dificultan la comprensión.",
  "0,25: comete numerosos errores gramaticales que dificultan la comprensión.",
  "0: comete errores frecuentes que impiden la comprensión.",
  "4. Uso del léxico: máximo 0,75.",
  "0,75: usa vocabulario rico, preciso y adecuado, aunque pueda haber errores esporádicos.",
  "0,5: hay algunos errores léxicos o vocabulario poco preciso, pero no dificulta la comprensión.",
  "0,25: hay numerosos errores léxicos, vocabulario repetitivo, vago o pobre, con interferencias.",
  "0: errores léxicos frecuentes que hacen la comprensión muy difícil.",
  "5. Ortografía y puntuación: máximo 0,25.",
  "0,25: ortografía y puntuación generalmente correctas.",
  "0: numerosos errores ortográficos o puntuación muy pobre.",
  "",
  "REGLAS IMPORTANTES",
  "El backend ya calcula word_count y length_penalty. Usa exactamente esos valores y no los recalcules.",
  "La nota final debe calcularse como content.score + expression.score - length_penalty.",
  "La nota final no puede ser inferior a 0 ni superior a 3.",
  "No cuentes dos veces el mismo error.",
  "Sé exigente pero justo.",
  "Explica la corrección en español.",
  "Mantén los ejemplos y fragmentos corregidos en inglés.",
  "No inventes información sobre la tarea si no se proporciona.",
  "Si no se proporciona el enunciado del writing, indica que la adecuación al tema puede ser solo aproximada.",
  "No seas excesivamente generoso con textos muy simples, repetitivos o con poca variedad gramatical.",
  "No penalices dos veces un mismo problema si afecta a varias categorías; menciona el impacto principal.",
  "No corrijas absolutamente todos los errores menores; selecciona los más relevantes para el aprendizaje.",
  "Si hay muchos errores repetidos, agrúpalos en un solo error principal.",
  "Si el texto tiene muy pocos errores, puedes incluir menos de 3 errores principales.",
  "Si el writing está vacío o es demasiado breve para evaluarlo, devuelve una nota baja y explica el motivo.",
  "Si el texto no está escrito en inglés, indícalo y evalúa en consecuencia.",
  "",
  "REGLAS DEL JSON",
  "Devuelve únicamente JSON válido ajustado al schema indicado.",
  "No uses markdown ni comentarios.",
  "No incluyas campos adicionales.",
  "content.score debe ser la suma de topic_relevance.score + organization.score.",
  "expression.score debe ser la suma de grammar.score + vocabulary.score + spelling_punctuation.score.",
  "Usa únicamente estos valores posibles: topic_relevance.score 0, 0.25, 0.5; organization.score 0, 0.25, 0.5, 0.75; grammar.score 0, 0.25, 0.5, 0.75; vocabulary.score 0, 0.25, 0.5, 0.75; spelling_punctuation.score 0, 0.25.",
  "main_errors debe incluir entre 3 y 8 errores, salvo que el texto tenga menos errores o sea demasiado breve.",
  "Las explicaciones deben estar en español.",
  "original y correction deben ser fragmentos breves en inglés.",
  "No incluyas nunca corrected_text, improved_version ni una versión completa alternativa del writing.",
  "Los consejos deben ser concretos, accionables y relacionados con el texto del alumno.",
  "Los recursos útiles deben ayudar a mejorar, pero no resolver el writing completo."
].join("\n");

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf"
};

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const safePath = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(root)) return null;
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  return stat.isDirectory() ? join(filePath, "index.html") : filePath;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 12000) {
        request.destroy();
        reject(new Error("Payload demasiado grande."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON inválido."));
      }
    });
    request.on("error", reject);
  });
}

function countWords(text) {
  const matches = String(text || "").match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

function getLengthPenalty(wordCount) {
  if (wordCount > 180) return 0.25;
  if (wordCount >= 140) return 0;
  if (wordCount >= 100) return 0.75;
  if (wordCount >= 80) return 1;
  if (wordCount >= 60) return 1.5;
  return 2;
}

function clampScore(value, min = 0, max = 3) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function roundQuarter(value) {
  return Math.round((Number(value) || 0) * 4) / 4;
}

function normalizeWritingCorrection(result, wordCount, lengthPenalty) {
  const normalized = result && typeof result === "object" ? result : {};
  const content = normalized.rubric?.content || {};
  const expression = normalized.rubric?.expression || {};

  const topicRelevance = clampScore(roundQuarter(content.topic_relevance?.score), 0, 0.5);
  const organization = clampScore(roundQuarter(content.organization?.score), 0, 0.75);
  const grammar = clampScore(roundQuarter(expression.grammar?.score), 0, 0.75);
  const vocabulary = clampScore(roundQuarter(expression.vocabulary?.score), 0, 0.75);
  const spellingPunctuation = clampScore(roundQuarter(expression.spelling_punctuation?.score), 0, 0.25);
  const contentScore = topicRelevance + organization;
  const expressionScore = grammar + vocabulary + spellingPunctuation;
  const finalScore = clampScore(contentScore + expressionScore - lengthPenalty);

  normalized.word_count = wordCount;
  normalized.length_penalty = lengthPenalty;
  normalized.max_score = 3;
  normalized.final_score = finalScore;
  normalized.rubric = {
    content: {
      ...content,
      score: contentScore,
      max: 1.25,
      topic_relevance: {
        ...content.topic_relevance,
        score: topicRelevance,
        max: 0.5
      },
      organization: {
        ...content.organization,
        score: organization,
        max: 0.75
      }
    },
    expression: {
      ...expression,
      score: expressionScore,
      max: 1.75,
      grammar: {
        ...expression.grammar,
        score: grammar,
        max: 0.75
      },
      vocabulary: {
        ...expression.vocabulary,
        score: vocabulary,
        max: 0.75
      },
      spelling_punctuation: {
        ...expression.spelling_punctuation,
        score: spellingPunctuation,
        max: 0.25
      }
    }
  };

  return normalized;
}

function getWritingCorrectionSchema() {
  const scoreBlock = {
    type: "object",
    additionalProperties: false,
    required: ["score", "max", "comment"],
    properties: {
      score: { type: "number" },
      max: { type: "number" },
      comment: { type: "string" }
    }
  };

  return {
    type: "object",
    additionalProperties: false,
    required: [
      "final_score",
      "max_score",
      "word_count",
      "length_penalty",
      "rubric",
      "general_comment",
      "main_errors",
      "improvement_tips",
      "useful_resources"
    ],
    properties: {
      final_score: { type: "number" },
      max_score: { type: "number" },
      word_count: { type: "integer" },
      length_penalty: { type: "number" },
      rubric: {
        type: "object",
        additionalProperties: false,
        required: ["content", "expression"],
        properties: {
          content: {
            type: "object",
            additionalProperties: false,
            required: ["score", "max", "topic_relevance", "organization"],
            properties: {
              score: { type: "number" },
              max: { type: "number" },
              topic_relevance: scoreBlock,
              organization: scoreBlock
            }
          },
          expression: {
            type: "object",
            additionalProperties: false,
            required: ["score", "max", "grammar", "vocabulary", "spelling_punctuation"],
            properties: {
              score: { type: "number" },
              max: { type: "number" },
              grammar: scoreBlock,
              vocabulary: scoreBlock,
              spelling_punctuation: scoreBlock
            }
          }
        }
      },
      general_comment: { type: "string" },
      main_errors: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["original", "correction", "explanation"],
          properties: {
            original: { type: "string" },
            correction: { type: "string" },
            explanation: { type: "string" }
          }
        }
      },
      improvement_tips: {
        type: "array",
        maxItems: 8,
        items: { type: "string" }
      },
      useful_resources: {
        type: "object",
        additionalProperties: false,
        required: ["connectors", "grammar_focus", "vocabulary_suggestions"],
        properties: {
          connectors: {
            type: "array",
            maxItems: 8,
            items: { type: "string" }
          },
          grammar_focus: {
            type: "array",
            maxItems: 8,
            items: { type: "string" }
          },
          vocabulary_suggestions: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["basic", "better_options"],
              properties: {
                basic: { type: "string" },
                better_options: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  };
}

function extractOpenAiText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;

  return (payload.output || [])
    .flatMap(item => item.content || [])
    .map(content => content.text || "")
    .find(Boolean);
}

async function handleWritingCorrection(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Método no permitido." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 500, { error: "Falta configurar OPENAI_API_KEY en el servidor." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  const writingPrompt = String(body.writingPrompt || "").trim();
  const studentWriting = String(body.studentWriting || "").trim();

  if (!writingPrompt || !studentWriting) {
    sendJson(response, 400, { error: "Faltan el enunciado o el writing del alumno." });
    return;
  }

  if (writingPrompt.length > maxPromptChars || studentWriting.length > maxWritingChars) {
    sendJson(response, 413, { error: "El texto es demasiado largo para corregirlo en esta versión." });
    return;
  }

  const wordCount = countWords(studentWriting);
  const lengthPenalty = getLengthPenalty(wordCount);

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0.2,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: writingSystemPrompt
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "DATOS CALCULADOS POR EL BACKEND",
                `word_count: ${wordCount}`,
                `length_penalty: ${lengthPenalty}`,
                "",
                "ENUNCIADO:",
                writingPrompt,
                "",
                "WRITING DEL ALUMNO:",
                studentWriting
              ].join("\n")
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "writing_correction",
          strict: true,
          schema: getWritingCorrectionSchema()
        }
      }
    })
  });

  const payload = await apiResponse.json().catch(() => ({}));

  if (!apiResponse.ok) {
    sendJson(response, apiResponse.status, {
      error: payload.error?.message || "OpenAI no pudo corregir el writing."
    });
    return;
  }

  try {
    const parsed = JSON.parse(extractOpenAiText(payload));
    sendJson(response, 200, normalizeWritingCorrection(parsed, wordCount, lengthPenalty));
  } catch {
    sendJson(response, 502, { error: "OpenAI devolvió una respuesta con formato inesperado." });
  }
}

createServer(async (request, response) => {
  if ((request.url || "").split("?")[0] === "/api/writing-correction") {
    try {
      await handleWritingCorrection(request, response);
    } catch {
      sendJson(response, 500, { error: "Error interno corrigiendo el writing." });
    }
    return;
  }

  const filePath = resolvePath(request.url || "/");
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`English Selectividad disponible en http://${host}:${port}`);
});
