import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CourseColor,
  CourseStatus,
  KnowledgeGraphData,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  NoteLinkItem,
  NoteLinksSummary,
  NoteWithCourse,
} from '../types.js';
import { getCourseById, listCourses } from './coursesRepo.js';
import { createNote, getNoteById, listNotes } from './notesRepo.js';

export interface ParsedWikiLink {
  raw: string;
  targetTitle: string;
  displayText: string;
  contextSnippet: string;
}

interface NoteLinkJoinedRow {
  id: string;
  source_note_id: string;
  source_note_title: string;
  source_course_id: string;
  source_course_name: string;
  target_note_id: string | null;
  target_title: string;
  display_text: string;
  context_snippet: string;
}

interface RawNoteLinkRow {
  id: string;
  source_note_id: string;
  target_note_id: string | null;
  target_title: string;
  display_text: string;
}

const MAX_SNIPPET_LENGTH = 180;

export function normalizeWikiTitle(title: string): string {
  return (title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function countPrecedingBackslashes(line: string, index: number): number {
  let count = 0;
  let pos = index - 1;
  while (pos >= 0 && line[pos] === '\\') {
    count += 1;
    pos -= 1;
  }
  return count;
}

function findMatchingBacktickEnd(
  line: string,
  startIndex: number,
  tickCount: number
): number {
  let i = startIndex;
  while (i < line.length) {
    if (line[i] === '`') {
      let run = 0;
      while (i + run < line.length && line[i + run] === '`') {
        run += 1;
      }
      if (run === tickCount) {
        return i + run;
      }
      i += run;
    } else {
      i += 1;
    }
  }
  return -1;
}

function stripLeadingMarkdownPrefix(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]\s+\[[ xX]\]\s+|[-*+>]\s+|\d+[.)]\s+|#{1,6}\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractContextSnippet(
  line: string,
  matchStart: number,
  matchEnd: number
): string {
  let sentStart = 0;
  for (let i = matchStart - 1; i >= 1; i -= 1) {
    if (
      (line[i - 1] === '.' || line[i - 1] === '!' || line[i - 1] === '?') &&
      /\s/.test(line[i])
    ) {
      sentStart = i + 1;
      break;
    }
  }

  let sentEnd = line.length;
  for (let i = matchEnd; i < line.length; i += 1) {
    if (
      (line[i] === '.' || line[i] === '!' || line[i] === '?') &&
      (i + 1 === line.length || /\s/.test(line[i + 1]))
    ) {
      sentEnd = i + 1;
      break;
    }
  }

  const cleaned = stripLeadingMarkdownPrefix(line.slice(sentStart, sentEnd));
  if (cleaned.length <= MAX_SNIPPET_LENGTH) {
    return cleaned;
  }

  const rawToken = line.slice(matchStart, matchEnd).replace(/\s+/g, ' ').trim();
  const tokenIdx = cleaned.indexOf(rawToken);
  if (tokenIdx === -1) {
    return `${cleaned.slice(0, MAX_SNIPPET_LENGTH - 1).trimEnd()}…`;
  }

  if (rawToken.length >= MAX_SNIPPET_LENGTH - 2) {
    return `${rawToken.slice(0, MAX_SNIPPET_LENGTH - 1)}…`;
  }

  const budget = MAX_SNIPPET_LENGTH - 2;
  const sideBudget = Math.max(10, Math.floor((budget - rawToken.length) / 2));
  let winStart = Math.max(0, tokenIdx - sideBudget);
  let winEnd = Math.min(cleaned.length, tokenIdx + rawToken.length + sideBudget);

  if (winStart === 0) {
    winEnd = Math.min(cleaned.length, MAX_SNIPPET_LENGTH - 1);
  } else if (winEnd === cleaned.length) {
    winStart = Math.max(0, cleaned.length - (MAX_SNIPPET_LENGTH - 1));
  }

  const prefix = winStart > 0 ? '…' : '';
  const suffix = winEnd < cleaned.length ? '…' : '';
  let snippet = `${prefix}${cleaned.slice(winStart, winEnd).trim()}${suffix}`;
  if (snippet.length > MAX_SNIPPET_LENGTH) {
    snippet = `${snippet.slice(0, MAX_SNIPPET_LENGTH - 1).trimEnd()}…`;
  }
  return snippet;
}

export function parseWikiLinksFromMarkdown(content: string): ParsedWikiLink[] {
  const normalizedContent = (content ?? '').replace(/\r\n?/g, '\n');
  if (!normalizedContent) {
    return [];
  }

  const lines = normalizedContent.split('\n');
  const results: ParsedWikiLink[] = [];
  const seenTargets = new Set<string>();

  let activeFenceChar: '`' | '~' | null = null;
  let activeFenceLength = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const fenceMatch = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);
    if (fenceMatch) {
      const fenceSeq = fenceMatch[1];
      const fenceChar = fenceSeq[0] as '`' | '~';
      const fenceRest = fenceMatch[2].trim();
      if (!activeFenceChar) {
        if (!(fenceChar === '`' && fenceRest.includes('`'))) {
          activeFenceChar = fenceChar;
          activeFenceLength = fenceSeq.length;
          continue;
        }
      } else if (
        fenceChar === activeFenceChar &&
        fenceSeq.length >= activeFenceLength &&
        fenceRest.length === 0
      ) {
        activeFenceChar = null;
        activeFenceLength = 0;
        continue;
      }
    }

    if (activeFenceChar) {
      continue;
    }

    let i = 0;
    while (i < line.length) {
      if (line[i] === '`') {
        let tickCount = 0;
        while (i + tickCount < line.length && line[i + tickCount] === '`') {
          tickCount += 1;
        }
        const closeBacktick = findMatchingBacktickEnd(
          line,
          i + tickCount,
          tickCount
        );
        if (closeBacktick !== -1) {
          i = closeBacktick;
          continue;
        }
        i += tickCount;
        continue;
      }

      if (line[i] === '[' && line[i + 1] === '[') {
        const backslashes = countPrecedingBackslashes(line, i);
        const isEscaped = backslashes % 2 === 1;
        const isEmbed =
          i > 0 &&
          line[i - 1] === '!' &&
          countPrecedingBackslashes(line, i - 1) % 2 === 0;

        if (isEscaped || isEmbed) {
          i += 2;
          continue;
        }

        const closeIdx = line.indexOf(']]', i + 2);
        if (closeIdx === -1) {
          i += 2;
          continue;
        }

        const raw = line.slice(i, closeIdx + 2);
        const inner = line.slice(i + 2, closeIdx);
        if (inner.includes('[[')) {
          i += 2;
          continue;
        }

        const pipeIdx = inner.indexOf('|');
        const targetTitle = (
          pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)
        ).trim();
        const rawDisplay =
          pipeIdx === -1 ? targetTitle : inner.slice(pipeIdx + 1).trim();
        const displayText = rawDisplay || targetTitle;

        const normalizedKey = normalizeWikiTitle(targetTitle);
        if (normalizedKey.length > 0 && !seenTargets.has(normalizedKey)) {
          seenTargets.add(normalizedKey);
          results.push({
            raw,
            targetTitle,
            displayText,
            contextSnippet: extractContextSnippet(line, i, closeIdx + 2),
          });
        }

        i = closeIdx + 2;
        continue;
      }

      i += 1;
    }
  }

  return results;
}

export function resolveNoteByWikiTitle<
  T extends { id: string; title: string; courseId: string },
>(
  targetTitle: string,
  notes: T[],
  preferredCourseId?: string
): T | null {
  const normalizedTarget = normalizeWikiTitle(targetTitle);
  if (!normalizedTarget) {
    return null;
  }

  const trimmedTarget = targetTitle.trim();

  if (preferredCourseId) {
    const inCourseExact = notes.find(
      (n) => n.courseId === preferredCourseId && n.title.trim() === trimmedTarget
    );
    if (inCourseExact) {
      return inCourseExact;
    }

    const inCourseNormalized = notes.find(
      (n) =>
        n.courseId === preferredCourseId &&
        normalizeWikiTitle(n.title) === normalizedTarget
    );
    if (inCourseNormalized) {
      return inCourseNormalized;
    }
  }

  const globalExact = notes.find((n) => n.title.trim() === trimmedTarget);
  if (globalExact) {
    return globalExact;
  }

  const globalNormalized = notes.find(
    (n) => normalizeWikiTitle(n.title) === normalizedTarget
  );
  if (globalNormalized) {
    return globalNormalized;
  }

  return null;
}

function mapNoteLinkRow(row: NoteLinkJoinedRow): NoteLinkItem {
  return {
    id: row.id,
    sourceNoteId: row.source_note_id,
    sourceNoteTitle: row.source_note_title,
    sourceCourseId: row.source_course_id,
    sourceCourseName: row.source_course_name,
    targetNoteId: row.target_note_id,
    targetTitle: row.target_title,
    displayText: row.display_text,
    contextSnippet: row.context_snippet,
  };
}

/**
 * Synchronizes outgoing `[[WikiLinks]]` for `noteId`, and resolves any previously
 * unresolved `note_links` rows whose normalized target title matches this note's title.
 */
export function syncNoteLinks(db: DatabaseSync, noteId: string): void {
  const note = getNoteById(db, noteId);
  db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(noteId);

  if (!note) {
    return;
  }

  const allNotes = listNotes(db);
  const parsedLinks = parseWikiLinksFromMarkdown(note.content);
  const now = new Date().toISOString();

  const insertStmt = db.prepare(
    `INSERT INTO note_links (
      id,
      source_note_id,
      target_note_id,
      target_title,
      display_text,
      context_snippet,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const link of parsedLinks) {
    const resolved = resolveNoteByWikiTitle(
      link.targetTitle,
      allNotes,
      note.courseId
    );
    insertStmt.run(
      randomUUID(),
      note.id,
      resolved ? resolved.id : null,
      link.targetTitle,
      link.displayText,
      link.contextSnippet,
      now
    );
  }

  const normalizedNoteTitle = normalizeWikiTitle(note.title);
  if (!normalizedNoteTitle) {
    return;
  }

  // Back-resolve previously orphaned note_links pointing to this note's title
  const unresolvedRows = db
    .prepare(
      'SELECT id, source_note_id, target_note_id, target_title, display_text FROM note_links WHERE target_note_id IS NULL'
    )
    .all() as unknown as RawNoteLinkRow[];

  const updateTargetStmt = db.prepare(
    'UPDATE note_links SET target_note_id = ? WHERE id = ?'
  );

  for (const row of unresolvedRows) {
    if (normalizeWikiTitle(row.target_title) === normalizedNoteTitle) {
      updateTargetStmt.run(note.id, row.id);
    }
  }

  // Re-evaluate incoming resolved links if this note was renamed
  const incomingRows = db
    .prepare(
      'SELECT id, source_note_id, target_note_id, target_title, display_text FROM note_links WHERE target_note_id = ?'
    )
    .all(note.id) as unknown as RawNoteLinkRow[];

  if (incomingRows.length > 0) {
    const noteCourseById = new Map(allNotes.map((n) => [n.id, n.courseId]));
    for (const row of incomingRows) {
      if (normalizeWikiTitle(row.target_title) !== normalizedNoteTitle) {
        const preferredCourse = noteCourseById.get(row.source_note_id);
        const reResolved = resolveNoteByWikiTitle(
          row.target_title,
          allNotes,
          preferredCourse
        );
        updateTargetStmt.run(reResolved ? reResolved.id : null, row.id);
      }
    }
  }
}

/**
 * Rebuilds the entire `note_links` table across all notes inside a SQLite savepoint.
 */
export function syncAllNoteLinks(db: DatabaseSync): void {
  const allNotes = listNotes(db);
  const now = new Date().toISOString();

  db.exec('SAVEPOINT cursada_sync_all_links;');
  try {
    db.prepare('DELETE FROM note_links').run();

    const insertStmt = db.prepare(
      `INSERT INTO note_links (
        id,
        source_note_id,
        target_note_id,
        target_title,
        display_text,
        context_snippet,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const note of allNotes) {
      const parsedLinks = parseWikiLinksFromMarkdown(note.content);
      for (const link of parsedLinks) {
        const resolved = resolveNoteByWikiTitle(
          link.targetTitle,
          allNotes,
          note.courseId
        );
        insertStmt.run(
          randomUUID(),
          note.id,
          resolved ? resolved.id : null,
          link.targetTitle,
          link.displayText,
          link.contextSnippet,
          now
        );
      }
    }

    db.exec('RELEASE SAVEPOINT cursada_sync_all_links;');
  } catch (err) {
    db.exec('ROLLBACK TO SAVEPOINT cursada_sync_all_links;');
    db.exec('RELEASE SAVEPOINT cursada_sync_all_links;');
    throw err;
  }
}

/**
 * Returns forward `[[WikiLinks]]` from `noteId` and incoming backlinks pointing to `noteId`.
 */
export function getNoteLinksSummary(
  db: DatabaseSync,
  noteId: string
): NoteLinksSummary {
  const note = getNoteById(db, noteId);
  if (!note) {
    return {
      noteId,
      forwardLinks: [],
      backlinks: [],
    };
  }

  const forwardRows = db
    .prepare(
      `SELECT
        nl.id,
        nl.source_note_id,
        sn.title AS source_note_title,
        sn.course_id AS source_course_id,
        sc.name AS source_course_name,
        nl.target_note_id,
        nl.target_title,
        nl.display_text,
        nl.context_snippet
       FROM note_links nl
       INNER JOIN notes sn ON sn.id = nl.source_note_id
       INNER JOIN courses sc ON sc.id = sn.course_id
       WHERE nl.source_note_id = ?
       ORDER BY nl.rowid ASC`
    )
    .all(noteId) as unknown as NoteLinkJoinedRow[];

  const candidateBacklinkRows = db
    .prepare(
      `SELECT
        nl.id,
        nl.source_note_id,
        sn.title AS source_note_title,
        sn.course_id AS source_course_id,
        sc.name AS source_course_name,
        nl.target_note_id,
        nl.target_title,
        nl.display_text,
        nl.context_snippet
       FROM note_links nl
       INNER JOIN notes sn ON sn.id = nl.source_note_id
       INNER JOIN courses sc ON sc.id = sn.course_id
       WHERE nl.source_note_id != ?
         AND (nl.target_note_id = ? OR nl.target_note_id IS NULL)
       ORDER BY sn.updated_at DESC, nl.rowid ASC`
    )
    .all(noteId, noteId) as unknown as NoteLinkJoinedRow[];

  const normalizedNoteTitle = normalizeWikiTitle(note.title);
  const seenSourceNotes = new Set<string>();
  const backlinks: NoteLinkItem[] = [];

  for (const row of candidateBacklinkRows) {
    const matchesTarget =
      row.target_note_id === noteId ||
      (row.target_note_id === null &&
        normalizedNoteTitle.length > 0 &&
        normalizeWikiTitle(row.target_title) === normalizedNoteTitle);

    if (!matchesTarget || seenSourceNotes.has(row.source_note_id)) {
      continue;
    }

    seenSourceNotes.add(row.source_note_id);
    backlinks.push(mapNoteLinkRow(row));
  }

  return {
    noteId,
    forwardLinks: forwardRows.map(mapNoteLinkRow),
    backlinks,
  };
}

/**
 * Opens an existing note matching `targetTitle` (preferring `courseId`), or creates
 * a new note in `courseId` with that title and synchronizes WikiLinks.
 */
export function openOrCreateWikiLinkNote(
  db: DatabaseSync,
  input: { courseId: string; targetTitle: string }
): NoteWithCourse {
  const trimmedTitle = (input.targetTitle ?? '').trim();
  if (!trimmedTitle) {
    throw new Error('El título del enlace no puede estar vacío.');
  }

  const course = getCourseById(db, input.courseId);
  if (!course) {
    throw new Error(`Course not found: ${input.courseId}`);
  }

  const allNotes = listNotes(db);
  const existing = resolveNoteByWikiTitle(trimmedTitle, allNotes, input.courseId);
  if (existing) {
    syncNoteLinks(db, existing.id);
    return existing;
  }

  const created = createNote(db, {
    courseId: input.courseId,
    title: trimmedTitle,
    content: '',
    origin: 'manual',
    isPinned: false,
  });

  syncNoteLinks(db, created.id);
  return created;
}

/**
 * Builds the 2D knowledge graph of notes (`nodes`) and deduplicated links (`edges`),
 * optionally filtered by `courseId` and whether archived courses are included.
 */
export function getKnowledgeGraph(
  db: DatabaseSync,
  opts?: { courseId?: string; includeArchived?: boolean }
): KnowledgeGraphData {
  const includeArchived = Boolean(opts?.includeArchived);
  const filterCourseId = opts?.courseId?.trim() || undefined;

  const courses = listCourses(db, { status: 'all' });
  const courseById = new Map<
    string,
    { name: string; color: CourseColor; status: CourseStatus }
  >(
    courses.map((c) => [
      c.id,
      { name: c.name, color: c.color, status: c.status },
    ])
  );

  const notes = listNotes(
    db,
    filterCourseId ? { courseId: filterCourseId } : undefined
  );

  const visibleNotes = notes.filter((n) => {
    const course = courseById.get(n.courseId);
    if (!course) {
      return false;
    }
    if (!includeArchived && course.status === 'archived') {
      return false;
    }
    return true;
  });

  const visibleNoteIds = new Set(visibleNotes.map((n) => n.id));
  const rawLinks = db
    .prepare(
      `SELECT id, source_note_id, target_note_id, target_title, display_text
       FROM note_links
       WHERE target_note_id IS NOT NULL
       ORDER BY rowid ASC`
    )
    .all() as unknown as RawNoteLinkRow[];

  const seenEdgeKeys = new Set<string>();
  const edges: KnowledgeGraphEdge[] = [];
  const degreeByNoteId = new Map<string, number>();

  for (const link of rawLinks) {
    const sourceId = link.source_note_id;
    const targetId = link.target_note_id;
    if (!targetId || sourceId === targetId) {
      continue;
    }
    if (!visibleNoteIds.has(sourceId) || !visibleNoteIds.has(targetId)) {
      continue;
    }

    const edgeKey = `${sourceId}->${targetId}`;
    if (seenEdgeKeys.has(edgeKey)) {
      continue;
    }
    seenEdgeKeys.add(edgeKey);

    edges.push({
      id: link.id,
      sourceNoteId: sourceId,
      targetNoteId: targetId,
      label: link.display_text || link.target_title,
    });

    degreeByNoteId.set(sourceId, (degreeByNoteId.get(sourceId) ?? 0) + 1);
    degreeByNoteId.set(targetId, (degreeByNoteId.get(targetId) ?? 0) + 1);
  }

  const nodes: KnowledgeGraphNode[] = visibleNotes.map((note) => {
    const course = courseById.get(note.courseId);
    return {
      id: note.id,
      noteId: note.id,
      title: note.title,
      courseId: note.courseId,
      courseName: course?.name ?? note.courseName,
      courseColor: course?.color ?? note.courseColor,
      courseStatus: course?.status ?? 'active',
      degree: degreeByNoteId.get(note.id) ?? 0,
      updatedAt: note.updatedAt,
    };
  });

  return {
    nodes,
    edges,
  };
}
