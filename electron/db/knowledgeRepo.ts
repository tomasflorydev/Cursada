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
import {
  normalizeWikiTitle,
  parseWikiLinksFromMarkdown,
  resolveNoteByWikiTitle,
  syncNoteLinks,
  type ParsedWikiLink,
} from './wikiLinks.js';

export {
  normalizeWikiTitle,
  parseWikiLinksFromMarkdown,
  resolveNoteByWikiTitle,
  syncNoteLinks,
  type ParsedWikiLink,
};

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

  return createNote(db, {
    courseId: input.courseId,
    title: trimmedTitle,
    content: '',
    origin: 'manual',
    isPinned: false,
  });
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
