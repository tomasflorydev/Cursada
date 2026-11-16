import type { DatabaseSync } from 'node:sqlite';
import type {
  ChatCitation,
  ChatMessage,
  ChatThread,
  ExamStageTag,
  NoteWithCourse,
  SaveChatMessageAsNoteInput,
  SendChatMessageInput,
  SendChatMessageResult,
} from '../types.js';
import { getAiSettings } from '../db/aiSettingsRepo.js';
import {
  appendChatMessage,
  createChatThread,
  getChatMessageById,
  getChatThread,
} from '../db/chatRepo.js';
import { getCourseById } from '../db/coursesRepo.js';
import { createNote, listNotes } from '../db/notesRepo.js';
import {
  cosineSimilarity,
  getSourceWithChunks,
  listSourcesByCourse,
  searchCourseChunksHybrid,
} from '../db/sourcesRepo.js';
import { chunkDocumentPages } from './chunkingService.js';
import { generateChatCompletion, type OllamaChatMessageInput } from './ollamaClient.js';
import {
  computeFallbackEmbedding,
  createOllamaSourceEmbedder,
  type SourceEmbedder,
} from './sourcesService.js';

export type SourceChunkEmbedder = SourceEmbedder;

export interface RagServiceDeps {
  embedder?: SourceEmbedder;
  fetchFn?: typeof fetch;
}

const DEFAULT_MAX_RETRIEVED_CHUNKS = 5;
const DEFAULT_MAX_HISTORY_TURNS = 6;
const DEFAULT_NOTE_TITLE = 'Respuesta del Asistente';
const MAX_DERIVED_NOTE_TITLE_LENGTH = 72;
const RRF_K = 60;
export const EXTRACTIVE_FALLBACK_MODEL_ID = 'local-rag-extractive';

const EXAM_STAGE_LABELS: Record<ExamStageTag, string> = {
  parcial_1: '1° Parcial',
  parcial_2: '2° Parcial',
  final: 'Final',
  general: 'General',
};

function normalizeSearchText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function extractMeaningfulTokens(raw: string): string[] {
  return normalizeSearchText(raw)
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

interface RetrievedCandidate {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: ChatCitation['sourceType'];
  pageNumber: number | null;
  excerpt: string;
  score: number;
  hasLexicalMatch: boolean;
}

function splitNoteIntoSearchablePieces(note: NoteWithCourse): string[] {
  const body = note.content.trim();
  if (!body) {
    return note.title.trim() ? [note.title.trim()] : [];
  }
  const chunks = chunkDocumentPages([{ pageNumber: 1, text: body }], {
    maxChars: 800,
    overlapChars: 100,
  });
  if (chunks.length > 0) {
    return chunks.map((c) => c.content);
  }
  return [body];
}

async function searchMatchingNoteCandidates(params: {
  db: DatabaseSync;
  courseId: string;
  query: string;
  queryEmbedding: Float32Array | null;
  embedder: SourceEmbedder;
  noteIds?: string[];
  examStage?: ExamStageTag | 'all';
  limit: number;
}): Promise<{ candidates: RetrievedCandidate[]; matchingNotes: NoteWithCourse[] }> {
  const { db, courseId, query, queryEmbedding, embedder, noteIds, examStage, limit } =
    params;

  let notes = listNotes(db, {
    courseId,
    examStage: examStage && examStage !== 'all' ? examStage : undefined,
  });

  if (noteIds !== undefined) {
    const requestedSet = new Set(noteIds.map((id) => id.trim()).filter(Boolean));
    notes = notes.filter((n) => requestedSet.has(n.id));
  }

  if (notes.length === 0) {
    return { candidates: [], matchingNotes: [] };
  }

  const queryTokens = extractMeaningfulTokens(query);
  const ftsMatchedNoteIds = new Set<string>();
  if (queryTokens.length > 0) {
    const safeMatchExpr = queryTokens
      .map((t) => `"${t.replace(/"/g, '""')}"*`)
      .join(' OR ');
    try {
      const ftsRows = db
        .prepare(
          `SELECT note_id FROM notes_fts WHERE notes_fts MATCH ? AND course_id = ?`
        )
        .all(safeMatchExpr, courseId) as Array<{ note_id: string }>;
      for (const row of ftsRows) {
        ftsMatchedNoteIds.add(row.note_id);
      }
    } catch {
      // Ignore FTS edge errors and rely on normalized token scan
    }
  }

  interface RawNotePiece {
    chunkId: string;
    note: NoteWithCourse;
    piece: string;
    lexicalScore: number;
    vectorScore: number;
    lexicalRank: number | null;
    vectorRank: number | null;
  }

  const rawPieces: RawNotePiece[] = [];
  for (const note of notes) {
    const pieces = splitNoteIntoSearchablePieces(note);
    pieces.forEach((piece, idx) => {
      const searchable = normalizeSearchText(`${note.title}\n${piece}`);
      const matchedCount = queryTokens.filter((token) =>
        searchable.includes(token)
      ).length;
      let lexicalScore =
        queryTokens.length > 0 ? matchedCount / queryTokens.length : 0;
      if (lexicalScore === 0 && ftsMatchedNoteIds.has(note.id)) {
        lexicalScore = 0.2;
      }
      rawPieces.push({
        chunkId: `note-${note.id}-chunk-${idx}`,
        note,
        piece,
        lexicalScore,
        vectorScore: 0,
        lexicalRank: null,
        vectorRank: null,
      });
    });
  }

  if (rawPieces.length === 0) {
    return { candidates: [], matchingNotes: notes };
  }

  if (queryEmbedding && queryEmbedding.length > 0) {
    let pieceEmbeddings: Float32Array[] | null = null;
    try {
      const embedded = await embedder(
        rawPieces.map((item) => `${item.note.title}\n${item.piece}`)
      );
      if (embedded.embeddings.length === rawPieces.length) {
        pieceEmbeddings = embedded.embeddings;
      }
    } catch {
      pieceEmbeddings = null;
    }

    const effectiveQueryVec = queryEmbedding;
    for (let i = 0; i < rawPieces.length; i++) {
      const vec =
        pieceEmbeddings?.[i] &&
        pieceEmbeddings[i].length === effectiveQueryVec.length
          ? pieceEmbeddings[i]
          : computeFallbackEmbedding(
              `${rawPieces[i].note.title}\n${rawPieces[i].piece}`,
              effectiveQueryVec.length
            );
      const sim = cosineSimilarity(effectiveQueryVec, vec);
      rawPieces[i].vectorScore =
        rawPieces[i].lexicalScore > 0 || sim >= 0.35 ? Math.max(0, sim) : 0;
    }
  }

  const lexicalSorted = rawPieces
    .filter((p) => p.lexicalScore > 0)
    .sort((a, b) => b.lexicalScore - a.lexicalScore);
  lexicalSorted.forEach((p, idx) => {
    p.lexicalRank = idx + 1;
  });

  const vectorSorted = rawPieces
    .filter((p) => p.vectorScore > 0)
    .sort((a, b) => b.vectorScore - a.vectorScore);
  vectorSorted.forEach((p, idx) => {
    p.vectorRank = idx + 1;
  });

  const candidates: RetrievedCandidate[] = [];
  for (const item of rawPieces) {
    const rrfScore =
      (item.lexicalRank !== null ? 1 / (RRF_K + item.lexicalRank) : 0) +
      (item.vectorRank !== null ? 1 / (RRF_K + item.vectorRank) : 0);
    if (rrfScore > 0) {
      candidates.push({
        chunkId: item.chunkId,
        sourceId: item.note.id,
        sourceTitle: item.note.title,
        sourceType: 'note',
        pageNumber: null,
        excerpt: item.piece.trim(),
        score: rrfScore,
        hasLexicalMatch: item.lexicalScore > 0,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    candidates: candidates.slice(0, limit),
    matchingNotes: notes,
  };
}

function formatCitationHeader(citation: ChatCitation): string {
  const pageSuffix = citation.pageNumber != null ? ` · pág. ${citation.pageNumber}` : '';
  const typeTag = citation.sourceType === 'note' ? ' (Nota)' : '';
  return `[${citation.citationNumber}] ${citation.sourceTitle}${typeTag}${pageSuffix}`;
}

function buildSystemPrompt(
  courseName: string,
  customInstructions: string,
  examStage?: ExamStageTag | 'all'
): string {
  const stageContext =
    examStage && examStage !== 'all'
      ? ` Enfoque de estudio actual: ${EXAM_STAGE_LABELS[examStage]}.`
      : '';
  const sections = [
    `Sos un asistente académico universitario para la materia "${courseName}" dentro de la aplicación Cursada.${stageContext}`,
    [
      'REGLAS ESTRICTAS DE RESPUESTA:',
      '1. Respondé siempre en español académico claro, conciso y preciso.',
      '2. Usá ÚNICA y EXCLUSIVAMENTE la información presente en los fragmentos recuperados ([1], [2], ...).',
      '3. Citá las fuentes inline junto a cada afirmación relevante usando el formato exacto [1], [2], etc.',
      '4. NO inventes definiciones, fechas, fórmulas ni detalles que no figuren en los fragmentos.',
      '5. Si los fragmentos no alcanzan para responder total o parcialmente la pregunta, decilo explícitamente indicando qué falta.',
    ].join('\n'),
  ];

  if (customInstructions) {
    sections.push(
      `INSTRUCCIONES PERSONALIZADAS DEL ESTUDIANTE (PRIORIDAD ALTA — RESPETAR EN FORMATO, TONO Y ENFOQUE):\n${customInstructions}`
    );
  }

  return sections.join('\n\n');
}

function buildUserPrompt(params: {
  question: string;
  citations: ChatCitation[];
  customInstructions: string;
}): string {
  const fragmentsBlock =
    params.citations.length > 0
      ? params.citations
          .map((citation) => `${formatCitationHeader(citation)}\n${citation.excerpt}`)
          .join('\n\n---\n\n')
      : '(No se encontraron fragmentos indexados relevantes para esta consulta en las fuentes de la materia.)';

  const parts = [
    `FRAGMENTOS RECUPERADOS DE LA MATERIA:\n${fragmentsBlock}`,
  ];

  if (params.customInstructions) {
    parts.push(`RECORDATORIO DE INSTRUCCIONES PERSONALIZADAS:\n${params.customInstructions}`);
  }

  parts.push(`CONSULTA DEL ESTUDIANTE:\n${params.question}`);

  return parts.join('\n\n');
}

function truncateInlineText(raw: string, maxLength: number): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function buildExtractiveFallbackResponse(params: {
  courseName: string;
  query: string;
  citations: ChatCitation[];
  customInstructions: string;
  ollamaBaseUrl: string;
}): string {
  if (params.citations.length === 0) {
    return [
      `No encontré fragmentos relevantes en las fuentes indexadas de **${params.courseName}** para responder "${truncateInlineText(params.query, 80)}".`,
      '',
      `Además, no se pudo establecer conexión con Ollama (${params.ollamaBaseUrl}) en este momento. Verificá que hayas cargado e indexado fuentes de la materia o revisá la configuración de IA en Ajustes.`,
    ].join('\n');
  }

  const lines = [
    `No fue posible conectar con el modelo de Ollama en este momento, por lo que muestro un resumen extractivo local basado en los fragmentos más relevantes de **${params.courseName}**:`,
    '',
  ];

  for (const citation of params.citations) {
    const pageSuffix = citation.pageNumber != null ? ` (pág. ${citation.pageNumber})` : '';
    lines.push(
      `- [${citation.citationNumber}] **${citation.sourceTitle}**${pageSuffix}: ${truncateInlineText(citation.excerpt, 280)}`
    );
  }

  if (params.customInstructions) {
    lines.push(
      '',
      `_Nota: Se conservaron tus instrucciones personalizadas ("${truncateInlineText(params.customInstructions, 120)}") para cuando Ollama vuelva a estar disponible._`
    );
  }

  return lines.join('\n');
}

function deriveNoteTitleFromMessage(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const cleaned = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      continue;
    }

    if (cleaned.length <= MAX_DERIVED_NOTE_TITLE_LENGTH) {
      return cleaned;
    }

    return `${cleaned.slice(0, MAX_DERIVED_NOTE_TITLE_LENGTH - 1).trimEnd()}…`;
  }

  return DEFAULT_NOTE_TITLE;
}

export async function sendChatMessageService(
  db: DatabaseSync,
  input: SendChatMessageInput,
  deps?: RagServiceDeps
): Promise<SendChatMessageResult> {
  const courseId = input.courseId?.trim();
  const content = input.content?.trim() ?? '';
  const customInstructions = input.customInstructions?.trim() ?? '';

  if (!courseId) {
    throw new Error('courseId is required');
  }
  if (!content) {
    throw new Error('Message content must not be empty');
  }

  const course = getCourseById(db, courseId);
  if (!course) {
    throw new Error(`Course not found: ${courseId}`);
  }

  let threadId: string;
  let priorMessages: ChatMessage[] = [];

  if (input.threadId?.trim()) {
    const existingThread = getChatThread(db, input.threadId.trim());
    if (!existingThread) {
      throw new Error(`Chat thread not found: ${input.threadId}`);
    }
    if (existingThread.courseId !== course.id) {
      throw new Error('Chat thread does not belong to the specified course');
    }
    threadId = existingThread.id;
    priorMessages = existingThread.messages.slice(-DEFAULT_MAX_HISTORY_TURNS);
  } else {
    const createdThread = createChatThread(db, { courseId: course.id });
    threadId = createdThread.id;
  }

  const userMessage = appendChatMessage(db, {
    threadId,
    role: 'user',
    content,
  });

  const embedder =
    deps?.embedder ?? createOllamaSourceEmbedder(db, { fetchImpl: deps?.fetchFn });

  let queryEmbedding: Float32Array | null = null;
  try {
    const embRes = await embedder([content]);
    queryEmbedding = embRes.embeddings[0] ?? null;
  } catch {
    queryEmbedding = null;
  }

  const sourceSearchResults = searchCourseChunksHybrid(db, {
    courseId: course.id,
    query: content,
    queryEmbedding,
    limit: DEFAULT_MAX_RETRIEVED_CHUNKS,
    sourceIds: input.sourceIds,
    examStage: input.examStage,
  });

  const combinedCandidates: RetrievedCandidate[] = sourceSearchResults.map(
    (result) => ({
      chunkId: result.chunk.id,
      sourceId: result.chunk.sourceId,
      sourceTitle: result.sourceTitle,
      sourceType: result.sourceType,
      pageNumber: result.chunk.pageNumber,
      excerpt: result.chunk.content.trim(),
      score: result.score,
      hasLexicalMatch: result.ftsScore > 0,
    })
  );

  const shouldIncludeNotes = input.includeNotes !== false;
  let matchingNotes: NoteWithCourse[] = [];

  if (shouldIncludeNotes) {
    const noteSearch = await searchMatchingNoteCandidates({
      db,
      courseId: course.id,
      query: content,
      queryEmbedding,
      embedder,
      noteIds: input.noteIds,
      examStage: input.examStage,
      limit: DEFAULT_MAX_RETRIEVED_CHUNKS,
    });
    matchingNotes = noteSearch.matchingNotes;
    combinedCandidates.push(...noteSearch.candidates);
  }

  // Fallback for broad summary questions when explicit filters or examStage are active
  const hasExplicitFilter =
    input.sourceIds !== undefined ||
    input.noteIds !== undefined ||
    (input.examStage !== undefined && input.examStage !== 'all');

  if (combinedCandidates.length === 0 && hasExplicitFilter) {
    const stageFilter =
      input.examStage && input.examStage !== 'all' ? input.examStage : null;
    const requestedSourceIds =
      input.sourceIds !== undefined
        ? new Set(input.sourceIds.map((id) => id.trim()).filter(Boolean))
        : null;

    const matchingSources = listSourcesByCourse(db, course.id).filter((src) => {
      if (src.indexingStatus !== 'ready') return false;
      if (requestedSourceIds && !requestedSourceIds.has(src.id)) return false;
      if (stageFilter && (src.examStage ?? 'general') !== stageFilter) return false;
      return true;
    });

    for (const src of matchingSources) {
      if (combinedCandidates.length >= DEFAULT_MAX_RETRIEVED_CHUNKS) break;
      const full = getSourceWithChunks(db, src.id);
      const firstChunk = full?.chunks[0];
      if (firstChunk) {
        combinedCandidates.push({
          chunkId: firstChunk.id,
          sourceId: src.id,
          sourceTitle: src.title,
          sourceType: src.sourceType,
          pageNumber: firstChunk.pageNumber,
          excerpt: firstChunk.content.trim(),
          score: 0.5,
          hasLexicalMatch: false,
        });
      }
    }

    for (const note of matchingNotes) {
      if (combinedCandidates.length >= DEFAULT_MAX_RETRIEVED_CHUNKS) break;
      const pieces = splitNoteIntoSearchablePieces(note);
      if (pieces.length > 0) {
        combinedCandidates.push({
          chunkId: `note-${note.id}-chunk-0`,
          sourceId: note.id,
          sourceTitle: note.title,
          sourceType: 'note',
          pageNumber: null,
          excerpt: pieces[0].trim(),
          score: 0.45,
          hasLexicalMatch: false,
        });
      }
    }
  }

  combinedCandidates.sort((a, b) => {
    if (a.hasLexicalMatch !== b.hasLexicalMatch) {
      return a.hasLexicalMatch ? -1 : 1;
    }
    return b.score - a.score;
  });

  const topCandidates = combinedCandidates.slice(0, DEFAULT_MAX_RETRIEVED_CHUNKS);
  const citations: ChatCitation[] = topCandidates.map((item, index) => ({
    citationNumber: index + 1,
    chunkId: item.chunkId,
    sourceId: item.sourceId,
    sourceTitle: item.sourceTitle,
    sourceType: item.sourceType,
    pageNumber: item.pageNumber,
    excerpt: item.excerpt,
    score: item.score,
  }));

  const settings = getAiSettings(db);

  const ollamaMessages: OllamaChatMessageInput[] = [
    {
      role: 'system',
      content: buildSystemPrompt(course.name, customInstructions, input.examStage),
    },
    ...priorMessages.map<OllamaChatMessageInput>((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    })),
    {
      role: 'user',
      content: buildUserPrompt({
        question: content,
        citations,
        customInstructions,
      }),
    },
  ];

  let assistantContent: string;
  let modelUsed: string;

  try {
    const completion = await generateChatCompletion({
      baseUrl: settings.baseUrl,
      model: settings.chatModel,
      messages: ollamaMessages,
      keepAlive: '0s',
      fetchImpl: deps?.fetchFn,
    });
    const trimmed = completion.content.trim();
    if (!trimmed) {
      throw new Error('Ollama returned an empty chat completion');
    }
    assistantContent = trimmed;
    modelUsed = completion.modelUsed || settings.chatModel;
  } catch {
    assistantContent = buildExtractiveFallbackResponse({
      courseName: course.name,
      query: content,
      citations,
      customInstructions,
      ollamaBaseUrl: settings.baseUrl,
    });
    modelUsed = EXTRACTIVE_FALLBACK_MODEL_ID;
  }

  const assistantMessage = appendChatMessage(db, {
    threadId,
    role: 'assistant',
    content: assistantContent,
    citations,
    modelUsed,
  });

  const refreshed = getChatThread(db, threadId);
  if (!refreshed) {
    throw new Error(`Failed to reload chat thread after message: ${threadId}`);
  }

  const thread: ChatThread = {
    id: refreshed.id,
    courseId: refreshed.courseId,
    title: refreshed.title,
    createdAt: refreshed.createdAt,
    updatedAt: refreshed.updatedAt,
  };

  return {
    thread,
    userMessage,
    assistantMessage,
  };
}

export function saveChatMessageAsNoteService(
  db: DatabaseSync,
  input: SaveChatMessageAsNoteInput
): NoteWithCourse {
  const messageId = input.messageId?.trim();
  if (!messageId) {
    throw new Error('messageId is required');
  }

  const message = getChatMessageById(db, messageId);
  if (!message) {
    throw new Error(`Chat message not found: ${messageId}`);
  }

  const requestedTitle = input.title?.trim();
  const title =
    requestedTitle && requestedTitle.length > 0
      ? requestedTitle
      : deriveNoteTitleFromMessage(message.content);

  const sections = [message.content.trim()];

  if (message.citations.length > 0) {
    const citedLines = message.citations.map((citation) => {
      const pageSuffix = citation.pageNumber != null ? ` (pág. ${citation.pageNumber})` : '';
      return `- [${citation.citationNumber}] **${citation.sourceTitle}**${pageSuffix}: ${truncateInlineText(citation.excerpt, 240)}`;
    });

    sections.push(['## Fuentes citadas', '', ...citedLines].join('\n'));
  }

  return createNote(db, {
    courseId: message.courseId,
    title,
    content: sections.join('\n\n'),
    origin: 'ai_summary',
  });
}
