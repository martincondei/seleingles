# English Selectividad

Aplicación web estática para practicar Inglés de Selectividad/PAU con exámenes reales, corrección automática, progreso local, diagnóstico de fallos y modos de práctica enfocados.

## Qué Incluye

- Panel de estudio con métricas, recomendaciones y patrones de error.
- Examen concreto por año y convocatoria.
- Simulacro aleatorio filtrado por años y modelo.
- Práctica enfocada de Reading.
- Práctica enfocada de Use of English.
- Corrección automática de MCQ, true/false con justificación, vocabulario y transformaciones.
- Autocorrección guiada para respuestas abiertas sin solución única.
- Banco de fallos basado en intentos guardados en `localStorage`.
- Validación automática de JSON de contenido.
- Tests del motor de comparación y corrección.

## Estructura

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── main.js
│   ├── logic/
│   │   ├── correction.js
│   │   ├── examGenerator.js
│   │   ├── progress.js
│   │   ├── statistics.js
│   │   └── textMatching.js
│   ├── ui/
│   │   ├── dom.js
│   │   ├── renderDashboard.js
│   │   ├── renderExam.js
│   │   ├── renderResults.js
│   │   └── timer.js
│   └── data/
│       ├── exams/
│       ├── reading/
│       └── use_of_english/
├── scripts/
│   ├── serve.mjs
│   └── validate-data.mjs
└── test/
```

## Scripts

```bash
npm start
npm run validate:data
npm test
npm run check
```

`npm start` sirve la app en `http://localhost:4173`.

## Añadir Contenido

1. Añade el JSON de Reading en `js/data/reading/<año>/`.
2. Añade el JSON de Use of English en `js/data/use_of_english/<año>/`.
3. Registra ambos archivos en `js/data/exams/index.json`.
4. Ejecuta `npm run validate:data`.

Cada pregunta necesita `id`, `type`, `prompt` y `points`. Las preguntas `mcq` usan `options` y `answer`; las preguntas de texto usan `answers`; las preguntas abiertas pueden usar `manualCorrection`.

## Roadmap Recomendado

- Backend opcional para cuentas y sincronización entre dispositivos.
- Panel docente para academias o grupos.
- Corrección asistida de Writing con rúbricas.
- Importador semiautomático de criterios oficiales en PDF.
- Objetivos semanales y repetición espaciada de fallos.
