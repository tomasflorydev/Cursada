import { useCallback, useEffect, useId, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import type { NoteLinkItem, NoteLinksSummary } from '../../types/domain';
import { SwissErrorAlert } from '../../ui';
import '../../styles/knowledge.css';

export interface NoteBacklinksPanelProps {
  noteId: string;
  courseId: string;
  refreshKey?: string | number;
  linksSummaryOverride?: NoteLinksSummary | null;
  defaultExpanded?: boolean;
  onOpenNote: (noteId: string, courseId: string) => void;
  onOpenOrCreateWikiLink?: (targetTitle: string) => void | Promise<void>;
}

export function NoteBacklinksPanel({
  noteId,
  courseId,
  refreshKey,
  linksSummaryOverride,
  defaultExpanded = true,
  onOpenNote,
  onOpenOrCreateWikiLink,
}: NoteBacklinksPanelProps) {
  const panelBodyId = useId();
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [summary, setSummary] = useState<NoteLinksSummary>(() =>
    linksSummaryOverride ?? {
      noteId,
      forwardLinks: [],
      backlinks: [],
    }
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    if (linksSummaryOverride !== undefined) {
      setSummary(
        linksSummaryOverride ?? {
          noteId,
          forwardLinks: [],
          backlinks: [],
        }
      );
      setErrorMessage(null);
      return;
    }

    if (!noteId) {
      setSummary({ noteId: '', forwardLinks: [], backlinks: [] });
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await cursadaClient.getNoteLinks(noteId);
      setSummary(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los enlaces de esta nota.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [noteId, linksSummaryOverride]);

  useEffect(() => {
    void loadLinks();

    if (linksSummaryOverride !== undefined) {
      return;
    }

    const handleDataChanged = () => {
      void loadLinks();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadLinks, refreshKey, linksSummaryOverride]);

  async function handleForwardLinkClick(link: NoteLinkItem): Promise<void> {
    setErrorMessage(null);
    setPendingTarget(link.id);
    try {
      if (onOpenOrCreateWikiLink) {
        await onOpenOrCreateWikiLink(link.targetTitle);
        return;
      }
      const opened = await cursadaClient.openOrCreateWikiLink({
        courseId,
        targetTitle: link.targetTitle,
      });
      onOpenNote(opened.id, opened.courseId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : `No se pudo abrir o crear la nota "${link.targetTitle}".`
      );
    } finally {
      setPendingTarget(null);
    }
  }

  const forwardCount = summary.forwardLinks.length;
  const backlinksCount = summary.backlinks.length;

  return (
    <section
      className="backlinks-panel"
      aria-label="Enlaces y backlinks de la nota"
      data-testid="note-backlinks-panel"
    >
      <button
        type="button"
        className="backlinks-panel-toggle"
        aria-expanded={isExpanded}
        aria-controls={panelBodyId}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <span className="backlinks-panel-title">Red de conocimiento</span>
        <span className="backlinks-panel-summary">
          <span>
            {forwardCount} {forwardCount === 1 ? 'enlace' : 'enlaces'} ·{' '}
            {backlinksCount} {backlinksCount === 1 ? 'backlink' : 'backlinks'}
          </span>
          <span aria-hidden="true">{isExpanded ? '▾' : '›'}</span>
        </span>
      </button>

      {isExpanded ? (
        <div id={panelBodyId}>
          {errorMessage ? <SwissErrorAlert message={errorMessage} /> : null}

          {isLoading && forwardCount === 0 && backlinksCount === 0 ? (
            <p className="backlinks-empty-copy">Cargando enlaces…</p>
          ) : (
            <div className="backlinks-panel-body">
              <div className="backlinks-section">
                <h3 className="backlinks-section-heading">
                  Enlaces en esta nota ([[WikiLinks]])
                </h3>
                {forwardCount === 0 ? (
                  <p className="backlinks-empty-copy">
                    Sin enlaces salientes. Escribí [[Nombre de nota]] para conectar
                    con otro apunte.
                  </p>
                ) : (
                  <ul className="backlinks-list">
                    {summary.forwardLinks.map((link) => {
                      const exists = link.targetNoteId !== null;
                      const showAliasTarget =
                        link.displayText.trim() !== link.targetTitle.trim();
                      const isBusy = pendingTarget === link.id;
                      return (
                        <li key={link.id} className="backlinks-list-item">
                          <button
                            type="button"
                            className="backlinks-item-btn"
                            disabled={isBusy}
                            onClick={() => void handleForwardLinkClick(link)}
                          >
                            <span className="backlinks-item-top">
                              <span className="backlinks-item-name">
                                {link.displayText}
                              </span>
                              <span
                                className={`backlinks-item-status ${exists ? '' : 'is-missing'}`}
                              >
                                {exists ? '→ Abrir' : '+ Crear nota'}
                              </span>
                            </span>
                            {showAliasTarget ? (
                              <span className="backlinks-item-meta">
                                Destino: {link.targetTitle}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="backlinks-section">
                <h3 className="backlinks-section-heading">
                  Backlinks (Notas que enlazan acá)
                </h3>
                {backlinksCount === 0 ? (
                  <p className="backlinks-empty-copy">
                    Ningún otro apunte enlaza a esta nota todavía.
                  </p>
                ) : (
                  <ul className="backlinks-list">
                    {summary.backlinks.map((link) => (
                      <li key={link.id} className="backlinks-list-item">
                        <button
                          type="button"
                          className="backlinks-item-btn"
                          onClick={() =>
                            onOpenNote(link.sourceNoteId, link.sourceCourseId)
                          }
                        >
                          <span className="backlinks-item-top">
                            <span className="backlinks-item-name">
                              {link.sourceNoteTitle}
                            </span>
                            <span className="backlinks-item-status">
                              {link.sourceCourseName}
                            </span>
                          </span>
                          {link.contextSnippet ? (
                            <span className="backlinks-item-snippet">
                              {link.contextSnippet}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
