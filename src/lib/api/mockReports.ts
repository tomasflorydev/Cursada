import type {
  ExamStageTag,
  GenerateStudyReportInput,
  GenerateStudyReportResult,
  NoteOrigin,
  NoteWithCourse,
  PracticeExamFormat,
  SaveStudyReportInput,
  Source,
  SourceWithChunks,
  StoredReport,
  StudyReportStepInfo,
  StudyReportType,
} from '../../types/domain';
import { mockGetCourse } from './mockCourses';
import { mockCreateNote, mockListNotes } from './mockNotes';
import {
  mockCheckOllamaStatus,
  mockGetAiSettings,
  tryBrowserOllamaChatCompletion,
} from './mockOllama';
import { mockGetSourceWithChunks, mockListSources } from './mockSources';

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

function extractSentencesFromSource(
  source: SourceWithChunks,
  limit = 4
): string[] {
  const rawJoined =
    source.chunks.length > 0
      ? source.chunks.map((c) => c.content).join('\n')
      : source.rawText;

  const cleanedLines = rawJoined
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

  return unique.length > 0
    ? unique
    : [`Contenidos principales de "${source.title}".`];
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function buildMockPracticeExamMarkdown(params: {
  title: string;
  courseName: string;
  examFormat: PracticeExamFormat;
  customInstructions: string;
  sources: SourceWithChunks[];
}): string {
  const { title, courseName, examFormat, customInstructions, sources } = params;

  const lines: string[] = [
    `# ${title}`,
    '',
    `> **Materia:** ${courseName} · **Modalidad:** ${EXAM_FORMAT_LABELS[examFormat]} · **Fuentes:** ${sources
      .map((s) => s.title)
      .join(', ')}`,
  ];

  if (customInstructions) {
    lines.push(`> **Instrucciones aplicadas:** ${customInstructions}`);
  }

  const pools = sources.map((src) => ({
    title: src.title,
    sentences: extractSentencesFromSource(src, 4),
  }));

  const mcCount =
    examFormat === 'multiple_choice'
      ? Math.max(3, Math.min(6, pools.length * 2))
      : examFormat === 'mixed'
        ? Math.max(2, Math.min(4, pools.length + 1))
        : 0;

  const devCount =
    examFormat === 'develop'
      ? Math.max(3, Math.min(6, pools.length * 2))
      : examFormat === 'mixed'
        ? Math.max(2, Math.min(3, pools.length))
        : 0;

  const answers: string[] = [];
  let qNum = 1;

  lines.push('', '## Consignas', '');

  for (let i = 0; i < mcCount; i++) {
    const pool = pools[i % pools.length];
    const accurate = trimCleanly(pool.sentences[i % pool.sentences.length], 180);
    const letters = ['A', 'B', 'C', 'D'] as const;
    const correctIndex = i % 4;
    const distractors = [
      `La fuente "${pool.title}" sostiene que este concepto carece de aplicación en ${courseName}.`,
      `No existe relación entre este principio y las definiciones de "${pool.title}".`,
      `Se trata de una regla opuesta a la descripta en "${pool.title}".`,
    ];

    let distractorIdx = 0;
    const optionLines = letters.map((letter, idx) => {
      const text = idx === correctIndex ? accurate : distractors[distractorIdx++];
      return `- **${letter})** ${text}`;
    });

    lines.push(
      `### ${qNum}. Opción múltiple — ${pool.title}`,
      '',
      `De acuerdo con **${pool.title}**, ¿qué enunciado describe correctamente el tema?`,
      '',
      ...optionLines,
      ''
    );

    answers.push(
      `${qNum}. **${letters[correctIndex]})** — Según *${pool.title}*: "${accurate}"`
    );
    qNum += 1;
  }

  for (let i = 0; i < devCount; i++) {
    const pool = pools[i % pools.length];
    const excerpt = trimCleanly(
      pool.sentences[(i + 1) % pool.sentences.length],
      180
    );
    const focusClause = customInstructions
      ? ` Enfocá tu respuesta considerando: *${customInstructions}*.`
      : '';

    lines.push(
      `### ${qNum}. Desarrollo — ${pool.title}`,
      '',
      `Explicá y ejemplificá el eje conceptual extraído de **${pool.title}**:${focusClause}`,
      '',
      `> *"${excerpt}"*`,
      ''
    );

    answers.push(
      `${qNum}. **(Desarrollo · ${pool.title})** — Criterio esperado: desarrollar los fundamentos de "${excerpt}" y vincularlos con los objetivos de ${courseName}.`
    );
    qNum += 1;
  }

  lines.push('## Clave de respuestas / corrección', '', ...answers, '');
  return lines.join('\n');
}

function buildMockReportMarkdown(params: {
  title: string;
  courseName: string;
  courseTerm: string;
  reportType: StudyReportType;
  examFormat: PracticeExamFormat | null;
  customInstructions: string;
  sources: SourceWithChunks[];
}): string {
  const {
    title,
    courseName,
    courseTerm,
    reportType,
    examFormat,
    customInstructions,
    sources,
  } = params;

  if (reportType === 'practice_exam') {
    return buildMockPracticeExamMarkdown({
      title,
      courseName,
      examFormat: examFormat ?? 'mixed',
      customInstructions,
      sources,
    });
  }

  const sourceNames = sources.map((s) => s.title).join(', ');
  const lines: string[] = [
    `# ${title}`,
    '',
    `> **Materia:** ${courseName} (${courseTerm}) · **Tipo:** ${REPORT_TYPE_LABELS[reportType]} · **Fuentes (${sources.length}):** ${sourceNames}`,
  ];

  if (customInstructions) {
    lines.push(`> **Instrucciones aplicadas:** ${customInstructions}`);
  }

  const extractedPerSource = sources.map((src) => ({
    source: src,
    sentences: extractSentencesFromSource(src, 4),
  }));

  if (reportType === 'summary') {
    lines.push('', '## Síntesis general', '');
    for (const entry of extractedPerSource) {
      lines.push(`- **${entry.source.title}:** ${entry.sentences[0]}`);
    }

    lines.push('', '## Puntos clave por fuente', '');
    for (const entry of extractedPerSource) {
      lines.push(`### ${entry.source.title}`, '');
      for (const sentence of entry.sentences) {
        lines.push(`- ${sentence}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  if (reportType === 'report') {
    lines.push(
      '',
      '## Introducción',
      '',
      `Este informe académico integra ${sources.length} ${
        sources.length === 1 ? 'fuente indexada' : 'fuentes indexadas'
      } de **${courseName}**${
        customInstructions
          ? `, orientando el análisis hacia: *${customInstructions}*`
          : ''
      }.`,
      '',
      '## Ejes temáticos desarrollados',
      ''
    );

    for (const entry of extractedPerSource) {
      lines.push(`### ${entry.source.title}`, '');
      for (const sentence of entry.sentences) {
        lines.push(`- ${sentence}`);
      }
      lines.push('');
    }

    lines.push(
      '## Comparación entre fuentes',
      '',
      '| Fuente | Páginas | Fragmentos | Eje principal |',
      '| :--- | ---: | ---: | :--- |'
    );
    for (const entry of extractedPerSource) {
      lines.push(
        `| ${escapeTableCell(entry.source.title)} | ${entry.source.pageCount} | ${entry.source.chunks.length} | ${escapeTableCell(trimCleanly(entry.sentences[0], 120))} |`
      );
    }

    lines.push(
      '',
      '## Conclusiones',
      '',
      `La articulación de ${sourceNames} consolida los conceptos centrales de **${courseName}** para su aplicación práctica y evaluación.`
    );
    lines.push('');
    return lines.join('\n');
  }

  // 'study_guide'
  lines.push(
    '',
    '## Objetivos de aprendizaje',
    '',
    `- Dominar los conceptos fundamentales de ${sourceNames}.`,
    `- Integrar definiciones, relaciones y criterios de aplicación en **${courseName}**.`
  );
  if (customInstructions) {
    lines.push(`- Priorizar el enfoque solicitado: ${customInstructions}.`);
  }

  lines.push('', '## Conceptos clave y definiciones', '');
  for (const entry of extractedPerSource) {
    lines.push(`### ${entry.source.title}`, '');
    for (const sentence of entry.sentences) {
      lines.push(`- ${sentence}`);
    }
    lines.push('');
  }

  lines.push(
    '## Cuadro comparativo',
    '',
    '| Fuente | Páginas | Idea central |',
    '| :--- | ---: | :--- |'
  );
  for (const entry of extractedPerSource) {
    lines.push(
      `| ${escapeTableCell(entry.source.title)} | ${entry.source.pageCount} | ${escapeTableCell(trimCleanly(entry.sentences[0], 120))} |`
    );
  }

  lines.push('', '## Preguntas de autoevaluación', '');
  extractedPerSource.forEach((entry, idx) => {
    lines.push(
      `${idx + 1}. ¿Cómo se fundamenta en **${entry.source.title}** la idea: *"${trimCleanly(entry.sentences[0], 140)}"*?`
    );
  });

  lines.push('', '## Checklist de repaso', '');
  for (const entry of extractedPerSource) {
    lines.push(`- [ ] Repasar **${entry.source.title}** (${entry.source.pageCount} págs.)`);
  }
  lines.push('- [ ] Responder las preguntas de autoevaluación sin mirar los apuntes');
  lines.push('');
  return lines.join('\n');
}

const EXAM_STAGE_LABELS: Record<ExamStageTag, string> = {
  parcial_1: '1° Parcial',
  parcial_2: '2° Parcial',
  final: 'Final',
  general: 'General',
};

function mockNoteToSourceWithChunks(note: NoteWithCourse): SourceWithChunks {
  const rawText = note.content.trim() || note.title.trim();
  const paragraphs = rawText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks =
    paragraphs.length > 0
      ? paragraphs.map((p, idx) => ({
          id: `${note.id}-note-chunk-${idx}`,
          sourceId: note.id,
          courseId: note.courseId,
          chunkIndex: idx,
          pageNumber: null,
          content: p,
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

export async function mockGenerateStudyReport(
  input: GenerateStudyReportInput
): Promise<GenerateStudyReportResult> {
  const courseId = (input.courseId ?? '').trim();
  if (!courseId) {
    throw new Error('Seleccioná una materia válida para generar el material.');
  }

  const course = await mockGetCourse(courseId);
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

  const allSources = await mockListSources(course.id);
  const readySources = allSources.filter(
    (source) =>
      source.indexingStatus === 'ready' &&
      (!stageFilter || (source.examStage ?? 'general') === stageFilter)
  );

  let selectedBaseSources: Source[];
  if (input.sourceIds !== undefined) {
    const requestedIds = input.sourceIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    const readyById = new Map(readySources.map((src) => [src.id, src]));
    const seen = new Set<string>();
    selectedBaseSources = [];

    for (const id of requestedIds) {
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

  const selectedSourcesWithChunks: SourceWithChunks[] = [];
  for (const base of selectedBaseSources) {
    const full = await mockGetSourceWithChunks(base.id);
    if (full) {
      selectedSourcesWithChunks.push(full);
    } else {
      selectedSourcesWithChunks.push({ ...base, chunks: [] });
    }
  }

  const wantsNotes =
    input.includeNotes !== false &&
    (input.includeNotes === true ||
      input.noteIds !== undefined ||
      (stageFilter !== null && input.sourceIds === undefined));

  if (wantsNotes) {
    const candidateNotes = await mockListNotes({
      courseId: course.id,
      examStage: stageFilter ?? undefined,
    });
    let selectedNotes: NoteWithCourse[] = [];
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
    for (const note of selectedNotes) {
      selectedSourcesWithChunks.push(mockNoteToSourceWithChunks(note));
    }
  }

  if (selectedSourcesWithChunks.length === 0) {
    if (input.sourceIds !== undefined || input.noteIds !== undefined) {
      throw new Error(
        'No hay fuentes indexadas que coincidan con la selección.'
      );
    }
    if (stageFilter) {
      throw new Error(
        `La materia "${course.name}" no tiene fuentes indexadas listas ni notas para ${EXAM_STAGE_LABELS[stageFilter]}.`
      );
    }
    throw new Error(
      `La materia "${course.name}" no tiene fuentes indexadas listas para generar material.`
    );
  }

  const totalSteps = selectedSourcesWithChunks.length + 1;
  const steps: StudyReportStepInfo[] = selectedSourcesWithChunks.map(
    (src, idx) => ({
      stepNumber: idx + 1,
      totalSteps,
      stage: 'map',
      label: `Analizando ${src.sourceType === 'note' ? 'nota' : 'fuente'} ${idx + 1}/${selectedSourcesWithChunks.length}: ${src.title}`,
      sourceId: src.id,
      sourceTitle: src.title,
    })
  );

  steps.push({
    stepNumber: totalSteps,
    totalSteps,
    stage: 'reduce',
    label: `Sintetizando material final (${REPORT_TYPE_LABELS[input.reportType]})`,
  });

  const [aiSettings, health] = await Promise.all([
    mockGetAiSettings(),
    mockCheckOllamaStatus(),
  ]);
  const isVitest = typeof process !== 'undefined' && Boolean(process.env?.VITEST);

  const stageInstruction = stageFilter
    ? `Instancia de evaluación objetivo: ${EXAM_STAGE_LABELS[stageFilter]}.`
    : '';
  const rawCustomInstructions = (input.customInstructions ?? '').trim();
  const customInstructions = [stageInstruction, rawCustomInstructions]
    .filter(Boolean)
    .join(' ');
  const title =
    input.title?.trim() ||
    `${DEFAULT_TITLE_PREFIXES[input.reportType]} — ${course.name}`;

  let liveMarkdown: string | null = null;
  let liveModelUsed: string | null = null;

  if (health.status === 'connected' && !isVitest) {
    const mappedSummaries: string[] = [];
    let mapFailed = false;

    for (const src of selectedSourcesWithChunks) {
      const sourceText = src.chunks
        .map((chunk) => chunk.content.trim())
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 6000);

      if (!sourceText) {
        mappedSummaries.push(`### ${src.title}\nSin contenido indexado disponible.`);
        continue;
      }

      const mapReply = await tryBrowserOllamaChatCompletion({
        timeoutMs: 90_000,
        messages: [
          {
            role: 'system',
            content:
              'Sos un asistente académico universitario. Extraé los conceptos clave, definiciones, fórmulas, ejemplos y temas evaluables del material en español, de forma estructurada y fiel al texto.',
          },
          {
            role: 'user',
            content: [
              `Materia: ${course.name}`,
              `Tipo de material objetivo: ${REPORT_TYPE_LABELS[input.reportType]}`,
              customInstructions ? `Instrucciones del estudiante: ${customInstructions}` : '',
              `Fuente: "${src.title}" (${src.sourceType})`,
              `\nContenido:\n${sourceText}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      });

      if (!mapReply) {
        mapFailed = true;
        break;
      }
      mappedSummaries.push(`### ${src.title}\n${mapReply.content}`);
    }

    if (!mapFailed && mappedSummaries.length > 0) {
      const examConstraint =
        input.reportType === 'practice_exam'
          ? `Formato de parcial requerido: ${resolvedExamFormat}. Incluí obligatoriamente una sección final llamada "## Clave de respuestas / corrección" con las respuestas o criterios de corrección.`
          : '';

      const reduceReply = await tryBrowserOllamaChatCompletion({
        timeoutMs: 120_000,
        messages: [
          {
            role: 'system',
            content: [
              `Sos un docente y asistente de estudio universitario para la materia "${course.name}".`,
              input.reportLanguage === 'en'
                ? 'Generate a clean, well-structured Markdown study document in English.'
                : input.reportLanguage === 'auto'
                  ? 'Generate a clean Markdown study document in the predominant language of the sources.'
                  : 'Generá un documento en Markdown limpio, claro y bien estructurado en español.',
              input.citeSources === false
                ? 'Do not include numeric citation markers ([1], [2]).'
                : 'Preservá citas verificables cuando correspondan.',
              'Usá únicamente la información sintetizada de las fuentes provistas.',
              examConstraint,
            ]
              .filter(Boolean)
              .join(' '),
          },
          {
            role: 'user',
            content: [
              `Título: ${title}`,
              `Tipo de material: ${REPORT_TYPE_LABELS[input.reportType]}`,
              customInstructions ? `Instrucciones del estudiante: ${customInstructions}` : '',
              `\nSíntesis por fuente:\n${mappedSummaries.join('\n\n')}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      });

      if (reduceReply) {
        liveMarkdown = reduceReply.content;
        liveModelUsed = reduceReply.modelUsed;
      }
    }
  }

  const modelUsed =
    liveModelUsed ??
    (isVitest && health.status === 'connected'
      ? aiSettings.chatModel
      : 'local-map-reduce-fallback');

  const content =
    liveMarkdown ??
    buildMockReportMarkdown({
      title,
      courseName: course.name,
      courseTerm: course.term,
      reportType: input.reportType,
      examFormat: resolvedExamFormat,
      customInstructions,
      sources: selectedSourcesWithChunks,
    });

  let note: NoteWithCourse | null = null;
  if (input.autoSaveAsNote !== false) {
    note = await mockCreateNote({
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
    sourcesUsed: selectedSourcesWithChunks.map((src) => ({
      sourceId: src.id,
      title: src.title,
      pageCount: src.pageCount,
      chunkCount: src.chunks.length || src.chunkCount,
    })),
    steps,
    modelUsed,
    note,
  };
}

const INITIAL_MOCK_REPORTS: StoredReport[] = [
  {
    id: 'report-bd2-parcial',
    courseId: 'bd-2',
    courseName: 'Base de Datos II',
    title: 'Resumen para el parcial de Base de Datos',
    reportType: 'summary',
    createdAt: '2026-11-15T20:50:00.000Z',
    updatedAt: '2026-11-15T20:50:00.000Z',
    summaryLine: 'Generado desde 6 notas y 2 PDFs.',
    notesCount: 6,
    pdfsCount: 2,
    usedLocalModel: true,
    modelLabel: 'modelo local',
    noteId: 'note-3',
    citations: [
      {
        index: 1,
        kind: 'note',
        id: 'note-3',
        title: 'Niveles de aislamiento y fenómenos de lectura',
        snippet:
          'Dirty read, non-repeatable read y phantom read en READ COMMITTED vs REPEATABLE READ.',
      },
      {
        index: 2,
        kind: 'note',
        id: 'note-3',
        title: 'Normalización y dependencias funcionales',
        snippet:
          'En 3FN ningún atributo no clave depende de otro atributo no clave (dependencia transitiva).',
      },
      {
        index: 3,
        kind: 'note',
        id: 'note-3',
        title: 'Índices B+Tree y planes de ejecución',
        snippet:
          'Los índices compuestos requieren respetar el prefijo izquierdo en predicados de búsqueda.',
      },
    ],
    content: [
      '## Síntesis ejecutiva',
      'Los temas con mayor peso en evaluaciones recientes son aislamiento transaccional, normalización y optimización de consultas con índices [1][2][3]. Conviene verificar siempre dependencias transitivas antes de definir claves candidatas [2].',
      '## Transacciones y aislamiento',
      'En READ COMMITTED se evitan lecturas sucias pero siguen ocurriendo lecturas no repetibles; SERIALIZABLE garantiza equivalencia con ejecución en serie mediante bloqueos o control multiversión [1].',
      '## Diseño relacional e índices',
      'Para eliminar dependencias parciales se normaliza hasta 2FN y para eliminar transitivas hasta 3FN [2]. Recordar armar un apunte dedicado de índices compuestos y cobertura de consultas [3].',
    ].join('\n\n'),
  },
  {
    id: 'report-is1-guia',
    courseId: 'ing-soft-1',
    courseName: 'Ingeniería de Software I',
    title: 'Guía de estudio: Métricas ágiles y criterios INVEST',
    reportType: 'study_guide',
    createdAt: '2026-11-14T18:15:00.000Z',
    updatedAt: '2026-11-14T18:15:00.000Z',
    summaryLine: 'Generado desde 4 notas.',
    notesCount: 4,
    pdfsCount: 0,
    usedLocalModel: true,
    modelLabel: 'modelo local',
    noteId: 'note-1',
    citations: [
      {
        index: 1,
        kind: 'note',
        id: 'note-1',
        title: 'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica',
        snippet:
          'La velocidad mide capacidad histórica del equipo y no debe utilizarse para comparar equipos distintos.',
      },
    ],
    content: [
      '## Foco de repaso',
      'Diferenciar story points de horas ideales y aplicar los seis criterios INVEST al refinar historias de usuario [1].',
      '## Checklist de conceptos',
      'Repasar cycle time, definición de terminado (DoD) y trade-offs al contraer deuda técnica deliberada [1].',
    ].join('\n\n'),
  },
];

let mockStudyReportsStore: StoredReport[] = structuredClone(INITIAL_MOCK_REPORTS);
let nextMockReportSeq = 1;

export function resetMockStudyReports(): void {
  mockStudyReportsStore = structuredClone(INITIAL_MOCK_REPORTS);
  nextMockReportSeq = 1;
}

export function mockDeleteStudyReportsByCourse(courseId: string): void {
  mockStudyReportsStore = mockStudyReportsStore.filter(
    (item) => item.courseId !== courseId
  );
}

export async function mockListStudyReports(
  courseId?: string
): Promise<StoredReport[]> {
  const trimmed = (courseId ?? '').trim();
  const filtered = trimmed
    ? mockStudyReportsStore.filter((item) => item.courseId === trimmed)
    : mockStudyReportsStore;
  return structuredClone(
    [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  );
}

export async function mockGetStudyReportById(
  id: string
): Promise<StoredReport | null> {
  const found = mockStudyReportsStore.find((item) => item.id === id);
  return found ? structuredClone(found) : null;
}

export async function mockSaveStudyReport(
  input: SaveStudyReportInput
): Promise<StoredReport> {
  const course = await mockGetCourse(input.courseId);
  const now = new Date().toISOString();
  const existingIdx = input.id
    ? mockStudyReportsStore.findIndex((item) => item.id === input.id)
    : -1;
  const existing = existingIdx >= 0 ? mockStudyReportsStore[existingIdx] : null;
  const id = (input.id ?? '').trim() || `report-${Date.now()}-${nextMockReportSeq++}`;

  const saved: StoredReport = {
    id,
    courseId: input.courseId,
    courseName: (input.courseName ?? '').trim() || course?.name || existing?.courseName || 'Materia',
    title: (input.title ?? '').trim() || existing?.title || 'Informe',
    reportType: input.reportType,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    summaryLine: (input.summaryLine ?? '').trim(),
    content: input.content,
    notesCount: Number(input.notesCount ?? 0),
    pdfsCount: Number(input.pdfsCount ?? 0),
    usedLocalModel: Boolean(input.usedLocalModel),
    modelLabel: (input.modelLabel ?? '').trim() || 'síntesis offline',
    noteId: input.noteId ?? null,
    citations: structuredClone(input.citations ?? []),
    sourceIds: input.sourceIds ? [...input.sourceIds] : undefined,
    noteIds: input.noteIds ? [...input.noteIds] : undefined,
    examStage: input.examStage ?? 'all',
    includeNotes: input.includeNotes ?? true,
    examFormat: input.examFormat,
    customInstructions: input.customInstructions,
  };

  if (existingIdx >= 0) {
    mockStudyReportsStore[existingIdx] = saved;
  } else {
    mockStudyReportsStore = [saved, ...mockStudyReportsStore];
  }

  return structuredClone(saved);
}

export async function mockDeleteStudyReport(id: string): Promise<void> {
  mockStudyReportsStore = mockStudyReportsStore.filter((item) => item.id !== id);
}
