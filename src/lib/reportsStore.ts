import type {
  ExamStageTag,
  NoteWithCourse,
  PracticeExamFormat,
  ReportCitationSource,
  Source,
  StoredReport,
  StudyReportType,
} from '../types/domain';
import { cursadaClient, notifyCursadaDataChanged } from './api/client';

export type { ReportCitationSource, StoredReport } from '../types/domain';
export type NoteFontSize = 'small' | 'normal' | 'large';

export interface GenerateStoredReportInput {
  courseId: string;
  courseName?: string;
  reportType: StudyReportType;
  sourceIds?: string[];
  noteIds?: string[];
  examStage?: ExamStageTag | 'all';
  includeNotes?: boolean;
  examFormat?: PracticeExamFormat;
  customInstructions?: string;
  title?: string;
  autoSaveAsNote?: boolean;
}

let reportsMemoryStore: StoredReport[] = [];
let hasHydratedReports = false;
let inflightRefresh: Promise<StoredReport[]> | null = null;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeReports(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Fetches persisted reports from SQLite (Electron) or mockClient (browser/tests)
 * and updates the reactive in-memory cache without touching `localStorage`.
 */
export async function refreshStoredReports(): Promise<StoredReport[]> {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = cursadaClient
    .listStudyReports()
    .then((loaded) => {
      reportsMemoryStore = [...loaded].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );
      hasHydratedReports = true;
      emitChange();
      return [...reportsMemoryStore];
    })
    .finally(() => {
      inflightRefresh = null;
    });

  return inflightRefresh;
}

export function resetStoredReports(): void {
  reportsMemoryStore = [];
  hasHydratedReports = false;
  inflightRefresh = null;
  emitChange();
}

export function listStoredReports(courseId?: string): StoredReport[] {
  if (!hasHydratedReports && typeof window !== 'undefined') {
    void refreshStoredReports();
  }
  const items = courseId
    ? reportsMemoryStore.filter((item) => item.courseId === courseId)
    : reportsMemoryStore;
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLatestStoredReport(courseId?: string): StoredReport | null {
  const list = listStoredReports(courseId);
  return list[0] ?? null;
}

export function getStoredReportById(reportId: string): StoredReport | null {
  return reportsMemoryStore.find((item) => item.id === reportId) ?? null;
}

export async function deleteStoredReport(reportId: string): Promise<void> {
  await cursadaClient.deleteStudyReport(reportId);
  reportsMemoryStore = reportsMemoryStore.filter((item) => item.id !== reportId);
  hasHydratedReports = true;
  emitChange();
}

export async function deleteStoredReportsByCourse(courseId: string): Promise<void> {
  const next = reportsMemoryStore.filter((item) => item.courseId !== courseId);
  if (next.length !== reportsMemoryStore.length) {
    reportsMemoryStore = next;
    emitChange();
  }
  await refreshStoredReports();
}

export function formatRelativeAgeEs(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return 'recién';
  }
  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  if (diffMinutes < 5) {
    return 'recién';
  }
  if (diffMinutes < 60) {
    return `hace ${diffMinutes} min`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `hace ${diffHours} h`;
  }
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? 'hace 1 día' : `hace ${diffDays} días`;
}

function normalizeCitations(
  notes: NoteWithCourse[],
  sources: Source[],
  includeNotes: boolean,
  selectedSourceIds?: string[]
): ReportCitationSource[] {
  const citations: ReportCitationSource[] = [];
  const selectedSet = selectedSourceIds ? new Set(selectedSourceIds) : null;

  const filteredSources = selectedSet
    ? sources.filter((src) => selectedSet.has(src.id))
    : sources;

  if (includeNotes) {
    for (const note of notes.slice(0, 4)) {
      const compactSnippet = note.content
        .replace(/[#>*`[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140);
      citations.push({
        index: citations.length + 1,
        kind: 'note',
        id: note.id,
        title: note.title || 'Nota sin título',
        snippet: compactSnippet || 'Contenido de cursada guardado en el anotador.',
      });
    }
  }

  for (const source of filteredSources.slice(0, 4)) {
    const typeLabel =
      source.sourceType === 'pdf'
        ? 'Documento PDF indexado localmente'
        : source.sourceType === 'markdown'
          ? 'Documento Markdown indexado localmente'
          : 'Fuente de texto indexada localmente';
    const snippetSource = source.rawText
      ? source.rawText.replace(/\s+/g, ' ').trim().slice(0, 120)
      : '';
    citations.push({
      index: citations.length + 1,
      kind: 'source',
      id: source.id,
      title: source.title,
      snippet:
        snippetSource || `${typeLabel} · ${source.chunkCount} fragmentos.`,
      pageLabel: source.sourceType === 'pdf' ? 'p. 1' : undefined,
    });
  }

  return citations;
}

function ensureBodyHasCitations(content: string, citations: ReportCitationSource[]): string {
  if (citations.length === 0 || /\[\d+\]/.test(content)) {
    return content;
  }
  const markers = citations
    .slice(0, 3)
    .map((c) => `[${c.index}]`)
    .join('');
  const blocks = content.split('\n\n');
  if (blocks.length === 0) {
    return `${content} ${markers}`;
  }
  const targetIdx = blocks.findIndex((block) => {
    const trimmed = block.trim();
    if (!trimmed) {
      return false;
    }
    return !trimmed
      .split('\n')
      .every((line) => /^(?:#{1,6}\s|>|$)/.test(line.trim()));
  });
  const idx = targetIdx >= 0 ? targetIdx : 0;
  blocks[idx] = `${blocks[idx]} ${markers}`;
  return blocks.join('\n\n');
}

function buildCourseCountsSummary(notesCount: number, pdfsCount: number): string {
  const notesPart = notesCount === 1 ? '1 nota' : `${notesCount} notas`;
  if (pdfsCount === 0) {
    return `Generado desde ${notesPart}.`;
  }
  const pdfPart = pdfsCount === 1 ? '1 PDF' : `${pdfsCount} PDFs`;
  return `Generado desde ${notesPart} y ${pdfPart}.`;
}

function buildNotesOnlyReportContent(
  reportType: StudyReportType,
  courseName: string,
  notes: NoteWithCourse[],
  citations: ReportCitationSource[],
  examFormat?: PracticeExamFormat
): { title: string; content: string } {
  const cleanExcerpt = (note: NoteWithCourse) =>
    note.content
      .replace(/[#>*`[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);

  if (reportType === 'practice_exam') {
    const formatNote =
      examFormat === 'multiple_choice'
        ? 'Formato multiple choice'
        : examFormat === 'mixed'
          ? 'Formato mixto'
          : 'Preguntas de desarrollo';
    return {
      title: `Preguntas de práctica · ${courseName}`,
      content: [
        `## Banco de práctica (${formatNote})`,
        ...notes.slice(0, 4).map((n, idx) => {
          const ref = citations[idx] ? `[${citations[idx].index}]` : '';
          return `**Pregunta ${idx + 1}.** Explicá los conceptos centrales de «${n.title || 'Apunte'}» y aplicá un ejemplo concreto ${ref}.`;
        }),
      ].join('\n\n'),
    };
  }

  if (reportType === 'study_guide') {
    return {
      title: `Guía de estudio · ${courseName}`,
      content: [
        '## Mapa de temas',
        notes
          .slice(0, 5)
          .map((n, idx) => {
            const ref = citations[idx] ? `[${citations[idx].index}]` : '';
            return `- **${n.title || 'Nota'}**: ${cleanExcerpt(n) || 'Revisar definiciones y ejemplos en el apunte.'} ${ref}`;
          })
          .join('\n'),
        '## Plan de repaso',
        `Consolidá definiciones clave de ${courseName} y practicá ejercicios integradores sobre cada unidad citada.`,
      ].join('\n\n'),
    };
  }

  return {
    title: `Resumen para el parcial de ${courseName}`,
    content: [
      '## Síntesis desde tus notas',
      ...notes.slice(0, 4).map((n, idx) => {
        const ref = citations[idx] ? `[${citations[idx].index}]` : '';
        const text = cleanExcerpt(n) || 'Sin contenido extendido.';
        return `**${n.title || 'Apunte'}.** ${text} ${ref}`;
      }),
    ].join('\n\n'),
  };
}

function upsertInMemoryCache(saved: StoredReport): void {
  const idx = reportsMemoryStore.findIndex((item) => item.id === saved.id);
  if (idx >= 0) {
    reportsMemoryStore = reportsMemoryStore.map((item) =>
      item.id === saved.id ? saved : item
    );
  } else {
    reportsMemoryStore = [saved, ...reportsMemoryStore];
  }
  hasHydratedReports = true;
  emitChange();
}

export async function generateAndStoreReport(
  input: GenerateStoredReportInput,
  options?: { persistId?: string }
): Promise<StoredReport> {
  const includeNotes = input.includeNotes ?? true;
  const stageFilter =
    input.examStage && input.examStage !== 'all' ? input.examStage : undefined;

  const [allCourseNotes, allCourseSources, course] = await Promise.all([
    cursadaClient.listNotes({
      courseId: input.courseId,
      ...(stageFilter ? { examStage: stageFilter } : {}),
    }),
    cursadaClient.listSources(input.courseId),
    input.courseName
      ? Promise.resolve(null)
      : cursadaClient.getCourse(input.courseId),
  ]);

  const notes =
    input.noteIds !== undefined
      ? allCourseNotes.filter((n) => input.noteIds!.includes(n.id))
      : allCourseNotes;

  const sources = stageFilter
    ? allCourseSources.filter((s) => (s.examStage ?? 'general') === stageFilter)
    : allCourseSources;

  const effectiveSourceIds =
    input.sourceIds !== undefined
      ? input.sourceIds.filter((id) => sources.some((s) => s.id === id))
      : sources.map((s) => s.id);
  const effectiveNoteIds = notes.map((n) => n.id);
  const resolvedCourseName = input.courseName ?? course?.name ?? 'Materia';

  const readySelectedSources = sources.filter(
    (s) => effectiveSourceIds.includes(s.id) && s.indexingStatus === 'ready'
  );

  if (readySelectedSources.length === 0 && (!includeNotes || notes.length === 0)) {
    throw new Error(
      'Seleccioná al menos una nota o subí una fuente indexada (PDF, Markdown o texto) para generar el informe.'
    );
  }

  const citations = normalizeCitations(notes, sources, includeNotes, effectiveSourceIds);
  const usedNotesCount = includeNotes ? notes.length : 0;
  const usedPdfsCount = sources.filter(
    (s) => effectiveSourceIds.includes(s.id) && s.sourceType === 'pdf'
  ).length;

  if (readySelectedSources.length > 0 || (includeNotes && notes.length > 0)) {
    try {
      const generated = await cursadaClient.generateStudyReport({
        courseId: input.courseId,
        reportType: input.reportType,
        sourceIds: effectiveSourceIds,
        noteIds: includeNotes ? effectiveNoteIds : [],
        examStage: input.examStage,
        includeNotes,
        examFormat: input.examFormat,
        customInstructions: input.customInstructions,
        title: input.title,
        autoSaveAsNote: input.autoSaveAsNote ?? false,
      });

      const finalContent = ensureBodyHasCitations(generated.content, citations);
      const usedLocalModel =
        Boolean(generated.modelUsed) && generated.modelUsed !== 'offline-deterministic';

      const saved = await cursadaClient.saveStudyReport({
        id: options?.persistId,
        courseId: input.courseId,
        courseName:
          input.courseName ??
          course?.name ??
          generated.note?.courseName ??
          resolvedCourseName,
        title: generated.title,
        reportType: generated.reportType,
        summaryLine: buildCourseCountsSummary(usedNotesCount, usedPdfsCount),
        content: finalContent,
        notesCount: usedNotesCount,
        pdfsCount: usedPdfsCount,
        usedLocalModel,
        modelLabel: usedLocalModel ? 'modelo local' : 'síntesis offline',
        noteId: generated.note?.id ?? null,
        citations,
        sourceIds: effectiveSourceIds,
        noteIds: effectiveNoteIds,
        examStage: input.examStage,
        includeNotes,
        examFormat: input.examFormat,
        customInstructions: input.customInstructions,
      });

      upsertInMemoryCache(saved);
      return saved;
    } catch (err) {
      if (readySelectedSources.length > 0) {
        throw err;
      }
      // If notes-only generation failed upstream, fall back to local notes synthesis below
    }
  }

  const notesFallback = buildNotesOnlyReportContent(
    input.reportType,
    resolvedCourseName,
    notes,
    citations,
    input.examFormat
  );
  const finalTitle = input.title?.trim() || notesFallback.title;
  let savedNoteId: string | null = null;
  if (input.autoSaveAsNote) {
    const origin =
      input.reportType === 'study_guide'
        ? 'ai_study_guide'
        : input.reportType === 'practice_exam'
          ? 'ai_practice_exam'
          : 'ai_summary';
    const created = await cursadaClient.createNote({
      courseId: input.courseId,
      title: finalTitle,
      content: notesFallback.content,
      origin,
      ...(stageFilter ? { examStage: stageFilter } : {}),
    });
    savedNoteId = created.id;
  }

  const saved = await cursadaClient.saveStudyReport({
    id: options?.persistId,
    courseId: input.courseId,
    courseName: resolvedCourseName,
    title: finalTitle,
    reportType: input.reportType,
    summaryLine: buildCourseCountsSummary(usedNotesCount, usedPdfsCount),
    content: ensureBodyHasCitations(notesFallback.content, citations),
    notesCount: usedNotesCount,
    pdfsCount: usedPdfsCount,
    usedLocalModel: false,
    modelLabel: 'síntesis offline',
    noteId: savedNoteId,
    citations,
    sourceIds: effectiveSourceIds,
    noteIds: effectiveNoteIds,
    examStage: input.examStage,
    includeNotes,
    examFormat: input.examFormat,
    customInstructions: input.customInstructions,
  });

  upsertInMemoryCache(saved);
  return saved;
}

export async function regenerateStoredReport(reportId: string): Promise<StoredReport> {
  const existing =
    getStoredReportById(reportId) ??
    (await cursadaClient.getStudyReportById(reportId));
  if (!existing) {
    throw new Error(`No se encontró el informe "${reportId}".`);
  }

  return generateAndStoreReport(
    {
      courseId: existing.courseId,
      courseName: existing.courseName,
      reportType: existing.reportType,
      sourceIds: existing.sourceIds,
      noteIds: existing.noteIds,
      examStage: existing.examStage,
      includeNotes: existing.includeNotes ?? true,
      examFormat: existing.examFormat,
      customInstructions: existing.customInstructions,
      title: existing.title,
      autoSaveAsNote: false,
    },
    { persistId: existing.id }
  );
}

export async function saveStoredReportAsNote(
  reportId: string
): Promise<NoteWithCourse> {
  const existing =
    getStoredReportById(reportId) ??
    (await cursadaClient.getStudyReportById(reportId));
  if (!existing) {
    throw new Error(`No se encontró el informe "${reportId}".`);
  }

  const origin =
    existing.reportType === 'study_guide'
      ? 'ai_study_guide'
      : existing.reportType === 'practice_exam'
        ? 'ai_practice_exam'
        : 'ai_summary';

  const savedNote = await cursadaClient.createNote({
    courseId: existing.courseId,
    title: existing.title,
    content: existing.content,
    origin,
  });

  const updatedReport = await cursadaClient.saveStudyReport({
    id: existing.id,
    courseId: existing.courseId,
    courseName: existing.courseName,
    title: existing.title,
    reportType: existing.reportType,
    summaryLine: existing.summaryLine,
    content: existing.content,
    notesCount: existing.notesCount,
    pdfsCount: existing.pdfsCount,
    usedLocalModel: existing.usedLocalModel,
    modelLabel: existing.modelLabel,
    noteId: savedNote.id,
    citations: existing.citations,
    sourceIds: existing.sourceIds,
    noteIds: existing.noteIds,
    examStage: existing.examStage,
    includeNotes: existing.includeNotes,
    examFormat: existing.examFormat,
    customInstructions: existing.customInstructions,
  });

  upsertInMemoryCache(updatedReport);
  notifyCursadaDataChanged();
  return savedNote;
}

export function exportReportToPdf(report: StoredReport): {
  printed: boolean;
  title: string;
} {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { printed: false, title: report.title };
  }
  const previousTitle = document.title;
  document.title = `${report.title} — ${report.courseName}`;
  try {
    if (typeof window.print === 'function') {
      window.print();
    }
    return { printed: true, title: document.title };
  } finally {
    document.title = previousTitle;
  }
}
