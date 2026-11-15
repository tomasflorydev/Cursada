import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ChatCitation,
  ChatMessage,
  ChatMessageRole,
  ChatThread,
  ChatThreadWithMessages,
  CreateChatThreadInput,
} from '../types.js';

export const DEFAULT_CHAT_THREAD_TITLE = 'Nueva consulta';
const MAX_AUTO_THREAD_TITLE_LENGTH = 56;
const VALID_CHAT_ROLES = new Set<ChatMessageRole>(['user', 'assistant']);

let lastTimestampMs = 0;

function nextIsoTimestamp(): string {
  const nowMs = Date.now();
  lastTimestampMs = nowMs > lastTimestampMs ? nowMs : lastTimestampMs + 1;
  return new Date(lastTimestampMs).toISOString();
}

interface ChatThreadRow {
  id: string;
  course_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: string;
  thread_id: string;
  role: ChatMessageRole;
  content: string;
  citations_json: string;
  model_used: string | null;
  created_at: string;
}

interface ChatMessageWithCourseRow extends ChatMessageRow {
  course_id: string;
}

export interface AppendChatMessageParams {
  threadId: string;
  role: ChatMessageRole;
  content: string;
  citations?: ChatCitation[];
  modelUsed?: string | null;
}

function requireNonEmptyId(rawId: string, label: string): string {
  const value = typeof rawId === 'string' ? rawId.trim() : '';
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function assertCourseExists(db: DatabaseSync, rawCourseId: string): string {
  const courseId = requireNonEmptyId(rawCourseId, 'Course ID');
  const row = db
    .prepare('SELECT id FROM courses WHERE id = ?')
    .get(courseId) as { id: string } | undefined;
  if (!row) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function parseCitationsJson(rawJson: string): ChatCitation[] {
  if (typeof rawJson !== 'string' || !rawJson.trim()) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is ChatCitation =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ChatCitation).citationNumber === 'number' &&
        typeof (item as ChatCitation).chunkId === 'string' &&
        typeof (item as ChatCitation).sourceId === 'string' &&
        typeof (item as ChatCitation).sourceTitle === 'string' &&
        typeof (item as ChatCitation).excerpt === 'string'
    );
  } catch {
    return [];
  }
}

function mapThreadRow(row: ChatThreadRow): ChatThread {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    citations: parseCitationsJson(row.citations_json),
    modelUsed: row.model_used ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Produces a clean single-line thread title <= 56 characters from a user's first question.
 */
export function summarizeChatThreadTitle(
  question: string,
  maxLength = MAX_AUTO_THREAD_TITLE_LENGTH
): string {
  const normalized = question.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return DEFAULT_CHAT_THREAD_TITLE;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const limit = Math.max(4, maxLength - 3);
  const sliced = normalized.slice(0, limit);
  const lastSpace = sliced.lastIndexOf(' ');
  const base =
    lastSpace >= Math.floor(limit * 0.55)
      ? sliced.slice(0, lastSpace).trimEnd()
      : sliced.trimEnd();

  return `${base}...`;
}

export function listChatThreads(
  db: DatabaseSync,
  courseId: string
): ChatThread[] {
  const validCourseId = requireNonEmptyId(courseId, 'Course ID');
  const rows = db
    .prepare(
      `SELECT id, course_id, title, created_at, updated_at
       FROM chat_threads
       WHERE course_id = ?
       ORDER BY updated_at DESC, created_at DESC, rowid DESC`
    )
    .all(validCourseId) as unknown as ChatThreadRow[];

  return rows.map(mapThreadRow);
}

export function getChatThread(
  db: DatabaseSync,
  threadId: string
): ChatThreadWithMessages | null {
  const validThreadId = requireNonEmptyId(threadId, 'Thread ID');
  const threadRow = db
    .prepare(
      `SELECT id, course_id, title, created_at, updated_at
       FROM chat_threads
       WHERE id = ?`
    )
    .get(validThreadId) as ChatThreadRow | undefined;

  if (!threadRow) {
    return null;
  }

  const messageRows = db
    .prepare(
      `SELECT id, thread_id, role, content, citations_json, model_used, created_at
       FROM chat_messages
       WHERE thread_id = ?
       ORDER BY created_at ASC, rowid ASC`
    )
    .all(validThreadId) as unknown as ChatMessageRow[];

  return {
    ...mapThreadRow(threadRow),
    messages: messageRows.map(mapMessageRow),
  };
}

export function createChatThread(
  db: DatabaseSync,
  input: CreateChatThreadInput
): ChatThread {
  const courseId = assertCourseExists(db, input.courseId);
  const title = (input.title ?? '').trim() || DEFAULT_CHAT_THREAD_TITLE;
  const id = randomUUID();
  const now = nextIsoTimestamp();

  db.prepare(
    `INSERT INTO chat_threads (id, course_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, courseId, title, now, now);

  const created = db
    .prepare(
      `SELECT id, course_id, title, created_at, updated_at
       FROM chat_threads
       WHERE id = ?`
    )
    .get(id) as ChatThreadRow | undefined;

  if (!created) {
    throw new Error('Failed to load created chat thread');
  }

  return mapThreadRow(created);
}

export function deleteChatThread(db: DatabaseSync, threadId: string): boolean {
  const validThreadId = requireNonEmptyId(threadId, 'Thread ID');
  const result = db
    .prepare('DELETE FROM chat_threads WHERE id = ?')
    .run(validThreadId);

  return Number(result.changes) > 0;
}

export function appendChatMessage(
  db: DatabaseSync,
  params: AppendChatMessageParams
): ChatMessage {
  const threadId = requireNonEmptyId(params.threadId, 'Thread ID');
  if (!VALID_CHAT_ROLES.has(params.role)) {
    throw new Error(
      `Invalid chat message role "${String(params.role)}". Expected 'user' or 'assistant'.`
    );
  }

  const content =
    typeof params.content === 'string' ? params.content.trim() : '';
  if (!content) {
    throw new Error('Chat message content cannot be empty');
  }

  const citations = Array.isArray(params.citations) ? params.citations : [];
  const citationsJson = JSON.stringify(citations);
  const modelUsed =
    typeof params.modelUsed === 'string' && params.modelUsed.trim()
      ? params.modelUsed.trim()
      : null;

  const existingThread = db
    .prepare(
      `SELECT id, course_id, title, created_at, updated_at
       FROM chat_threads
       WHERE id = ?`
    )
    .get(threadId) as ChatThreadRow | undefined;

  if (!existingThread) {
    throw new Error(`Chat thread not found: ${threadId}`);
  }

  const id = randomUUID();
  const now = nextIsoTimestamp();
  const nextTitle =
    params.role === 'user' && existingThread.title === DEFAULT_CHAT_THREAD_TITLE
      ? summarizeChatThreadTitle(content)
      : existingThread.title;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO chat_messages (
         id,
         thread_id,
         role,
         content,
         citations_json,
         model_used,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, threadId, params.role, content, citationsJson, modelUsed, now);

    db.prepare(
      `UPDATE chat_threads
       SET title = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextTitle, now, threadId);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const inserted = db
    .prepare(
      `SELECT id, thread_id, role, content, citations_json, model_used, created_at
       FROM chat_messages
       WHERE id = ?`
    )
    .get(id) as ChatMessageRow | undefined;

  if (!inserted) {
    throw new Error('Failed to load appended chat message');
  }

  return mapMessageRow(inserted);
}

export function getChatMessageById(
  db: DatabaseSync,
  messageId: string
): (ChatMessage & { courseId: string }) | null {
  const validMessageId = requireNonEmptyId(messageId, 'Message ID');
  const row = db
    .prepare(
      `SELECT
         m.id,
         m.thread_id,
         m.role,
         m.content,
         m.citations_json,
         m.model_used,
         m.created_at,
         t.course_id
       FROM chat_messages m
       INNER JOIN chat_threads t ON t.id = m.thread_id
       WHERE m.id = ?`
    )
    .get(validMessageId) as ChatMessageWithCourseRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...mapMessageRow(row),
    courseId: row.course_id,
  };
}
