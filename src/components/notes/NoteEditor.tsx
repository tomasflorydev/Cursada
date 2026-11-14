import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cursadaClient } from '../../lib/api/client';
import type { NoteWithCourse } from '../../types/domain';

export type NoteEditorViewMode = 'edit' | 'preview';
export type NoteSaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export const NOTE_AUTOSAVE_DELAY_MS = 450;

export interface NoteEditorProps {
  note: NoteWithCourse;
  title?: string;
  onNoteSaved?: (updated: NoteWithCourse) => void;
  defaultViewMode?: NoteEditorViewMode;
}

const VIEW_MODE_OPTIONS: ReadonlyArray<{
  id: NoteEditorViewMode;
  label: string;
}> = [
  { id: 'edit', label: 'Editar' },
  { id: 'preview', label: 'Lectura' },
];

const cursadaCodeMirrorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88rem',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.65',
    padding: '16px 20px',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--accent-primary)',
    minHeight: '320px',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent-primary)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-soft)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-surface-subtle)',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-placeholder': {
    color: 'var(--text-muted)',
  },
});

function canMountCodeMirror(): boolean {
  if (typeof document === 'undefined' || typeof Range === 'undefined') {
    return false;
  }
  return typeof Range.prototype.getClientRects === 'function';
}

export function NoteEditor({
  note,
  title,
  onNoteSaved,
  defaultViewMode = 'edit',
}: NoteEditorProps) {
  const effectiveTitle = title ?? note.title;
  const [viewMode, setViewMode] = useState<NoteEditorViewMode>(defaultViewMode);
  const [content, setContent] = useState<string>(note.content);
  const [saveStatus, setSaveStatus] = useState<NoteSaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [useFallbackEditor, setUseFallbackEditor] = useState<boolean>(
    () => !canMountCodeMirror()
  );
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportFeedback, setExportFeedback] = useState<{
    kind: 'success' | 'neutral' | 'error';
    text: string;
  } | null>(null);

  const cmHostRef = useRef<HTMLDivElement | null>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  const debounceTimerRef = useRef<number | null>(null);
  const exportTimerRef = useRef<number | null>(null);
  const onNoteSavedRef = useRef(onNoteSaved);
  onNoteSavedRef.current = onNoteSaved;

  const latestDraftRef = useRef({
    noteId: note.id,
    title: effectiveTitle,
    content: note.content,
  });
  const savedSnapshotRef = useRef({
    noteId: note.id,
    title: note.title,
    content: note.content,
  });
  const mountedNoteIdRef = useRef<string>(note.id);

  const clearPendingTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const persistDraft = useCallback(
    async (target: { noteId: string; title: string; content: string }) => {
      const trimmedTitle = target.title.trim();
      if (!trimmedTitle) {
        if (latestDraftRef.current.noteId === target.noteId) {
          setSaveStatus('error');
          setSaveError('El título no puede estar vacío.');
        }
        return;
      }

      if (latestDraftRef.current.noteId === target.noteId) {
        setSaveStatus('saving');
        setSaveError(null);
      }

      try {
        const updated = await cursadaClient.updateNote(target.noteId, {
          title: trimmedTitle,
          content: target.content,
        });

        if (savedSnapshotRef.current.noteId === target.noteId) {
          savedSnapshotRef.current = {
            noteId: target.noteId,
            title: updated.title,
            content: updated.content,
          };
        }

        if (latestDraftRef.current.noteId === target.noteId) {
          const stillMatchesLatest =
            latestDraftRef.current.title.trim() === updated.title &&
            latestDraftRef.current.content === updated.content;
          setSaveStatus(stillMatchesLatest ? 'saved' : 'dirty');
        }

        onNoteSavedRef.current?.(updated);
      } catch (err) {
        if (latestDraftRef.current.noteId === target.noteId) {
          setSaveStatus('error');
          setSaveError(
            err instanceof Error ? err.message : 'No se pudo guardar la nota.'
          );
        }
      }
    },
    []
  );

  // Sync state when switching to a different note; flush pending edits for the previous note
  useEffect(() => {
    if (mountedNoteIdRef.current !== note.id) {
      const prevDraft = latestDraftRef.current;
      const prevSaved = savedSnapshotRef.current;
      const prevWasDirty =
        prevDraft.noteId === prevSaved.noteId &&
        (prevDraft.title.trim() !== prevSaved.title ||
          prevDraft.content !== prevSaved.content);

      clearPendingTimer();
      if (prevWasDirty && prevDraft.title.trim()) {
        void persistDraft(prevDraft);
      }

      mountedNoteIdRef.current = note.id;
      latestDraftRef.current = {
        noteId: note.id,
        title: effectiveTitle,
        content: note.content,
      };
      savedSnapshotRef.current = {
        noteId: note.id,
        title: note.title,
        content: note.content,
      };

      setContent(note.content);
      setSaveStatus('saved');
      setSaveError(null);
      setExportFeedback(null);

      const view = cmViewRef.current;
      if (view && view.state.doc.toString() !== note.content) {
        isSyncingRef.current = true;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: note.content },
        });
        isSyncingRef.current = false;
      }
    }
  }, [note.id, note.title, note.content, effectiveTitle, clearPendingTimer, persistDraft]);

  // Schedule debounced auto-save when title or content diverges from the last saved snapshot
  useEffect(() => {
    latestDraftRef.current = {
      noteId: note.id,
      title: effectiveTitle,
      content,
    };

    const saved = savedSnapshotRef.current;
    if (saved.noteId !== note.id) {
      return;
    }

    const trimmedTitle = effectiveTitle.trim();
    const isTitleDirty = trimmedTitle !== saved.title;
    const isContentDirty = content !== saved.content;

    if (!isTitleDirty && !isContentDirty) {
      clearPendingTimer();
      setSaveStatus((prev) => (prev === 'saving' ? prev : 'saved'));
      setSaveError(null);
      return;
    }

    if (!trimmedTitle) {
      clearPendingTimer();
      setSaveStatus('error');
      setSaveError('El título no puede estar vacío.');
      return;
    }

    setSaveStatus('dirty');
    setSaveError(null);
    clearPendingTimer();

    const snapshotToSave = {
      noteId: note.id,
      title: effectiveTitle,
      content,
    };
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void persistDraft(snapshotToSave);
    }, NOTE_AUTOSAVE_DELAY_MS);
  }, [note.id, effectiveTitle, content, clearPendingTimer, persistDraft]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      clearPendingTimer();
      if (exportTimerRef.current !== null) {
        window.clearTimeout(exportTimerRef.current);
      }
    };
  }, [clearPendingTimer]);

  // Mount CodeMirror 6 when editing pane is visible and environment supports layout measurement
  useEffect(() => {
    if (viewMode === 'preview' || useFallbackEditor) {
      if (cmViewRef.current) {
        cmViewRef.current.destroy();
        cmViewRef.current = null;
      }
      return;
    }

    const host = cmHostRef.current;
    if (!host) {
      return;
    }

    try {
      const state = EditorState.create({
        doc: latestDraftRef.current.content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({
            base: markdownLanguage,
            codeLanguages: languages,
          }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': 'Contenido en Markdown',
          }),
          placeholder('Escribí tus apuntes en Markdown...'),
          cursadaCodeMirrorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isSyncingRef.current) {
              setContent(update.state.doc.toString());
            }
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: host,
      });
      cmViewRef.current = view;

      return () => {
        view.destroy();
        if (cmViewRef.current === view) {
          cmViewRef.current = null;
        }
      };
    } catch {
      setUseFallbackEditor(true);
    }
  }, [viewMode, useFallbackEditor, note.id]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      clearPendingTimer();
      void persistDraft(latestDraftRef.current);
    }
  }

  async function handleExportNote(): Promise<void> {
    if (isExporting) return;

    // Ensure latest unsaved changes are persisted before exporting
    const saved = savedSnapshotRef.current;
    const draft = latestDraftRef.current;
    if (
      draft.title.trim() &&
      (draft.title.trim() !== saved.title || draft.content !== saved.content)
    ) {
      clearPendingTimer();
      await persistDraft(draft);
    }

    setIsExporting(true);
    setExportFeedback(null);
    if (exportTimerRef.current !== null) {
      window.clearTimeout(exportTimerRef.current);
      exportTimerRef.current = null;
    }

    try {
      const result = await cursadaClient.exportMarkdown({
        scope: 'note',
        noteId: note.id,
      });

      if (result.canceled) {
        setExportFeedback({
          kind: 'neutral',
          text: 'Exportación cancelada',
        });
      } else if (result.mode === 'download') {
        setExportFeedback({
          kind: 'success',
          text: 'Descarga iniciada (.md)',
        });
      } else {
        setExportFeedback({
          kind: 'success',
          text: result.targetDir
            ? `Exportada en ${result.targetDir}`
            : 'Nota exportada (.md)',
        });
      }
    } catch (err) {
      setExportFeedback({
        kind: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo exportar la nota.',
      });
    } finally {
      setIsExporting(false);
      exportTimerRef.current = window.setTimeout(() => {
        setExportFeedback(null);
      }, 4500);
    }
  }

  const statusLabel =
    saveStatus === 'saving'
      ? 'Guardando...'
      : saveStatus === 'dirty'
        ? 'Sin guardar'
        : saveStatus === 'error'
          ? saveError ?? 'Error al guardar'
          : 'Guardado';

  return (
    <div className="note-editor-shell" onKeyDown={handleKeyDown}>
      <div className="note-editor-toolbar">
        <div
          className="task-status-segmented"
          role="group"
          aria-label="Modo de vista del editor"
        >
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`task-filter-pill ${viewMode === option.id ? 'is-active' : ''}`}
              aria-pressed={viewMode === option.id}
              onClick={() => setViewMode(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="note-editor-toolbar-right">
          <span
            className={`note-save-status is-${saveStatus}`}
            role="status"
            aria-live="polite"
            data-testid="note-save-status"
          >
            {statusLabel}
          </span>

          <button
            type="button"
            className="secondary-button note-export-button"
            disabled={isExporting}
            onClick={() => void handleExportNote()}
          >
            {isExporting ? 'Exportando...' : 'Exportar .md'}
          </button>
        </div>
      </div>

      {exportFeedback ? (
        <div
          className={`note-export-feedback is-${exportFeedback.kind}`}
          role="status"
          aria-live="polite"
        >
          {exportFeedback.text}
        </div>
      ) : null}

      <div className={`note-editor-body is-mode-${viewMode}`}>
        {viewMode === 'edit' ? (
          <div className="note-editor-pane" data-testid="note-editor-pane">
            {useFallbackEditor ? (
              <textarea
                className="note-editor-fallback-textarea"
                aria-label="Contenido en Markdown"
                placeholder="Escribí tus apuntes en Markdown..."
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            ) : (
              <div
                ref={cmHostRef}
                className="note-codemirror-host"
                data-testid="note-codemirror-host"
              />
            )}
          </div>
        ) : (
          <div
            className="note-preview-pane"
            data-testid="note-markdown-preview"
            aria-label="Vista previa en Markdown"
          >
            {content.trim().length > 0 ? (
              <div className="note-markdown-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="note-preview-empty">
                Esta nota todavía no tiene contenido. Escribí en Markdown para
                ver la vista previa formateada.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
