import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createCourse, VALID_COURSE_COLORS, validateCourseStatus } from '../db/coursesRepo.js';
import { syncAllNoteLinks } from '../db/knowledgeRepo.js';
import { createNote } from '../db/notesRepo.js';
import { parseMarkdownFrontmatter } from '../../shared/wikiLinks.js';
import type {
  CourseColor,
  CourseStatus,
  CourseWithSchedules,
  ExamStageTag,
  ImportObsidianVaultInput,
  ImportObsidianVaultResult,
} from '../types.js';

export { parseMarkdownFrontmatter };

interface VaultMarkdownFile {
  relativePath: string;
  content: string;
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
  return segments.some(
    (seg) => seg.startsWith('.') || seg === '..'
  );
}

function isMarkdownFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

function collectMarkdownFilesFromDisk(vaultRoot: string): VaultMarkdownFile[] {
  const results: VaultMarkdownFile[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        const rel = normalizeRelativePath(path.relative(vaultRoot, fullPath));
        if (!isHiddenOrUnsafeRelativePath(rel)) {
          results.push({
            relativePath: rel,
            content: fs.readFileSync(fullPath, 'utf8'),
          });
        }
      }
    }
  }

  walk(vaultRoot);
  return results;
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

  const normalized = rawStage
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

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

function extractNoteTitleFromRelativePath(relPath: string): string {
  const fileName = path.posix.basename(relPath);
  const ext = path.posix.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  return base.trim() || 'Nota sin título';
}

/**
 * Imports an Obsidian vault (from `filesPayload` or recursively from `vaultDir`),
 * creates Anotadores (`active` or `archived`), persists YAML frontmatter + `exam_stage`,
 * and resolves all `[[WikiLinks]]` and backlinks immediately.
 */
export function importObsidianVaultFromDir(
  db: DatabaseSync,
  input: ImportObsidianVaultInput
): ImportObsidianVaultResult {
  const targetStatus: CourseStatus = input.targetStatus ?? 'active';
  validateCourseStatus(targetStatus);

  const courseNameOverride = input.courseNameOverride?.trim() || undefined;
  const hasPayload = Array.isArray(input.filesPayload);
  const rawVaultDir = input.vaultDir?.trim() || undefined;

  if (!hasPayload && !rawVaultDir) {
    return {
      canceled: true,
      vaultPath: null,
      coursesCreated: [],
      notesImportedCount: 0,
      linksResolvedCount: 0,
    };
  }

  let vaultPath: string | null = null;
  let vaultBasename = 'Vault Obsidian';
  let markdownFiles: VaultMarkdownFile[] = [];

  if (hasPayload) {
    vaultPath = rawVaultDir ?? courseNameOverride ?? 'obsidian-vault';
    if (rawVaultDir) {
      const base = path.basename(rawVaultDir);
      if (base) {
        vaultBasename = base;
      }
    }
    markdownFiles = (input.filesPayload ?? [])
      .map((entry) => ({
        relativePath: normalizeRelativePath(entry.relativePath),
        content: typeof entry.content === 'string' ? entry.content : '',
      }))
      .filter(
        (entry) =>
          !isHiddenOrUnsafeRelativePath(entry.relativePath) &&
          isMarkdownFile(entry.relativePath)
      );
  } else if (rawVaultDir) {
    const resolvedDir = path.resolve(rawVaultDir);
    if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
      throw new Error(
        `La carpeta de Obsidian no existe o no es un directorio válido: ${rawVaultDir}`
      );
    }
    vaultPath = resolvedDir;
    vaultBasename = path.basename(resolvedDir) || 'Vault Obsidian';
    markdownFiles = collectMarkdownFilesFromDisk(resolvedDir);
  }

  const courseByGroupName = new Map<string, CourseWithSchedules>();
  const coursesCreated: CourseWithSchedules[] = [];
  const importedNoteIds: string[] = [];
  let colorIndex = 0;

  const updateMetaStmt = db.prepare(
    'UPDATE notes SET frontmatter_json = ?, exam_stage = ? WHERE id = ?'
  );

  const getOrCreateCourseForGroup = (groupName: string): CourseWithSchedules => {
    const key = groupName.trim() || vaultBasename;
    const existing = courseByGroupName.get(key);
    if (existing) {
      return existing;
    }
    const color: CourseColor =
      VALID_COURSE_COLORS[colorIndex % VALID_COURSE_COLORS.length];
    colorIndex += 1;

    const created = createCourse(db, {
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
  };

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

    const course = getOrCreateCourseForGroup(groupName);
    const { frontmatter, body } = parseMarkdownFrontmatter(file.content);
    const title = extractNoteTitleFromRelativePath(file.relativePath);
    const examStage = resolveExamStageFromFrontmatter(frontmatter);

    const createdNote = createNote(db, {
      courseId: course.id,
      title,
      content: body,
      origin: 'manual',
      isPinned: false,
    });

    updateMetaStmt.run(
      JSON.stringify(frontmatter),
      examStage,
      createdNote.id
    );

    importedNoteIds.push(createdNote.id);
  }

  syncAllNoteLinks(db);

  let linksResolvedCount = 0;
  if (importedNoteIds.length > 0) {
    const placeholders = importedNoteIds.map(() => '?').join(', ');
    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM note_links
         WHERE target_note_id IS NOT NULL
           AND source_note_id IN (${placeholders})`
      )
      .get(...importedNoteIds) as { count: number } | undefined;
    linksResolvedCount = Number(countRow?.count ?? 0);
  }

  return {
    canceled: false,
    vaultPath,
    coursesCreated,
    notesImportedCount: importedNoteIds.length,
    linksResolvedCount,
  };
}
