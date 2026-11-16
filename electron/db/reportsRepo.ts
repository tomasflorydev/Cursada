import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ExamStageTag,
  PracticeExamFormat,
  ReportCitationSource,
  SaveStudyReportInput,
  StoredReport,
  StudyReportType,
} from '../types.js';

interface StudyReportRow {
  id: string;
  course_id: string;
  course_name: string;
  title: string;
  report_type: StudyReportType;
  summary_line: string;
  content: string;
  notes_count: number;
  pdfs_count: number;
  used_local_model: number;
  model_label: string;
  note_id: string | null;
  citations_json: string;
  source_ids_json: string;
  note_ids_json: string;
  exam_stage: string;
  include_notes: number;
  exam_format: string | null;
  custom_instructions: string;
  created_at: string;
  updated_at: string;
}

const VALID_REPORT_TYPES = new Set<StudyReportType>([
  'summary',
  'report',
  'study_guide',
  'practice_exam',
]);

const VALID_EXAM_STAGES = new Set<string>([
  'all',
  'general',
  'parcial_1',
  'parcial_2',
  'final',
]);

const VALID_EXAM_FORMATS = new Set<PracticeExamFormat>([
  'develop',
  'multiple_choice',
  'mixed',
]);

function parseJsonArray<T>(raw: string, fallback: T[] = []): T[] {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function mapStudyReportRow(row: StudyReportRow): StoredReport {
  const examStage: ExamStageTag | 'all' = VALID_EXAM_STAGES.has(row.exam_stage)
    ? (row.exam_stage as ExamStageTag | 'all')
    : 'all';
  const examFormat =
    row.exam_format && VALID_EXAM_FORMATS.has(row.exam_format as PracticeExamFormat)
      ? (row.exam_format as PracticeExamFormat)
      : undefined;

  return {
    id: row.id,
    courseId: row.course_id,
    courseName: row.course_name,
    title: row.title,
    reportType: row.report_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summaryLine: row.summary_line,
    content: row.content,
    notesCount: Number(row.notes_count ?? 0),
    pdfsCount: Number(row.pdfs_count ?? 0),
    usedLocalModel: Boolean(row.used_local_model),
    modelLabel: row.model_label || 'síntesis offline',
    noteId: row.note_id ?? null,
    citations: parseJsonArray<ReportCitationSource>(row.citations_json),
    sourceIds: parseJsonArray<string>(row.source_ids_json),
    noteIds: parseJsonArray<string>(row.note_ids_json),
    examStage,
    includeNotes: Boolean(row.include_notes),
    ...(examFormat ? { examFormat } : {}),
    ...(row.custom_instructions ? { customInstructions: row.custom_instructions } : {}),
  };
}

function assertCourseAndResolveName(
  db: DatabaseSync,
  rawCourseId: string,
  fallbackName?: string
): { courseId: string; courseName: string } {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('La materia del informe es obligatoria.');
  }
  const row = db
    .prepare('SELECT id, name FROM courses WHERE id = ?')
    .get(courseId) as { id: string; name: string } | undefined;
  if (!row) {
    throw new Error(`No se encontró la materia solicitada (${courseId}).`);
  }
  return {
    courseId: row.id,
    courseName: (fallbackName ?? '').trim() || row.name,
  };
}

export function listStudyReports(
  db: DatabaseSync,
  courseId?: string
): StoredReport[] {
  const trimmedCourseId = (courseId ?? '').trim();
  const sql = `
    SELECT
      sr.*,
      COALESCE(NULLIF(sr.course_name, ''), c.name, 'Materia') AS resolved_course_name
    FROM study_reports sr
    INNER JOIN courses c ON c.id = sr.course_id
    ${trimmedCourseId ? 'WHERE sr.course_id = ?' : ''}
    ORDER BY sr.updated_at DESC, sr.created_at DESC, sr.id ASC
  `;

  const rows = (
    trimmedCourseId
      ? db.prepare(sql).all(trimmedCourseId)
      : db.prepare(sql).all()
  ) as unknown as Array<StudyReportRow & { resolved_course_name?: string }>;

  return rows.map((row) =>
    mapStudyReportRow({
      ...row,
      course_name: row.resolved_course_name ?? row.course_name,
    })
  );
}

export function getStudyReportById(
  db: DatabaseSync,
  id: string
): StoredReport | null {
  const validId = (id ?? '').trim();
  if (!validId) {
    return null;
  }
  const row = db
    .prepare('SELECT * FROM study_reports WHERE id = ?')
    .get(validId) as StudyReportRow | undefined;
  return row ? mapStudyReportRow(row) : null;
}

export function saveStudyReport(
  db: DatabaseSync,
  input: SaveStudyReportInput
): StoredReport {
  const { courseId, courseName } = assertCourseAndResolveName(
    db,
    input.courseId,
    input.courseName
  );
  const title = (input.title ?? '').trim();
  if (!title) {
    throw new Error('El título del informe no puede estar vacío.');
  }
  if (!VALID_REPORT_TYPES.has(input.reportType)) {
    throw new Error(`Tipo de informe inválido: "${String(input.reportType)}".`);
  }

  const content = typeof input.content === 'string' ? input.content : '';
  const id = (input.id ?? '').trim() || randomUUID();
  const existing = getStudyReportById(db, id);
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt ?? now;

  let resolvedNoteId: string | null = input.noteId ?? null;
  if (resolvedNoteId) {
    const noteRow = db
      .prepare('SELECT id FROM notes WHERE id = ?')
      .get(resolvedNoteId) as { id: string } | undefined;
    if (!noteRow) {
      resolvedNoteId = null;
    }
  }

  const examStage =
    input.examStage && VALID_EXAM_STAGES.has(input.examStage)
      ? input.examStage
      : 'all';
  const examFormat =
    input.examFormat && VALID_EXAM_FORMATS.has(input.examFormat)
      ? input.examFormat
      : null;

  const summaryLine = (input.summaryLine ?? '').trim();
  const notesCount = Math.max(0, Math.floor(Number(input.notesCount ?? 0)));
  const pdfsCount = Math.max(0, Math.floor(Number(input.pdfsCount ?? 0)));
  const usedLocalModel = input.usedLocalModel ? 1 : 0;
  const modelLabel = (input.modelLabel ?? '').trim() || (usedLocalModel ? 'modelo local' : 'síntesis offline');
  const citationsJson = JSON.stringify(Array.isArray(input.citations) ? input.citations : []);
  const sourceIdsJson = JSON.stringify(Array.isArray(input.sourceIds) ? input.sourceIds : []);
  const noteIdsJson = JSON.stringify(Array.isArray(input.noteIds) ? input.noteIds : []);
  const includeNotes = input.includeNotes !== false ? 1 : 0;
  const customInstructions = (input.customInstructions ?? '').trim();

  db.prepare(
    `INSERT INTO study_reports (
       id, course_id, course_name, title, report_type, summary_line, content,
       notes_count, pdfs_count, used_local_model, model_label, note_id,
       citations_json, source_ids_json, note_ids_json, exam_stage,
       include_notes, exam_format, custom_instructions, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       course_id = excluded.course_id,
       course_name = excluded.course_name,
       title = excluded.title,
       report_type = excluded.report_type,
       summary_line = excluded.summary_line,
       content = excluded.content,
       notes_count = excluded.notes_count,
       pdfs_count = excluded.pdfs_count,
       used_local_model = excluded.used_local_model,
       model_label = excluded.model_label,
       note_id = excluded.note_id,
       citations_json = excluded.citations_json,
       source_ids_json = excluded.source_ids_json,
       note_ids_json = excluded.note_ids_json,
       exam_stage = excluded.exam_stage,
       include_notes = excluded.include_notes,
       exam_format = excluded.exam_format,
       custom_instructions = excluded.custom_instructions,
       updated_at = excluded.updated_at`
  ).run(
    id,
    courseId,
    courseName,
    title,
    input.reportType,
    summaryLine,
    content,
    notesCount,
    pdfsCount,
    usedLocalModel,
    modelLabel,
    resolvedNoteId,
    citationsJson,
    sourceIdsJson,
    noteIdsJson,
    examStage,
    includeNotes,
    examFormat,
    customInstructions,
    createdAt,
    now
  );

  const saved = getStudyReportById(db, id);
  if (!saved) {
    throw new Error('No se pudo cargar el informe guardado en SQLite.');
  }
  return saved;
}

export function deleteStudyReport(db: DatabaseSync, id: string): void {
  const validId = (id ?? '').trim();
  if (!validId) {
    throw new Error('ID de informe inválido o vacío.');
  }
  db.prepare('DELETE FROM study_reports WHERE id = ?').run(validId);
}
