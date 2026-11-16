export interface ParsedWikiLink {
  raw: string;
  targetTitle: string;
  displayText: string;
  contextSnippet: string;
}

const MAX_SNIPPET_LENGTH = 180;

/**
 * Normalizes a note title or WikiLink target for accent-, case-, and whitespace-insensitive matching.
 */
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

  const rawSentence = line.slice(sentStart, sentEnd);
  const cleaned = stripLeadingMarkdownPrefix(rawSentence);
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

  const budget = MAX_SNIPPET_LENGTH - 2; // reserve space for leading/trailing ellipsis
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

/**
 * Parses `[[Target]]` and `[[Target|Visible Text]]` WikiLinks from Markdown content.
 * Ignores fenced code blocks, inline code spans, escaped `\[[...]]`, and embeds `![[...]]`.
 */
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

/**
 * Resolves a WikiLink target title against existing notes, preferring exact and normalized
 * matches inside `preferredCourseId` before falling back across all notes.
 */
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

function unquoteYamlScalar(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.length >= 2) {
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      const inner = trimmed.slice(1, -1);
      if (trimmed.startsWith('"')) {
        return inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
      }
      return inner.replace(/''/g, "'").trim();
    }
  }
  return trimmed;
}

function parseInlineYamlArray(rawValue: string): string {
  const inner = rawValue.slice(1, -1).trim();
  if (!inner) {
    return '';
  }
  return inner
    .split(',')
    .map((item) => unquoteYamlScalar(item))
    .filter((item) => item.length > 0)
    .join(', ');
}

/**
 * Safely parses YAML frontmatter delimited by `---` at the start of a Markdown document.
 * Arrays (inline `[a, b]` or multiline `- item`) are joined as comma-separated strings.
 */
export function parseMarkdownFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const input = (raw ?? '').replace(/^\uFEFF/, '');
  const normalized = input.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { frontmatter: {}, body: raw ?? '' };
  }

  let closingLineIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '---' || trimmed === '...') {
      closingLineIndex = i;
      break;
    }
  }

  if (closingLineIndex === -1) {
    return { frontmatter: {}, body: raw ?? '' };
  }

  const frontmatter: Record<string, string> = {};
  const yamlLines = lines.slice(1, closingLineIndex);

  let i = 0;
  while (i < yamlLines.length) {
    const line = yamlLines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      i += 1;
      continue;
    }

    const keyMatch = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (!keyMatch) {
      i += 1;
      continue;
    }

    const key = keyMatch[1];
    const rawVal = keyMatch[2].trim();

    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      frontmatter[key] = parseInlineYamlArray(rawVal);
      i += 1;
      continue;
    }

    if (rawVal === '') {
      const listItems: string[] = [];
      let j = i + 1;
      while (j < yamlLines.length) {
        const nextLine = yamlLines[j];
        const nextTrimmed = nextLine.trim();
        if (!nextTrimmed || nextTrimmed.startsWith('#')) {
          j += 1;
          continue;
        }
        const listMatch = /^\s*-\s+(.*)$/.exec(nextLine);
        if (listMatch) {
          const val = unquoteYamlScalar(listMatch[1]);
          if (val) {
            listItems.push(val);
          }
          j += 1;
        } else {
          break;
        }
      }
      if (listItems.length > 0) {
        frontmatter[key] = listItems.join(', ');
        i = j;
        continue;
      }
      frontmatter[key] = '';
      i += 1;
      continue;
    }

    frontmatter[key] = unquoteYamlScalar(rawVal);
    i += 1;
  }

  const body = lines.slice(closingLineIndex + 1).join('\n').replace(/^\n+/, '');
  return { frontmatter, body };
}
