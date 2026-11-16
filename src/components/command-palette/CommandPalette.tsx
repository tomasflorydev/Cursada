import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cursadaClient } from '../../lib/api/client';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from '../../lib/shortcuts/commandPaletteSearch';
import type {
  CommandPaletteItem,
  CommandPaletteItemKind,
  CommandPaletteTarget,
  CourseWithSchedules,
  ExamWithCourse,
  NoteWithCourse,
  TaskWithCourse,
} from '../../types/domain';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTarget: (target: CommandPaletteTarget) => void;
}

interface PaletteDataState {
  courses: CourseWithSchedules[];
  notes: NoteWithCourse[];
  tasks: TaskWithCourse[];
  exams: ExamWithCourse[];
}

const EMPTY_PALETTE_DATA: PaletteDataState = {
  courses: [],
  notes: [],
  tasks: [],
  exams: [],
};

const FILTER_OPTIONS: ReadonlyArray<{
  value: CommandPaletteItemKind | 'all';
  label: string;
}> = [
  { value: 'all', label: 'Todo' },
  { value: 'course', label: 'Materias' },
  { value: 'note', label: 'Notas' },
  { value: 'task', label: 'Tareas' },
  { value: 'exam', label: 'Exámenes' },
  { value: 'action', label: 'Acciones' },
];

export function CommandPalette({
  isOpen,
  onClose,
  onSelectTarget,
}: CommandPaletteProps) {
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [query, setQuery] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<CommandPaletteItemKind | 'all'>('all');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<PaletteDataState>(EMPTY_PALETTE_DATA);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setKindFilter('all');
      setActiveIndex(0);
      setLoadError(null);
      return;
    }

    let active = true;
    setQuery('');
    setKindFilter('all');
    setActiveIndex(0);
    setIsLoading(true);
    setLoadError(null);
    inputRef.current?.focus();

    void Promise.all([
      cursadaClient.listCourses({ status: 'all' }),
      cursadaClient.listNotes(),
      cursadaClient.listTasks({ status: 'all' }),
      cursadaClient.listExams(),
    ])
      .then(([courses, notes, tasks, exams]) => {
        if (!active) {
          return;
        }
        setData({ courses, notes, tasks, exams });
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        setLoadError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los resultados.'
        );
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen, onClose]);

  const allItems = useMemo(() => buildCommandPaletteItems(data), [data]);

  const filteredItems = useMemo(
    () => filterCommandPaletteItems(allItems, query, kindFilter),
    [allItems, query, kindFilter]
  );

  const boundedActiveIndex =
    filteredItems.length > 0
      ? Math.min(activeIndex, filteredItems.length - 1)
      : -1;

  useEffect(() => {
    if (!isOpen || boundedActiveIndex < 0) {
      return;
    }
    const activeButton = itemRefs.current[boundedActiveIndex];
    if (activeButton && typeof activeButton.scrollIntoView === 'function') {
      activeButton.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, boundedActiveIndex]);

  if (!isOpen) {
    return null;
  }

  function handleSelectItem(item: CommandPaletteItem): void {
    onSelectTarget(item.target);
    onClose();
  }

  function handleDialogKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>
  ): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filteredItems.length > 0) {
        setActiveIndex((prev) => {
          const current = prev >= filteredItems.length ? 0 : prev;
          return (current + 1) % filteredItems.length;
        });
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filteredItems.length > 0) {
        setActiveIndex((prev) => {
          const current = prev >= filteredItems.length ? 0 : prev;
          return (current - 1 + filteredItems.length) % filteredItems.length;
        });
      }
      return;
    }

    if (event.key === 'Enter') {
      if (event.target instanceof HTMLButtonElement) {
        return;
      }
      const activeItem =
        boundedActiveIndex >= 0 ? filteredItems[boundedActiveIndex] : undefined;
      if (activeItem) {
        event.preventDefault();
        handleSelectItem(activeItem);
      }
    }
  }

  return (
    <div
      className="command-palette-backdrop"
      data-testid="command-palette-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de búsqueda rápida"
        data-testid="command-palette-dialog"
        className="command-palette-dialog"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="command-palette-header">
          <svg
            className="command-palette-search-icon"
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <circle cx="8.75" cy="8.75" r="5.25" />
            <path d="m12.8 12.8 3.7 3.7" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            className="command-palette-input"
            data-testid="command-palette-input"
            aria-label="Buscar anotador, nota, tarea, examen o comando..."
            placeholder="Buscar anotador, nota, tarea, examen o comando..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
          />
          <button
            type="button"
            className="ghost-action-button command-palette-close-btn"
            aria-label="Cerrar paleta de búsqueda"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div
          className="command-palette-filters"
          role="group"
          aria-label="Filtrar resultados por tipo"
        >
          {FILTER_OPTIONS.map((option) => {
            const isSelected = kindFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`command-palette-filter-pill ${isSelected ? 'is-active' : ''}`}
                aria-pressed={isSelected}
                onClick={() => {
                  setKindFilter(option.value);
                  setActiveIndex(0);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="command-palette-results" aria-label="Resultados de búsqueda">
          {loadError ? (
            <div className="command-palette-empty" role="alert">
              {loadError}
            </div>
          ) : null}

          {!loadError && filteredItems.length === 0 ? (
            <div className="command-palette-empty">
              {isLoading
                ? 'Cargando índice...'
                : query.trim()
                  ? `No se encontraron resultados para “${query.trim()}”.`
                  : 'No hay elementos en esta categoría.'}
            </div>
          ) : (
            <ul className="command-palette-list">
              {filteredItems.map((item, index) => {
                const isActive = index === boundedActiveIndex;
                return (
                  <li key={item.id}>
                    <button
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      id={`${baseId}-item-${index}`}
                      type="button"
                      className={`command-palette-item ${isActive ? 'is-active' : ''}`}
                      data-course-color={item.courseColor}
                      aria-current={isActive ? 'true' : undefined}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelectItem(item)}
                    >
                      <span
                        className="command-palette-item-leading"
                        aria-hidden="true"
                      >
                        {item.courseColor ? (
                          <span
                            className="course-dot"
                            data-course-color={item.courseColor}
                          />
                        ) : (
                          <span className="command-palette-action-glyph">⌘</span>
                        )}
                      </span>

                      <span className="command-palette-item-body">
                        <span className="command-palette-item-title">
                          {item.title}
                        </span>
                        <span className="command-palette-item-subtitle">
                          {item.subtitle}
                        </span>
                      </span>

                      <span className="command-palette-item-trailing">
                        {item.badge ? (
                          <span
                            className={`command-palette-badge is-${item.kind}`}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                        {item.shortcutHint ? (
                          <kbd className="command-palette-kbd">
                            {item.shortcutHint}
                          </kbd>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="command-palette-footer" aria-label="Atajos disponibles">
          <span className="command-palette-hint">
            <kbd>↑↓</kbd> Navegar
          </span>
          <span className="command-palette-hint">
            <kbd>↵</kbd> Abrir
          </span>
          <span className="command-palette-hint">
            <kbd>Esc</kbd> Cerrar
          </span>
          <span className="command-palette-hint">
            <kbd>⌘1–5</kbd> Secciones
          </span>
          <span className="command-palette-hint">
            <kbd>⌘N</kbd> Nuevo
          </span>
          <span className="command-palette-hint">
            <kbd>⌘,</kbd> Ajustes
          </span>
        </footer>
      </div>
    </div>
  );
}
