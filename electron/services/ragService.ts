import type { DatabaseSync } from 'node:sqlite';
import type {
  ChatCitation,
  ChatMessage,
  ChatThread,
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
import { createNote } from '../db/notesRepo.js';
import { generateChatCompletion, type OllamaChatMessageInput } from './ollamaClient.js';
import {
  createOllamaSourceEmbedder,
  searchSourceChunksService,
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
export const EXTRACTIVE_FALLBACK_MODEL_ID = 'local-rag-extractive';

function formatCitationHeader(citation: ChatCitation): string {
  const pageSuffix = citation.pageNumber != null ? ` · pág. ${citation.pageNumber}` : '';
  return `[${citation.citationNumber}] ${citation.sourceTitle}${pageSuffix}`;
}

function buildSystemPrompt(courseName: string, customInstructions: string): string {
  const sections = [
    `Sos un asistente académico universitario para la materia "${courseName}" dentro de la aplicación Cursada.`,
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

  const searchResults = await searchSourceChunksService(
    db,
    {
      courseId: course.id,
      query: content,
      limit: DEFAULT_MAX_RETRIEVED_CHUNKS,
    },
    { embedder }
  );

  const citations: ChatCitation[] = searchResults.map((result, index) => ({
    citationNumber: index + 1,
    chunkId: result.chunk.id,
    sourceId: result.chunk.sourceId,
    sourceTitle: result.sourceTitle,
    sourceType: result.sourceType,
    pageNumber: result.chunk.pageNumber,
    excerpt: result.chunk.content.trim(),
    score: result.score,
  }));

  const settings = getAiSettings(db);

  const ollamaMessages: OllamaChatMessageInput[] = [
    {
      role: 'system',
      content: buildSystemPrompt(course.name, customInstructions),
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
