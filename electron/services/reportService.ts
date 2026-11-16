import type { DatabaseSync } from 'node:sqlite';
import { getAiSettings } from '../db/aiSettingsRepo.js';
import { getCourseById } from '../db/coursesRepo.js';
import { createNote, listNotes } from '../db/notesRepo.js';
import { getSourceWithChunks, listSourcesByCourse } from '../db/sourcesRepo.js';
import type {
  CourseWithSchedules,
  ExamStageTag,
  GenerateStudyReportInput,
  GenerateStudyReportResult,
  NoteOrigin,
  NoteWithCourse,
  PracticeExamFormat,
  Source,
  SourceWithChunks,
  StudyReportStepInfo,
  StudyReportType,
} from '../types.js';
import { chunkDocumentPages } from './chunkingService.js';
import {
  generateChatCompletion,
  OllamaCancelledError,
} from './ollamaClient.js';

export const LOCAL_REPORT_FALLBACK_MODEL = 'local-map-reduce-fallback';
const MAX_MAP_SOURCE_CHARS = 4500;
const MAX_LOCAL_MAP_SUMMARY_CHARS = 1200;
const MAX_REDUCE_INPUT_CHARS = 14000;

const VALID_REPORT_TYPES = new Set<StudyReportType>([
  'summary',
  'report',
  'study_guide',
  'practice_exam',
]);

const VALID_EXAM_FORMATS = new Set<PracticeExamFormat>([
  'develop',
  'multiple_choice',
  'mixed',
]);

const REPORT_TYPE_LABELS: Record<StudyReportType, string> = {
  summary: 'Resumen',
  report: 'Informe académico',
  study_guide: 'Guía de estudio',
  practice_exam: 'Examen de práctica',
};

const DEFAULT_TITLE_PREFIXES: Record<StudyReportType, string> = {
  summary: 'Resumen',
  report: 'Informe',
  study_guide: 'Guía de estudio',
  practice_exam: 'Examen de práctica',
};

const EXAM_FORMAT_LABELS: Record<PracticeExamFormat, string> = {
  develop: 'Desarrollo',
  multiple_choice: 'Multiple Choice',
  mixed: 'Mixto',
};

const REPORT_TYPE_TO_NOTE_ORIGIN: Record<StudyReportType, NoteOrigin> = {
  summary: 'ai_summary',
  report: 'ai_summary',
  study_guide: 'ai_study_guide',
  practice_exam: 'ai_practice_exam',
};

interface MapSourceOutput {
  source: SourceWithChunks;
  sampledContent: string;
  summaryText: string;
  usedFallback: boolean;
}

function trimCleanly(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const sliced = normalized.slice(0, maxChars);
  const lastBreak = Math.max(
    sliced.lastIndexOf('\n'),
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf(' ')
  );
  if (lastBreak > Math.floor(maxChars * 0.65)) {
    return `${sliced.slice(0, lastBreak).trimEnd()}...`;
  }
  return `${sliced.trimEnd()}...`;
}

/**
 * Samples and condenses chunks evenly across a source's pages/chunks up to `maxChars`,
 * preserving coverage from start to finish when a document is large.
 */
export function sampleSourceContentForMap(
  source: SourceWithChunks,
  maxChars = MAX_MAP_SOURCE_CHARS
): string {
  const sortedChunks = [...source.chunks].sort(
    (a, b) => a.chunkIndex - b.chunkIndex
  );

  const formattedPieces = sortedChunks
    .map((chunk) => {
      const text = chunk.content.trim();
      if (!text) return '';
      const pagePrefix =
        chunk.pageNumber !== null ? `[Pág. ${chunk.pageNumber}] ` : '';
      return `${pagePrefix}${text}`;
    })
    .filter((piece) => piece.length > 0);

  if (formattedPieces.length === 0) {
    return trimCleanly(source.rawText || '', maxChars);
  }

  const fullJoined = formattedPieces.join('\n\n');
  if (fullJoined.length <= maxChars) {
    return fullJoined;
  }

  if (formattedPieces.length === 1) {
    return trimCleanly(formattedPieces[0], maxChars);
  }

  const separator = '\n\n...\n\n';
  const maxSamples = Math.min(formattedPieces.length, 24);

  for (let sampleCount = maxSamples; sampleCount >= 2; sampleCount--) {
    const indices: number[] = [];
    let lastIndex = -1;
    for (let i = 0; i < sampleCount; i++) {
      const idx = Math.round(
        (i * (formattedPieces.length - 1)) / (sampleCount - 1)
      );
      if (idx !== lastIndex) {
        indices.push(idx);
        lastIndex = idx;
      }
    }

    const candidate = indices.map((idx) => formattedPieces[idx]).join(separator);
    if (candidate.length <= maxChars) {
      return candidate;
    }
  }

  // Even first + last chunks exceed maxChars: budget both ends evenly
  const perEndBudget = Math.max(
    120,
    Math.floor((maxChars - separator.length) / 2)
  );
  const firstPiece = trimCleanly(formattedPieces[0], perEndBudget);
  const lastPiece = trimCleanly(
    formattedPieces[formattedPieces.length - 1],
    perEndBudget
  );
  return trimCleanly(`${firstPiece}${separator}${lastPiece}`, maxChars);
}

function extractRepresentativeSentences(text: string, limit = 6): string[] {
  const cleanedLines = text
    .replace(/\[Pág\.\s*\d+\]\s*/g, '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length >= 20);

  const sentences: string[] = [];
  for (const line of cleanedLines) {
    const parts = line
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 20);

    if (parts.length > 0) {
      sentences.push(...parts);
    } else {
      sentences.push(line);
    }
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(sentence);
    }
    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

function buildLocalMapSummary(
  source: SourceWithChunks,
  sampledContent: string,
  reportType: StudyReportType,
  customInstructions: string
): string {
  const sentences = extractRepresentativeSentences(sampledContent, 6);
  const bullets =
    sentences.length > 0
      ? sentences.map((sentence) => `- ${sentence}`)
      : [`- ${trimCleanly(sampledContent, 400)}`];

  const headerLines = [
    `**Fuente:** ${source.title} (${source.pageCount} ${
      source.pageCount === 1 ? 'página' : 'páginas'
    }, ${source.chunks.length} fragmentos)`,
    `**Objetivo:** ${REPORT_TYPE_LABELS[reportType]}`,
  ];

  if (customInstructions) {
    headerLines.push(`**Criterio aplicado:** ${customInstructions}`);
  }

  return trimCleanly(
    [...headerLines, '', ...bullets].join('\n'),
    MAX_LOCAL_MAP_SUMMARY_CHARS
  );
}

function buildMapPrompts(params: {
  course: CourseWithSchedules;
  source: SourceWithChunks;
  sampledContent: string;
  reportType: StudyReportType;
  examFormat: PracticeExamFormat | null;
  customInstructions: string;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const {
    course,
    source,
    sampledContent,
    reportType,
    examFormat,
    customInstructions,
  } = params;

  const targetDescription = examFormat
    ? `${REPORT_TYPE_LABELS[reportType]} (formato ${EXAM_FORMAT_LABELS[examFormat]})`
    : REPORT_TYPE_LABELS[reportType];

  const systemLines = [
    `Sos un asistente académico universitario para la materia "${course.name}" (${course.term}).`,
    `Estás ejecutando la fase MAP de un flujo Map-Reduce: analizá EXCLUSIVAMENTE la fuente entregada y extraé conceptos clave, definiciones, argumentos, fórmulas o datos relevantes orientados a preparar un "${targetDescription}".`,
    'Mantené rigor académico en español claro, conservá referencias de página ([Pág. X]) si aparecen en el texto y NO inventes información que no figure en la fuente.',
  ];

  if (customInstructions) {
    systemLines.push(
      `INSTRUCCIÓN PRIORITARIA DEL ESTUDIANTE: Adaptá los puntos extraídos para cumplir con estas indicaciones: "${customInstructions}".`
    );
  }

  const userSections = [
    `Materia: ${course.name}`,
    `Fuente: ${source.title} (${source.sourceType}, ${source.pageCount} págs., ${source.chunks.length} fragmentos)`,
    `Material objetivo: ${targetDescription}`,
  ];

  if (customInstructions) {
    userSections.push(
      '',
      '## Instrucciones prioritarias del estudiante',
      customInstructions
    );
  }

  userSections.push(
    '',
    '## Contenido de la fuente',
    sampledContent
  );

  return [
    { role: 'system', content: systemLines.join('\n') },
    { role: 'user', content: userSections.join('\n') },
  ];
}

function getReduceTypeInstructions(
  reportType: StudyReportType,
  examFormat: PracticeExamFormat | null
): string {
  switch (reportType) {
    case 'summary':
      return [
        'Generá un **Resumen** claro y estructurado en Markdown (GFM) pensado para repaso ágil:',
        '- Comenzá con una síntesis general de la idea central.',
        '- Organizá los ejes temáticos con subtítulos y viñetas precisas.',
        '- Incluí definiciones esenciales y conclusiones clave.',
      ].join('\n');

    case 'report':
      return [
        'Generá un **Informe académico desarrollado** en Markdown (GFM) con redacción formal y analítica:',
        '- Incluí `## Introducción` contextualizando el alcance de las fuentes.',
        '- Desarrollá los `## Ejes temáticos` en profundidad.',
        '- Agregá `## Articulación entre fuentes` comparando o integrando los aportes de cada documento.',
        '- Cerrá con `## Conclusiones`.',
      ].join('\n');

    case 'study_guide':
      return [
        'Generá una **Guía de estudio completa** en Markdown (GFM):',
        '- `## Objetivos de aprendizaje`',
        '- `## Conceptos clave y definiciones`',
        '- `## Cuadro comparativo o esquema integrador` (usá una tabla GFM cuando ayude a contrastar conceptos)',
        '- `## Preguntas de autoevaluación`',
        '- `## Checklist de repaso` (usando tareas `- [ ] ...`)',
      ].join('\n');

    case 'practice_exam': {
      const format = examFormat ?? 'mixed';
      const formatGuidance =
        format === 'develop'
          ? 'Todas las consignas deben ser preguntas abiertas de desarrollo teórico-práctico y análisis conceptual (sin opciones múltiples), indicando criterios esperados o puntaje sugerido.'
          : format === 'multiple_choice'
            ? 'Todas las consignas deben ser preguntas de opción múltiple (Multiple Choice) con 4 opciones claras (`A)`, `B)`, `C)`, `D)`) y una única respuesta correcta por pregunta.'
            : 'Combiná de manera equilibrada preguntas de opción múltiple (`A)`, `B)`, `C)`, `D)`) y preguntas de desarrollo teórico-práctico.';

      return [
        `Generá un **Examen de práctica** en Markdown (GFM) con formato **${EXAM_FORMAT_LABELS[format]}**:`,
        `- ${formatGuidance}`,
        '- Basá todas las consignas en los contenidos reales de las fuentes analizadas.',
        '- OBLIGATORIO: Incluí al final del documento la sección exacta `## Clave de respuestas / corrección` con la respuesta correcta y justificación breve (o guía de corrección) para cada pregunta.',
      ].join('\n');
    }
  }
}

function buildReducePrompts(params: {
  course: CourseWithSchedules;
  title: string;
  reportType: StudyReportType;
  examFormat: PracticeExamFormat | null;
  customInstructions: string;
  mapOutputs: MapSourceOutput[];
  reportLanguage?: 'es' | 'en' | 'auto';
  citeSources?: boolean;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const {
    course,
    title,
    reportType,
    examFormat,
    customInstructions,
    mapOutputs,
  } = params;

  const systemLines = [
    params.reportLanguage === 'en'
      ? `You are an academic study assistant writing clear study material in English for "${course.name}" (${course.term}).`
      : params.reportLanguage === 'auto'
        ? `Sos un asistente académico universitario redactando material de estudio para "${course.name}" (${course.term}) en el idioma predominante de las fuentes.`
        : `Sos un asistente académico universitario redactando material de estudio en español para "${course.name}" (${course.term}).`,
    'Estás ejecutando la fase REDUCE de un flujo Map-Reduce: integrá los análisis parciales de todas las fuentes seleccionadas en un único documento coherente, sin repetir información ni inventar hechos ajenos a las fuentes.',
    params.citeSources === false
      ? 'IMPORTANTE: Redactá de manera fluida SIN incluir marcadores numéricos de cita ([1], [2], [Pág. X]).'
      : 'Cuando correspondan afirmaciones concretas, preservá citas verificables a las fuentes ([1], [Pág. X]).',
    '',
    getReduceTypeInstructions(reportType, examFormat),
  ];

  if (customInstructions) {
    systemLines.push(
      '',
      `REQUISITO PRIORITARIO DEL ESTUDIANTE: Debés seguir y priorizar explícitamente estas instrucciones en el formato, tono, profundidad y foco del documento final: "${customInstructions}".`
    );
  }

  const perSourceBudget = Math.max(
    900,
    Math.floor(MAX_REDUCE_INPUT_CHARS / Math.max(1, mapOutputs.length))
  );

  const mapSections = mapOutputs.map((item, idx) => {
    const condensed = trimCleanly(item.summaryText, perSourceBudget);
    return [
      `### Fuente ${idx + 1}: ${item.source.title} (${item.source.pageCount} ${
        item.source.pageCount === 1 ? 'pág.' : 'págs.'
      }, ${item.source.chunks.length} fragmentos)`,
      condensed,
    ].join('\n');
  });

  const userLines = [
    `Título sugerido: ${title}`,
    `Materia: ${course.name} (${course.term})`,
  ];
  if (course.professor) {
    userLines.push(`Cátedra / Docente: ${course.professor}`);
  }
  if (customInstructions) {
    userLines.push(
      '',
      '## Instrucciones prioritarias del estudiante',
      customInstructions
    );
  }
  userLines.push(
    '',
    '## Análisis parciales por fuente (Fase Map)',
    ...mapSections
  );

  return [
    { role: 'system', content: systemLines.join('\n') },
    { role: 'user', content: userLines.join('\n') },
  ];
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function buildLocalPracticeExamFallback(params: {
  title: string;
  course: CourseWithSchedules;
  examFormat: PracticeExamFormat;
  customInstructions: string;
  mapOutputs: MapSourceOutput[];
}): string {
  const { title, course, examFormat, customInstructions, mapOutputs } = params;
  const lines: string[] = [
    `# ${title}`,
    '',
    `> **Materia:** ${course.name} · **Formato:** ${EXAM_FORMAT_LABELS[examFormat]} · *Generado en modo local de respaldo*`,
  ];

  if (customInstructions) {
    lines.push(`> **Instrucciones aplicadas:** ${customInstructions}`);
  }

  const questionEntries: Array<{
    number: number;
    kind: 'mc' | 'dev';
    sourceTitle: string;
    statement: string;
    answerKey: string;
  }> = [];

  const sourcePools = mapOutputs.map((item) => {
    const sentences = extractRepresentativeSentences(
      `${item.summaryText}\n${item.sampledContent}`,
      4
    );
    return {
      title: item.source.title,
      sentences:
        sentences.length > 0
          ? sentences
          : [`Contenidos fundamentales de "${item.source.title}".`],
    };
  });

  let questionNumber = 1;
  const mcCount =
    examFormat === 'multiple_choice'
      ? Math.max(3, Math.min(6, sourcePools.length * 2))
      : examFormat === 'mixed'
        ? Math.max(2, Math.min(4, sourcePools.length + 1))
        : 0;

  const devCount =
    examFormat === 'develop'
      ? Math.max(3, Math.min(6, sourcePools.length * 2))
      : examFormat === 'mixed'
        ? Math.max(2, Math.min(3, sourcePools.length))
        : 0;

  lines.push('', '## Consignas', '');

  for (let i = 0; i < mcCount; i++) {
    const pool = sourcePools[i % sourcePools.length];
    const fact = pool.sentences[i % pool.sentences.length];
    const cleanFact = trimCleanly(fact, 180);
    const letterChoices = ['A', 'B', 'C', 'D'] as const;
    const correctIndex = i % 4;

    const optionTexts = [
      cleanFact,
      `Se descarta por completo el enfoque descripto en "${pool.title}".`,
      `El concepto aplica únicamente fuera del alcance de ${course.name}.`,
      `Ninguna de las afirmaciones respaldadas por "${pool.title}" es válida.`,
    ];

    // Place the accurate statement at correctIndex and distribute the 3 distinct distractors
    let distractorCursor = 0;
    const rotatedOptions = letterChoices.map((letter, idx) => {
      const text =
        idx === correctIndex
          ? optionTexts[0]
          : optionTexts[1 + distractorCursor++];
      return `- **${letter})** ${text}`;
    });

    lines.push(
      `### ${questionNumber}. Opción múltiple — ${pool.title}`,
      '',
      `Según el material de **${pool.title}**, ¿cuál de las siguientes afirmaciones es correcta?`,
      '',
      ...rotatedOptions,
      ''
    );

    questionEntries.push({
      number: questionNumber,
      kind: 'mc',
      sourceTitle: pool.title,
      statement: cleanFact,
      answerKey: `**${letterChoices[correctIndex]})** — Respaldado directamente por *${pool.title}*: "${cleanFact}"`,
    });
    questionNumber += 1;
  }

  for (let i = 0; i < devCount; i++) {
    const pool = sourcePools[i % sourcePools.length];
    const focusSentence = trimCleanly(
      pool.sentences[(i + 1) % pool.sentences.length],
      180
    );
    const focusNote = customInstructions
      ? ` Considerando especialmente: *${customInstructions}*.`
      : '';

    lines.push(
      `### ${questionNumber}. Desarrollo — ${pool.title}`,
      '',
      `Explicá los conceptos principales trabajados en **${pool.title}** vinculados con la siguiente idea y fundamentá su importancia práctica:${focusNote}`,
      '',
      `> *"${focusSentence}"*`,
      ''
    );

    questionEntries.push({
      number: questionNumber,
      kind: 'dev',
      sourceTitle: pool.title,
      statement: focusSentence,
      answerKey: `Debe definir y desarrollar la idea central de *${pool.title}* ("${focusSentence}"), articulando sus implicancias dentro de ${course.name}.`,
    });
    questionNumber += 1;
  }

  lines.push('## Clave de respuestas / corrección', '');
  for (const entry of questionEntries) {
    lines.push(
      `${entry.number}. **(${entry.kind === 'mc' ? 'Multiple Choice' : 'Desarrollo'} · ${entry.sourceTitle})**: ${entry.answerKey}`
    );
  }
  lines.push('');

  return lines.join('\n');
}

function buildLocalReduceFallback(params: {
  course: CourseWithSchedules;
  title: string;
  reportType: StudyReportType;
  examFormat: PracticeExamFormat | null;
  customInstructions: string;
  mapOutputs: MapSourceOutput[];
}): string {
  const {
    course,
    title,
    reportType,
    examFormat,
    customInstructions,
    mapOutputs,
  } = params;

  if (reportType === 'practice_exam') {
    return buildLocalPracticeExamFallback({
      title,
      course,
      examFormat: examFormat ?? 'mixed',
      customInstructions,
      mapOutputs,
    });
  }

  const sourceNames = mapOutputs.map((item) => item.source.title).join(', ');
  const lines: string[] = [
    `# ${title}`,
    '',
    `> **Materia:** ${course.name} (${course.term}) · **Fuentes analizadas (${mapOutputs.length}):** ${sourceNames}`,
    '> *Nota: Material ensamblado mediante síntesis local Map-Reduce porque Ollama no respondió durante la fase de reducción.*',
  ];

  if (customInstructions) {
    lines.push(`> **Enfoque solicitado:** ${customInstructions}`);
  }

  if (reportType === 'summary') {
    lines.push('', '## Síntesis general', '');
    for (const item of mapOutputs) {
      const topSentence =
        extractRepresentativeSentences(item.summaryText, 1)[0] ??
        trimCleanly(item.sampledContent, 200);
      lines.push(`- **${item.source.title}:** ${topSentence}`);
    }
    lines.push('', '## Puntos clave por fuente', '');
    for (const item of mapOutputs) {
      lines.push(`### ${item.source.title}`, '', item.summaryText, '');
    }
    return lines.join('\n');
  }

  if (reportType === 'report') {
    lines.push(
      '',
      '## Introducción',
      '',
      `El presente informe consolida y analiza ${mapOutputs.length} ${
        mapOutputs.length === 1 ? 'fuente documental' : 'fuentes documentales'
      } correspondientes a **${course.name}** (${course.term})${
        customInstructions
          ? `, priorizando el siguiente eje: *${customInstructions}*`
          : ''
      }.`,
      '',
      '## Ejes temáticos y desarrollo por fuente',
      ''
    );

    for (const item of mapOutputs) {
      lines.push(`### ${item.source.title}`, '', item.summaryText, '');
    }

    lines.push(
      '## Comparación entre fuentes',
      '',
      '| Fuente | Páginas | Fragmentos | Aporte principal |',
      '| :--- | ---: | ---: | :--- |'
    );
    for (const item of mapOutputs) {
      const highlight =
        extractRepresentativeSentences(item.summaryText, 1)[0] ??
        trimCleanly(item.sampledContent, 140);
      lines.push(
        `| ${escapeTableCell(item.source.title)} | ${item.source.pageCount} | ${item.source.chunks.length} | ${escapeTableCell(trimCleanly(highlight, 140))} |`
      );
    }

    lines.push(
      '',
      '## Conclusiones',
      '',
      `La integración de ${sourceNames} permite abordar de manera articulada los conceptos centrales de **${course.name}** y sirve como base verificable para las instancias de evaluación.`
    );
    lines.push('');
    return lines.join('\n');
  }

  // 'study_guide'
  lines.push(
    '',
    '## Objetivos de estudio',
    '',
    `- Comprender los fundamentos y definiciones desarrollados en ${sourceNames}.`,
    `- Relacionar los conceptos clave de **${course.name}** con sus aplicaciones prácticas.${
      customInstructions ? `\n- Atender especialmente: ${customInstructions}.` : ''
    }`,
    '',
    '## Conceptos clave por fuente',
    ''
  );

  for (const item of mapOutputs) {
    lines.push(`### ${item.source.title}`, '', item.summaryText, '');
  }

  lines.push(
    '## Cuadro comparativo de fuentes',
    '',
    '| Fuente | Páginas | Síntesis rápida |',
    '| :--- | ---: | :--- |'
  );
  for (const item of mapOutputs) {
    const highlight =
      extractRepresentativeSentences(item.summaryText, 1)[0] ??
      trimCleanly(item.sampledContent, 140);
    lines.push(
      `| ${escapeTableCell(item.source.title)} | ${item.source.pageCount} | ${escapeTableCell(trimCleanly(highlight, 140))} |`
    );
  }

  lines.push('', '## Preguntas de autoevaluación', '');
  mapOutputs.forEach((item, idx) => {
    const idea =
      extractRepresentativeSentences(item.summaryText, 1)[0] ??
      item.source.title;
    lines.push(
      `${idx + 1}. ¿Cómo se explica y aplica en **${item.source.title}** el concepto vinculado a: *"${trimCleanly(idea, 160)}"*?`
    );
  });

  lines.push('', '## Checklist de repaso', '');
  for (const item of mapOutputs) {
    lines.push(
      `- [ ] Repasar y resumir con palabras propias **${item.source.title}** (${item.source.pageCount} ${
        item.source.pageCount === 1 ? 'pág.' : 'págs.'
      })`
    );
  }
  lines.push(
    '- [ ] Resolver las preguntas de autoevaluación sin consultar el material'
  );
  lines.push('');
  return lines.join('\n');
}

const EXAM_STAGE_LABELS: Record<ExamStageTag, string> = {
  parcial_1: '1° Parcial',
  parcial_2: '2° Parcial',
  final: 'Final',
  general: 'General',
};

function noteToSourceWithChunks(note: NoteWithCourse): SourceWithChunks {
  const rawText = note.content.trim() || note.title.trim();
  const chunkItems = chunkDocumentPages([{ pageNumber: 1, text: rawText }], {
    maxChars: 800,
    overlapChars: 100,
  });
  const chunks =
    chunkItems.length > 0
      ? chunkItems.map((c) => ({
          id: `${note.id}-note-chunk-${c.chunkIndex}`,
          sourceId: note.id,
          courseId: note.courseId,
          chunkIndex: c.chunkIndex,
          pageNumber: null,
          content: c.content,
          embeddingDim: null,
        }))
      : [
          {
            id: `${note.id}-note-chunk-0`,
            sourceId: note.id,
            courseId: note.courseId,
            chunkIndex: 0,
            pageNumber: null,
            content: rawText,
            embeddingDim: null,
          },
        ];

  return {
    id: note.id,
    courseId: note.courseId,
    title: note.title,
    sourceType: 'note',
    originalPath: null,
    storedFilename: null,
    rawText,
    pageCount: 1,
    charCount: rawText.length,
    chunkCount: chunks.length,
    indexingStatus: 'ready',
    indexingError: null,
    embeddingModel: null,
    examStage: note.examStage ?? 'general',
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    chunks,
  };
}

function selectStudyMaterialUnits(
  db: DatabaseSync,
  course: CourseWithSchedules,
  input: GenerateStudyReportInput
): SourceWithChunks[] {
  const stageFilter =
    input.examStage && input.examStage !== 'all' ? input.examStage : null;

  const readySources = listSourcesByCourse(db, course.id).filter(
    (source) =>
      source.indexingStatus === 'ready' &&
      (!stageFilter || (source.examStage ?? 'general') === stageFilter)
  );

  let selectedBaseSources: Source[];
  if (input.sourceIds !== undefined) {
    const requestedSet = input.sourceIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const readyById = new Map(readySources.map((src) => [src.id, src]));
    const seen = new Set<string>();
    selectedBaseSources = [];

    for (const id of requestedSet) {
      if (seen.has(id)) continue;
      const match = readyById.get(id);
      if (match) {
        seen.add(id);
        selectedBaseSources.push(match);
      }
    }
  } else {
    selectedBaseSources = readySources;
  }

  const wantsNotes =
    input.includeNotes !== false &&
    (input.includeNotes === true ||
      input.noteIds !== undefined ||
      (stageFilter !== null && input.sourceIds === undefined));

  let selectedNotes: NoteWithCourse[] = [];
  if (wantsNotes) {
    const candidateNotes = listNotes(db, {
      courseId: course.id,
      examStage: stageFilter ?? undefined,
    });
    if (input.noteIds !== undefined) {
      const requestedNoteIds = input.noteIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      const noteById = new Map(candidateNotes.map((n) => [n.id, n]));
      const seen = new Set<string>();
      for (const id of requestedNoteIds) {
        if (seen.has(id)) continue;
        const match = noteById.get(id);
        if (match) {
          seen.add(id);
          selectedNotes.push(match);
        }
      }
    } else {
      selectedNotes = candidateNotes;
    }
  }

  const sourceUnits: SourceWithChunks[] = selectedBaseSources.map((base) => {
    const full = getSourceWithChunks(db, base.id);
    if (!full) {
      return {
        ...base,
        chunks: base.rawText.trim()
          ? [
              {
                id: `${base.id}-fallback-0`,
                sourceId: base.id,
                courseId: base.courseId,
                chunkIndex: 0,
                pageNumber: 1,
                content: base.rawText.trim(),
                embeddingDim: null,
              },
            ]
          : [],
      };
    }

    if (full.chunks.length === 0 && full.rawText.trim()) {
      return {
        ...full,
        chunkCount: 1,
        chunks: [
          {
            id: `${full.id}-fallback-0`,
            sourceId: full.id,
            courseId: full.courseId,
            chunkIndex: 0,
            pageNumber: 1,
            content: full.rawText.trim(),
            embeddingDim: null,
          },
        ],
      };
    }

    return full;
  });

  const noteUnits = selectedNotes.map(noteToSourceWithChunks);
  const combinedUnits = [...sourceUnits, ...noteUnits];

  if (combinedUnits.length === 0) {
    if (input.sourceIds !== undefined || input.noteIds !== undefined) {
      throw new Error(
        'No hay fuentes indexadas que coincidan con la selección. Verificá que al menos una fuente elegida esté en estado listo o seleccioná notas válidas.'
      );
    }
    if (stageFilter) {
      throw new Error(
        `La materia "${course.name}" no tiene fuentes indexadas listas ni notas etiquetadas para ${EXAM_STAGE_LABELS[stageFilter]}.`
      );
    }
    throw new Error(
      `La materia "${course.name}" no tiene fuentes indexadas listas para generar material.`
    );
  }

  return combinedUnits;
}

/**
 * Generates study material (summary, academic report, study guide, or practice exam)
 * via an on-demand Map-Reduce pipeline over a course's ready sources and/or selected notes.
 * Passes `keep_alive: '0s'` to Ollama on every call and falls back cleanly when offline.
 */
export interface GenerateStudyReportOptions {
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
  stream?: boolean;
  onToken?: (chunkText: string, accumulatedText: string) => void;
  onStep?: (step: StudyReportStepInfo) => void;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new OllamaCancelledError(
      'La generación del informe fue cancelada por el usuario.'
    );
  }
}

export async function generateStudyReportService(
  db: DatabaseSync,
  input: GenerateStudyReportInput,
  options?: GenerateStudyReportOptions
): Promise<GenerateStudyReportResult> {
  assertNotAborted(options?.signal);

  const courseId = (input.courseId ?? '').trim();
  if (!courseId) {
    throw new Error('Seleccioná una materia válida para generar el material.');
  }

  const course = getCourseById(db, courseId);
  if (!course) {
    throw new Error(`No se encontró la materia solicitada (${courseId}).`);
  }

  if (!VALID_REPORT_TYPES.has(input.reportType)) {
    throw new Error(
      `Tipo de material inválido: "${String(input.reportType)}".`
    );
  }

  let resolvedExamFormat: PracticeExamFormat | null = null;
  if (input.reportType === 'practice_exam') {
    if (
      input.examFormat !== undefined &&
      !VALID_EXAM_FORMATS.has(input.examFormat)
    ) {
      throw new Error(
        `Formato de examen inválido: "${String(input.examFormat)}".`
      );
    }
    resolvedExamFormat = input.examFormat ?? 'mixed';
  }

  const stageFilter =
    input.examStage && input.examStage !== 'all' ? input.examStage : null;
  const stageInstruction = stageFilter
    ? `Instancia de evaluación objetivo: ${EXAM_STAGE_LABELS[stageFilter]}.`
    : '';
  const rawCustomInstructions = (input.customInstructions ?? '').trim();
  const customInstructions = [stageInstruction, rawCustomInstructions]
    .filter(Boolean)
    .join(' ');
  const selectedSources = selectStudyMaterialUnits(db, course, input);
  const aiSettings = getAiSettings(db);

  const totalSteps = selectedSources.length + 1;
  const steps: StudyReportStepInfo[] = [];
  const mapOutputs: MapSourceOutput[] = [];

  // Map Phase: process each selected source or note individually
  for (let i = 0; i < selectedSources.length; i++) {
    assertNotAborted(options?.signal);
    const source = selectedSources[i];
    const mapStep: StudyReportStepInfo = {
      stepNumber: i + 1,
      totalSteps,
      stage: 'map',
      label: `Analizando ${source.sourceType === 'note' ? 'nota' : 'fuente'} ${i + 1}/${selectedSources.length}: ${source.title}`,
      sourceId: source.id,
      sourceTitle: source.title,
    };
    steps.push(mapStep);
    options?.onStep?.(mapStep);

    const sampledContent = sampleSourceContentForMap(
      source,
      MAX_MAP_SOURCE_CHARS
    );

    let summaryText: string;
    let usedFallback = false;

    try {
      const completion = await generateChatCompletion({
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.chatModel,
        messages: buildMapPrompts({
          course,
          source,
          sampledContent,
          reportType: input.reportType,
          examFormat: resolvedExamFormat,
          customInstructions,
        }),
        keepAlive: '0s',
        fetchImpl: options?.fetchFn,
        signal: options?.signal,
        stream: options?.stream,
      });
      summaryText = completion.content;
    } catch (err) {
      if (err instanceof OllamaCancelledError || options?.signal?.aborted) {
        throw err instanceof OllamaCancelledError
          ? err
          : new OllamaCancelledError(
              'La generación del informe fue cancelada por el usuario.'
            );
      }
      usedFallback = true;
      summaryText = buildLocalMapSummary(
        source,
        sampledContent,
        input.reportType,
        customInstructions
      );
    }

    mapOutputs.push({
      source,
      sampledContent,
      summaryText,
      usedFallback,
    });
  }

  assertNotAborted(options?.signal);

  const title =
    input.title?.trim() ||
    `${DEFAULT_TITLE_PREFIXES[input.reportType]} — ${course.name}`;

  // Reduce Phase: synthesize all Map outputs into final Markdown
  const reduceStep: StudyReportStepInfo = {
    stepNumber: totalSteps,
    totalSteps,
    stage: 'reduce',
    label: `Sintetizando material final (${REPORT_TYPE_LABELS[input.reportType]})`,
  };
  steps.push(reduceStep);
  options?.onStep?.(reduceStep);

  let content: string;
  let modelUsed: string;

  try {
    const reduceCompletion = await generateChatCompletion({
      baseUrl: aiSettings.baseUrl,
      model: aiSettings.chatModel,
      messages: buildReducePrompts({
        course,
        title,
        reportType: input.reportType,
        examFormat: resolvedExamFormat,
        customInstructions,
        mapOutputs,
        reportLanguage: input.reportLanguage,
        citeSources: input.citeSources,
      }),
      keepAlive: '0s',
      fetchImpl: options?.fetchFn,
      signal: options?.signal,
      stream: options?.stream,
      onToken: options?.onToken,
    });
    content = reduceCompletion.content;
    modelUsed = reduceCompletion.modelUsed || aiSettings.chatModel;
  } catch (err) {
    if (err instanceof OllamaCancelledError || options?.signal?.aborted) {
      throw err instanceof OllamaCancelledError
        ? err
        : new OllamaCancelledError(
            'La generación del informe fue cancelada por el usuario.'
          );
    }
    modelUsed = LOCAL_REPORT_FALLBACK_MODEL;
    content = buildLocalReduceFallback({
      course,
      title,
      reportType: input.reportType,
      examFormat: resolvedExamFormat,
      customInstructions,
      mapOutputs,
    });
  }

  let note: NoteWithCourse | null = null;
  if (input.autoSaveAsNote !== false) {
    note = createNote(db, {
      courseId: course.id,
      title,
      content,
      origin: REPORT_TYPE_TO_NOTE_ORIGIN[input.reportType],
      examStage: stageFilter ?? 'general',
    });
  }

  return {
    reportType: input.reportType,
    examFormat: resolvedExamFormat,
    title,
    content,
    sourcesUsed: selectedSources.map((source) => ({
      sourceId: source.id,
      title: source.title,
      pageCount: source.pageCount,
      chunkCount: source.chunks.length || source.chunkCount,
    })),
    steps,
    modelUsed,
    note,
  };
}
