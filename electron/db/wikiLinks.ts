import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  normalizeWikiTitle,
  parseWikiLinksFromMarkdown,
  resolveNoteByWikiTitle,
  type ParsedWikiLink,
} from '../../shared/wikiLinks.js';

export {
  normalizeWikiTitle,
  parseWikiLinksFromMarkdown,
  resolveNoteByWikiTitle,
  type ParsedWikiLink,
};

interface MinimalNoteRow {
  id: string;
  course_id: string;
  title: string;
  content: string;
}

interface MinimalNoteTitleRow {
  id: string;
  course_id: string;
  title: string;
}

interface RawNoteLinkTargetRow {
  id: string;
  source_note_id: string;
  target_note_id: string | null;
  target_title: string;
  display_text: string;
}

/**
 * Synchronizes outgoing `[[WikiLinks]]` for `noteId`, and resolves any previously
 * unresolved `note_links` rows whose normalized target title matches this note's title.
 */
export function syncNoteLinks(db: DatabaseSync, noteId: string): void {
  const noteRow = db
    .prepare('SELECT id, course_id, title, content FROM notes WHERE id = ?')
    .get(noteId) as MinimalNoteRow | undefined;

  db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(noteId);

  if (!noteRow) {
    return;
  }

  const allNoteRows = db
    .prepare('SELECT id, course_id, title FROM notes')
    .all() as unknown as MinimalNoteTitleRow[];
  const allNotes = allNoteRows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
  }));

  const parsedLinks = parseWikiLinksFromMarkdown(noteRow.content);
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
      noteRow.course_id
    );
    insertStmt.run(
      randomUUID(),
      noteRow.id,
      resolved ? resolved.id : null,
      link.targetTitle,
      link.displayText,
      link.contextSnippet,
      now
    );
  }

  const normalizedNoteTitle = normalizeWikiTitle(noteRow.title);
  if (!normalizedNoteTitle) {
    return;
  }

  // Back-resolve previously orphaned note_links pointing to this note's title
  const unresolvedRows = db
    .prepare(
      'SELECT id, source_note_id, target_note_id, target_title, display_text FROM note_links WHERE target_note_id IS NULL'
    )
    .all() as unknown as RawNoteLinkTargetRow[];

  const updateTargetStmt = db.prepare(
    'UPDATE note_links SET target_note_id = ? WHERE id = ?'
  );

  for (const row of unresolvedRows) {
    if (normalizeWikiTitle(row.target_title) === normalizedNoteTitle) {
      updateTargetStmt.run(noteRow.id, row.id);
    }
  }

  // Re-evaluate incoming resolved links if this note was renamed
  const incomingRows = db
    .prepare(
      'SELECT id, source_note_id, target_note_id, target_title, display_text FROM note_links WHERE target_note_id = ?'
    )
    .all(noteRow.id) as unknown as RawNoteLinkTargetRow[];

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
