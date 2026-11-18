import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from 'react';
import { formatRelativeAgeEs, type StoredReport } from '../../lib/reportsStore';
import { renderTextWithMathAndCitations } from '../../lib/math/latexRenderer';
import type {
  ChatMessage,
  ExamStageTag,
  NoteWithCourse,
  Source,
  SourceType,
  StudyReportType,
} from '../../types';
import {
  SwissButton,
  SwissCheckbox,
  SwissErrorAlert,
  SwissLinkButton,
  SwissLoadingBar,
  SwissSectionHeader,
} from '../../ui';

export const COURSE_EXAM_STAGE_OPTIONS: ReadonlyArray<{
  value: ExamStageTag;
  label: string;
}> = [
  { value: 'general', label: 'General' },
  { value: 'parcial_1', label: '1° Parcial' },
  { value: 'parcial_2', label: '2° Parcial' },
  { value: 'final', label: 'Final' },
];

const SOURCE_TYPE_SHORT: Record<SourceType, string> = {
  pdf: 'PDF',
  markdown: 'MD',
  txt: 'TXT',
  pasted_text: 'Texto',
  note: 'Nota',
};

function sanitizeReportFilename(title: string): string {
  const normalized = (title || 'informe-ia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  return `${normalized || 'informe-ia'}.md`;
}

function downloadReportMarkdown(report: StoredReport): boolean {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }
  const markdownBody = report.content.trimStart().startsWith('#')
    ? report.content
    : `# ${report.title}\n\n${report.content}`;
  const blob = new Blob([markdownBody], {
    type: 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeReportFilename(report.title);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
  return true;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    try {
      return document.execCommand('copy');
    } finally {
      helper.remove();
    }
  }
  return false;
}

function extractReportExcerpt(content: string): string {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !b.startsWith('#'));
  const first = blocks[0] ?? content.trim();
  const singleLine = first.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 220) {
    return singleLine;
  }
  return `${singleLine.slice(0, 217).trimEnd()}…`;
}

export interface CourseAssistantSidebarProps {
  isRightSidebarOpen: boolean;
  onCollapse: () => void;
  aiStageFilter: ExamStageTag | 'all';
  onChangeStageFilter: (stage: ExamStageTag | 'all') => void;
  aiContextFilter: 'all' | 'sources_only' | 'notes_only';
  onChangeContextFilter: (
    next:
      | 'all'
      | 'sources_only'
      | 'notes_only'
      | ((
          prev: 'all' | 'sources_only' | 'notes_only'
        ) => 'all' | 'sources_only' | 'notes_only')
  ) => void;
  checkedCount: number;
  totalSources: number;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUploadSourceTrigger: () => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  isPasteOpen: boolean;
  onTogglePasteOpen: () => void;
  pasteTitle: string;
  onChangePasteTitle: (value: string) => void;
  pasteText: string;
  onChangePasteText: (value: string) => void;
  onPasteSubmit: (event: FormEvent<HTMLFormElement>) => void;
  includeNotes: boolean;
  onToggleIncludeNotes: () => void;
  filteredNotes: NoteWithCourse[];
  selectedNoteIds: Set<string>;
  onToggleNoteSelection: (noteId: string) => void;
  isNotePickerExpanded: boolean;
  onToggleNotePickerExpanded: () => void;
  filteredSources: Source[];
  selectedSourceIds: Set<string>;
  onToggleSourceSelection: (sourceId: string) => void;
  onSourceStageChange: (sourceId: string, stage: ExamStageTag) => void;
  reindexingSourceId: string | null;
  onReindexSource: (sourceId: string) => void;
  isLoadingPreview: boolean;
  onPreviewSource: (sourceId: string) => void;
  onDeleteSource: (sourceId: string) => void;
  isImportingSource: boolean;
  sourceError: string | null;
  isGeneratingReport: boolean;
  reportProgressText: string | null;
  reportError: string | null;
  onGenerateReport: (type: StudyReportType) => void;
  onRetryReport?: () => void;
  onCancelReport: () => void;
  onOpenSimulator: () => void;
  latestReport: StoredReport | null;
  onReportCitationClick: (citationNumber: number) => void;
  onOpenReport?: (reportId: string) => void;
  askQuery: string;
  onChangeAskQuery: (value: string) => void;
  isAsking: boolean;
  onAskSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancelAsk: () => void;
  streamingChatContent: string | null;
  askError: string | null;
  lastQuestion: string | null;
  lastAnswer: ChatMessage | null;
  onChatCitationClick: (citationNumber: number) => void;
}

/**
 * Right pane of the 3-column course notebook: context filters, source uploads & preview/reindex,
 * AI report actions, interactive simulator trigger, and quick RAG ask panel.
 */
export function CourseAssistantSidebar({
  isRightSidebarOpen,
  onCollapse,
  aiStageFilter,
  onChangeStageFilter,
  aiContextFilter,
  onChangeContextFilter,
  checkedCount,
  totalSources,
  fileInputRef,
  onUploadSourceTrigger,
  onFileInputChange,
  isPasteOpen,
  onTogglePasteOpen,
  pasteTitle,
  onChangePasteTitle,
  pasteText,
  onChangePasteText,
  onPasteSubmit,
  includeNotes,
  onToggleIncludeNotes,
  filteredNotes,
  selectedNoteIds,
  onToggleNoteSelection,
  isNotePickerExpanded,
  onToggleNotePickerExpanded,
  filteredSources,
  selectedSourceIds,
  onToggleSourceSelection,
  onSourceStageChange,
  reindexingSourceId,
  onReindexSource,
  isLoadingPreview,
  onPreviewSource,
  onDeleteSource,
  isImportingSource,
  sourceError,
  isGeneratingReport,
  reportProgressText,
  reportError,
  onGenerateReport,
  onRetryReport,
  onCancelReport,
  onOpenSimulator,
  latestReport,
  onReportCitationClick,
  onOpenReport,
  askQuery,
  onChangeAskQuery,
  isAsking,
  onAskSubmit,
  onCancelAsk,
  streamingChatContent,
  askError,
  lastQuestion,
  lastAnswer,
  onChatCitationClick,
}: CourseAssistantSidebarProps) {
  const askInputId = useId();
  const pasteTitleId = useId();
  const pasteBodyId = useId();
  const [reportActionNotice, setReportActionNotice] = useState<string | null>(
    null
  );
  const reportNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (reportNoticeTimerRef.current !== null) {
        window.clearTimeout(reportNoticeTimerRef.current);
      }
    };
  }, []);

  function showReportActionNotice(message: string): void {
    setReportActionNotice(message);
    if (reportNoticeTimerRef.current !== null) {
      window.clearTimeout(reportNoticeTimerRef.current);
    }
    reportNoticeTimerRef.current = window.setTimeout(() => {
      setReportActionNotice(null);
      reportNoticeTimerRef.current = null;
    }, 2500);
  }

  async function handleCopyLatestReport(): Promise<void> {
    if (!latestReport) return;
    try {
      const ok = await copyTextToClipboard(latestReport.content);
      showReportActionNotice(
        ok ? 'Copiado al portapapeles.' : 'No se pudo copiar el informe.'
      );
    } catch {
      showReportActionNotice('No se pudo copiar el informe.');
    }
  }

  function handleExportLatestReport(): void {
    if (!latestReport) return;
    const ok = downloadReportMarkdown(latestReport);
    showReportActionNotice(
      ok ? 'Exportado en Markdown.' : 'No se pudo exportar el informe.'
    );
  }

  return (
    <aside className="notebook-ai-pane" aria-label="Asistente e informes con IA">
      <div className="notebook-pane-header-bar" style={{ marginBottom: 0 }}>
        <h2 className="swiss-section-label">Informe con IA</h2>
        <button
          type="button"
          className="notebook-collapse-btn"
          aria-label="Colapsar panel derecho"
          aria-expanded={isRightSidebarOpen}
          title="Ocultar panel de asistente IA"
          onClick={onCollapse}
        >
          ›
        </button>
      </div>

      <div
        className="stage-filter-groups"
        role="group"
        aria-label="Filtrar contexto de IA por instancia"
      >
        <div className="stage-filter-group">
          <span className="swiss-section-label stage-filter-group-label">
            Alcance
          </span>
          <div className="stage-filter-pills">
            {(
              [
                { id: 'all', label: 'Todo' },
                { id: 'parcial_1', label: '1° Parcial' },
                { id: 'parcial_2', label: '2° Parcial' },
                { id: 'final', label: 'Final' },
              ] as const
            ).map((stage) => {
              const isActive = aiStageFilter === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  className={`stage-pill ${isActive ? 'is-active' : ''}`.trim()}
                  aria-pressed={isActive}
                  onClick={() => onChangeStageFilter(stage.id)}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="stage-filter-group">
          <span className="swiss-section-label stage-filter-group-label">
            Origen
          </span>
          <div className="stage-filter-pills">
            <button
              type="button"
              className={`stage-pill ${
                aiContextFilter === 'sources_only' ? 'is-active' : ''
              }`.trim()}
              aria-pressed={aiContextFilter === 'sources_only'}
              onClick={() =>
                onChangeContextFilter((prev) =>
                  prev === 'sources_only' ? 'all' : 'sources_only'
                )
              }
            >
              Solo Fuentes
            </button>
            <button
              type="button"
              className={`stage-pill ${
                aiContextFilter === 'notes_only' ? 'is-active' : ''
              }`.trim()}
              aria-pressed={aiContextFilter === 'notes_only'}
              onClick={() =>
                onChangeContextFilter((prev) =>
                  prev === 'notes_only' ? 'all' : 'notes_only'
                )
              }
            >
              Solo Notas
            </button>
          </div>
        </div>
      </div>

      <div>
        <SwissSectionHeader
          subtle
          title={`Fuentes · ${checkedCount} de ${totalSources}`}
          right={
            <span style={{ display: 'inline-flex', gap: '8px' }}>
              <SwissLinkButton
                className="swiss-link-sm"
                onClick={onUploadSourceTrigger}
              >
                + Subir PDF
              </SwissLinkButton>
              <SwissLinkButton
                className="swiss-link-sm"
                onClick={onTogglePasteOpen}
              >
                + Texto
              </SwissLinkButton>
            </span>
          }
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          className="visually-hidden"
          aria-label="Seleccionar archivo PDF, Markdown o texto"
          onChange={onFileInputChange}
        />

        {isPasteOpen ? (
          <form
            onSubmit={onPasteSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '10px 0',
              borderTop: '1px solid var(--rule)',
            }}
          >
            <label htmlFor={pasteTitleId} className="visually-hidden">
              Título de la fuente
            </label>
            <input
              id={pasteTitleId}
              type="text"
              className="swiss-input"
              placeholder="Título de la fuente…"
              value={pasteTitle}
              onChange={(e) => onChangePasteTitle(e.target.value)}
            />
            <label htmlFor={pasteBodyId} className="visually-hidden">
              Contenido de la fuente
            </label>
            <textarea
              id={pasteBodyId}
              rows={4}
              className="swiss-input"
              placeholder="Pegá el texto de la bibliografía o consigna…"
              value={pasteText}
              onChange={(e) => onChangePasteText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <SwissButton
                type="submit"
                variant="primary"
                disabled={isImportingSource}
              >
                Indexar
              </SwissButton>
              <SwissButton variant="tertiary" onClick={onTogglePasteOpen}>
                Cancelar
              </SwissButton>
            </div>
          </form>
        ) : null}

        <div className="notebook-sources-list">
          {aiContextFilter !== 'sources_only' ? (
            <div className="notebook-source-row">
              <div className="notebook-source-left">
                <SwissCheckbox
                  checked={includeNotes}
                  ariaLabel="Incluir todas las notas"
                  onChange={onToggleIncludeNotes}
                />
                <span className="notebook-source-name">Todas las notas</span>
              </div>
              <span
                className="swiss-meta"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>{filteredNotes.length}</span>
                {filteredNotes.length > 0 ? (
                  <SwissLinkButton
                    style={{ fontSize: '11px', fontWeight: 500 }}
                    onClick={onToggleNotePickerExpanded}
                  >
                    {isNotePickerExpanded ? 'Ocultar' : 'Elegir'}
                  </SwissLinkButton>
                ) : null}
              </span>
            </div>
          ) : null}

          {aiContextFilter !== 'sources_only' &&
          includeNotes &&
          isNotePickerExpanded
            ? filteredNotes.map((n) => (
                <div
                  key={n.id}
                  className="notebook-source-row"
                  style={{ paddingLeft: '14px' }}
                >
                  <div className="notebook-source-left">
                    <SwissCheckbox
                      checked={selectedNoteIds.has(n.id)}
                      ariaLabel={`Incluir nota ${n.title}`}
                      onChange={() => onToggleNoteSelection(n.id)}
                    />
                    <span className="notebook-source-name" title={n.title}>
                      {n.title}
                    </span>
                  </div>
                  <span className="swiss-meta">Nota</span>
                </div>
              ))
            : null}

          {aiContextFilter !== 'notes_only'
            ? filteredSources.map((src) => {
                const isChecked = selectedSourceIds.has(src.id);
                return (
                  <div key={src.id} className="notebook-source-row">
                    <div className="notebook-source-left">
                      <SwissCheckbox
                        checked={isChecked}
                        ariaLabel={`Incluir ${src.title}`}
                        onChange={() => onToggleSourceSelection(src.id)}
                      />
                      <span className="notebook-source-name" title={src.title}>
                        {src.title}
                      </span>
                    </div>
                    <span
                      className="swiss-meta"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <select
                        aria-label={`Instancia de ${src.title}`}
                        value={src.examStage ?? 'general'}
                        onChange={(e) =>
                          onSourceStageChange(
                            src.id,
                            e.target.value as ExamStageTag
                          )
                        }
                        style={{
                          fontSize: '11px',
                          background: 'transparent',
                          border: '1px solid var(--rule)',
                          color: 'var(--mut)',
                          padding: '1px 4px',
                        }}
                      >
                        {COURSE_EXAM_STAGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span>{SOURCE_TYPE_SHORT[src.sourceType]}</span>
                      {src.indexingStatus === 'error' ? (
                        <SwissLinkButton
                          className="swiss-link-sm"
                          style={{ fontWeight: 600, color: 'var(--acc)' }}
                          aria-label={`Reindexar ${src.title}`}
                          disabled={reindexingSourceId === src.id}
                          onClick={() => onReindexSource(src.id)}
                        >
                          {reindexingSourceId === src.id
                            ? 'Reindexando…'
                            : 'Reindexar'}
                        </SwissLinkButton>
                      ) : null}
                      <SwissLinkButton
                        className="swiss-link-sm"
                        style={{ fontWeight: 400 }}
                        aria-label={`Ver ${src.title}`}
                        disabled={isLoadingPreview}
                        onClick={() => onPreviewSource(src.id)}
                      >
                        Ver
                      </SwissLinkButton>
                      <SwissLinkButton
                        className="swiss-link-sm"
                        style={{ fontWeight: 400 }}
                        aria-label={`Quitar ${src.title}`}
                        onClick={() => onDeleteSource(src.id)}
                      >
                        Quitar
                      </SwissLinkButton>
                    </span>
                  </div>
                );
              })
            : null}
        </div>

        {isImportingSource ? <SwissLoadingBar text="Indexando fuente…" /> : null}
        {sourceError ? <SwissErrorAlert message={sourceError} /> : null}
      </div>

      <div className="notebook-report-actions">
        <SwissButton
          variant="primary"
          disabled={isGeneratingReport}
          onClick={() => onGenerateReport('summary')}
        >
          Resumen de parcial
        </SwissButton>
        <SwissButton
          variant="secondary"
          disabled={isGeneratingReport}
          onClick={() => onGenerateReport('study_guide')}
        >
          Guía de estudio
        </SwissButton>
        <SwissButton
          variant="secondary"
          disabled={isGeneratingReport}
          onClick={() => onGenerateReport('practice_exam')}
        >
          Preguntas
        </SwissButton>
        <SwissButton variant="secondary" onClick={onOpenSimulator}>
          Simulacro interactivo
        </SwissButton>
      </div>

      <section
        className="notebook-report-panel"
        aria-label="Estado del informe con IA"
      >
        {isGeneratingReport ? (
          <div
            className="notebook-report-state is-generating"
            data-testid="assistant-report-generating"
          >
            <div className="notebook-report-progress-row">
              <div className="notebook-report-progress-track">
                <SwissLoadingBar
                  text={reportProgressText ?? 'Generando informe…'}
                />
              </div>
              <SwissButton
                variant="tertiary"
                size="sm"
                aria-label="Cancelar generación de informe"
                onClick={onCancelReport}
              >
                Cancelar
              </SwissButton>
            </div>
          </div>
        ) : reportError ? (
          <div
            className="notebook-report-state is-error"
            data-testid="assistant-report-error"
          >
            <SwissErrorAlert message={reportError} />
            <div className="notebook-report-error-actions">
              <SwissButton
                variant="secondary"
                size="sm"
                aria-label="Reintentar generación de informe"
                onClick={() =>
                  onRetryReport ? onRetryReport() : onGenerateReport('summary')
                }
              >
                Reintentar
              </SwissButton>
            </div>
          </div>
        ) : latestReport ? (
          <div
            className="notebook-last-report"
            data-testid="assistant-report-result"
          >
            <span className="swiss-section-label">
              Último informe · {formatRelativeAgeEs(latestReport.updatedAt)}
            </span>
            <h3
              className="notebook-last-report-title"
              title={latestReport.title}
            >
              {latestReport.title}
            </h3>
            <p className="notebook-last-report-excerpt">
              {renderTextWithMathAndCitations(
                extractReportExcerpt(latestReport.content),
                onReportCitationClick
              )}
            </p>
            <div className="notebook-last-report-actions">
              <SwissButton
                variant="secondary"
                size="sm"
                aria-label="Copiar informe"
                onClick={() => void handleCopyLatestReport()}
              >
                Copiar
              </SwissButton>
              <SwissButton
                variant="secondary"
                size="sm"
                aria-label="Exportar informe"
                onClick={handleExportLatestReport}
              >
                Exportar
              </SwissButton>
              <SwissButton
                variant="secondary"
                size="sm"
                aria-label="Regenerar informe"
                onClick={() => onGenerateReport(latestReport.reportType)}
              >
                Regenerar
              </SwissButton>
              <SwissLinkButton
                underlined
                className="notebook-open-report-link"
                onClick={() => onOpenReport?.(latestReport.id)}
              >
                Abrir informe →
              </SwissLinkButton>
            </div>
            {reportActionNotice ? (
              <span
                className="swiss-meta"
                role="status"
                aria-live="polite"
              >
                {reportActionNotice}
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className="notebook-report-empty"
            data-testid="assistant-report-empty"
          >
            <p className="notebook-report-empty-title">
              Sin informe generado todavía
            </p>
            <p className="notebook-report-empty-copy">
              Elegí un formato arriba para sintetizar {checkedCount}{' '}
              {checkedCount === 1 ? 'fuente activa' : 'fuentes activas'}.
            </p>
          </div>
        )}
      </section>

      <form
        className="notebook-ask-form"
        style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}
        onSubmit={onAskSubmit}
      >
        <label htmlFor={askInputId} className="visually-hidden">
          Preguntale a tus fuentes
        </label>
        <input
          id={askInputId}
          type="text"
          className="swiss-input"
          style={{ flex: 1, minWidth: 0 }}
          placeholder="Preguntale a tus fuentes…"
          value={askQuery}
          disabled={isAsking}
          onChange={(e) => onChangeAskQuery(e.target.value)}
        />
        <SwissButton
          type="submit"
          variant="secondary"
          aria-label="Enviar consulta"
          disabled={isAsking || !askQuery.trim()}
        >
          →
        </SwissButton>
      </form>

      {isAsking ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SwissLoadingBar text="Consultando tus fuentes…" />
          </div>
          <SwissLinkButton
            className="swiss-link-sm"
            aria-label="Cancelar consulta"
            onClick={onCancelAsk}
          >
            Cancelar
          </SwissLinkButton>
        </div>
      ) : null}
      {streamingChatContent ? (
        <p className="notebook-answer-copy" aria-live="polite">
          {streamingChatContent}
        </p>
      ) : null}
      {askError ? <SwissErrorAlert message={askError} /> : null}

      {lastAnswer ? (
        <div
          style={{
            borderTop: '1px solid var(--rule)',
            paddingTop: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {lastQuestion ? (
            <div className="swiss-meta">{lastQuestion}</div>
          ) : null}
          <p className="notebook-answer-copy">
            {renderTextWithMathAndCitations(
              lastAnswer.content,
              onChatCitationClick
            )}
          </p>
          {lastAnswer.citations.length > 0 ? (
            <div className="swiss-meta">
              {lastAnswer.citations.map((c) => (
                <div key={c.chunkId}>
                  [{c.citationNumber}] {c.sourceTitle}
                  {c.pageNumber !== null ? ` (p. ${c.pageNumber})` : ''}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
