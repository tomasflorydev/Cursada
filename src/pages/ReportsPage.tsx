import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { PracticeExamSimulatorModal } from '../components/assistant/PracticeExamSimulatorModal';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import { renderTextWithMathAndCitations } from '../lib/math/latexRenderer';
import {
  deleteStoredReport,
  exportReportToPdf,
  formatRelativeAgeEs,
  generateAndStoreReport,
  isReportCancelledError,
  listStoredReports,
  refreshStoredReports,
  regenerateStoredReport,
  saveStoredReportAsNote,
  subscribeReports,
  type ReportCitationSource,
  type StoredReport,
} from '../lib/reportsStore';
import type {
  CourseWithSchedules,
  NoteWithCourse,
  Source,
  StudyReportType,
} from '../types';
import {
  SwissButton,
  SwissCitationBadge,
  SwissEmptyState,
  SwissErrorAlert,
  SwissLinkButton,
  SwissLoadingBar,
  SwissSectionHeader,
  SwissSelect,
  SwissTitleUnderline,
} from '../ui';

export interface ReportsPageProps {
  initialReportId?: string | null;
  reportNavigationVersion?: number;
  createRequestVersion?: number;
  onSelectCourseNote?: (courseId: string, noteId?: string) => void;
}

const REPORT_TYPE_OPTIONS: ReadonlyArray<{ value: StudyReportType; label: string }> = [
  { value: 'summary', label: 'Resumen de parcial' },
  { value: 'study_guide', label: 'Guía de estudio' },
  { value: 'practice_exam', label: 'Preguntas de práctica' },
  { value: 'report', label: 'Informe académico' },
];

type ReportBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string };

function parseReportBlocks(markdown: string, reportTitle?: string): ReportBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReportBlock[] = [];
  let paragraphLines: string[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: 'p', text: paragraphLines.join(' ').trim() });
      paragraphLines = [];
    }
  };
  const flushUl = () => {
    if (ulItems.length > 0) {
      blocks.push({ kind: 'ul', items: ulItems });
      ulItems = [];
    }
  };
  const flushOl = () => {
    if (olItems.length > 0) {
      blocks.push({ kind: 'ol', items: olItems });
      olItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushUl();
      flushOl();
      continue;
    }

    const hMatch = /^#{1,3}\s+(.+)$/.exec(line);
    if (hMatch) {
      flushParagraph();
      flushUl();
      flushOl();
      const headingText = hMatch[1].trim();
      const normalizedHeading = headingText.replace(/(?:\s*\[\d+\])+\s*$/, '').trim();
      if (reportTitle && blocks.length === 0 && /^#\s+/.test(line) && normalizedHeading === reportTitle.trim()) {
        continue;
      }
      blocks.push({ kind: 'h2', text: headingText });
      continue;
    }

    const ulMatch = /^[-*+]\s+(?:\[[ xX]\]\s*)?(.+)$/.exec(line);
    if (ulMatch) {
      flushParagraph();
      flushOl();
      ulItems.push(ulMatch[1].trim());
      continue;
    }

    const olMatch = /^\d+[.)]\s+(.+)$/.exec(line);
    if (olMatch) {
      flushParagraph();
      flushUl();
      olItems.push(olMatch[1].trim());
      continue;
    }

    flushUl();
    flushOl();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushUl();
  flushOl();
  return blocks;
}

export function ReportsPage({
  initialReportId = null,
  reportNavigationVersion = 0,
  createRequestVersion = 0,
  onSelectCourseNote,
}: ReportsPageProps) {
  const courseSelectId = useId();
  const typeSelectId = useId();

  const [reports, setReports] = useState<StoredReport[]>(() => listStoredReports());
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    () => initialReportId ?? listStoredReports()[0]?.id ?? null
  );

  // Create inline form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createCourseId, setCreateCourseId] = useState<string>('');
  const [createReportType, setCreateReportType] = useState<StudyReportType>('summary');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Action states for selected report
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNoteFeedback, setSavedNoteFeedback] = useState<{
    courseId: string;
    noteId: string;
  } | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulatorSources, setSimulatorSources] = useState<Source[]>([]);
  const [simulatorNotes, setSimulatorNotes] = useState<NoteWithCourse[]>([]);

  const lastNavVersionRef = useRef<number>(reportNavigationVersion);
  const lastCreateVersionRef = useRef<number>(0);
  const regenerateAbortRef = useRef<AbortController | null>(null);

  const loadCourses = useCallback(async () => {
    const loaded = await cursadaClient.listCourses({ status: 'active' });
    setCourses(loaded);
    setCreateCourseId((prev) => {
      if (prev && loaded.some((c) => c.id === prev)) {
        return prev;
      }
      return loaded[0]?.id ?? '';
    });
  }, []);

  useEffect(() => {
    void loadCourses();
    void refreshStoredReports();

    const handleDataChanged = () => {
      void loadCourses();
      void refreshStoredReports();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);

    const unsubscribe = subscribeReports(() => {
      const updatedList = listStoredReports();
      setReports(updatedList);
      setSelectedReportId((current) => {
        if (current && updatedList.some((r) => r.id === current)) {
          return current;
        }
        return updatedList[0]?.id ?? null;
      });
    });

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
      unsubscribe();
    };
  }, [loadCourses]);

  // Sync external report navigation
  useEffect(() => {
    if (
      initialReportId &&
      (reportNavigationVersion > lastNavVersionRef.current || selectedReportId === null)
    ) {
      lastNavVersionRef.current = reportNavigationVersion;
      if (reports.some((r) => r.id === initialReportId)) {
        setSelectedReportId(initialReportId);
        setActionError(null);
        setSavedNoteFeedback(null);
        setIsConfirmingDelete(false);
      }
    }
  }, [initialReportId, reportNavigationVersion, reports, selectedReportId]);

  // Sync external create request (Cmd+N / Command Palette)
  useEffect(() => {
    if (
      createRequestVersion > 0 &&
      createRequestVersion > lastCreateVersionRef.current
    ) {
      lastCreateVersionRef.current = createRequestVersion;
      setCreateError(null);
      setIsCreateOpen(true);
    }
  }, [createRequestVersion]);

  const selectedReport = useMemo(() => {
    if (reports.length === 0) return null;
    return reports.find((r) => r.id === selectedReportId) ?? reports[0];
  }, [reports, selectedReportId]);

  const groupedReports = useMemo(() => {
    const groups = new Map<string, { courseId: string; courseName: string; items: StoredReport[] }>();
    for (const rep of reports) {
      let group = groups.get(rep.courseId);
      if (!group) {
        group = {
          courseId: rep.courseId,
          courseName: rep.courseName,
          items: [],
        };
        groups.set(rep.courseId, group);
      }
      group.items.push(rep);
    }
    return Array.from(groups.values());
  }, [reports]);

  const reportBlocks = useMemo(
    () => (selectedReport ? parseReportBlocks(selectedReport.content, selectedReport.title) : []),
    [selectedReport]
  );

  async function handleCreateSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!createCourseId) {
      setCreateError('Seleccioná una materia para generar el informe.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      const course = courses.find((c) => c.id === createCourseId);
      const created = await generateAndStoreReport({
        courseId: createCourseId,
        courseName: course?.name,
        reportType: createReportType,
      });
      setSelectedReportId(created.id);
      setIsCreateOpen(false);
      setActionError(null);
      setSavedNoteFeedback(null);
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el informe. Verificá que la materia tenga fuentes indexadas.'
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveAsNote(): Promise<void> {
    if (!selectedReport || isSavingNote) return;
    setActionError(null);
    setSavedNoteFeedback(null);
    setIsSavingNote(true);
    try {
      const saved = await saveStoredReportAsNote(selectedReport.id);
      setSavedNoteFeedback({ courseId: saved.courseId, noteId: saved.id });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo guardar el informe como nota.'
      );
    } finally {
      setIsSavingNote(false);
    }
  }

  function handleExportPdf(): void {
    if (!selectedReport) return;
    setActionError(null);
    exportReportToPdf(selectedReport);
  }

  async function handleRegenerate(): Promise<void> {
    if (!selectedReport || isRegenerating) return;
    setActionError(null);
    setSavedNoteFeedback(null);
    setIsConfirmingDelete(false);
    const controller = new AbortController();
    regenerateAbortRef.current = controller;
    setIsRegenerating(true);
    try {
      await regenerateStoredReport(selectedReport.id, {
        signal: controller.signal,
      });
    } catch (err) {
      if (isReportCancelledError(err) || controller.signal.aborted) {
        setActionError('Regeneración cancelada.');
      } else {
        setActionError(
          err instanceof Error
            ? err.message
            : 'No se pudo regenerar el informe. Verificá que existan fuentes indexadas en la materia.'
        );
      }
    } finally {
      if (regenerateAbortRef.current === controller) {
        regenerateAbortRef.current = null;
      }
      setIsRegenerating(false);
    }
  }

  async function handleDeleteReport(): Promise<void> {
    if (!selectedReport || isDeleting) return;
    setActionError(null);
    setSavedNoteFeedback(null);
    setIsDeleting(true);
    try {
      await deleteStoredReport(selectedReport.id);
      setIsConfirmingDelete(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo eliminar el informe.'
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function handleCitationClick(citationIndex: number): void {
    if (!selectedReport || !onSelectCourseNote) return;
    const citation = selectedReport.citations.find((c) => c.index === citationIndex);
    if (citation?.kind === 'note') {
      onSelectCourseNote(selectedReport.courseId, citation.id);
      return;
    }
    onSelectCourseNote(selectedReport.courseId);
  }

  function handleCitationCardClick(citation: ReportCitationSource): void {
    if (!selectedReport || !onSelectCourseNote) return;
    if (citation.kind === 'note') {
      onSelectCourseNote(selectedReport.courseId, citation.id);
      return;
    }
    onSelectCourseNote(selectedReport.courseId);
  }

  async function handleOpenSimulator(): Promise<void> {
    if (!selectedReport) return;
    setActionError(null);
    try {
      const [loadedSources, loadedNotes] = await Promise.all([
        cursadaClient.listSources(selectedReport.courseId),
        cursadaClient.listNotes({ courseId: selectedReport.courseId }),
      ]);
      setSimulatorSources(loadedSources);
      setSimulatorNotes(loadedNotes);
      setIsSimulatorOpen(true);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar el simulacro interactivo.'
      );
    }
  }

  return (
    <section aria-labelledby="main-title" className="swiss-grid">
      <h1 id="main-title" tabIndex={-1} className="visually-hidden">
        Informes
      </h1>

      {/* Izquierda (3 cols): Lista de informes agrupada por materia */}
      <aside className="swiss-col-3" aria-label="Listado de informes">
        <SwissSectionHeader
          title={`Informes · ${reports.length}`}
          right={
            <SwissLinkButton onClick={() => setIsCreateOpen((v) => !v)}>
              + Nuevo
            </SwissLinkButton>
          }
        />

        {isCreateOpen ? (
          <form
            onSubmit={(e) => void handleCreateSubmit(e)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              padding: '12px 0',
              marginBottom: '12px',
              borderTop: '1px solid var(--rule)',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <div>
              <label htmlFor={courseSelectId} className="swiss-meta">
                Materia
              </label>
              <SwissSelect
                id={courseSelectId}
                value={createCourseId}
                onChange={(e) => setCreateCourseId(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SwissSelect>
            </div>

            <div>
              <label htmlFor={typeSelectId} className="swiss-meta">
                Tipo de informe
              </label>
              <SwissSelect
                id={typeSelectId}
                value={createReportType}
                onChange={(e) => setCreateReportType(e.target.value as StudyReportType)}
              >
                {REPORT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </SwissSelect>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <SwissButton type="submit" variant="primary" disabled={isCreating}>
                {isCreating ? 'Generando…' : 'Generar'}
              </SwissButton>
              <SwissButton
                variant="tertiary"
                disabled={isCreating}
                onClick={() => {
                  setIsCreateOpen(false);
                  setCreateError(null);
                }}
              >
                Cancelar
              </SwissButton>
            </div>

            {isCreating ? <SwissLoadingBar text="Generando informe…" /> : null}
            {createError ? <SwissErrorAlert message={createError} /> : null}
          </form>
        ) : null}

        {groupedReports.length === 0 ? (
          <p className="swiss-meta-md">No tenés informes todavía.</p>
        ) : (
          <div>
            {groupedReports.map((group) => (
              <div key={group.courseId} style={{ marginBottom: '18px' }}>
                <div className="swiss-section-label" style={{ marginBottom: '6px' }}>
                  {group.courseName}
                </div>
                {group.items.map((rep) => {
                  const isSelected = selectedReport?.id === rep.id;
                  return (
                    <button
                      key={rep.id}
                      type="button"
                      className={`swiss-list-row ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedReportId(rep.id);
                        setActionError(null);
                        setSavedNoteFeedback(null);
                        setIsConfirmingDelete(false);
                      }}
                    >
                      <span>{rep.title}</span>
                      <span className="swiss-meta">
                        {formatRelativeAgeEs(rep.updatedAt)} · {rep.notesCount}{' '}
                        {rep.notesCount === 1 ? 'nota' : 'notas'}, {rep.pdfsCount}{' '}
                        {rep.pdfsCount === 1 ? 'PDF' : 'PDFs'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Centro (6 cols): Artículo / cuerpo del informe */}
      <article className="swiss-col-6" aria-label="Contenido del informe">
        <div className="reports-center-wrap">
          {!selectedReport ? (
            <SwissEmptyState
              title="Todavía no hay informes"
              description="Generá un resumen, guía de estudio o examen de práctica a partir de tus materias y fuentes."
              actionLabel="+ Nuevo informe"
              onAction={() => setIsCreateOpen(true)}
            />
          ) : (
            <>
              <div className="swiss-meta-md">
                Informes / {selectedReport.courseName}
              </div>

              <h2 className="reports-title">{selectedReport.title}</h2>

              <div className="reports-article-head">
                <span className="swiss-meta-md">
                  Generado {formatRelativeAgeEs(selectedReport.updatedAt)} con el{' '}
                  {selectedReport.modelLabel}
                </span>

                <div className="reports-actions-bar">
                  {selectedReport.reportType === 'practice_exam' ? (
                    <SwissButton
                      variant="secondary"
                      onClick={() => void handleOpenSimulator()}
                    >
                      Iniciar simulacro
                    </SwissButton>
                  ) : null}
                  <SwissButton
                    variant="secondary"
                    disabled={isSavingNote || isDeleting}
                    onClick={() => void handleSaveAsNote()}
                  >
                    {isSavingNote ? 'Guardando…' : 'Guardar como nota'}
                  </SwissButton>
                  <SwissButton
                    variant="secondary"
                    disabled={isDeleting}
                    onClick={handleExportPdf}
                  >
                    Exportar PDF
                  </SwissButton>
                  <SwissButton
                    variant="primary"
                    disabled={isRegenerating || isDeleting}
                    onClick={() => void handleRegenerate()}
                  >
                    {isRegenerating ? 'Regenerando…' : 'Regenerar'}
                  </SwissButton>
                  {isConfirmingDelete ? (
                    <>
                      <SwissButton
                        variant="primary"
                        disabled={isDeleting}
                        aria-label="Confirmar eliminación"
                        onClick={() => void handleDeleteReport()}
                      >
                        {isDeleting ? 'Eliminando…' : 'Confirmar eliminación'}
                      </SwissButton>
                      <SwissButton
                        variant="tertiary"
                        disabled={isDeleting}
                        onClick={() => setIsConfirmingDelete(false)}
                      >
                        Cancelar
                      </SwissButton>
                    </>
                  ) : (
                    <SwissButton
                      variant="tertiary"
                      aria-label="Eliminar informe"
                      disabled={isRegenerating || isDeleting}
                      onClick={() => setIsConfirmingDelete(true)}
                    >
                      Eliminar
                    </SwissButton>
                  )}
                </div>
              </div>

              {isRegenerating ? (
                <div
                  style={{
                    marginTop: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SwissLoadingBar text="Regenerando informe…" />
                  </div>
                  <SwissLinkButton
                    className="swiss-link-sm"
                    onClick={() => regenerateAbortRef.current?.abort()}
                  >
                    Cancelar
                  </SwissLinkButton>
                </div>
              ) : null}

              {actionError ? (
                <div style={{ marginTop: '14px' }}>
                  <SwissErrorAlert message={actionError} />
                </div>
              ) : null}

              {savedNoteFeedback ? (
                <div
                  role="status"
                  className="swiss-meta-md"
                  style={{
                    marginTop: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span>Informe guardado como nota.</span>
                  {onSelectCourseNote ? (
                    <SwissLinkButton
                      underlined
                      onClick={() =>
                        onSelectCourseNote(
                          savedNoteFeedback.courseId,
                          savedNoteFeedback.noteId
                        )
                      }
                    >
                      Abrir nota →
                    </SwissLinkButton>
                  ) : null}
                </div>
              ) : null}

              <SwissTitleUnderline />

              <div className="reports-body">
                {reportBlocks.map((block, index) => {
                  if (block.kind === 'h2') {
                    return (
                      <h2 key={index}>
                        {renderTextWithMathAndCitations(block.text, handleCitationClick)}
                      </h2>
                    );
                  }
                  if (block.kind === 'ul') {
                    return (
                      <ul
                        key={index}
                        style={{ paddingLeft: '18px', marginBottom: '12px' }}
                      >
                        {block.items.map((item, itemIdx) => (
                          <li key={itemIdx} style={{ marginBottom: '4px' }}>
                            {renderTextWithMathAndCitations(item, handleCitationClick)}
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  if (block.kind === 'ol') {
                    return (
                      <ol
                        key={index}
                        style={{ paddingLeft: '20px', marginBottom: '12px' }}
                      >
                        {block.items.map((item, itemIdx) => (
                          <li key={itemIdx} style={{ marginBottom: '4px' }}>
                            {renderTextWithMathAndCitations(item, handleCitationClick)}
                          </li>
                        ))}
                      </ol>
                    );
                  }
                  return (
                    <p key={index}>
                      {renderTextWithMathAndCitations(block.text, handleCitationClick)}
                    </p>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </article>

      {/* Derecha (3 cols): Fuentes citadas */}
      <aside className="swiss-col-3" aria-label="Fuentes citadas">
        <SwissSectionHeader
          title={`Fuentes citadas · ${selectedReport?.citations.length ?? 0}`}
        />

        {!selectedReport || selectedReport.citations.length === 0 ? (
          <p className="swiss-meta-md">
            Este informe no tiene fuentes citadas registradas.
          </p>
        ) : (
          <div>
            {selectedReport.citations.map((citation) => (
              <button
                key={`${citation.index}-${citation.id}`}
                type="button"
                className="reports-source-card"
                onClick={() => handleCitationCardClick(citation)}
              >
                <span className="reports-source-title">
                  <SwissCitationBadge index={citation.index} /> {citation.title}
                  {citation.pageLabel ? (
                    <span className="swiss-meta"> · {citation.pageLabel}</span>
                  ) : null}
                </span>
                <span className="reports-source-snippet">{citation.snippet}</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      {selectedReport ? (
        <PracticeExamSimulatorModal
          isOpen={isSimulatorOpen}
          courseId={selectedReport.courseId}
          courseName={selectedReport.courseName}
          examStage={selectedReport.examStage ?? 'all'}
          sources={simulatorSources}
          notes={simulatorNotes}
          initialMarkdown={selectedReport.content}
          onClose={() => setIsSimulatorOpen(false)}
          onCitationClick={(target) => {
            setIsSimulatorOpen(false);
            if (onSelectCourseNote) {
              onSelectCourseNote(
                selectedReport.courseId,
                target.kind === 'note' ? target.sourceId : undefined
              );
            }
          }}
          onSavedNote={(created) => {
            setIsSimulatorOpen(false);
            onSelectCourseNote?.(created.courseId, created.id);
          }}
        />
      ) : null}
    </section>
  );
}
