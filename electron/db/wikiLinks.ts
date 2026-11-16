import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface ParsedWikiLink {
  raw: string;
  targetTitle: string;
  displayText: string;
  contextSnippet: string;
}

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
