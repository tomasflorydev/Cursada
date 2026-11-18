import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../../lib/dates';
import type { CourseWithSchedules, NoteWithCourse } from '../../types';
import { SwissLinkButton } from '../../ui';
import { NoteBacklinksPanel } from '../notes/NoteBacklinksPanel';

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatNoteDateShort(isoTimestamp: string, todayIso: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'hoy';
  }
  const noteIso = toIsoDateString(parsed);
  if (noteIso === todayIso) {
    return 'hoy';
  }
  const todayDate = parseIsoDateLocal(todayIso);
  const noteDate = parseIsoDateLocal(noteIso);
  const diffDays = Math.round(
    (todayDate.getTime() - noteDate.getTime()) / 86_400_000
  );
  if (diffDays === 1) {
    return 'ayer';
  }
  const monthShort = MONTH_SHORT_NAMES_ES[parsed.getMonth()] ?? '';
  return `${parsed.getDate()} ${monthShort}`;
}

function handleMenuListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    return;
  }
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  );
  if (items.length === 0) return;

  const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
  let nextIdx = 0;
  if (event.key === 'Home') {
    nextIdx = 0;
  } else if (event.key === 'End') {
    nextIdx = items.length - 1;
  } else if (event.key === 'ArrowDown') {
    nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % items.length;
  } else {
    nextIdx =
      currentIdx === -1
        ? items.length - 1
        : (currentIdx - 1 + items.length) % items.length;
  }

  event.preventDefault();
  items[nextIdx]?.focus();
}

export interface CourseNotebookSidebarProps {
  course: CourseWithSchedules;
  notes: NoteWithCourse[];
  selectedNote: NoteWithCourse | null;
  todayIso: string;
  confirmDeleteNoteId: string | null;
  noteFeedback: string | null;
  isLeftSidebarOpen: boolean;
  onCollapse: () => void;
  onCreateNote: () => void;
  onSelectNote: (noteId: string) => void;
  onTogglePin: (noteId?: string) => void;
  onExportNote: (noteId?: string) => void;
  onRequestDeleteNote: (noteId: string | null) => void;
  onConfirmDeleteNote: (noteId: string) => void;
  onBackToCourses: () => void;
  onExportCourse: () => void;
  onEditCourse?: (course: CourseWithSchedules) => void;
  onArchiveCourse?: (course: CourseWithSchedules) => void;
  onDeleteCourse?: (courseId: string) => void;
  onOpenExternalNote: (targetCourseId: string, noteId: string) => void;
  onOpenOrCreateWikiLink: (targetTitle: string) => void;
}

/**
 * Left pane of the 3-column course notebook: course actions menu, scrollable notes list
 * with per-row contextual menus, and collapsed-by-default WikiLink knowledge network.
 */
export function CourseNotebookSidebar({
  course,
  notes,
  selectedNote,
  todayIso,
  confirmDeleteNoteId,
  noteFeedback,
  isLeftSidebarOpen,
  onCollapse,
  onCreateNote,
  onSelectNote,
  onTogglePin,
  onExportNote,
  onRequestDeleteNote,
  onConfirmDeleteNote,
  onBackToCourses,
  onExportCourse,
  onEditCourse,
  onArchiveCourse,
  onDeleteCourse,
  onOpenExternalNote,
  onOpenOrCreateWikiLink,
}: CourseNotebookSidebarProps) {
  const courseMenuId = useId();
  const [isCourseMenuOpen, setIsCourseMenuOpen] = useState(false);
  const [openNoteMenuId, setOpenNoteMenuId] = useState<string | null>(null);
  const [flipNoteMenuUp, setFlipNoteMenuUp] = useState(false);

  const courseMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const courseMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const notesListRef = useRef<HTMLDivElement | null>(null);
  const noteMenuWrapRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const noteMenuTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    setOpenNoteMenuId(null);
    setFlipNoteMenuUp(false);
  }, [selectedNote?.id]);

  useEffect(() => {
    const activeNoteMenuId = openNoteMenuId ?? confirmDeleteNoteId;
    if (!isCourseMenuOpen && !activeNoteMenuId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (
        isCourseMenuOpen &&
        courseMenuWrapRef.current &&
        !courseMenuWrapRef.current.contains(target)
      ) {
        setIsCourseMenuOpen(false);
      }

      if (activeNoteMenuId) {
        const activeWrap = noteMenuWrapRefs.current.get(activeNoteMenuId);
        if (activeWrap && !activeWrap.contains(target)) {
          setOpenNoteMenuId(null);
          if (confirmDeleteNoteId) {
            onRequestDeleteNote(null);
          }
        }
      }
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (isCourseMenuOpen) {
        event.preventDefault();
        setIsCourseMenuOpen(false);
        courseMenuTriggerRef.current?.focus();
        return;
      }

      if (activeNoteMenuId) {
        event.preventDefault();
        setOpenNoteMenuId(null);
        if (confirmDeleteNoteId) {
          onRequestDeleteNote(null);
        }
        noteMenuTriggerRefs.current.get(activeNoteMenuId)?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCourseMenuOpen, openNoteMenuId, confirmDeleteNoteId, onRequestDeleteNote]);

  function handleToggleNoteMenu(noteId: string): void {
    setIsCourseMenuOpen(false);
    if (confirmDeleteNoteId && confirmDeleteNoteId !== noteId) {
      onRequestDeleteNote(null);
    }

    const willOpen = openNoteMenuId !== noteId;
    if (willOpen) {
      const triggerEl = noteMenuTriggerRefs.current.get(noteId);
      const listEl = notesListRef.current;
      if (triggerEl && listEl) {
        const triggerRect = triggerEl.getBoundingClientRect();
        const listRect = listEl.getBoundingClientRect();
        const shouldFlip =
          listRect.height > 0 &&
          triggerRect.bottom + 132 > listRect.bottom &&
          triggerRect.top - 132 >= listRect.top;
        setFlipNoteMenuUp(shouldFlip);
      } else {
        setFlipNoteMenuUp(false);
      }
      setOpenNoteMenuId(noteId);
    } else {
      setOpenNoteMenuId(null);
      setFlipNoteMenuUp(false);
    }
  }

  return (
    <aside className="notebook-notes-pane" aria-label="Notas de la materia">
      <div className="notebook-notes-top">
        <div className="notebook-course-head">
          <span className="notebook-course-title" title={course.name}>
            {course.name}
          </span>
          <div className="notebook-menu-wrap" ref={courseMenuWrapRef}>
            <button
              ref={courseMenuTriggerRef}
              type="button"
              className={`notebook-more-btn ${isCourseMenuOpen ? 'is-open' : ''}`.trim()}
              aria-label="Acciones de la materia"
              aria-haspopup="menu"
              aria-expanded={isCourseMenuOpen}
              aria-controls={courseMenuId}
              onClick={() => {
                setOpenNoteMenuId(null);
                setIsCourseMenuOpen((prev) => !prev);
              }}
            >
              ···
            </button>
            <div
              id={courseMenuId}
              className={`notebook-menu notebook-course-menu ${isCourseMenuOpen ? 'is-open' : ''}`.trim()}
              onKeyDown={handleMenuListKeyDown}
            >
              {onEditCourse ? (
                <button
                  type="button"
                  className="notebook-menu-item"
                  tabIndex={isCourseMenuOpen ? undefined : -1}
                  onClick={() => {
                    setIsCourseMenuOpen(false);
                    onEditCourse(course);
                  }}
                >
                  Editar materia
                </button>
              ) : null}
              {onArchiveCourse ? (
                <button
                  type="button"
                  className="notebook-menu-item"
                  tabIndex={isCourseMenuOpen ? undefined : -1}
                  onClick={() => {
                    setIsCourseMenuOpen(false);
                    onArchiveCourse(course);
                  }}
                >
                  {course.status === 'active' ? 'Archivar' : 'Activar'}
                </button>
              ) : null}
              <button
                type="button"
                className="notebook-menu-item"
                tabIndex={isCourseMenuOpen ? undefined : -1}
                onClick={() => {
                  setIsCourseMenuOpen(false);
                  onExportCourse();
                }}
              >
                Exportar materia .md
              </button>
              <button
                type="button"
                className="notebook-menu-item"
                tabIndex={isCourseMenuOpen ? undefined : -1}
                onClick={() => {
                  setIsCourseMenuOpen(false);
                  onBackToCourses();
                }}
              >
                ← Todas las materias
              </button>
              {onDeleteCourse ? (
                <>
                  <hr className="notebook-menu-separator" />
                  <button
                    type="button"
                    className="notebook-menu-item is-danger"
                    tabIndex={isCourseMenuOpen ? undefined : -1}
                    onClick={() => {
                      setIsCourseMenuOpen(false);
                      onDeleteCourse(course.id);
                    }}
                  >
                    Eliminar materia
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="notebook-pane-header-bar">
          <h2 className="swiss-section-label">Notas · {notes.length}</h2>
          <div className="notebook-pane-header-actions">
            <SwissLinkButton className="swiss-link-sm" onClick={onCreateNote}>
              + Nueva
            </SwissLinkButton>
            <button
              type="button"
              className="notebook-collapse-btn"
              aria-label="Colapsar panel izquierdo"
              aria-expanded={isLeftSidebarOpen}
              title="Ocultar panel de notas"
              onClick={onCollapse}
            >
              ‹
            </button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="swiss-meta-md">No hay notas cargadas todavía.</p>
        ) : (
          <div className="notebook-notes-list" ref={notesListRef}>
            {notes.map((note) => {
              const isSelected = selectedNote?.id === note.id;
              const isConfirmingDelete = confirmDeleteNoteId === note.id;
              const isNoteMenuOpen =
                openNoteMenuId === note.id || isConfirmingDelete;
              const shouldMountNoteMenu = isSelected || isNoteMenuOpen;
              const words = countWords(note.content);
              const dateLabel = formatNoteDateShort(note.updatedAt, todayIso);
              const stageTag = note.examStage ?? 'general';
              const stageShort =
                stageTag === 'parcial_1'
                  ? '1°P'
                  : stageTag === 'parcial_2'
                    ? '2°P'
                    : stageTag === 'final'
                      ? 'Final'
                      : null;
              return (
                <div
                  key={note.id}
                  className={`notebook-note-row ${isSelected ? 'is-selected' : ''} ${isNoteMenuOpen ? 'is-menu-open' : ''}`.trim()}
                >
                  <button
                    type="button"
                    className={`notebook-note-item ${isSelected ? 'is-selected' : ''}`.trim()}
                    onClick={() => onSelectNote(note.id)}
                  >
                    <span className="notebook-note-title">
                      {note.title || 'Nota sin título'}
                    </span>
                    <span className="notebook-note-meta">
                      {dateLabel} · {words}{' '}
                      {words === 1 ? 'palabra' : 'palabras'}
                      {stageShort ? ` · ${stageShort}` : ''}
                      {note.isPinned ? ' · Fijada' : ''}
                    </span>
                  </button>

                  <div
                    className="notebook-note-menu-wrap"
                    ref={(el) => {
                      if (el) {
                        noteMenuWrapRefs.current.set(note.id, el);
                      } else {
                        noteMenuWrapRefs.current.delete(note.id);
                      }
                    }}
                  >
                    <button
                      ref={(el) => {
                        if (el) {
                          noteMenuTriggerRefs.current.set(note.id, el);
                        } else {
                          noteMenuTriggerRefs.current.delete(note.id);
                        }
                      }}
                      type="button"
                      className={`notebook-note-menu-trigger ${isNoteMenuOpen ? 'is-open' : ''}`.trim()}
                      aria-label={`Acciones de ${note.title || 'nota'}`}
                      aria-haspopup="menu"
                      aria-expanded={isNoteMenuOpen}
                      onClick={() => handleToggleNoteMenu(note.id)}
                    >
                      ···
                    </button>

                    {shouldMountNoteMenu ? (
                      <div
                        className={`notebook-menu notebook-note-menu ${isNoteMenuOpen ? 'is-open' : ''} ${isNoteMenuOpen && flipNoteMenuUp ? 'is-above' : ''}`.trim()}
                        onKeyDown={handleMenuListKeyDown}
                      >
                        {isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              className="notebook-menu-item is-danger"
                              onClick={() => {
                                setOpenNoteMenuId(null);
                                onConfirmDeleteNote(note.id);
                              }}
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              className="notebook-menu-item"
                              onClick={() => {
                                setOpenNoteMenuId(null);
                                onRequestDeleteNote(null);
                              }}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="notebook-menu-item"
                              tabIndex={isNoteMenuOpen ? undefined : -1}
                              onClick={() => {
                                setOpenNoteMenuId(null);
                                onTogglePin(note.id);
                              }}
                            >
                              {note.isPinned ? 'Desfijar' : 'Fijar'}
                            </button>
                            <button
                              type="button"
                              className="notebook-menu-item"
                              tabIndex={isNoteMenuOpen ? undefined : -1}
                              onClick={() => {
                                setOpenNoteMenuId(null);
                                onExportNote(note.id);
                              }}
                            >
                              Exportar .md
                            </button>
                            <hr className="notebook-menu-separator" />
                            <button
                              type="button"
                              className="notebook-menu-item is-danger"
                              tabIndex={isNoteMenuOpen ? undefined : -1}
                              onClick={() => {
                                setOpenNoteMenuId(note.id);
                                onRequestDeleteNote(note.id);
                              }}
                            >
                              Eliminar nota
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {noteFeedback ? (
          <p
            className="notebook-note-feedback swiss-meta"
            role="status"
            aria-live="polite"
          >
            {noteFeedback}
          </p>
        ) : null}
      </div>

      <div className="notebook-knowledge-section">
        {selectedNote ? (
          <NoteBacklinksPanel
            noteId={selectedNote.id}
            courseId={course.id}
            refreshKey={selectedNote.updatedAt}
            defaultExpanded={false}
            onOpenNote={(noteId, targetCourseId) => {
              if (targetCourseId === course.id) {
                onSelectNote(noteId);
              } else {
                onOpenExternalNote(targetCourseId, noteId);
              }
            }}
            onOpenOrCreateWikiLink={onOpenOrCreateWikiLink}
          />
        ) : null}
      </div>
    </aside>
  );
}
