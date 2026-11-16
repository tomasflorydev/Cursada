import type {
  ChatCitation,
  ChatMessage,
  ChatThread,
  ChatThreadWithMessages,
  CreateChatThreadInput,
  ExamStageTag,
  NoteWithCourse,
  SaveChatMessageAsNoteInput,
  SendChatMessageInput,
  SendChatMessageResult,
} from '../../types/domain';
import { getMockCourseByIdSync } from './mockCourses';
import { mockCreateNote, mockListNotes } from './mockNotes';
import {
  mockGetAiSettings,
  tryBrowserOllamaChatCompletion,
  type BrowserOllamaChatMessage,
} from './mockOllama';
import {
  mockGetSourceWithChunks,
  mockListSources,
  mockSearchSourceChunks,
} from './mockSources';

const DEFAULT_CHAT_THREAD_TITLE = 'Nueva consulta';
const MAX_AUTO_TITLE_LENGTH = 56;
const DEFAULT_NOTE_TITLE = 'Respuesta del Asistente';
const MAX_DERIVED_NOTE_TITLE_LENGTH = 72;

interface MockChatStore {
  threads: ChatThread[];
  messages: ChatMessage[];
  sequence: number;
}

const store: MockChatStore = {
  threads: [],
  messages: [],
  sequence: 0,
};

function nextId(prefix: string): string {
  store.sequence += 1;
  return `${prefix}-${store.sequence}`;
}

function nextIsoTimestamp(): string {
  store.sequence += 1;
  return new Date(Date.now() + store.sequence * 10).toISOString();
}

function cloneCitation(citation: ChatCitation): ChatCitation {
  return { ...citation };
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    citations: message.citations.map(cloneCitation),
  };
}

function cloneThread(thread: ChatThread): ChatThread {
  return { ...thread };
}

function summarizeThreadTitle(question: string): string {
  const normalized = question.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return DEFAULT_CHAT_THREAD_TITLE;
  }
  if (normalized.length <= MAX_AUTO_TITLE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_AUTO_TITLE_LENGTH - 1).trimEnd()}…`;
}

function truncateInlineText(raw: string, maxLength: number): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
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

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function extractMeaningfulTokens(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function splitNoteIntoPieces(note: NoteWithCourse): string[] {
  const clean = note.content.replace(/\r\n?/g, '\n').trim();
  if (!clean) {
    return note.title.trim() ? [note.title.trim()] : [];
  }
  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) {
    return [clean.slice(0, 800)];
  }
  const pieces: string[] = [];
  let buffer = '';
  for (const para of paragraphs) {
    if (!buffer) {
      buffer = para;
    } else if (buffer.length + 2 + para.length <= 800) {
      buffer = `${buffer}\n\n${para}`;
    } else {
      pieces.push(buffer);
      buffer = para;
    }
  }
  if (buffer) {
    pieces.push(buffer);
  }
  return pieces;
}

async function retrieveMockCitations(params: {
  courseId: string;
  query: string;
  sourceIds?: string[];
  noteIds?: string[];
  examStage?: ExamStageTag | 'all';
  includeNotes?: boolean;
}): Promise<ChatCitation[]> {
  const { courseId, query, sourceIds, noteIds, examStage, includeNotes } = params;

  const sourceMatches = await mockSearchSourceChunks({
    courseId,
    query,
    limit: 5,
    sourceIds,
    examStage,
  });

  interface RankedItem {
    chunkId: string;
    sourceId: string;
    sourceTitle: string;
    sourceType: ChatCitation['sourceType'];
    pageNumber: number | null;
    excerpt: string;
    score: number;
    hasLexicalMatch: boolean;
  }

  const combined: RankedItem[] = sourceMatches.map((match) => ({
    chunkId: match.chunk.id,
    sourceId: match.chunk.sourceId,
    sourceTitle: match.sourceTitle,
    sourceType: match.sourceType,
    pageNumber: match.chunk.pageNumber,
    excerpt: match.chunk.content.trim(),
    score: match.score,
    hasLexicalMatch: match.ftsScore > 0,
  }));

  const shouldIncludeNotes = includeNotes !== false;
  let matchingNotes: NoteWithCourse[] = [];

  if (shouldIncludeNotes) {
    matchingNotes = await mockListNotes({
      courseId,
      examStage: examStage && examStage !== 'all' ? examStage : undefined,
    });

    if (noteIds !== undefined) {
      const noteSet = new Set(noteIds.map((id) => id.trim()).filter(Boolean));
      matchingNotes = matchingNotes.filter((n) => noteSet.has(n.id));
    }

    const queryTokens = extractMeaningfulTokens(query);
    if (queryTokens.length > 0 && matchingNotes.length > 0) {
      const noteCandidates: Array<RankedItem & { rawLexical: number }> = [];
      for (const note of matchingNotes) {
        const pieces = splitNoteIntoPieces(note);
        pieces.forEach((piece, idx) => {
          const normalized = normalizeSearchText(`${note.title}\n${piece}`);
          const matchedCount = queryTokens.filter((t) =>
            normalized.includes(t)
          ).length;
          if (matchedCount > 0) {
            const rawLexical = matchedCount / queryTokens.length;
            noteCandidates.push({
              chunkId: `note-${note.id}-chunk-${idx}`,
              sourceId: note.id,
              sourceTitle: note.title,
              sourceType: 'note',
              pageNumber: null,
              excerpt: piece.trim(),
              score: 0,
              hasLexicalMatch: true,
              rawLexical,
            });
          }
        });
      }

      noteCandidates.sort((a, b) => b.rawLexical - a.rawLexical);
      noteCandidates.slice(0, 5).forEach((cand, idx) => {
        const rank = idx + 1;
        combined.push({
          chunkId: cand.chunkId,
          sourceId: cand.sourceId,
          sourceTitle: cand.sourceTitle,
          sourceType: cand.sourceType,
          pageNumber: cand.pageNumber,
          excerpt: cand.excerpt,
          score: 1 / (60 + rank) + cand.rawLexical * 0.015,
          hasLexicalMatch: true,
        });
      });
    }
  }

  if (combined.length > 0) {
    combined.sort((a, b) => {
      if (a.hasLexicalMatch !== b.hasLexicalMatch) {
        return a.hasLexicalMatch ? -1 : 1;
      }
      return b.score - a.score;
    });
    return combined.slice(0, 5).map((item, index) => ({
      citationNumber: index + 1,
      chunkId: item.chunkId,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      sourceType: item.sourceType,
      pageNumber: item.pageNumber,
      excerpt: item.excerpt,
      score: item.score,
    }));
  }

  // Fallback for broad summary questions when a course has ready sources or matching notes
  const sourceIdSet =
    sourceIds !== undefined
      ? new Set(sourceIds.map((id) => id.trim()).filter(Boolean))
      : null;
  const stageFilter = examStage && examStage !== 'all' ? examStage : null;

  const courseSources = await mockListSources(courseId);
  const readySources = courseSources.filter((source) => {
    if (source.indexingStatus !== 'ready') return false;
    if (sourceIdSet && !sourceIdSet.has(source.id)) return false;
    if (stageFilter && (source.examStage ?? 'general') !== stageFilter) return false;
    return true;
  });

  const fallbackCitations: ChatCitation[] = [];

  for (const source of readySources) {
    const detailed = await mockGetSourceWithChunks(source.id);
    if (!detailed || detailed.chunks.length === 0) {
      continue;
    }
    const firstChunk = detailed.chunks[0];
    const index = fallbackCitations.length;
    fallbackCitations.push({
      citationNumber: index + 1,
      chunkId: firstChunk.id,
      sourceId: detailed.id,
      sourceTitle: detailed.title,
      sourceType: detailed.sourceType,
      pageNumber: firstChunk.pageNumber,
      excerpt: firstChunk.content.trim(),
      score: Math.max(0.35, Number((0.62 - index * 0.08).toFixed(4))),
    });
    if (fallbackCitations.length >= 3) {
      break;
    }
  }

  for (const note of matchingNotes) {
    if (fallbackCitations.length >= 4) {
      break;
    }
    const pieces = splitNoteIntoPieces(note);
    if (pieces.length === 0) continue;
    const index = fallbackCitations.length;
    fallbackCitations.push({
      citationNumber: index + 1,
      chunkId: `note-${note.id}-chunk-0`,
      sourceId: note.id,
      sourceTitle: note.title,
      sourceType: 'note',
      pageNumber: null,
      excerpt: pieces[0].trim(),
      score: Math.max(0.3, Number((0.54 - index * 0.06).toFixed(4))),
    });
  }

  return fallbackCitations;
}

function buildMockAssistantContent(params: {
  courseName: string;
  question: string;
  customInstructions: string;
  citations: ChatCitation[];
}): string {
  if (params.citations.length === 0) {
    const base = `No encontré fragmentos indexados en las fuentes de **${params.courseName}** para responder "${truncateInlineText(params.question, 80)}". Subí apuntes, PDFs o texto en la pestaña **Fuentes** para poder citarlos en mis respuestas.`;
    return params.customInstructions
      ? `${base}\n\n_(Instrucción recibida: "${params.customInstructions}")_`
      : base;
  }

  const lines: string[] = [];

  if (params.customInstructions) {
    lines.push(`**Instrucción aplicada:** ${params.customInstructions}`, '');
  }

  lines.push(
    `Según las fuentes indexadas de **${params.courseName}**, estos son los puntos principales para responder tu consulta:`,
    ''
  );

  for (const citation of params.citations) {
    const pagePart = citation.pageNumber != null ? ` (pág. ${citation.pageNumber})` : '';
    const cleanExcerpt = citation.excerpt.replace(/^#{1,6}\s+/, '');
    lines.push(
      `- ${truncateInlineText(cleanExcerpt, 200)} [${citation.citationNumber}] — *${citation.sourceTitle}*${pagePart}`
    );
  }

  return lines.join('\n');
}

export function resetMockChat(): void {
  store.threads = [];
  store.messages = [];
  store.sequence = 0;
}

export async function mockListChatThreads(courseId: string): Promise<ChatThread[]> {
  return store.threads
    .filter((thread) => thread.courseId === courseId)
    .sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      return b.createdAt.localeCompare(a.createdAt);
    })
    .map(cloneThread);
}

export async function mockGetChatThread(
  threadId: string
): Promise<ChatThreadWithMessages | null> {
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread) {
    return null;
  }

  const messages = store.messages
    .filter((message) => message.threadId === thread.id)
    .map(cloneMessage);

  return {
    ...cloneThread(thread),
    messages,
  };
}

export async function mockCreateChatThread(
  input: CreateChatThreadInput
): Promise<ChatThread> {
  const courseId = input.courseId?.trim();
  if (!courseId) {
    throw new Error('courseId is required');
  }
  if (!getMockCourseByIdSync(courseId)) {
    throw new Error(`Course not found: ${courseId}`);
  }

  const now = nextIsoTimestamp();
  const title = input.title?.trim() || DEFAULT_CHAT_THREAD_TITLE;
  const thread: ChatThread = {
    id: nextId('mock-thread'),
    courseId,
    title,
    createdAt: now,
    updatedAt: now,
  };

  store.threads.push(thread);
  return cloneThread(thread);
}

export async function mockDeleteChatThread(threadId: string): Promise<void> {
  const trimmedId = threadId?.trim();
  if (!trimmedId) {
    return;
  }
  store.threads = store.threads.filter((thread) => thread.id !== trimmedId);
  store.messages = store.messages.filter((message) => message.threadId !== trimmedId);
}

export async function mockSendChatMessage(
  input: SendChatMessageInput
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

  const course = getMockCourseByIdSync(courseId);
  if (!course) {
    throw new Error(`Course not found: ${courseId}`);
  }

  let thread: ChatThread | undefined;
  if (input.threadId?.trim()) {
    thread = store.threads.find((item) => item.id === input.threadId?.trim());
    if (!thread) {
      throw new Error(`Chat thread not found: ${input.threadId}`);
    }
    if (thread.courseId !== course.id) {
      throw new Error('Chat thread does not belong to the specified course');
    }
  } else {
    const now = nextIsoTimestamp();
    thread = {
      id: nextId('mock-thread'),
      courseId: course.id,
      title: DEFAULT_CHAT_THREAD_TITLE,
      createdAt: now,
      updatedAt: now,
    };
    store.threads.push(thread);
  }

  const userNow = nextIsoTimestamp();
  const userMessage: ChatMessage = {
    id: nextId('mock-msg'),
    threadId: thread.id,
    role: 'user',
    content,
    citations: [],
    modelUsed: null,
    createdAt: userNow,
  };
  store.messages.push(userMessage);

  if (thread.title === DEFAULT_CHAT_THREAD_TITLE) {
    thread.title = summarizeThreadTitle(content);
  }
  thread.updatedAt = userNow;

  const citations = await retrieveMockCitations({
    courseId: course.id,
    query: content,
    sourceIds: input.sourceIds,
    noteIds: input.noteIds,
    examStage: input.examStage,
    includeNotes: input.includeNotes,
  });
  const settings = await mockGetAiSettings();

  const historyMessages: BrowserOllamaChatMessage[] = store.messages
    .filter((message) => message.threadId === thread.id && message.id !== userMessage.id)
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));

  const contextBlock =
    citations.length > 0
      ? citations
          .map(
            (citation, index) =>
              `[${index + 1}] Fuente: "${citation.sourceTitle}" (${citation.sourceType})\n${citation.excerpt}`
          )
          .join('\n\n')
      : 'No se encontraron fragmentos relevantes en las fuentes subidas de esta materia.';

  const citeSources = input.citeSources !== false;
  const effectiveCitations = citeSources ? citations : [];
  const languageDirective =
    input.reportLanguage === 'en'
      ? 'Respond clearly and concisely in academic English.'
      : input.reportLanguage === 'auto'
        ? 'Respond in the predominant language of the sources.'
        : 'Respondé siempre en español claro y conciso.';

  const systemPrompt = [
    `Sos un asistente de estudio universitario para la materia "${course.name}".`,
    languageDirective,
    citeSources
      ? 'Basate en los fragmentos de fuentes provistos cuando existan y citalos como [1], [2], etc. Si la información no está en las fuentes, aclaralo sin inventar datos.'
      : 'Basate en los fragmentos provistos sin incluir marcadores numéricos de cita ([1], [2]). Si la información no está en las fuentes, aclaralo sin inventar datos.',
    customInstructions ? `Instrucciones del estudiante: ${customInstructions}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const liveReply = await tryBrowserOllamaChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      {
        role: 'user',
        content: `Fragmentos relevantes:\n${contextBlock}\n\nConsulta:\n${content}`,
      },
    ],
  });

  const isVitest = typeof process !== 'undefined' && Boolean(process.env?.VITEST);
  const assistantContent =
    liveReply?.content ??
    buildMockAssistantContent({
      courseName: course.name,
      question: content,
      customInstructions,
      citations: effectiveCitations,
    });
  const modelUsed =
    liveReply?.modelUsed ?? (isVitest ? settings.chatModel : 'local-rag-extractive');

  const assistantNow = nextIsoTimestamp();
  const assistantMessage: ChatMessage = {
    id: nextId('mock-msg'),
    threadId: thread.id,
    role: 'assistant',
    content: assistantContent,
    citations: effectiveCitations,
    modelUsed,
    createdAt: assistantNow,
  };
  store.messages.push(assistantMessage);
  thread.updatedAt = assistantNow;

  return {
    thread: cloneThread(thread),
    userMessage: cloneMessage(userMessage),
    assistantMessage: cloneMessage(assistantMessage),
  };
}

export async function mockSaveChatMessageAsNote(
  input: SaveChatMessageAsNoteInput
): Promise<NoteWithCourse> {
  const messageId = input.messageId?.trim();
  if (!messageId) {
    throw new Error('messageId is required');
  }

  const message = store.messages.find((item) => item.id === messageId);
  if (!message) {
    throw new Error(`Chat message not found: ${messageId}`);
  }

  const thread = store.threads.find((item) => item.id === message.threadId);
  if (!thread) {
    throw new Error(`Chat thread not found for message: ${messageId}`);
  }

  const title = input.title?.trim() || deriveNoteTitleFromMessage(message.content);
  const sections = [message.content.trim()];

  if (message.citations.length > 0) {
    const citedLines = message.citations.map((citation) => {
      const pageSuffix = citation.pageNumber != null ? ` (pág. ${citation.pageNumber})` : '';
      return `- [${citation.citationNumber}] **${citation.sourceTitle}**${pageSuffix}: ${truncateInlineText(citation.excerpt, 240)}`;
    });

    sections.push(['## Fuentes citadas', '', ...citedLines].join('\n'));
  }

  return mockCreateNote({
    courseId: thread.courseId,
    title,
    content: sections.join('\n\n'),
    origin: 'ai_summary',
  });
}
