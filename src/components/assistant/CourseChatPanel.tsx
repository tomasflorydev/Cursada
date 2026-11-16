import { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cursadaClient } from '../../lib/api/client';
import type {
  ChatCitation,
  ChatThread,
  ChatThreadWithMessages,
  SourceType,
} from '../../types/domain';

export interface CourseChatPanelProps {
  courseId: string;
  courseName: string;
  onNoteCreated?: (noteId: string) => void;
  onOpenNotesTab?: () => void;
}

const QUICK_START_PROMPTS = [
  'Resumime los temas principales de las fuentes',
  '¿Qué conceptos clave conviene repasar para el parcial?',
  'Explicame paso a paso el tema más importante con citas',
];

function formatSourceType(sourceType: SourceType): string {
  switch (sourceType) {
    case 'pdf':
      return 'PDF';
    case 'markdown':
      return 'Markdown';
    case 'txt':
      return 'Archivo de texto';
    case 'pasted_text':
      return 'Texto pegado';
    case 'note':
      return 'Nota';
  }
}

function formatMessageTime(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCitationChipLabel(citation: ChatCitation): string {
  const pageSuffix = citation.pageNumber != null ? ` · pág. ${citation.pageNumber}` : '';
  return `[${citation.citationNumber}] ${citation.sourceTitle}${pageSuffix}`;
}

function formatModelLabel(modelUsed: string): string {
  if (modelUsed === 'local-rag-extractive') {
    return 'Modo extractivo local (local-rag-extractive)';
  }
  return modelUsed;
}

export function CourseChatPanel({
  courseId,
  courseName,
  onNoteCreated,
  onOpenNotesTab,
}: CourseChatPanelProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThreadWithMessages | null>(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [savedNotesByMessageId, setSavedNotesByMessageId] = useState<Record<string, string>>({});
  const [customInstructions, setCustomInstructions] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [activeCitation, setActiveCitation] = useState<ChatCitation | null>(null);

  const citationDialogRef = useRef<HTMLDialogElement | null>(null);
  const threadSelectId = useId();
  const customInstructionsId = useId();
  const promptInputId = useId();
  const promptErrorId = useId();
  const citationDialogTitleId = useId();

  const loadThreads = useCallback(
    async (preferredThreadId?: string) => {
      setIsLoadingThreads(true);
      setErrorMessage(null);

      try {
        const listed = await cursadaClient.listChatThreads(courseId);
        setThreads(listed);

        const targetId =
          preferredThreadId && listed.some((thread) => thread.id === preferredThreadId)
            ? preferredThreadId
            : listed[0]?.id;

        if (!targetId) {
          setActiveThread(null);
          return;
        }

        const detailed = await cursadaClient.getChatThread(targetId);
        setActiveThread(detailed);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar las conversaciones del asistente.'
        );
      } finally {
        setIsLoadingThreads(false);
      }
    },
    [courseId]
  );

  useEffect(() => {
    setThreads([]);
    setActiveThread(null);
    setCustomInstructions('');
    setDraftPrompt('');
    setValidationError(null);
    setErrorMessage(null);
    setStatusMessage('');
    setActiveCitation(null);
    setSavedNotesByMessageId({});
    void loadThreads();
  }, [courseId, loadThreads]);

  useEffect(() => {
    const dialog = citationDialogRef.current;
    if (!dialog) {
      return;
    }

    if (activeCitation) {
      if (!dialog.open && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    } else if (dialog.open && typeof dialog.close === 'function') {
      dialog.returnValue = '';
      dialog.close('');
    }
  }, [activeCitation]);

  const closeCitationDialog = useCallback(() => {
    const dialog = citationDialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
      if (dialog.open && typeof dialog.close === 'function') {
        dialog.close('');
      }
    }
    setActiveCitation(null);
  }, []);

  const handleSelectThread = async (threadId: string) => {
    setErrorMessage(null);
    if (!threadId) {
      setActiveThread(null);
      return;
    }
    try {
      const detailed = await cursadaClient.getChatThread(threadId);
      setActiveThread(detailed);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo cargar la conversación seleccionada.'
      );
    }
  };

  const handleCreateThread = async () => {
    setErrorMessage(null);
    setValidationError(null);
    try {
      const created = await cursadaClient.createChatThread({ courseId });
      setThreads((prev) => [created, ...prev]);
      setActiveThread({ ...created, messages: [] });
      setStatusMessage('Nueva conversación iniciada.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo crear una nueva conversación.'
      );
    }
  };

  const handleDeleteThread = async () => {
    if (!activeThread) {
      return;
    }
    setErrorMessage(null);
    const deletingId = activeThread.id;

    try {
      await cursadaClient.deleteChatThread(deletingId);
      const remaining = threads.filter((thread) => thread.id !== deletingId);
      setThreads(remaining);
      setStatusMessage('Conversación eliminada.');

      if (remaining.length > 0) {
        const nextThread = await cursadaClient.getChatThread(remaining[0].id);
        setActiveThread(nextThread);
      } else {
        setActiveThread(null);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo eliminar la conversación.'
      );
    }
  };

  const submitQuestion = async (rawPrompt: string) => {
    const trimmedPrompt = rawPrompt.trim();
    if (!trimmedPrompt) {
      setValidationError('Escribí una consulta antes de enviar.');
      return;
    }

    setValidationError(null);
    setErrorMessage(null);
    setIsSending(true);
    setStatusMessage('Buscando fragmentos en tus fuentes y generando respuesta...');

    try {
      const trimmedInstructions = customInstructions.trim();
      const result = await cursadaClient.sendChatMessage({
        courseId,
        threadId: activeThread?.id,
        content: trimmedPrompt,
        customInstructions: trimmedInstructions || undefined,
      });

      setDraftPrompt('');

      const updatedThreads = await cursadaClient.listChatThreads(courseId);
      setThreads(
        updatedThreads.length > 0
          ? updatedThreads
          : [result.thread]
      );

      const refreshed = await cursadaClient.getChatThread(result.thread.id);
      if (refreshed) {
        setActiveThread(refreshed);
      } else {
        setActiveThread((prev) => ({
          ...result.thread,
          messages: [
            ...(prev?.id === result.thread.id ? prev.messages : []),
            result.userMessage,
            result.assistantMessage,
          ],
        }));
      }

      setStatusMessage('Respuesta generada.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar la consulta al asistente.'
      );
      setStatusMessage('');
    } finally {
      setIsSending(false);
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) {
      return;
    }
    void submitQuestion(draftPrompt);
  };

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    if (!isSending) {
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleSaveAsNote = async (messageId: string) => {
    setErrorMessage(null);
    setSavingMessageId(messageId);
    setStatusMessage('Guardando respuesta como nota...');

    try {
      const createdNote = await cursadaClient.saveChatMessageAsNote({ messageId });
      setSavedNotesByMessageId((prev) => ({
        ...prev,
        [messageId]: createdNote.id,
      }));
      setStatusMessage(`Nota "${createdNote.title}" guardada en ${courseName}.`);
      onNoteCreated?.(createdNote.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo guardar la respuesta como nota.'
      );
      setStatusMessage('');
    } finally {
      setSavingMessageId(null);
    }
  };

  const messages = activeThread?.messages ?? [];

  return (
    <section className="assistant-panel" aria-label={`Asistente de ${courseName}`}>
      <header className="assistant-header">
        <div className="assistant-header-copy">
          <h2 className="assistant-title">Asistente de estudio</h2>
        </div>

        <div className="assistant-thread-controls">
          <div className="assistant-thread-picker">
            <label htmlFor={threadSelectId} className="assistant-field-label">
              Conversación
            </label>
            <select
              id={threadSelectId}
              className="assistant-thread-select"
              value={activeThread?.id ?? ''}
              disabled={isLoadingThreads || isSending || threads.length === 0}
              onChange={(event) => void handleSelectThread(event.target.value)}
            >
              {threads.length === 0 ? (
                <option value="">Sin conversaciones guardadas</option>
              ) : (
                threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            className="secondary-button assistant-new-thread-button"
            onClick={() => void handleCreateThread()}
            disabled={isSending}
          >
            + Nueva consulta
          </button>

          {activeThread && (
            <button
              type="button"
              className="ghost-action-button assistant-delete-thread-button"
              onClick={() => void handleDeleteThread()}
              disabled={isSending}
            >
              Eliminar conversación
            </button>
          )}
        </div>
      </header>

      {(errorMessage || validationError) && (
        <div
          id={promptErrorId}
          role="alert"
          className="course-form-alert assistant-alert"
        >
          {errorMessage ?? validationError}
        </div>
      )}

      <div className="assistant-conversation">
        {isLoadingThreads ? (
          <div className="assistant-loading" role="status">
            Cargando conversaciones de {courseName}...
          </div>
        ) : messages.length === 0 ? (
          <div className="assistant-empty-state surface-panel">
            <h3 className="assistant-empty-title">
              Consultá tus apuntes, PDFs y notas de {courseName}
            </h3>
            <div className="assistant-quick-prompts" aria-label="Consultas sugeridas">
              {QUICK_START_PROMPTS.map((promptText) => (
                <button
                  key={promptText}
                  type="button"
                  className="assistant-prompt-chip"
                  disabled={isSending}
                  onClick={() => void submitQuestion(promptText)}
                >
                  {promptText}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="assistant-messages">
            {messages.map((message) => {
              const isAssistant = message.role === 'assistant';
              const savedNoteId = savedNotesByMessageId[message.id];

              return (
                <article
                  key={message.id}
                  className={`assistant-message assistant-message--${message.role}`}
                >
                  <header className="assistant-message-header">
                    <span className="assistant-message-role">
                      {isAssistant ? 'Asistente' : 'Vos'}
                    </span>
                    <div className="assistant-message-meta">
                      {isAssistant && message.modelUsed && (
                        <span className="assistant-model-pill">
                          {formatModelLabel(message.modelUsed)}
                        </span>
                      )}
                      {message.createdAt && (
                        <time className="assistant-message-time" dateTime={message.createdAt}>
                          {formatMessageTime(message.createdAt)}
                        </time>
                      )}
                    </div>
                  </header>

                  <div className="assistant-message-body">
                    {isAssistant ? (
                      <div className="note-markdown-preview assistant-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="assistant-user-text">{message.content}</p>
                    )}
                  </div>

                  {isAssistant && message.citations.length > 0 && (
                    <div className="assistant-citations" aria-label="Citas verificables">
                      {message.citations.map((citation) => (
                        <button
                          key={`${message.id}-${citation.chunkId}-${citation.citationNumber}`}
                          type="button"
                          className="assistant-citation-chip"
                          onClick={() => setActiveCitation(citation)}
                        >
                          {formatCitationChipLabel(citation)}
                        </button>
                      ))}
                    </div>
                  )}

                  {isAssistant && (
                    <footer className="assistant-message-actions">
                      {savedNoteId ? (
                        <div className="assistant-saved-note-bar">
                          <span className="assistant-saved-badge">Nota guardada</span>
                          {onOpenNotesTab && (
                            <button
                              type="button"
                              className="primary-button assistant-open-notes-button"
                              onClick={() => onOpenNotesTab()}
                            >
                              Abrir en Notas
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="secondary-button assistant-save-note-button"
                          disabled={savingMessageId === message.id}
                          onClick={() => void handleSaveAsNote(message.id)}
                        >
                          {savingMessageId === message.id
                            ? 'Guardando...'
                            : 'Guardar como Nota'}
                        </button>
                      )}
                    </footer>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <p className="assistant-status" role="status" aria-live="polite">
        {statusMessage}
      </p>

      <form className="assistant-composer" onSubmit={handleFormSubmit} noValidate>
        <div className="assistant-field-group">
          <label htmlFor={customInstructionsId} className="assistant-field-label">
            Instrucciones personalizadas (opcional)
          </label>
          <textarea
            id={customInstructionsId}
            name="customInstructions"
            className="assistant-instructions-input"
            rows={2}
            placeholder="Ej.: Respondé en formato tabla o bullets breves, con ejemplos pensados para parcial..."
            value={customInstructions}
            onChange={(event) => setCustomInstructions(event.target.value)}
            disabled={isSending}
          />
        </div>

        <div className="assistant-field-group">
          <label htmlFor={promptInputId} className="assistant-field-label">
            Tu consulta sobre {courseName}
          </label>
          <div className="assistant-composer-row">
            <textarea
              id={promptInputId}
              name="prompt"
              className="assistant-prompt-input"
              rows={3}
              placeholder="Escribí tu pregunta (Enter para enviar, Shift+Enter para nueva línea)..."
              value={draftPrompt}
              onChange={(event) => {
                setDraftPrompt(event.target.value);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              onKeyDown={handlePromptKeyDown}
              disabled={isSending}
              aria-invalid={validationError ? 'true' : undefined}
              aria-describedby={validationError ? promptErrorId : undefined}
            />
            <button
              type="submit"
              className="primary-button assistant-submit-button"
              disabled={isSending}
            >
              {isSending ? 'Generando...' : 'Enviar'}
            </button>
          </div>
        </div>
      </form>

      <dialog
        ref={citationDialogRef}
        className="cursada-modal-dialog citation-dialog"
        aria-labelledby={citationDialogTitleId}
        {...({ closedby: 'any' } as Record<string, string>)}
        onCancel={(event) => {
          event.preventDefault();
          closeCitationDialog();
        }}
        onClose={() => {
          if (citationDialogRef.current) {
            citationDialogRef.current.returnValue = '';
          }
          setActiveCitation(null);
        }}
        onClick={(event) => {
          const dialog = citationDialogRef.current;
          if (!dialog || 'closedBy' in HTMLDialogElement.prototype) {
            return;
          }
          const rect = dialog.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            return;
          }
          const clickedOutside =
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom;
          if (clickedOutside) {
            closeCitationDialog();
          }
        }}
      >
        {activeCitation && (
          <div className="cursada-modal-content citation-dialog-content">
            <div className="cursada-modal-header citation-dialog-header">
              <div>
                <h3 id={citationDialogTitleId} className="cursada-modal-title">
                  [{activeCitation.citationNumber}] {activeCitation.sourceTitle}
                </h3>
                <p className="citation-dialog-meta">
                  <span>{formatSourceType(activeCitation.sourceType)}</span>
                  <span>
                    {activeCitation.pageNumber != null
                      ? `Página ${activeCitation.pageNumber}`
                      : 'Sin número de página'}
                  </span>
                  <span>
                    Relevancia: {Math.round(activeCitation.score * 100)}% (
                    {activeCitation.score.toFixed(3)})
                  </span>
                </p>
              </div>
            </div>

            <div className="citation-dialog-body">
              <blockquote className="citation-dialog-excerpt">
                {activeCitation.excerpt}
              </blockquote>
            </div>

            <div className="cursada-modal-footer citation-dialog-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={closeCitationDialog}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
