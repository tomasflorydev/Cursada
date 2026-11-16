import type {
  ExamStageTag,
  NoteWithCourse,
  PracticeExamFormat,
  PracticeExamQuestionItem,
  PracticeExamSimulationAttempt,
  Source,
} from '../../types/domain';

export interface BuildInteractivePracticeExamParams {
  courseId: string;
  courseName: string;
  examStage?: ExamStageTag | 'all';
  sources: Source[];
  notes: NoteWithCourse[];
  questionCount?: number;
  format?: PracticeExamFormat;
  generatedMarkdown?: string;
}

export interface GradePracticeExamAttemptParams {
  courseId: string;
  courseName: string;
  examStage: ExamStageTag | 'all';
  questions: PracticeExamQuestionItem[];
  answers: Record<string, string>;
}

export interface EvaluatedQuestionResult {
  status: 'correct' | 'incorrect' | 'review';
  isCorrect: boolean;
  userAnswer: string;
}

interface MaterialUnit {
  id: string;
  kind: 'note' | 'source';
  title: string;
  citationIndex: number;
  pageLabel?: string;
  sentences: string[];
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
type OptionLetter = (typeof OPTION_LETTERS)[number];

const EXAM_STAGE_LABELS: Record<ExamStageTag | 'all', string> = {
  parcial_1: '1° Parcial',
  parcial_2: '2° Parcial',
  final: 'Final',
  general: 'General',
  all: 'Todas las instancias',
};

function trimCleanly(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const sliced = normalized.slice(0, maxChars);
  const lastBreak = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf(' '));
  if (lastBreak > Math.floor(maxChars * 0.6)) {
    return `${sliced.slice(0, lastBreak).trimEnd()}…`;
  }
  return `${sliced.trimEnd()}…`;
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function extractSentences(rawText: string, fallbackTitle: string): string[] {
  const cleanedLines = rawText
    .replace(/\[Pág\.\s*\d+\]\s*/g, '')
    .split(/\r?\n+/)
    .map((line) =>
      line
        .replace(/^#+\s*/, '')
        .replace(/^>\s*/, '')
        .replace(/^[-*+]\s*(\[[ xX]\]\s*)?/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim()
    )
    .filter((line) => line.length >= 18 && !line.startsWith('```') && !line.startsWith('|'));

  const sentences: string[] = [];
  for (const line of cleanedLines) {
    const parts = line
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 18);
    if (parts.length > 0) {
      sentences.push(...parts);
    } else {
      sentences.push(line);
    }
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = normalizeText(sentence);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(sentence);
    }
    if (unique.length >= 10) {
      break;
    }
  }

  return unique.length > 0
    ? unique
    : [`Contenidos fundamentales trabajados en "${fallbackTitle}".`];
}

function buildMaterialPool(params: {
  examStage?: ExamStageTag | 'all';
  sources: Source[];
  notes: NoteWithCourse[];
}): MaterialUnit[] {
  const stageFilter =
    params.examStage && params.examStage !== 'all' ? params.examStage : null;

  const readySources = params.sources.filter((src) => {
    if (stageFilter && (src.examStage ?? 'general') !== stageFilter) {
      return false;
    }
    return src.indexingStatus === 'ready' || src.rawText.trim().length > 0;
  });

  const matchingNotes = params.notes.filter((note) => {
    if (stageFilter && (note.examStage ?? 'general') !== stageFilter) {
      return false;
    }
    return note.content.trim().length > 0 || note.title.trim().length > 0;
  });

  const pool: MaterialUnit[] = [];

  for (const src of readySources) {
    pool.push({
      id: src.id,
      kind: 'source',
      title: src.title,
      citationIndex: pool.length + 1,
      pageLabel: src.sourceType === 'pdf' ? 'p. 1' : undefined,
      sentences: extractSentences(src.rawText, src.title),
    });
  }

  for (const note of matchingNotes) {
    pool.push({
      id: note.id,
      kind: 'note',
      title: note.title,
      citationIndex: pool.length + 1,
      sentences: extractSentences(note.content, note.title),
    });
  }

  return pool;
}

function matchMaterialUnit(
  hintText: string,
  materials: MaterialUnit[],
  fallbackIndex: number
): MaterialUnit | null {
  if (materials.length === 0) {
    return null;
  }
  const normalizedHint = normalizeText(hintText);
  if (normalizedHint) {
    const exactMatch = materials.find((m) =>
      normalizedHint.includes(normalizeText(m.title))
    );
    if (exactMatch) {
      return exactMatch;
    }
  }
  return materials[fallbackIndex % materials.length];
}

interface ParsedAnswerKeyEntry {
  correctOption?: OptionLetter;
  explanation: string;
  titleHint: string;
}

function parseAnswerKeySection(
  keyMarkdown: string
): Map<number, ParsedAnswerKeyEntry> {
  const map = new Map<number, ParsedAnswerKeyEntry>();
  const lines = keyMarkdown.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Patterns:
    // 1. **(Multiple Choice · Title)**: **B)** — ...
    // - **Pregunta 1**: Respuesta correcta **B** (...).
    // 1. **B)** — Según *Title*: "..."
    const numMatch =
      /^(?:[-*]\s*)?(?:\*{0,2}Pregunta\s+)?(\d+)[.):\s*]+(.+)$/i.exec(line);
    if (!numMatch) continue;

    const qNum = Number(numMatch[1]);
    const rest = numMatch[2].trim();
    if (!Number.isInteger(qNum) || qNum <= 0) continue;

    const optMatch =
      /\bRespuesta\s+correcta\s+\*{0,2}([A-D])\*{0,2}|\*{0,2}([A-D])\)\*{0,2}/i.exec(
        rest
      );
    const letter = (optMatch?.[1] ?? optMatch?.[2])?.toUpperCase() as
      | OptionLetter
      | undefined;

    const titleHintMatch = /\*([^*]+)\*/.exec(rest);
    const cleanedExplanation = rest
      .replace(/^\*{0,2}\((?:Multiple Choice|Desarrollo)\s*·[^)]+\)\*{0,2}[:\s—-]*/i, '')
      .replace(/\*\*/g, '')
      .trim();

    map.set(qNum, {
      correctOption:
        letter && OPTION_LETTERS.includes(letter) ? letter : undefined,
      explanation: cleanedExplanation || rest.replace(/\*\*/g, '').trim(),
      titleHint: titleHintMatch?.[1] ?? rest,
    });
  }

  return map;
}

function parseGeneratedPracticeExamMarkdown(params: {
  markdown: string;
  materials: MaterialUnit[];
  courseName: string;
}): PracticeExamQuestionItem[] {
  const { markdown, materials, courseName } = params;
  const trimmed = markdown.trim();
  if (!trimmed) {
    return [];
  }

  const keyHeadingMatch =
    /^##\s+(?:Clave de respuestas(?:\s*\/\s*corrección)?|Respuestas|Corrección)\b/im.exec(
      trimmed
    );
  const questionsSection = keyHeadingMatch
    ? trimmed.slice(0, keyHeadingMatch.index)
    : trimmed;
  const keySection = keyHeadingMatch
    ? trimmed.slice(keyHeadingMatch.index + keyHeadingMatch[0].length)
    : '';

  const answerKey = parseAnswerKeySection(keySection);
  const lines = questionsSection.split(/\r?\n/);

  interface RawParsedQuestion {
    number: number;
    headingTitleHint: string;
    promptLines: string[];
    options: Array<{ letter: OptionLetter; text: string }>;
  }

  const parsedBlocks: RawParsedQuestion[] = [];
  let current: RawParsedQuestion | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingQuestionMatch =
      /^###\s*(\d+)\.\s*(?:Opción múltiple|Multiple Choice|Desarrollo)?\s*(?:[—–-]\s*(.+))?$/i.exec(
        line
      );
    const numberedQuestionMatch =
      !headingQuestionMatch && /^(\d+)\.\s+(.+)$/.exec(line);

    if (headingQuestionMatch) {
      if (current) parsedBlocks.push(current);
      current = {
        number: Number(headingQuestionMatch[1]),
        headingTitleHint: (headingQuestionMatch[2] ?? '').trim(),
        promptLines: [],
        options: [],
      };
      continue;
    }

    if (numberedQuestionMatch) {
      if (current) parsedBlocks.push(current);
      current = {
        number: Number(numberedQuestionMatch[1]),
        headingTitleHint: '',
        promptLines: [numberedQuestionMatch[2].trim()],
        options: [],
      };
      continue;
    }

    if (!current) continue;

    const optionMatch =
      /^(?:[-*]\s*)?\*{0,2}([A-D])[).]\*{0,2}\s+(.+)$/i.exec(line);
    if (optionMatch) {
      const letter = optionMatch[1].toUpperCase() as OptionLetter;
      if (OPTION_LETTERS.includes(letter)) {
        current.options.push({
          letter,
          text: optionMatch[2].trim(),
        });
        continue;
      }
    }

    if (!line.startsWith('#')) {
      const cleanLine = line.replace(/^>\s*/, '').trim();
      if (cleanLine) {
        current.promptLines.push(cleanLine);
      }
    }
  }
  if (current) {
    parsedBlocks.push(current);
  }

  if (parsedBlocks.length === 0) {
    return [];
  }

  return parsedBlocks.map((block, index) => {
    const qNumber = index + 1;
    const keyEntry = answerKey.get(block.number) ?? answerKey.get(qNumber);
    const prompt = block.promptLines
      .join(' ')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .trim();
    const matchedMaterial = matchMaterialUnit(
      `${block.headingTitleHint} ${keyEntry?.titleHint ?? ''} ${prompt}`,
      materials,
      index
    );

    const citationIndex = matchedMaterial?.citationIndex ?? 1;
    const citationTitle =
      matchedMaterial?.title || block.headingTitleHint || courseName;
    const citationSourceId = matchedMaterial?.id ?? `course-${courseName}`;
    const citationKind: 'note' | 'source' = matchedMaterial?.kind ?? 'source';
    const pageLabel = matchedMaterial?.pageLabel;

    if (block.options.length >= 2) {
      const normalizedOptions = OPTION_LETTERS.map((letter) => {
        const found = block.options.find((o) => o.letter === letter);
        return {
          letter,
          text:
            found?.text ??
            `Alternativa no aplicable según ${citationTitle}.`,
        };
      });
      const correctOption: OptionLetter = keyEntry?.correctOption ?? 'A';
      const correctText =
        normalizedOptions.find((o) => o.letter === correctOption)?.text ??
        normalizedOptions[0].text;

      return {
        id: `sim-q-${qNumber}`,
        number: qNumber,
        kind: 'multiple_choice',
        prompt:
          prompt ||
          `Según "${citationTitle}", ¿cuál es la opción correcta?`,
        options: normalizedOptions,
        correctOption,
        modelAnswer: `${correctOption}) ${correctText}`,
        explanation:
          keyEntry?.explanation ||
          `Opción correcta ${correctOption}, respaldada por "${citationTitle}".`,
        citationIndex,
        citationTitle,
        citationSourceId,
        citationKind,
        pageLabel,
      };
    }

    const fallbackModel =
      matchedMaterial?.sentences[0] ??
      `Desarrollar los conceptos clave vinculados a "${citationTitle}" en ${courseName}.`;
    return {
      id: `sim-q-${qNumber}`,
      number: qNumber,
      kind: 'develop',
      prompt:
        prompt ||
        `Explicá los fundamentos principales desarrollados en "${citationTitle}".`,
      modelAnswer: keyEntry?.explanation || fallbackModel,
      explanation:
        keyEntry?.explanation ||
        `Criterio esperado según "${citationTitle}": ${fallbackModel}`,
      citationIndex,
      citationTitle,
      citationSourceId,
      citationKind,
      pageLabel,
    };
  });
}

export function buildInteractivePracticeExam(
  params: BuildInteractivePracticeExamParams
): PracticeExamQuestionItem[] {
  const materials = buildMaterialPool({
    examStage: params.examStage,
    sources: params.sources,
    notes: params.notes,
  });

  if (params.generatedMarkdown && params.generatedMarkdown.trim()) {
    const parsed = parseGeneratedPracticeExamMarkdown({
      markdown: params.generatedMarkdown,
      materials,
      courseName: params.courseName,
    });
    if (parsed.length > 0) {
      const limit = params.questionCount
        ? Math.max(1, Math.min(parsed.length, Math.floor(params.questionCount)))
        : parsed.length;
      return parsed.slice(0, limit);
    }
  }

  if (materials.length === 0) {
    return [];
  }

  const defaultCount = Math.min(6, Math.max(4, materials.length * 2));
  const totalCount = Math.max(
    1,
    Math.min(12, Math.floor(params.questionCount ?? defaultCount))
  );
  const format: PracticeExamFormat = params.format ?? 'mixed';

  const questions: PracticeExamQuestionItem[] = [];

  for (let i = 0; i < totalCount; i++) {
    const number = i + 1;
    const material = materials[i % materials.length];
    const sentenceIdx =
      Math.floor(i / materials.length) % material.sentences.length;
    const accurateFact = trimCleanly(material.sentences[sentenceIdx], 175);

    const isMultipleChoice =
      format === 'multiple_choice'
        ? true
        : format === 'develop'
          ? false
          : i % 2 === 0;

    if (isMultipleChoice) {
      const correctIdx = i % 4;
      const correctOption = OPTION_LETTERS[correctIdx];
      const distractors = [
        `El material "${material.title}" descarta por completo este principio en ${params.courseName}.`,
        `Se trata de una regla opuesta a lo fundamentado en "${material.title}".`,
        `Este concepto carece de relación con los temas evaluables de "${material.title}".`,
      ];

      let dIdx = 0;
      const options = OPTION_LETTERS.map((letter, idx) => ({
        letter,
        text: idx === correctIdx ? accurateFact : distractors[dIdx++],
      }));

      questions.push({
        id: `sim-q-${number}`,
        number,
        kind: 'multiple_choice',
        prompt: `De acuerdo con "${material.title}", ¿cuál de las siguientes afirmaciones es correcta?`,
        options,
        correctOption,
        modelAnswer: `${correctOption}) ${accurateFact}`,
        explanation: `La respuesta correcta es ${correctOption}. En "${material.title}" se establece: "${accurateFact}".`,
        citationIndex: material.citationIndex,
        citationTitle: material.title,
        citationSourceId: material.id,
        citationKind: material.kind,
        pageLabel: material.pageLabel,
      });
    } else {
      const devSentence = trimCleanly(
        material.sentences[(sentenceIdx + 1) % material.sentences.length],
        175
      );
      questions.push({
        id: `sim-q-${number}`,
        number,
        kind: 'develop',
        prompt: `Explicá con tus palabras el concepto de "${material.title}" vinculado a: "${devSentence}" y justificá su aplicación en ${params.courseName}.`,
        modelAnswer: `Debe definir y fundamentar la idea central de "${material.title}" ("${devSentence}") articulándola con ejemplos de ${params.courseName}.`,
        explanation: `Criterio de corrección basado en "${material.title}": explicar "${devSentence}" y su alcance práctico.`,
        citationIndex: material.citationIndex,
        citationTitle: material.title,
        citationSourceId: material.id,
        citationKind: material.kind,
        pageLabel: material.pageLabel,
      });
    }
  }

  return questions;
}

function extractMatchTokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
}

export function evaluateSimulationQuestion(
  question: PracticeExamQuestionItem,
  rawAnswer: string | undefined
): EvaluatedQuestionResult {
  const userAnswer = (rawAnswer ?? '').trim();

  if (question.kind === 'multiple_choice') {
    const isCorrect =
      Boolean(question.correctOption) &&
      userAnswer.toUpperCase() === question.correctOption;
    return {
      status: isCorrect ? 'correct' : 'incorrect',
      isCorrect,
      userAnswer,
    };
  }

  if (userAnswer.length < 12) {
    return {
      status: 'review',
      isCorrect: false,
      userAnswer,
    };
  }

  const answerTokens = new Set(extractMatchTokens(userAnswer));
  const targetTokens = Array.from(
    new Set(extractMatchTokens(`${question.modelAnswer} ${question.explanation}`))
  );
  const overlap = targetTokens.filter((t) => answerTokens.has(t)).length;
  const requiredMatches = targetTokens.length <= 3 ? 1 : 2;
  const isCorrect = overlap >= requiredMatches;

  return {
    status: 'review',
    isCorrect,
    userAnswer,
  };
}

export function gradePracticeExamAttempt(
  params: GradePracticeExamAttemptParams
): PracticeExamSimulationAttempt {
  const totalCount = params.questions.length;
  let correctCount = 0;

  for (const question of params.questions) {
    const result = evaluateSimulationQuestion(
      question,
      params.answers[question.id]
    );
    if (result.isCorrect) {
      correctCount += 1;
    }
  }

  const scorePercent =
    totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  return {
    courseId: params.courseId,
    courseName: params.courseName,
    examStage: params.examStage,
    questions: params.questions,
    answers: { ...params.answers },
    scorePercent,
    correctCount,
    totalCount,
    completedAt: new Date().toISOString(),
  };
}

export function formatSimulationAttemptAsMarkdown(
  attempt: PracticeExamSimulationAttempt
): string {
  const stageLabel = EXAM_STAGE_LABELS[attempt.examStage] ?? 'General';
  const lines: string[] = [
    `# Simulacro de práctica — ${attempt.courseName}`,
    '',
    `- **Instancia:** ${stageLabel}`,
    `- **Puntaje:** ${attempt.correctCount} / ${attempt.totalCount} (${attempt.scorePercent}%)`,
    `- **Fecha:** ${attempt.completedAt.slice(0, 10)}`,
    '',
    '## Revisión pregunta por pregunta',
    '',
  ];

  for (const q of attempt.questions) {
    const evaluated = evaluateSimulationQuestion(q, attempt.answers[q.id]);
    const statusLabel =
      q.kind === 'multiple_choice'
        ? evaluated.isCorrect
          ? 'Correcta'
          : 'Incorrecta'
        : evaluated.isCorrect
          ? 'Revisar pauta (aprobada)'
          : 'Revisar pauta';

    lines.push(`### ${q.number}. ${q.prompt}`, '');
    lines.push(`- **Estado:** ${statusLabel}`);
    lines.push(
      `- **Tu respuesta:** ${evaluated.userAnswer || '_(Sin responder)_'}`
    );
    lines.push(`- **Respuesta / Pauta esperada:** ${q.modelAnswer}`);
    lines.push(`- **Explicación:** ${q.explanation}`);
    lines.push(
      `- **Cita [${q.citationIndex}]:** ${q.citationTitle}${
        q.pageLabel ? ` (${q.pageLabel})` : ''
      }`
    );
    lines.push('');
  }

  return lines.join('\n');
}
