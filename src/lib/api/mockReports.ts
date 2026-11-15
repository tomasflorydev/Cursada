import type {
  GenerateStudyReportInput,
  GenerateStudyReportResult,
  NoteOrigin,
  NoteWithCourse,
  PracticeExamFormat,
  Source,
  SourceWithChunks,
  StudyReportStepInfo,
  StudyReportType,
} from '../../types/domain';
import { mockGetCourse } from './mockCourses';
import { mockCreateNote } from './mockNotes';
import { mockCheckOllamaStatus, mockGetAiSettings } from './mockOllama';
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

  const allSources = await mockListSources(course.id);
  const readySources = allSources.filter(
    (source) => source.indexingStatus === 'ready'
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

    if (selectedBaseSources.length === 0) {
      throw new Error(
        'No hay fuentes indexadas que coincidan con la selección.'
      );
    }
  } else {
    if (readySources.length === 0) {
      throw new Error(
        `La materia "${course.name}" no tiene fuentes indexadas listas para generar material.`
      );
    }
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

  const totalSteps = selectedSourcesWithChunks.length + 1;
  const steps: StudyReportStepInfo[] = selectedSourcesWithChunks.map(
    (src, idx) => ({
      stepNumber: idx + 1,
      totalSteps,
      stage: 'map',
      label: `Analizando fuente ${idx + 1}/${selectedSourcesWithChunks.length}: ${src.title}`,
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
  const modelUsed =
    health.status === 'connected'
      ? aiSettings.chatModel
      : 'local-map-reduce-fallback';

  const customInstructions = (input.customInstructions ?? '').trim();
  const title =
    input.title?.trim() ||
    `${DEFAULT_TITLE_PREFIXES[input.reportType]} — ${course.name}`;

  const content = buildMockReportMarkdown({
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
