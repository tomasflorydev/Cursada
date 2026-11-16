import type {
  CourseColor,
  CourseStatus,
  CourseWithSchedules,
  ExamStageTag,
  ImportObsidianVaultInput,
  ImportObsidianVaultResult,
  KnowledgeGraphData,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  NoteLinkItem,
  NoteLinksSummary,
  NoteWithCourse,
} from '../../types/domain';
import {
  normalizeWikiTitle,
  parseMarkdownFrontmatter,
  parseWikiLinksFromMarkdown,
  resolveNoteByWikiTitle,
} from '../knowledge/wikiLinksParser';
import { mockCreateCourse, mockListCourses } from './mockCourses';
import { mockCreateNote, mockGetNote, mockListNotes } from './mockNotes';

const VALID_MOCK_COLORS: readonly CourseColor[] = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'rose',
  'cyan',
  'orange',
  'slate',
];

const mockImportedFrontmatter = new Map<string, Record<string, string>>();

export function resetMockKnowledge(): void {
  mockImportedFrontmatter.clear();
}

export function getMockImportedFrontmatter(
  noteId: string
): Record<string, string> | undefined {
  return mockImportedFrontmatter.get(noteId);
}

function normalizeRelativePath(rawPath: string): string {
  return (rawPath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
}

function isHiddenOrUnsafeRelativePath(relPath: string): boolean {
  if (!relPath) {
    return true;
  }
  const segments = relPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    return true;
  }
  return segments.some((seg) => seg.startsWith('.') || seg === '..');
}

function isMarkdownFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

function extractNoteTitleFromRelativePath(relPath: string): string {
  const parts = relPath.split('/');
  const fileName = parts[parts.length - 1] ?? '';
  const lastDot = fileName.lastIndexOf('.');
  const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return base.trim() || 'Nota sin título';
}

function resolveExamStageFromFrontmatter(
  frontmatter: Record<string, string>
): ExamStageTag {
  let rawStage = '';
  for (const [k, v] of Object.entries(frontmatter)) {
    const lowerKey = k.trim().toLowerCase();
    if (
      lowerKey === 'exam_stage' ||
      lowerKey === 'examstage' ||
      lowerKey === 'parcial' ||
      lowerKey === 'instancia'
    ) {
      rawStage = v;
      break;
    }
  }

  const normalized = normalizeWikiTitle(rawStage).replace(/[_-]+/g, ' ');
  if (
    normalized === 'parcial 1' ||
    normalized === '1' ||
    normalized === '1er parcial' ||
    normalized === 'primer parcial' ||
    normalized === 'p1'
  ) {
    return 'parcial_1';
  }
  if (
    normalized === 'parcial 2' ||
    normalized === '2' ||
    normalized === '2do parcial' ||
    normalized === 'segundo parcial' ||
    normalized === 'p2'
  ) {
    return 'parcial_2';
  }
  if (normalized === 'final' || normalized === 'examen final') {
    return 'final';
  }
  return 'general';
}

export async function mockGetNoteLinks(
  noteId: string
): Promise<NoteLinksSummary> {
  const note = await mockGetNote(noteId);
  if (!note) {
    return {
      noteId,
      forwardLinks: [],
      backlinks: [],
    };
  }

  const allNotes = await mockListNotes();
  const parsedForward = parseWikiLinksFromMarkdown(note.content);

  const forwardLinks: NoteLinkItem[] = parsedForward.map((link, index) => {
    const target = resolveNoteByWikiTitle(
      link.targetTitle,
      allNotes,
      note.courseId
    );
    return {
      id: `mock-fwd:${note.id}:${index}:${normalizeWikiTitle(link.targetTitle)}`,
      sourceNoteId: note.id,
      sourceNoteTitle: note.title,
      sourceCourseId: note.courseId,
      sourceCourseName: note.courseName,
      targetNoteId: target ? target.id : null,
      targetTitle: link.targetTitle,
      displayText: link.displayText,
      contextSnippet: link.contextSnippet,
    };
  });

  const normalizedNoteTitle = normalizeWikiTitle(note.title);
  const backlinks: NoteLinkItem[] = [];

  for (const source of allNotes) {
    if (source.id === note.id) {
      continue;
    }
    const parsed = parseWikiLinksFromMarkdown(source.content);
    for (let idx = 0; idx < parsed.length; idx += 1) {
      const link = parsed[idx];
      const resolved = resolveNoteByWikiTitle(
        link.targetTitle,
        allNotes,
        source.courseId
      );
      const matchesThisNote =
        (resolved !== null && resolved.id === note.id) ||
        (resolved === null &&
          normalizedNoteTitle.length > 0 &&
          normalizeWikiTitle(link.targetTitle) === normalizedNoteTitle);

      if (matchesThisNote) {
        backlinks.push({
          id: `mock-back:${source.id}->${note.id}:${idx}`,
          sourceNoteId: source.id,
          sourceNoteTitle: source.title,
          sourceCourseId: source.courseId,
          sourceCourseName: source.courseName,
          targetNoteId: note.id,
          targetTitle: link.targetTitle,
          displayText: link.displayText,
          contextSnippet: link.contextSnippet,
        });
        break;
      }
    }
  }

  return {
    noteId,
    forwardLinks,
    backlinks,
  };
}

export async function mockOpenOrCreateWikiLink(input: {
  courseId: string;
  targetTitle: string;
}): Promise<NoteWithCourse> {
  const trimmedTitle = (input.targetTitle ?? '').trim();
  if (!trimmedTitle) {
    throw new Error('El título del enlace no puede estar vacío.');
  }

  const allNotes = await mockListNotes();
  const existing = resolveNoteByWikiTitle(
    trimmedTitle,
    allNotes,
    input.courseId
  );
  if (existing) {
    return existing;
  }

  return mockCreateNote({
    courseId: input.courseId,
    title: trimmedTitle,
    content: '',
    origin: 'manual',
    isPinned: false,
  });
}

export async function mockGetKnowledgeGraph(opts?: {
  courseId?: string;
  includeArchived?: boolean;
}): Promise<KnowledgeGraphData> {
  const includeArchived = Boolean(opts?.includeArchived);
  const filterCourseId = opts?.courseId?.trim() || undefined;

  const [courses, allNotes] = await Promise.all([
    mockListCourses({ status: 'all' }),
    mockListNotes(),
  ]);

  const courseById = new Map<
    string,
    { name: string; color: CourseColor; status: CourseStatus }
  >(
    courses.map((c) => [
      c.id,
      { name: c.name, color: c.color, status: c.status },
    ])
  );

  const visibleNotes = allNotes.filter((note) => {
    if (filterCourseId && note.courseId !== filterCourseId) {
      return false;
    }
    const course = courseById.get(note.courseId);
    if (!course) {
      return false;
    }
    if (!includeArchived && course.status === 'archived') {
      return false;
    }
    return true;
  });

  const visibleNoteIds = new Set(visibleNotes.map((n) => n.id));
  const seenEdgeKeys = new Set<string>();
  const edges: KnowledgeGraphEdge[] = [];
  const degreeByNoteId = new Map<string, number>();

  for (const source of visibleNotes) {
    const parsedLinks = parseWikiLinksFromMarkdown(source.content);
    for (const link of parsedLinks) {
      const target = resolveNoteByWikiTitle(
        link.targetTitle,
        allNotes,
        source.courseId
      );
      if (!target || target.id === source.id || !visibleNoteIds.has(target.id)) {
        continue;
      }

      const edgeKey = `${source.id}->${target.id}`;
      if (seenEdgeKeys.has(edgeKey)) {
        continue;
      }
      seenEdgeKeys.add(edgeKey);

      edges.push({
        id: `mock-edge:${edgeKey}`,
        sourceNoteId: source.id,
        targetNoteId: target.id,
        label: link.displayText || link.targetTitle,
      });

      degreeByNoteId.set(source.id, (degreeByNoteId.get(source.id) ?? 0) + 1);
      degreeByNoteId.set(target.id, (degreeByNoteId.get(target.id) ?? 0) + 1);
    }
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

export async function mockImportObsidianVault(
  input?: ImportObsidianVaultInput
): Promise<ImportObsidianVaultResult> {
  if (!input?.filesPayload || input.filesPayload.length === 0) {
    return {
      canceled: true,
      vaultPath: null,
      coursesCreated: [],
      notesImportedCount: 0,
      linksResolvedCount: 0,
    };
  }

  const targetStatus: CourseStatus = input.targetStatus ?? 'active';
  const courseNameOverride = input.courseNameOverride?.trim() || undefined;
  const rawVaultDir = input.vaultDir?.trim() || undefined;
  const vaultBasename = rawVaultDir
    ? rawVaultDir.split(/[\\/]/).filter(Boolean).pop() || 'Vault Obsidian'
    : 'Vault Obsidian';

  const markdownFiles = input.filesPayload
    .map((entry) => ({
      relativePath: normalizeRelativePath(entry.relativePath),
      content: typeof entry.content === 'string' ? entry.content : '',
    }))
    .filter(
      (entry) =>
        !isHiddenOrUnsafeRelativePath(entry.relativePath) &&
        isMarkdownFile(entry.relativePath)
    );

  const courseByGroupName = new Map<string, CourseWithSchedules>();
  const coursesCreated: CourseWithSchedules[] = [];
  const importedNotes: NoteWithCourse[] = [];
  let colorIndex = 0;

  async function getOrCreateCourse(
    groupName: string
  ): Promise<CourseWithSchedules> {
    const key = groupName.trim() || vaultBasename;
    const existing = courseByGroupName.get(key);
    if (existing) {
      return existing;
    }

    const color = VALID_MOCK_COLORS[colorIndex % VALID_MOCK_COLORS.length];
    colorIndex += 1;

    const created = await mockCreateCourse({
      name: key,
      color,
      status: targetStatus,
      professor: '',
      term: '',
      schedules: [],
    });
    courseByGroupName.set(key, created);
    coursesCreated.push(created);
    return created;
  }

  for (const file of markdownFiles) {
    const segments = file.relativePath.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) {
      continue;
    }

    const groupName = courseNameOverride
      ? courseNameOverride
      : segments.length > 1
        ? segments[0]
        : vaultBasename;

    const course = await getOrCreateCourse(groupName);
    const { frontmatter, body } = parseMarkdownFrontmatter(file.content);
    const title = extractNoteTitleFromRelativePath(file.relativePath);
    const examStage = resolveExamStageFromFrontmatter(frontmatter);

    const createdNote = await mockCreateNote({
      courseId: course.id,
      title,
      content: body,
      origin: 'manual',
      isPinned: false,
      examStage,
      frontmatter,
    });

    if (Object.keys(frontmatter).length > 0) {
      mockImportedFrontmatter.set(createdNote.id, frontmatter);
    }
    importedNotes.push(createdNote);
  }

  const allNotes = await mockListNotes();
  let linksResolvedCount = 0;
  for (const imported of importedNotes) {
    const parsedLinks = parseWikiLinksFromMarkdown(imported.content);
    for (const link of parsedLinks) {
      const target = resolveNoteByWikiTitle(
        link.targetTitle,
        allNotes,
        imported.courseId
      );
      if (target) {
        linksResolvedCount += 1;
      }
    }
  }

  return {
    canceled: false,
    vaultPath: rawVaultDir ?? courseNameOverride ?? 'obsidian-vault',
    coursesCreated,
    notesImportedCount: importedNotes.length,
    linksResolvedCount,
  };
}
