import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import type {
  GenerateStudyReportResult,
  NoteOrigin,
  NoteWithCourse,
  PracticeExamFormat,
  Source,
  StudyReportType,
} from '../../types/domain';

export interface CourseReportGeneratorProps {
  courseId: string;
  courseName: string;
  onNoteCreated?: (noteId: string) => void;
  onOpenNotesTab?: () => void;
}

const REPORT_TYPE_OPTIONS: ReadonlyArray<{
  value: StudyReportType;
  label: string;
}> = [
  {
    value: 'summary',
    label: 'Resumen',
  },
  {
    value: 'report',
    label: 'Informe',
  },
  {
    value: 'study_guide',
    label: 'Guía de estudio',
  },
  {
    value: 'practice_exam',
    label: 'Examen de práctica',
  },
];

const EXAM_FORMAT_OPTIONS: ReadonlyArray<{
  value: PracticeExamFormat;
  label: string;
}> = [
  { value: 'develop', label: 'Desarrollo' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'mixed', label: 'Mixto' },
];

const REPORT_TYPE_TO_NOTE_ORIGIN: Record<StudyReportType, NoteOrigin> = {
  summary: 'ai_summary',
  report: 'ai_summary',
  study_guide: 'ai_study_guide',
  practice_exam: 'ai_practice_exam',
};

function formatPlural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sanitizeMarkdownSlug(title: string): string {
  const normalized = (title ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 96)
    .replace(/-+$/g, '');

  return normalized || 'material-estudio';
}

function triggerMarkdownBlobDownload(filename: string, markdown: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export function CourseReportGenerator({
  courseId,
  courseName,
  onNoteCreated,
  onOpenNotesTab,
}: CourseReportGeneratorProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const instructionsId = `${baseId}-instructions`;
  const titleId = `${baseId}-title`;
  const autoSaveId = `${baseId}-auto-save`;

  const [sources, setSources] = useState<Source[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  const [reportType, setReportType] = useState<StudyReportType>('summary');
  const [examFormat, setExamFormat] = useState<PracticeExamFormat>('mixed');
  const [customInstructions, setCustomInstructions] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [autoSaveAsNote, setAutoSaveAsNote] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateStudyReportResult | null>(null);
  const [savedNote, setSavedNote] = useState<NoteWithCourse | null>(null);
  const [isSavingManualNote, setIsSavingManualNote] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    kind: 'success' | 'neutral' | 'error';
    text: string;
  } | null>(null);

  const activeCourseRef = useRef(courseId);
  const knownReadyIdsRef = useRef<Set<string>>(new Set());
  const loadSeqRef = useRef(0);
  const generateSeqRef = useRef(0);

  const readySources = useMemo(
    () => sources.filter((source) => source.indexingStatus === 'ready'),
    [sources]
  );

  const loadCourseSources = useCallback(
    async (options?: { silent?: boolean; resetSelection?: boolean }) => {
      const requestId = ++loadSeqRef.current;
      const targetCourseId = courseId;

      if (!options?.silent) {
        setIsLoadingSources(true);
      }

      try {
        const loaded = await cursadaClient.listSources(targetCourseId);
        if (
          activeCourseRef.current !== targetCourseId ||
          requestId !== loadSeqRef.current
        ) {
          return;
        }

        setSources(loaded);
        const readyIds = loaded
          .filter((item) => item.indexingStatus === 'ready')
          .map((item) => item.id);
        const readySet = new Set(readyIds);

        if (options?.resetSelection) {
          knownReadyIdsRef.current = readySet;
          setSelectedSourceIds(readyIds);
        } else {
          const prevKnown = knownReadyIdsRef.current;
          setSelectedSourceIds((prevSelected) => {
            const kept = prevSelected.filter((id) => readySet.has(id));
            const newlyReady = readyIds.filter((id) => !prevKnown.has(id));
            return [...kept, ...newlyReady];
          });
          knownReadyIdsRef.current = readySet;
        }
      } catch (err) {
        if (
          activeCourseRef.current !== targetCourseId ||
          requestId !== loadSeqRef.current
        ) {
          return;
        }
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar las fuentes.'
        );
      } finally {
        if (
          !options?.silent &&
          activeCourseRef.current === targetCourseId &&
          requestId === loadSeqRef.current
        ) {
          setIsLoadingSources(false);
        }
      }
    },
    [courseId]
  );

  useEffect(() => {
    activeCourseRef.current = courseId;
    knownReadyIdsRef.current = new Set();
    setSelectedSourceIds([]);
    setResult(null);
    setSavedNote(null);
    setErrorMessage(null);
    setActionFeedback(null);
    void loadCourseSources({ resetSelection: true });
  }, [courseId, loadCourseSources]);

  useEffect(() => {
    function handleDataChanged(): void {
      void loadCourseSources({ silent: true });
    }
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadCourseSources]);

  function handleToggleSource(sourceId: string): void {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  }

  function handleSelectAllSources(): void {
    setSelectedSourceIds(readySources.map((source) => source.id));
  }

  function handleSelectNoSources(): void {
    setSelectedSourceIds([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isGenerating || selectedSourceIds.length === 0) {
      return;
    }

    const requestId = ++generateSeqRef.current;
    const targetCourseId = courseId;

    setIsGenerating(true);
    setErrorMessage(null);
    setActionFeedback(null);

    try {
      const generated = await cursadaClient.generateStudyReport({
        courseId: targetCourseId,
        reportType,
        sourceIds: selectedSourceIds,
        ...(reportType === 'practice_exam' ? { examFormat } : {}),
        ...(customInstructions.trim()
          ? { customInstructions: customInstructions.trim() }
          : {}),
        ...(customTitle.trim() ? { title: customTitle.trim() } : {}),
        autoSaveAsNote,
      });

      if (
        activeCourseRef.current !== targetCourseId ||
        requestId !== generateSeqRef.current
      ) {
        return;
      }

      setResult(generated);
      setSavedNote(generated.note);
      if (generated.note) {
        onNoteCreated?.(generated.note.id);
        setActionFeedback({
          kind: 'success',
          text: 'Material generado y guardado automáticamente en Notas.',
        });
      } else {
        setActionFeedback({
          kind: 'neutral',
          text: 'Material generado. Podés revisarlo, guardarlo en Notas o exportarlo.',
        });
      }
    } catch (err) {
      if (
        activeCourseRef.current !== targetCourseId ||
        requestId !== generateSeqRef.current
      ) {
        return;
      }
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el material de estudio.'
      );
    } finally {
      if (
        activeCourseRef.current === targetCourseId &&
        requestId === generateSeqRef.current
      ) {
        setIsGenerating(false);
      }
    }
  }

  async function handleSaveManualNote(): Promise<void> {
    if (!result || savedNote || isSavingManualNote) {
      return;
    }

    setIsSavingManualNote(true);
    setErrorMessage(null);
    try {
      const created = await cursadaClient.createNote({
        courseId,
        title: result.title,
        content: result.content,
        origin: REPORT_TYPE_TO_NOTE_ORIGIN[result.reportType],
      });
      setSavedNote(created);
      onNoteCreated?.(created.id);
      setActionFeedback({
        kind: 'success',
        text: 'Material guardado en Notas.',
      });
    } catch (err) {
      setActionFeedback({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo guardar el material en Notas.',
      });
    } finally {
      setIsSavingManualNote(false);
    }
  }

  async function handleExportMarkdown(): Promise<void> {
    if (!result || isExporting) {
      return;
    }

    setIsExporting(true);
    setActionFeedback(null);
    try {
      if (savedNote) {
        const exportRes = await cursadaClient.exportMarkdown({
          scope: 'note',
          noteId: savedNote.id,
        });
        if (exportRes.canceled) {
          setActionFeedback({
            kind: 'neutral',
            text: 'Exportación cancelada.',
          });
        } else if (exportRes.mode === 'download') {
          setActionFeedback({
            kind: 'success',
            text: 'Descarga iniciada (.md).',
          });
        } else {
          setActionFeedback({
            kind: 'success',
            text: exportRes.targetDir
              ? `Archivo .md exportado en ${exportRes.targetDir}`
              : 'Material exportado en Markdown (.md).',
          });
        }
      } else {
        const filename = `${sanitizeMarkdownSlug(result.title)}.md`;
        const markdown = result.content.startsWith('# ')
          ? result.content
          : `# ${result.title}\n\n${result.content}`;
        triggerMarkdownBlobDownload(filename, markdown);
        setActionFeedback({
          kind: 'success',
          text: `Descarga iniciada (${filename}).`,
        });
      }
    } catch (err) {
      setActionFeedback({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo exportar el material en Markdown.',
      });
    } finally {
      setIsExporting(false);
    }
  }

  const isSubmitDisabled =
    isGenerating || isLoadingSources || selectedSourceIds.length === 0;

  return (
    <section
      className="assistant-report-generator surface-panel"
      aria-labelledby={headingId}
    >
      <header className="assistant-report-header">
        <div className="assistant-report-header-text">
          <h2 id={headingId} className="assistant-section-title section-title">
            Generador de material de estudio
          </h2>
        </div>
      </header>

      <form
        className="assistant-report-form"
        aria-labelledby={headingId}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <fieldset className="assistant-fieldset assistant-sources-fieldset">
          <legend className="assistant-legend">Fuentes incluidas</legend>

          {isLoadingSources ? (
            <p className="assistant-loading-text">
              Cargando fuentes indexadas...
            </p>
          ) : readySources.length === 0 ? (
            <div
              className="assistant-empty-state sources-empty-state"
              data-testid="report-no-ready-sources"
            >
              <p className="assistant-empty-title sources-empty-title">
                No hay fuentes indexadas listas en {courseName}
              </p>
            </div>
          ) : (
            <>
              <div className="assistant-sources-toolbar">
                <span className="assistant-sources-counter">
                  {selectedSourceIds.length} de {readySources.length}{' '}
                  {readySources.length === 1
                    ? 'fuente seleccionada'
                    : 'fuentes seleccionadas'}
                </span>
                <div className="assistant-sources-quick-actions">
                  <button
                    type="button"
                    className="assistant-quick-action-btn ghost-action-button"
                    onClick={handleSelectAllSources}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    className="assistant-quick-action-btn ghost-action-button"
                    onClick={handleSelectNoSources}
                  >
                    Ninguna
                  </button>
                </div>
              </div>

              <div className="assistant-sources-checkbox-list">
                {readySources.map((source) => {
                  const checkboxId = `${baseId}-source-${source.id}`;
                  const metaId = `${baseId}-source-meta-${source.id}`;
                  const isChecked = selectedSourceIds.includes(source.id);

                  return (
                    <div key={source.id} className="assistant-source-option">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        name="sourceIds"
                        value={source.id}
                        className="assistant-checkbox"
                        checked={isChecked}
                        aria-describedby={metaId}
                        onChange={() => handleToggleSource(source.id)}
                      />
                      <label
                        htmlFor={checkboxId}
                        className="assistant-checkbox-label"
                      >
                        {source.title}
                      </label>
                      <span id={metaId} className="assistant-source-meta">
                        {formatPlural(source.pageCount, 'página', 'páginas')} ·{' '}
                        {formatPlural(
                          source.chunkCount,
                          'fragmento',
                          'fragmentos'
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {selectedSourceIds.length === 0 ? (
                <p className="assistant-selection-warning">
                  Seleccioná al menos una fuente para habilitar la generación.
                </p>
              ) : null}
            </>
          )}
        </fieldset>

        <fieldset className="assistant-fieldset assistant-type-fieldset">
          <legend className="assistant-legend">Tipo de material</legend>
          <div className="assistant-radio-group">
            {REPORT_TYPE_OPTIONS.map((option) => {
              const radioId = `${baseId}-type-${option.value}`;
              return (
                <div key={option.value} className="assistant-radio-option">
                  <input
                    id={radioId}
                    type="radio"
                    name={`${baseId}-report-type`}
                    value={option.value}
                    className="assistant-radio"
                    checked={reportType === option.value}
                    onChange={() => setReportType(option.value)}
                  />
                  <label htmlFor={radioId} className="assistant-radio-label">
                    {option.label}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        {reportType === 'practice_exam' ? (
          <fieldset className="assistant-fieldset assistant-exam-format-fieldset">
            <legend className="assistant-legend">Formato del examen</legend>
            <div className="assistant-radio-group assistant-exam-format-group">
              {EXAM_FORMAT_OPTIONS.map((option) => {
                const radioId = `${baseId}-exam-${option.value}`;
                return (
                  <div key={option.value} className="assistant-radio-option">
                    <input
                      id={radioId}
                      type="radio"
                      name={`${baseId}-exam-format`}
                      value={option.value}
                      className="assistant-radio"
                      checked={examFormat === option.value}
                      onChange={() => setExamFormat(option.value)}
                    />
                    <label htmlFor={radioId} className="assistant-radio-label">
                      {option.label}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="assistant-field">
          <label htmlFor={instructionsId} className="assistant-field-label">
            Instrucciones / Prompt para la IA
          </label>
          <textarea
            id={instructionsId}
            name="customInstructions"
            rows={3}
            className="assistant-textarea"
            placeholder="Ej: Redactá un informe comparativo enfocado en..."
            value={customInstructions}
            onChange={(event) => setCustomInstructions(event.target.value)}
          />
        </div>

        <div className="assistant-field">
          <label htmlFor={titleId} className="assistant-field-label">
            Título del material (opcional)
          </label>
          <input
            id={titleId}
            type="text"
            name="title"
            className="assistant-input"
            placeholder="Se genera automáticamente si lo dejás vacío"
            value={customTitle}
            onChange={(event) => setCustomTitle(event.target.value)}
          />
        </div>

        <div className="assistant-autosave-row">
          <input
            id={autoSaveId}
            type="checkbox"
            name="autoSaveAsNote"
            className="assistant-checkbox"
            checked={autoSaveAsNote}
            onChange={(event) => setAutoSaveAsNote(event.target.checked)}
          />
          <label htmlFor={autoSaveId} className="assistant-checkbox-label">
            Guardar automáticamente en Notas
          </label>
        </div>

        <div className="assistant-form-actions">
          <button
            type="submit"
            className="assistant-submit-btn primary-button"
            disabled={isSubmitDisabled}
          >
            {isGenerating ? 'Generando material...' : 'Generar material'}
          </button>
        </div>
      </form>

      {isGenerating ? (
        <div
          className="assistant-progress-panel sources-progress-panel"
          role="status"
          aria-live="polite"
        >
          <p className="assistant-progress-label sources-progress-label">
            Procesando Map-Reduce bajo demanda...
          </p>
          <progress
            className="assistant-progress sources-progress"
            aria-label="Generando material de estudio..."
          />
        </div>
      ) : null}

      {errorMessage ? (
        <div className="assistant-error settings-alert is-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {result ? (
        <article
          className="assistant-report-result"
          data-testid="report-result-card"
        >
          <header className="assistant-result-header">
            <div className="assistant-result-title-group">
              <h3 className="assistant-result-title">{result.title}</h3>
              <div className="assistant-result-meta">
                <span
                  className="assistant-model-pill"
                  data-testid="report-model-pill"
                >
                  Modelo: {result.modelUsed}
                </span>
                <span className="assistant-sources-used-pill">
                  {formatPlural(
                    result.sourcesUsed.length,
                    'fuente procesada',
                    'fuentes procesadas'
                  )}
                </span>
              </div>
            </div>

            <div className="assistant-result-actions">
              {savedNote ? (
                <button
                  type="button"
                  className="assistant-open-notes-btn primary-button"
                  onClick={() => onOpenNotesTab?.()}
                >
                  Abrir en Notas
                </button>
              ) : (
                <button
                  type="button"
                  className="assistant-save-note-btn secondary-button"
                  disabled={isSavingManualNote}
                  onClick={() => void handleSaveManualNote()}
                >
                  {isSavingManualNote ? 'Guardando...' : 'Guardar en Notas'}
                </button>
              )}

              <button
                type="button"
                className="assistant-export-btn secondary-button"
                disabled={isExporting}
                onClick={() => void handleExportMarkdown()}
              >
                {isExporting ? 'Exportando...' : 'Exportar .md'}
              </button>
            </div>
          </header>

          <div
            className="assistant-steps-list"
            aria-label="Pasos del proceso Map-Reduce"
            data-testid="report-steps-list"
          >
            {result.steps.map((step) => (
              <span
                key={`${step.stage}-${step.stepNumber}`}
                className={`assistant-step-badge is-${step.stage}`}
              >
                {step.stage === 'map' ? 'Map' : 'Reduce'} {step.stepNumber}/
                {step.totalSteps}: {step.label}
              </span>
            ))}
          </div>

          {actionFeedback ? (
            <div
              className={`assistant-feedback note-export-feedback is-${actionFeedback.kind}`}
              role="status"
              aria-live="polite"
            >
              {actionFeedback.text}
            </div>
          ) : null}

          <div
            className="assistant-markdown-preview note-markdown-preview"
            data-testid="report-markdown-preview"
            aria-label="Vista previa del material generado"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.content}
            </ReactMarkdown>
          </div>
        </article>
      ) : null}
    </section>
  );
}
