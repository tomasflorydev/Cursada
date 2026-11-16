import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import { MONTH_SHORT_NAMES_ES } from '../../lib/dates';
import type {
  CourseWithSchedules,
  NoteFilters,
  NoteOrigin,
  NoteWithCourse,
} from '../../types/domain';
import { NoteEditor } from './NoteEditor';

export interface NotesWorkspaceProps {
  courseId?: string;
  onSelectCourse?: (courseId: string) => void;
  onNotesChanged?: () => void;
  initialNoteId?: string | null;
  createRequestVersion?: number;
}

const ORIGIN_LABELS: Record<NoteOrigin, string> = {
  manual: 'Apunte propio',
  ai_summary: 'Resumen IA',
  ai_study_guide: 'Guía IA',
  ai_practice_exam: 'Práctica IA',
};

function formatNoteDateLabel(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  const diffDays = Math.round(
    (todayStart.getTime() - dateStart.getTime()) / 86_400_000
  );

  if (diffDays === 0) {
    return 'Hoy';
  }
  if (diffDays === 1) {
    return 'Ayer';
  }
  const month = MONTH_SHORT_NAMES_ES[parsed.getMonth()] ?? '';
  return `${parsed.getDate()} ${month}`;
}

function sortNotesForList(notes: NoteWithCourse[]): NoteWithCourse[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const updatedCmp = b.updatedAt.localeCompare(a.updatedAt);
    if (updatedCmp !== 0) {
      return updatedCmp;
    }
    return a.id.localeCompare(b.id);
  });
}

export function NotesWorkspace({
  courseId,
  onSelectCourse,
  onNotesChanged,
  initialNoteId,
  createRequestVersion = 0,
}: NotesWorkspaceProps) {
  const [notes, setNotes] = useState<NoteWithCourse[]>([]);
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [pinnedOnly, setPinnedOnly] = useState<boolean>(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isListVisible, setIsListVisible] = useState<boolean>(false);
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const requestSeqRef = useRef<number>(0);
  const prevSelectedNoteIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const initialNoteIdRef = useRef<string | null | undefined>(initialNoteId);
  const appliedInitialNoteIdRef = useRef<string | null>(null);
  const lastCreateVersionRef = useRef<number>(0);
  const handleCreateNoteRef = useRef<() => Promise<void>>(async () => {});

  initialNoteIdRef.current = initialNoteId;

  const effectiveCourseFilter =
    courseId ?? (courseFilter === 'all' ? undefined : courseFilter);

  const loadData = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    const filters: NoteFilters = {};
    if (effectiveCourseFilter) {
      filters.courseId = effectiveCourseFilter;
    }
    if (searchQuery.trim()) {
      filters.query = searchQuery.trim();
    }
    if (pinnedOnly) {
      filters.pinnedOnly = true;
    }

    const [loadedNotes, loadedCourses] = await Promise.all([
      cursadaClient.listNotes(filters),
      courseId
        ? Promise.resolve([])
        : cursadaClient.listCourses({ status: 'all' }),
    ]);

    if (seq !== requestSeqRef.current) {
      return;
    }

    setNotes(loadedNotes);
    if (!courseId) {
      setCourses(loadedCourses);
    }
    setIsLoading(false);

    setSelectedNoteId((currentId) => {
      const requestedNoteId = initialNoteIdRef.current;
      if (
        requestedNoteId &&
        appliedInitialNoteIdRef.current !== requestedNoteId &&
        loadedNotes.some((n) => n.id === requestedNoteId)
      ) {
        appliedInitialNoteIdRef.current = requestedNoteId;
        return requestedNoteId;
      }
      if (currentId && loadedNotes.some((n) => n.id === currentId)) {
        return currentId;
      }
      return loadedNotes[0]?.id ?? null;
    });
  }, [courseId, effectiveCourseFilter, searchQuery, pinnedOnly]);

  useEffect(() => {
    void loadData();

    const handleExternalChange = () => {
      void loadData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleExternalChange);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleExternalChange);
    };
  }, [loadData]);

  useEffect(() => {
    if (!initialNoteId) {
      appliedInitialNoteIdRef.current = null;
      return;
    }
    if (appliedInitialNoteIdRef.current === initialNoteId) {
      return;
    }
    if (notes.some((n) => n.id === initialNoteId)) {
      appliedInitialNoteIdRef.current = initialNoteId;
      setSelectedNoteId(initialNoteId);
      setIsListVisible(false);
    }
  }, [initialNoteId, notes]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  // Sync draftTitle only when switching to a different note
  useEffect(() => {
    const nextId = selectedNote?.id ?? null;
    if (prevSelectedNoteIdRef.current !== nextId) {
      prevSelectedNoteIdRef.current = nextId;
      setDraftTitle(selectedNote?.title ?? '');
      setActionError(null);
    }
  }, [selectedNote]);

  async function handleCreateNote(): Promise<void> {
    if (isCreating) return;
    const targetCourseId =
      courseId ??
      (courseFilter !== 'all' ? courseFilter : (courses[0]?.id ?? ''));

    if (!targetCourseId) {
      setActionError('Creá un anotador primero para poder crear apuntes.');
      return;
    }

    setIsCreating(true);
    setActionError(null);
    try {
      const created = await cursadaClient.createNote({
        courseId: targetCourseId,
        title: 'Nuevo apunte',
        content: '',
        origin: 'manual',
        isPinned: false,
      });

      // Reset active filters if needed so the newly created note is immediately visible
      if (searchQuery.trim() !== '') {
        setSearchQuery('');
      }
      if (pinnedOnly) {
        setPinnedOnly(false);
      }

      setNotes((prev) => sortNotesForList([created, ...prev]));
      prevSelectedNoteIdRef.current = created.id;
      setSelectedNoteId(created.id);
      setIsListVisible(false);
      setDraftTitle(created.title);
      onNotesChanged?.();

      window.requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo crear la nota.'
      );
    } finally {
      setIsCreating(false);
    }
  }

  handleCreateNoteRef.current = handleCreateNote;

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (
      createRequestVersion &&
      createRequestVersion > lastCreateVersionRef.current
    ) {
      lastCreateVersionRef.current = createRequestVersion;
      void handleCreateNoteRef.current();
    }
  }, [createRequestVersion, isLoading]);

  async function handleTogglePin(noteId: string): Promise<void> {
    setActionError(null);
    try {
      const updated = await cursadaClient.toggleNotePin(noteId);
      setNotes((prev) =>
        sortNotesForList(prev.map((n) => (n.id === noteId ? updated : n)))
      );
      onNotesChanged?.();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo cambiar el fijado de la nota.'
      );
    }
  }

  async function handleDeleteNote(noteId: string): Promise<void> {
    setActionError(null);
    try {
      await cursadaClient.deleteNote(noteId);
      setNotes((prev) => {
        const remaining = prev.filter((n) => n.id !== noteId);
        if (selectedNoteId === noteId) {
          const nextSelected = remaining[0] ?? null;
          prevSelectedNoteIdRef.current = nextSelected?.id ?? null;
          setSelectedNoteId(nextSelected?.id ?? null);
          setDraftTitle(nextSelected?.title ?? '');
        }
        return remaining;
      });
      onNotesChanged?.();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo eliminar la nota.'
      );
    }
  }

  async function handleChangeNoteCourse(
    noteId: string,
    nextCourseId: string
  ): Promise<void> {
    setActionError(null);
    try {
      const updated = await cursadaClient.updateNote(noteId, {
        courseId: nextCourseId,
      });
      setNotes((prev) =>
        sortNotesForList(prev.map((n) => (n.id === noteId ? updated : n)))
      );
      onNotesChanged?.();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo reasignar el anotador de la nota.'
      );
    }
  }

  function handleNoteSaved(updated: NoteWithCourse): void {
    setNotes((prev) =>
      sortNotesForList(prev.map((n) => (n.id === updated.id ? updated : n)))
    );
    onNotesChanged?.();
  }

  function handleClearFilters(): void {
    setSearchQuery('');
    setCourseFilter('all');
    setPinnedOnly(false);
  }

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    (!courseId && courseFilter !== 'all') ||
    pinnedOnly;

  const canCreate = Boolean(courseId || courses.length > 0);
  const isListHidden = Boolean(selectedNote && !isListVisible);

  return (
    <div
      className={`notes-workspace ${isListHidden ? 'is-list-hidden' : ''}`}
      data-testid={
        courseId ? `notes-workspace-${courseId}` : 'notes-workspace-global'
      }
    >
      <aside className="notes-sidebar-pane" aria-label="Listado de notas">
        <div className="notes-sidebar-controls">
          <div className="notes-search-row">
            <input
              type="search"
              className="task-input notes-search-input"
              aria-label="Buscar en apuntes"
              placeholder="Buscar en apuntes (sin tildes)..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="notes-filter-row">
            {!courseId ? (
              <select
                className="task-select notes-course-select"
                aria-label="Filtrar por anotador"
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
              >
                <option value="all">Todos los anotadores</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            ) : null}

            <button
              type="button"
              className={`secondary-button notes-pin-filter-btn ${pinnedOnly ? 'is-selected' : ''}`}
              aria-pressed={pinnedOnly}
              onClick={() => setPinnedOnly((prev) => !prev)}
            >
              Solo fijadas
            </button>
          </div>

          <button
            type="button"
            className="primary-button notes-new-button"
            disabled={!canCreate || isCreating}
            onClick={() => void handleCreateNote()}
          >
            + Nueva nota
          </button>
        </div>

        {actionError ? (
          <div className="task-form-error" role="alert">
            {actionError}
          </div>
        ) : null}

        {isLoading ? (
          <p className="notes-sidebar-empty-text">Cargando apuntes...</p>
        ) : notes.length === 0 ? (
          <div className="notes-sidebar-empty">
            <p className="notes-sidebar-empty-title">
              {hasActiveFilters
                ? 'Sin apuntes que coincidan'
                : 'Todavía no hay apuntes'}
            </p>
            {hasActiveFilters || !canCreate ? (
              <p className="notes-sidebar-empty-text">
                {hasActiveFilters
                  ? 'Probá con otra búsqueda o limpiá los filtros activos.'
                  : 'Creá un anotador primero para poder tomar apuntes.'}
              </p>
            ) : null}
            {hasActiveFilters ? (
              <button
                type="button"
                className="secondary-button"
                onClick={handleClearFilters}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="notes-list" aria-label="Notas disponibles">
            {notes.map((note) => {
              const isSelected = note.id === selectedNote?.id;
              return (
                <li
                  key={note.id}
                  className={`notes-list-item ${isSelected ? 'is-selected' : ''} ${note.isPinned ? 'is-pinned' : ''}`}
                  data-course-color={note.courseColor}
                >
                  <div className="notes-list-item-row">
                    <button
                      type="button"
                      className="notes-list-item-select"
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => {
                        setSelectedNoteId(note.id);
                        setIsListVisible(false);
                      }}
                    >
                      <span className="notes-list-item-title">{note.title}</span>
                      <span className="notes-list-item-meta">
                        {!courseId ? (
                          <span
                            className="course-pill notes-list-course-pill"
                            data-course-color={note.courseColor}
                          >
                            <span
                              className="course-dot"
                              data-course-color={note.courseColor}
                              aria-hidden="true"
                            />
                            {note.courseName}
                          </span>
                        ) : null}
                        <span className="notes-list-date">
                          {formatNoteDateLabel(note.updatedAt)}
                        </span>
                        {note.origin !== 'manual' ? (
                          <span className="notes-origin-badge">
                            {ORIGIN_LABELS[note.origin]}
                          </span>
                        ) : null}
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`ghost-action-button notes-pin-icon-btn ${note.isPinned ? 'is-pinned' : ''}`}
                      aria-label={
                        note.isPinned
                          ? `Desfijar ${note.title}`
                          : `Fijar ${note.title}`
                      }
                      aria-pressed={note.isPinned}
                      title={note.isPinned ? 'Nota fijada' : 'Fijar nota'}
                      onClick={() => void handleTogglePin(note.id)}
                    >
                      {note.isPinned ? '★' : '☆'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="notes-editor-pane" aria-label="Editor de nota">
        {selectedNote ? (
          <>
            <header className="notes-editor-header">
              <div className="notes-editor-title-group">
                <input
                  ref={titleInputRef}
                  type="text"
                  className="notes-title-input"
                  aria-label="Título de la nota"
                  placeholder="Título del apunte..."
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />

                <div className="notes-editor-submeta">
                  {!courseId ? (
                    <div className="notes-editor-course-controls">
                      <select
                        className="task-select notes-editor-course-select"
                        aria-label="Anotador de la nota"
                        value={selectedNote.courseId}
                        onChange={(event) =>
                          void handleChangeNoteCourse(
                            selectedNote.id,
                            event.target.value
                          )
                        }
                      >
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                      {onSelectCourse ? (
                        <button
                          type="button"
                          className="ghost-action-button notes-open-course-btn"
                          onClick={() => onSelectCourse(selectedNote.courseId)}
                        >
                          Ir a anotador
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <span className="notes-origin-badge">
                    {ORIGIN_LABELS[selectedNote.origin]}
                  </span>
                </div>
              </div>

              <div className="notes-editor-actions">
                <button
                  type="button"
                  className={`secondary-button notes-toggle-list-btn ${isListVisible ? 'is-selected' : ''}`}
                  aria-label={
                    isListVisible ? 'Ocultar lista de notas' : 'Mostrar lista de notas'
                  }
                  aria-pressed={isListVisible}
                  onClick={() => setIsListVisible((prev) => !prev)}
                >
                  {isListVisible ? 'Ocultar lista' : 'Mostrar lista'}
                </button>

                <button
                  type="button"
                  className={`secondary-button notes-header-pin-btn ${selectedNote.isPinned ? 'is-selected' : ''}`}
                  aria-label={
                    selectedNote.isPinned ? 'Desfijar nota' : 'Fijar nota'
                  }
                  aria-pressed={selectedNote.isPinned}
                  onClick={() => void handleTogglePin(selectedNote.id)}
                >
                  {selectedNote.isPinned ? '★ Fijada' : '☆ Fijar'}
                </button>

                <button
                  type="button"
                  className="ghost-action-button task-action-btn is-danger"
                  aria-label="Eliminar nota"
                  onClick={() => void handleDeleteNote(selectedNote.id)}
                >
                  Eliminar
                </button>
              </div>
            </header>

            <NoteEditor
              note={selectedNote}
              title={draftTitle}
              onNoteSaved={handleNoteSaved}
            />
          </>
        ) : (
          <div className="notes-empty-editor">
            <h2 className="task-empty-title">
              {hasActiveFilters
                ? 'Ninguna nota seleccionada'
                : 'Empezá un nuevo apunte'}
            </h2>
            {hasActiveFilters ? (
              <p className="task-empty-subtitle">
                Limpiá el filtro de búsqueda o elegí otra nota del panel izquierdo.
              </p>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                className="primary-button"
                disabled={isCreating}
                onClick={() => void handleCreateNote()}
              >
                + Nueva nota
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
