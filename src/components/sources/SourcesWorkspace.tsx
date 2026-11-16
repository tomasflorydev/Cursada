import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import type {
  Source,
  SourceChunkSearchResult,
  SourceIndexingStatus,
  SourceType,
  SourceWithChunks,
} from '../../types/domain';

export interface SourcesWorkspaceProps {
  courseId: string;
  courseName?: string;
}

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  pdf: 'PDF',
  markdown: 'Markdown',
  txt: 'TXT',
  pasted_text: 'Texto pegado',
  note: 'Nota',
};

const INDEXING_STATUS_LABELS: Record<SourceIndexingStatus, string> = {
  ready: 'Indexado',
  indexing: 'Indexando...',
  pending: 'Pendiente',
  error: 'Error',
};

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    let chunkStr = '';
    for (let j = 0; j < slice.length; j++) {
      chunkStr += String.fromCharCode(slice[j]);
    }
    binary += chunkStr;
  }
  return btoa(binary);
}

async function readFileAsBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('No se pudo leer el contenido del archivo.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Error al leer el archivo.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function formatPlural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function SourcesWorkspace({ courseId, courseName }: SourcesWorkspaceProps) {
  const baseId = useId();
  const progressId = `${baseId}-indexing-progress`;
  const searchInputId = `${baseId}-search-input`;
  const pasteTitleId = `${baseId}-paste-dialog-title`;
  const pasteNameInputId = `${baseId}-paste-title-input`;
  const pasteBodyInputId = `${baseId}-paste-body-input`;
  const previewTitleId = `${baseId}-preview-dialog-title`;
  const previewPreLabelId = `${baseId}-preview-raw-heading`;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteDialogRef = useRef<HTMLDialogElement | null>(null);
  const previewDialogRef = useRef<HTMLDialogElement | null>(null);
  const searchSeqRef = useRef(0);

  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingLabel, setIndexingLabel] = useState('Indexando fuente...');
  const [reindexingSourceId, setReindexingSourceId] = useState<string | null>(null);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [liveStatusMessage, setLiveStatusMessage] = useState('');

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SourceChunkSearchResult[]>([]);
  const [isSearchingChunks, setIsSearchingChunks] = useState(false);

  // Paste direct text modal state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [isSubmittingPaste, setIsSubmittingPaste] = useState(false);

  // Preview modal state
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<SourceWithChunks | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'raw' | 'chunks'>('raw');

  const loadSources = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        if (!options?.silent) {
          setIsLoading(true);
        }
        const list = await cursadaClient.listSources(courseId);
        setSources(list);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar las fuentes.'
        );
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [courseId]
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    function handleDataChanged(): void {
      void loadSources({ silent: true });
    }
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadSources]);

  // Sync native Paste <dialog> modal state
  useEffect(() => {
    const dialog = pasteDialogRef.current;
    if (!dialog) {
      return;
    }

    if (isPasteModalOpen) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }
    } else {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      dialog.returnValue = '';
    }
  }, [isPasteModalOpen]);

  // Sync native Preview <dialog> modal state
  useEffect(() => {
    const dialog = previewDialogRef.current;
    if (!dialog) {
      return;
    }

    if (previewSourceId !== null) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }
    } else {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      dialog.returnValue = '';
    }
  }, [previewSourceId]);

  // Execute chunk search when searchQuery changes
  useEffect(() => {
    const trimmed = searchQuery.trim();
    const requestId = ++searchSeqRef.current;

    if (!trimmed) {
      setSearchResults([]);
      setIsSearchingChunks(false);
      return;
    }

    setIsSearchingChunks(true);
    const timer = window.setTimeout(() => {
      void cursadaClient
        .searchSourceChunks({ courseId, query: trimmed, limit: 8 })
        .then((hits) => {
          if (searchSeqRef.current === requestId) {
            setSearchResults(hits);
            setIsSearchingChunks(false);
          }
        })
        .catch(() => {
          if (searchSeqRef.current === requestId) {
            setSearchResults([]);
            setIsSearchingChunks(false);
          }
        });
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, [courseId, searchQuery, sources]);

  const filteredSources = useMemo(() => {
    const normalizeText = (value: string): string =>
      value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

    const normalizedQuery = normalizeText(searchQuery).trim();
    if (!normalizedQuery) {
      return sources;
    }

    const queryTokens = normalizedQuery
      .split(/\s+/)
      .filter((token) => token.length > 0);
    const matchingSourceIds = new Set(
      searchResults.map((hit) => hit.chunk.sourceId)
    );

    return sources.filter((source) => {
      if (matchingSourceIds.has(source.id)) {
        return true;
      }
      const haystack = normalizeText(
        `${source.title} ${SOURCE_TYPE_LABELS[source.sourceType]} ${source.rawText}`
      );
      return queryTokens.every((token) => haystack.includes(token));
    });
  }, [searchQuery, searchResults, sources]);

  const summary = useMemo(() => {
    let totalPages = 0;
    let totalChunks = 0;
    for (const src of sources) {
      totalPages += src.pageCount;
      totalChunks += src.chunkCount;
    }
    return {
      sourceCount: sources.length,
      totalPages,
      totalChunks,
    };
  }, [sources]);

  async function handleOpenPreview(
    sourceId: string,
    initialTab: 'raw' | 'chunks' = 'raw'
  ): Promise<void> {
    setPreviewTab(initialTab);
    setPreviewSourceId(sourceId);
    setPreviewData(null);
    setPreviewError(null);
    setIsLoadingPreview(true);

    try {
      const detail = await cursadaClient.getSourceWithChunks(sourceId);
      if (!detail) {
        setPreviewError('No se encontró la fuente seleccionada.');
      } else {
        setPreviewData(detail);
      }
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar la previsualización.'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }

  function handlePreviewDialogClose(): void {
    const dialog = previewDialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    setPreviewSourceId(null);
    setPreviewData(null);
    setPreviewError(null);
  }

  function handleOpenPasteModal(): void {
    setPasteTitle('');
    setPasteContent('');
    setPasteError(null);
    setIsPasteModalOpen(true);
  }

  function handlePasteDialogClose(): void {
    const dialog = pasteDialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    setIsPasteModalOpen(false);
    setPasteError(null);
  }

  async function handleUploadButtonClick(): Promise<void> {
    setErrorMessage(null);
    const hasNativeDialog =
      typeof window !== 'undefined' &&
      typeof window.cursadaApi?.importSourceFile === 'function';

    if (hasNativeDialog) {
      setIsIndexing(true);
      setIndexingLabel('Importando e indexando archivo...');
      try {
        const result = await cursadaClient.importSourceFile({ courseId });
        if (!result.canceled && result.source) {
          await loadSources({ silent: true });
          setLiveStatusMessage(
            `Fuente "${result.source.title}" indexada con ${formatPlural(
              result.source.chunkCount,
              'fragmento',
              'fragmentos'
            )}.`
          );
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'No se pudo importar el archivo.'
        );
      } finally {
        setIsIndexing(false);
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleFileInputChange(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setIsIndexing(true);
    setIndexingLabel(`Extrayendo e indexando "${file.name}"...`);

    try {
      const bytes = await readFileAsBytes(file);
      const contentBase64 = bytesToBase64(bytes);
      const result = await cursadaClient.importSourceFile({
        courseId,
        fileName: file.name,
        contentBase64,
      });

      if (!result.canceled && result.source) {
        await loadSources({ silent: true });
        setLiveStatusMessage(
          `Fuente "${result.source.title}" indexada con ${formatPlural(
            result.source.chunkCount,
            'fragmento',
            'fragmentos'
          )}.`
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo procesar e indexar el archivo.'
      );
    } finally {
      setIsIndexing(false);
    }
  }

  async function handlePasteSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    const trimmedTitle = pasteTitle.trim();
    const trimmedContent = pasteContent.trim();

    if (!trimmedTitle) {
      setPasteError('Ingresá un título para identificar la fuente.');
      return;
    }
    if (!trimmedContent) {
      setPasteError('Pegá o escribí el contenido que querés indexar.');
      return;
    }

    setPasteError(null);
    setIsSubmittingPaste(true);
    setIsIndexing(true);
    setIndexingLabel(`Indexando "${trimmedTitle}"...`);

    try {
      const created = await cursadaClient.createSourceFromText({
        courseId,
        title: trimmedTitle,
        text: trimmedContent,
        sourceType: 'pasted_text',
      });
      await loadSources({ silent: true });
      handlePasteDialogClose();
      setLiveStatusMessage(
        `Fuente "${created.title}" indexada con ${formatPlural(
          created.chunkCount,
          'fragmento',
          'fragmentos'
        )}.`
      );
    } catch (error) {
      setPasteError(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar e indexar el texto.'
      );
    } finally {
      setIsSubmittingPaste(false);
      setIsIndexing(false);
    }
  }

  async function handleReindex(source: Source): Promise<void> {
    setErrorMessage(null);
    setReindexingSourceId(source.id);
    setIsIndexing(true);
    setIndexingLabel(`Reindexando "${source.title}"...`);

    try {
      const updated = await cursadaClient.reindexSource(source.id);
      await loadSources({ silent: true });
      if (previewSourceId === source.id) {
        const refreshed = await cursadaClient.getSourceWithChunks(source.id);
        setPreviewData(refreshed);
      }
      setLiveStatusMessage(
        `Fuente "${updated.title}" reindexada con ${formatPlural(
          updated.chunkCount,
          'fragmento',
          'fragmentos'
        )}.`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo reindexar la fuente.'
      );
    } finally {
      setReindexingSourceId(null);
      setIsIndexing(false);
    }
  }

  async function handleDelete(source: Source): Promise<void> {
    setErrorMessage(null);
    setDeletingSourceId(source.id);

    try {
      await cursadaClient.deleteSource(source.id);
      if (previewSourceId === source.id) {
        handlePreviewDialogClose();
      }
      await loadSources({ silent: true });
      setLiveStatusMessage(`Fuente "${source.title}" eliminada.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar la fuente.'
      );
    } finally {
      setDeletingSourceId(null);
    }
  }

  function handleSearchFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
  }

  const trimmedQuery = searchQuery.trim();

  return (
    <section
      className="sources-workspace surface-panel"
      aria-labelledby={`${baseId}-heading`}
    >
      <header className="sources-header">
        <div className="sources-header-text">
          <h2 id={`${baseId}-heading`} className="sources-heading">
            Fuentes de estudio
          </h2>
          <p className="sources-summary-meta" data-testid="sources-summary">
            {formatPlural(summary.sourceCount, 'fuente', 'fuentes')}
            {' · '}
            {formatPlural(summary.totalPages, 'página', 'páginas')}
            {' · '}
            {formatPlural(
              summary.totalChunks,
              'fragmento indexado',
              'fragmentos indexados'
            )}
            {courseName ? ` en ${courseName}` : ''}
          </p>
        </div>

        <div className="sources-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt"
            className="visually-hidden sources-file-input"
            data-testid="source-file-input"
            aria-label="Seleccionar archivo (.pdf, .md, .txt)"
            onChange={(event) => {
              void handleFileInputChange(event);
            }}
          />
          <button
            type="button"
            className="primary-button"
            disabled={isIndexing}
            onClick={() => {
              void handleUploadButtonClick();
            }}
          >
            Subir archivo (.pdf, .md, .txt)
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isIndexing}
            onClick={handleOpenPasteModal}
          >
            Pegar texto directo
          </button>
        </div>
      </header>

      <div
        className="visually-hidden sources-live-region"
        role="status"
        aria-live="polite"
      >
        {liveStatusMessage}
      </div>

      {isIndexing && (
        <div className="sources-progress-panel">
          <label htmlFor={progressId} className="sources-progress-label">
            {indexingLabel}
          </label>
          <progress id={progressId} className="sources-progress" />
        </div>
      )}

      {errorMessage && (
        <div className="course-form-alert" role="alert">
          {errorMessage}
        </div>
      )}

      <search className="sources-search-bar">
        <form
          className="sources-search-form"
          onSubmit={handleSearchFormSubmit}
        >
          <label htmlFor={searchInputId} className="visually-hidden">
            Buscar en fuentes y fragmentos
          </label>
          <input
            id={searchInputId}
            type="search"
            className="sources-search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar fragmentos o filtrar fuentes por tema o palabra clave..."
          />
          {trimmedQuery && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setSearchQuery('')}
            >
              Limpiar
            </button>
          )}
        </form>
      </search>

      {trimmedQuery && (
        <div
          className="sources-search-results"
          data-testid="sources-fragment-results"
        >
          <div className="sources-search-results-header">
            <h3 className="sources-subheading">
              Fragmentos coincidentes
              {!isSearchingChunks ? ` (${searchResults.length})` : ''}
            </h3>
            {isSearchingChunks && (
              <span className="sources-muted-hint">Buscando...</span>
            )}
          </div>

          {!isSearchingChunks && searchResults.length === 0 ? (
            <p className="sources-empty-search">
              No se encontraron fragmentos para "{trimmedQuery}".
            </p>
          ) : (
            <ul role="list" className="sources-hit-list">
              {searchResults.map((hit) => (
                <li key={hit.chunk.id} className="sources-hit-card">
                  <div className="sources-hit-meta">
                    <span className="sources-hit-source">{hit.sourceTitle}</span>
                    <span className="sources-type-badge">
                      {SOURCE_TYPE_LABELS[hit.sourceType]}
                    </span>
                    {hit.chunk.pageNumber !== null && (
                      <span className="sources-page-badge">
                        Página {hit.chunk.pageNumber}
                      </span>
                    )}
                    <button
                      type="button"
                      className="ghost-action-button sources-hit-open-btn"
                      onClick={() => {
                        void handleOpenPreview(hit.chunk.sourceId, 'chunks');
                      }}
                    >
                      Ver fuente
                    </button>
                  </div>
                  <p className="sources-hit-excerpt">{hit.chunk.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="sources-loading-text">Cargando fuentes...</p>
      ) : filteredSources.length === 0 ? (
        <div className="sources-empty-state">
          <p className="sources-empty-title">
            {sources.length === 0
              ? 'Todavía no cargaste fuentes'
              : 'Ninguna fuente coincide con tu búsqueda'}
          </p>
        </div>
      ) : (
        <ul role="list" className="sources-list">
          {filteredSources.map((source) => {
            const isThisReindexing = reindexingSourceId === source.id;
            const isThisDeleting = deletingSourceId === source.id;
            return (
              <li
                key={source.id}
                className="sources-card"
                data-testid={`source-card-${source.id}`}
              >
                <div className="sources-card-main">
                  <div className="sources-card-title-row">
                    <h3 className="sources-card-title">{source.title}</h3>
                    <span
                      className={`sources-type-badge is-${source.sourceType}`}
                    >
                      {SOURCE_TYPE_LABELS[source.sourceType]}
                    </span>
                    <span
                      className={`sources-status-badge is-${source.indexingStatus}`}
                    >
                      {INDEXING_STATUS_LABELS[source.indexingStatus]}
                    </span>
                  </div>

                  <p className="sources-card-meta">
                    <span>
                      {formatPlural(source.pageCount, 'página', 'páginas')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {formatPlural(source.chunkCount, 'fragmento', 'fragmentos')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {source.charCount.toLocaleString('es-AR')} caracteres
                    </span>
                    {source.embeddingModel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="sources-model-tag">
                          {source.embeddingModel}
                        </span>
                      </>
                    )}
                  </p>

                  {source.indexingStatus === 'error' && source.indexingError && (
                    <p className="sources-card-error" role="alert">
                      {source.indexingError}
                    </p>
                  )}
                </div>

                <div className="sources-card-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    aria-label={`Previsualizar ${source.title}`}
                    onClick={() => {
                      void handleOpenPreview(source.id, 'raw');
                    }}
                  >
                    Previsualizar
                  </button>
                  <button
                    type="button"
                    className="ghost-action-button"
                    aria-label={`Reindexar ${source.title}`}
                    disabled={isThisReindexing || isIndexing}
                    onClick={() => {
                      void handleReindex(source);
                    }}
                  >
                    {isThisReindexing ? 'Reindexando...' : 'Reindexar'}
                  </button>
                  <button
                    type="button"
                    className="danger-outline-button"
                    aria-label={`Eliminar ${source.title}`}
                    disabled={isThisDeleting || isIndexing}
                    onClick={() => {
                      void handleDelete(source);
                    }}
                  >
                    {isThisDeleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Modal: Paste direct text */}
      <dialog
        ref={pasteDialogRef}
        className="cursada-modal-dialog sources-modal-dialog"
        aria-labelledby={pasteTitleId}
        onClose={handlePasteDialogClose}
      >
        {isPasteModalOpen && (
          <div className="cursada-modal-content">
            <header className="cursada-modal-header">
              <h3 id={pasteTitleId} className="cursada-modal-title">
                Pegar texto directo
              </h3>
              <button
                type="button"
                className="ghost-action-button"
                aria-label="Cerrar diálogo de texto directo"
                onClick={handlePasteDialogClose}
              >
                Cerrar
              </button>
            </header>

            <form
              className="course-form"
              onSubmit={(event) => {
                void handlePasteSubmit(event);
              }}
              noValidate
            >
              {pasteError && (
                <div className="course-form-alert" role="alert">
                  {pasteError}
                </div>
              )}

              <div className="course-form-field">
                <label htmlFor={pasteNameInputId} className="course-form-label">
                  Título
                </label>
                <input
                  id={pasteNameInputId}
                  type="text"
                  className="course-form-input"
                  value={pasteTitle}
                  onChange={(event) => setPasteTitle(event.target.value)}
                  placeholder="Ej. Apuntes Unidad 3 — Patrones de diseño"
                  required
                />
              </div>

              <div className="course-form-field">
                <label htmlFor={pasteBodyInputId} className="course-form-label">
                  Contenido
                </label>
                <textarea
                  id={pasteBodyInputId}
                  className="sources-paste-textarea"
                  rows={10}
                  value={pasteContent}
                  onChange={(event) => setPasteContent(event.target.value)}
                  placeholder="Pegá acá texto de clases, guías de estudio o definiciones..."
                  required
                />
              </div>

              <footer className="cursada-modal-footer">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isSubmittingPaste}
                  onClick={handlePasteDialogClose}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSubmittingPaste}
                >
                  {isSubmittingPaste ? 'Indexando...' : 'Guardar e indexar'}
                </button>
              </footer>
            </form>
          </div>
        )}
      </dialog>

      {/* Modal: Source preview (raw text + indexed chunks) */}
      <dialog
        ref={previewDialogRef}
        className="cursada-modal-dialog sources-modal-dialog sources-preview-dialog"
        aria-labelledby={previewTitleId}
        onClose={handlePreviewDialogClose}
      >
        {previewSourceId !== null && (
          <div className="cursada-modal-content">
            <header className="cursada-modal-header">
              <div className="sources-preview-title-group">
                <h3 id={previewTitleId} className="cursada-modal-title">
                  {previewData ? previewData.title : 'Previsualización de fuente'}
                </h3>
                {previewData && (
                  <p className="sources-preview-subtitle">
                    {SOURCE_TYPE_LABELS[previewData.sourceType]}
                    {' · '}
                    {formatPlural(previewData.pageCount, 'página', 'páginas')}
                    {' · '}
                    {formatPlural(
                      previewData.chunks.length,
                      'fragmento indexado',
                      'fragmentos indexados'
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="ghost-action-button"
                aria-label="Cerrar previsualización"
                onClick={handlePreviewDialogClose}
              >
                Cerrar
              </button>
            </header>

            {isLoadingPreview ? (
              <p className="sources-loading-text">Cargando contenido...</p>
            ) : previewError ? (
              <div className="course-form-alert" role="alert">
                {previewError}
              </div>
            ) : previewData ? (
              <>
                <div
                  className="sources-preview-tabs"
                  role="group"
                  aria-label="Modo de visualización"
                >
                  <button
                    type="button"
                    className={`sources-tab-button ${
                      previewTab === 'raw' ? 'is-active' : ''
                    }`}
                    aria-pressed={previewTab === 'raw'}
                    onClick={() => setPreviewTab('raw')}
                  >
                    Texto extraído
                  </button>
                  <button
                    type="button"
                    className={`sources-tab-button ${
                      previewTab === 'chunks' ? 'is-active' : ''
                    }`}
                    aria-pressed={previewTab === 'chunks'}
                    onClick={() => setPreviewTab('chunks')}
                  >
                    Fragmentos indexados ({previewData.chunks.length})
                  </button>
                </div>

                {previewTab === 'raw' ? (
                  <div className="sources-raw-panel">
                    <h4
                      id={previewPreLabelId}
                      className="sources-preview-section-label"
                    >
                      Contenido extraído completo
                    </h4>
                    <pre
                      role="region"
                      aria-labelledby={previewPreLabelId}
                      tabIndex={0}
                      className="sources-raw-pre"
                    >
                      <code>{previewData.rawText}</code>
                    </pre>
                  </div>
                ) : (
                  <ul role="list" className="sources-chunks-list">
                    {previewData.chunks.map((chunk) => (
                      <li key={chunk.id} className="sources-chunk-card">
                        <div className="sources-chunk-header">
                          <span className="sources-chunk-index">
                            #{chunk.chunkIndex + 1}
                          </span>
                          <span className="sources-page-badge">
                            {chunk.pageNumber !== null
                              ? `Página ${chunk.pageNumber}`
                              : 'Sin página'}
                          </span>
                          {chunk.embeddingDim !== null && (
                            <span className="sources-chunk-dim">
                              {chunk.embeddingDim} dims
                            </span>
                          )}
                        </div>
                        <p className="sources-chunk-content">{chunk.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            <footer className="cursada-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handlePreviewDialogClose}
              >
                Cerrar
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </section>
  );
}
