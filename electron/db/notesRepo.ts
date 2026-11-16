import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CourseColor,
  CreateNoteInput,
  ExamStageTag,
  NoteFilters,
  NoteOrigin,
  NoteWithCourse,
  UpdateNoteInput,
} from '../types.js';
import { syncNoteLinks } from './wikiLinks.js';

interface NoteJoinedRow {
  id: string;
  course_id: string;
  title: string;
  content: string;
  origin: NoteOrigin;
  is_pinned: number;
  exam_stage?: ExamStageTag;
  frontmatter_json?: string;
  created_at: string;
  updated_at: string;
  course_name: string;
  course_color: CourseColor;
}

const VALID_ORIGINS = new Set<NoteOrigin>([
  'manual',
  'ai_summary',
  'ai_study_guide',
  'ai_practice_exam',
]);

const VALID_EXAM_STAGES = new Set<ExamStageTag>([
  'parcial_1',
  'parcial_2',
  'final',
  'general',
]);

function validateExamStage(stage: ExamStageTag | undefined): ExamStageTag {
  const resolved = stage ?? 'general';
  if (!VALID_EXAM_STAGES.has(resolved)) {
    throw new Error(
      `Invalid examStage "${String(stage)}". Expected 'parcial_1', 'parcial_2', 'final', or 'general'.`
    );
  }
  return resolved;
}

function normalizeFrontmatter(
  raw: Record<string, string> | undefined
): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const cleanKey = String(key).trim();
    if (cleanKey && value !== undefined && value !== null) {
      result[cleanKey] = String(value);
    }
  }
  return result;
}

function parseFrontmatterJson(rawJson: string | undefined): Record<string, string> {
  if (typeof rawJson !== 'string' || !rawJson.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return normalizeFrontmatter(parsed as Record<string, string>);
  } catch {
    return {};
  }
}

function validateTitle(rawTitle: string): string {
  const title = (rawTitle ?? '').trim();
  if (!title) {
    throw new Error('Note title cannot be empty');
  }
  return title;
}

function assertCourseExists(db: DatabaseSync, rawCourseId: string): string {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Course ID is required');
  }
  const row = db
    .prepare('SELECT id FROM courses WHERE id = ?')
    .get(courseId) as { id: string } | undefined;
  if (!row) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function validateOrigin(origin: NoteOrigin | undefined): NoteOrigin {
  const resolved = origin ?? 'manual';
  if (!VALID_ORIGINS.has(resolved)) {
    throw new Error(
      `Invalid note origin "${String(origin)}". Expected 'manual', 'ai_summary', 'ai_study_guide', or 'ai_practice_exam'.`
    );
  }
  return resolved;
}

/**
 * Sanitizes free-form user input into a safe FTS5 prefix-term query.
 * Every alphanumeric token is double-quoted with a trailing `*` so FTS5 special
 * operators (`AND`, `OR`, `NOT`, `NEAR`, `*`, `:`, quotes, parentheses) never throw.
 */
export function buildSafeFtsQuery(rawQuery: string): string | null {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return null;
  }

  const tokens = trimmed
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' ');
}

function mapNoteRow(row: NoteJoinedRow): NoteWithCourse {
  const examStage: ExamStageTag =
    row.exam_stage && VALID_EXAM_STAGES.has(row.exam_stage)
      ? row.exam_stage
      : 'general';
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    content: row.content,
    origin: row.origin,
    isPinned: Boolean(row.is_pinned),
    examStage,
    frontmatter: parseFrontmatterJson(row.frontmatter_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    courseName: row.course_name,
    courseColor: row.course_color,
  };
}

export function listNotes(
  db: DatabaseSync,
  filters?: NoteFilters
): NoteWithCourse[] {
  const conditions: string[] = [];
  const params: Array<string> = [];

  if (filters?.courseId) {
    conditions.push('n.course_id = ?');
    params.push(filters.courseId);
  }

  if (filters?.pinnedOnly) {
    conditions.push('n.is_pinned = 1');
  }

  if (filters?.examStage && filters.examStage !== 'all') {
    const validStage = validateExamStage(filters.examStage);
    conditions.push('n.exam_stage = ?');
    params.push(validStage);
  }

  if (filters?.query) {
    const ftsQuery = buildSafeFtsQuery(filters.query);
    if (ftsQuery) {
      conditions.push(
        'n.id IN (SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?)'
      );
      params.push(ftsQuery);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      n.*,
      c.name AS course_name,
      c.color AS course_color
    FROM notes n
    INNER JOIN courses c ON c.id = n.course_id
    ${whereClause}
    ORDER BY n.is_pinned DESC, n.updated_at DESC, n.id ASC
  `;

  const rows = db.prepare(sql).all(...params) as unknown as NoteJoinedRow[];
  return rows.map(mapNoteRow);
}

export function getNoteById(
  db: DatabaseSync,
  id: string
): NoteWithCourse | null {
  const row = db
    .prepare(
      `SELECT n.*, c.name AS course_name, c.color AS course_color
       FROM notes n
       INNER JOIN courses c ON c.id = n.course_id
       WHERE n.id = ?`
    )
    .get(id) as NoteJoinedRow | undefined;
  return row ? mapNoteRow(row) : null;
}

export function createNote(
  db: DatabaseSync,
  input: CreateNoteInput
): NoteWithCourse {
  const id = randomUUID();
  const now = new Date().toISOString();
  const title = validateTitle(input.title);
  const courseId = assertCourseExists(db, input.courseId);
  const content = typeof input.content === 'string' ? input.content : '';
  const origin = validateOrigin(input.origin);
  const isPinned = input.isPinned ? 1 : 0;
  const examStage = validateExamStage(input.examStage);
  const frontmatterJson = JSON.stringify(normalizeFrontmatter(input.frontmatter));

  db.prepare(
    `INSERT INTO notes (id, course_id, title, content, origin, is_pinned, exam_stage, frontmatter_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    courseId,
    title,
    content,
    origin,
    isPinned,
    examStage,
    frontmatterJson,
    now,
    now
  );

  syncNoteLinks(db, id);

  const created = getNoteById(db, id);
  if (!created) {
    throw new Error('Failed to load created note');
  }
  return created;
}

export function updateNote(
  db: DatabaseSync,
  id: string,
  input: UpdateNoteInput
): NoteWithCourse {
  const existing = getNoteById(db, id);
  if (!existing) {
    throw new Error(`Note not found: ${id}`);
  }

  const now = new Date().toISOString();
  const courseId =
    input.courseId !== undefined
      ? assertCourseExists(db, input.courseId)
      : existing.courseId;
  const title =
    input.title !== undefined ? validateTitle(input.title) : existing.title;
  const content =
    input.content !== undefined ? input.content : existing.content;
  const isPinned =
    input.isPinned !== undefined
      ? input.isPinned
        ? 1
        : 0
      : existing.isPinned
        ? 1
        : 0;
  const examStage =
    input.examStage !== undefined
      ? validateExamStage(input.examStage)
      : existing.examStage ?? 'general';
  const frontmatterJson = JSON.stringify(
    input.frontmatter !== undefined
      ? normalizeFrontmatter(input.frontmatter)
      : existing.frontmatter ?? {}
  );

  db.prepare(
    `UPDATE notes
     SET course_id = ?, title = ?, content = ?, is_pinned = ?, exam_stage = ?, frontmatter_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(courseId, title, content, isPinned, examStage, frontmatterJson, now, id);

  syncNoteLinks(db, id);

  const updated = getNoteById(db, id);
  if (!updated) {
    throw new Error('Failed to load updated note');
  }
  return updated;
}

export function toggleNotePin(db: DatabaseSync, id: string): NoteWithCourse {
  const existing = getNoteById(db, id);
  if (!existing) {
    throw new Error(`Note not found: ${id}`);
  }
  return updateNote(db, id, { isPinned: !existing.isPinned });
}

export function deleteNote(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}
