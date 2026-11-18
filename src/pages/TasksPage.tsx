import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  addDays,
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../lib/dates';
import type {
  CourseWithSchedules,
  TaskPriority,
  TaskWithCourse,
} from '../types/domain';
import {
  SwissButton,
  SwissCheckbox,
  SwissEmptyState,
  SwissErrorAlert,
  SwissLinkButton,
  SwissSectionHeader,
  SwissSelect,
} from '../ui';

export interface TasksPageProps {
  onSelectCourse: (courseId: string | null) => void;
  onTasksChanged?: () => void;
  externalCreateVersion?: number;
}

type TaskViewFilter = 'open' | 'today' | 'week' | 'done';
type QuickDatePreset = 'unset' | 'today' | 'tomorrow' | 'in3days' | 'none' | 'custom';

function diffCalendarDays(targetIso: string, refIso: string): number {
  const target = parseIsoDateLocal(targetIso);
  const ref = parseIsoDateLocal(refIso);
  return Math.round((target.getTime() - ref.getTime()) / 86_400_000);
}

function formatShortDateEs(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const monthIdx = Number(match[2]) - 1;
  const dayNum = Number(match[3]);
  const monthName = MONTH_SHORT_NAMES_ES[monthIdx] ?? match[2];
  return `${dayNum} ${monthName}`;
}

function formatDueRelative(diffDays: number): string {
  if (diffDays < -1) return `venció hace ${Math.abs(diffDays)} días`;
  if (diffDays === -1) return 'venció ayer';
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'en 1 día';
  return `en ${diffDays} días`;
}

function sortTasksChronologically(tasks: TaskWithCourse[]): TaskWithCourse[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate && b.dueDate) {
      const cmp = a.dueDate.localeCompare(b.dueDate);
      if (cmp !== 0) return cmp;
    } else if (a.dueDate) {
      return -1;
    } else if (b.dueDate) {
      return 1;
    }
    return a.title.localeCompare(b.title);
  });
}

function resolveQuickDateIso(
  preset: QuickDatePreset,
  customDate: string,
  today: Date
): string | null {
  switch (preset) {
    case 'today':
      return toIsoDateString(today);
    case 'tomorrow':
      return toIsoDateString(addDays(today, 1));
    case 'in3days':
      return toIsoDateString(addDays(today, 3));
    case 'custom':
      return /^\d{4}-\d{2}-\d{2}$/.test(customDate) ? customDate : null;
    case 'none':
    case 'unset':
    default:
      return null;
  }
}

export function TasksPage({
  onSelectCourse,
  onTasksChanged,
  externalCreateVersion = 0,
}: TasksPageProps) {
  const quickAddInputRef = useRef<HTMLInputElement | null>(null);
  const lastExternalCreateVersionRef = useRef<number>(0);

  const [tasks, setTasks] = useState<TaskWithCourse[]>([]);
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [viewFilter, setViewFilter] = useState<TaskViewFilter>('open');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string | null>(null);
  const [showCompletedGroup, setShowCompletedGroup] = useState<boolean>(false);

  // Quick-add state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCourseId, setQuickCourseId] = useState('');
  const [quickDatePreset, setQuickDatePreset] = useState<QuickDatePreset>('unset');
  const [quickCustomDate, setQuickCustomDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Inline edit / delete state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCourseId, setEditCourseId] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority | ''>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toIsoDateString(today), [today]);

  useEffect(() => {
    if (
      externalCreateVersion > 0 &&
      externalCreateVersion !== lastExternalCreateVersionRef.current
    ) {
      lastExternalCreateVersionRef.current = externalCreateVersion;
      quickAddInputRef.current?.focus();
    } else if (externalCreateVersion === 0) {
      lastExternalCreateVersionRef.current = 0;
    }
  }, [externalCreateVersion]);

  const loadData = useCallback(async () => {
    try {
      const [loadedTasks, loadedCourses] = await Promise.all([
        cursadaClient.listTasks({ status: 'all' }),
        cursadaClient.listCourses({ status: 'active' }),
      ]);
      setTasks(loadedTasks);
      setCourses(loadedCourses);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudieron cargar las tareas.'
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      cursadaClient.listTasks({ status: 'all' }),
      cursadaClient.listCourses({ status: 'active' }),
    ])
      .then(([loadedTasks, loadedCourses]) => {
        if (!active) return;
        setTasks(loadedTasks);
        setCourses(loadedCourses);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'No se pudieron cargar las tareas.'
        );
      });

    const handleDataChanged = () => {
      if (!active) return;
      void loadData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadData]);

  // Sidebar view counts (unfiltered by course so the student sees total scope)
  const viewCounts = useMemo(() => {
    let open = 0;
    let todayCount = 0;
    let week = 0;
    let done = 0;

    for (const task of tasks) {
      if (task.status === 'done') {
        done++;
        continue;
      }
      open++;
      if (task.dueDate) {
        if (task.dueDate === todayIso) {
          todayCount++;
        }
        const diff = diffCalendarDays(task.dueDate, todayIso);
        if (diff <= 7) {
          week++;
        }
      }
    }

    return { open, today: todayCount, week, done };
  }, [tasks, todayIso]);

  const tasksMatchingView = useMemo(() => {
    return tasks.filter((task) => {
      if (viewFilter === 'done') {
        return task.status === 'done';
      }
      if (viewFilter === 'today') {
        return task.status === 'pending' && task.dueDate === todayIso;
      }
      if (viewFilter === 'week') {
        if (task.status !== 'pending' || !task.dueDate) return false;
        return diffCalendarDays(task.dueDate, todayIso) <= 7;
      }
      // 'open': show pending (plus completed group collapsible underneath)
      return true;
    });
  }, [tasks, viewFilter, todayIso]);

  const countsByCourse = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (viewFilter === 'done') {
        if (task.status === 'done') {
          map.set(task.courseId, (map.get(task.courseId) ?? 0) + 1);
        }
      } else if (viewFilter === 'today') {
        if (task.status === 'pending' && task.dueDate === todayIso) {
          map.set(task.courseId, (map.get(task.courseId) ?? 0) + 1);
        }
      } else if (viewFilter === 'week') {
        if (
          task.status === 'pending' &&
          task.dueDate &&
          diffCalendarDays(task.dueDate, todayIso) <= 7
        ) {
          map.set(task.courseId, (map.get(task.courseId) ?? 0) + 1);
        }
      } else if (task.status === 'pending') {
        map.set(task.courseId, (map.get(task.courseId) ?? 0) + 1);
      }
    }
    return map;
  }, [tasks, viewFilter, todayIso]);

  const visibleTasks = useMemo(() => {
    if (!selectedCourseFilter) {
      return tasksMatchingView;
    }
    return tasksMatchingView.filter((t) => t.courseId === selectedCourseFilter);
  }, [tasksMatchingView, selectedCourseFilter]);

  const groupedTasks = useMemo(() => {
    const thisWeek: TaskWithCourse[] = [];
    const later: TaskWithCourse[] = [];
    const done: TaskWithCourse[] = [];

    for (const task of visibleTasks) {
      if (task.status === 'done') {
        done.push(task);
        continue;
      }
      if (task.dueDate && diffCalendarDays(task.dueDate, todayIso) <= 7) {
        thisWeek.push(task);
      } else {
        later.push(task);
      }
    }

    done.sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));

    return {
      thisWeek: sortTasksChronologically(thisWeek),
      later: sortTasksChronologically(later),
      done,
    };
  }, [visibleTasks, todayIso]);

  async function handleQuickCreate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) {
      setErrorMsg('Escribí el título de la tarea antes de crearla.');
      return;
    }

    const effectiveCourseId =
      quickCourseId || selectedCourseFilter || courses[0]?.id || '';
    if (!effectiveCourseId) {
      setErrorMsg('Creá al menos una materia activa antes de agregar tareas.');
      return;
    }

    const dueDate = resolveQuickDateIso(quickDatePreset, quickCustomDate, today);

    setIsCreating(true);
    setErrorMsg(null);
    try {
      await cursadaClient.createTask({
        courseId: effectiveCourseId,
        title: trimmed,
        dueDate,
      });
      setQuickTitle('');
      await loadData();
      onTasksChanged?.();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo crear la tarea.'
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleTask(taskId: string): Promise<void> {
    setErrorMsg(null);
    try {
      await cursadaClient.toggleTaskStatus(taskId);
      await loadData();
      onTasksChanged?.();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo actualizar la tarea.'
      );
    }
  }

  function startEditing(task: TaskWithCourse): void {
    setConfirmDeleteId(null);
    setErrorMsg(null);
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditCourseId(task.courseId);
    setEditDueDate(task.dueDate ?? '');
    setEditPriority(task.priority ?? '');
  }

  function cancelEditing(): void {
    setEditingTaskId(null);
    setErrorMsg(null);
  }

  async function handleSaveEdit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!editingTaskId) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setErrorMsg('El título de la tarea no puede estar vacío.');
      return;
    }

    setIsSavingEdit(true);
    setErrorMsg(null);
    try {
      await cursadaClient.updateTask(editingTaskId, {
        courseId: editCourseId,
        title: trimmed,
        description: editDescription.trim(),
        dueDate: editDueDate.trim() ? editDueDate.trim() : null,
        priority: editPriority ? editPriority : null,
      });
      setEditingTaskId(null);
      await loadData();
      onTasksChanged?.();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo guardar la tarea.'
      );
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteTask(taskId: string): Promise<void> {
    setErrorMsg(null);
    try {
      await cursadaClient.deleteTask(taskId);
      setConfirmDeleteId(null);
      if (editingTaskId === taskId) {
        setEditingTaskId(null);
      }
      await loadData();
      onTasksChanged?.();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo eliminar la tarea.'
      );
    }
  }

  function renderTaskRow(task: TaskWithCourse) {
    const isDone = task.status === 'done';
    const isEditing = editingTaskId === task.id;
    const isConfirmingDelete = confirmDeleteId === task.id;

    if (isEditing) {
      return (
        <div
          key={task.id}
          style={{
            padding: '16px 0',
            borderTop: '1px solid var(--rule)',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <form
            onSubmit={(e) => void handleSaveEdit(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '12px' }}>
              <div>
                <label className="swiss-section-label" htmlFor={`edit-task-title-${task.id}`}>
                  Título
                </label>
                <input
                  id={`edit-task-title-${task.id}`}
                  type="text"
                  className="swiss-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="swiss-section-label" htmlFor={`edit-task-course-${task.id}`}>
                  Materia
                </label>
                <SwissSelect
                  id={`edit-task-course-${task.id}`}
                  value={editCourseId}
                  onChange={(e) => setEditCourseId(e.target.value)}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SwissSelect>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
              <div>
                <label className="swiss-section-label" htmlFor={`edit-task-desc-${task.id}`}>
                  Detalle
                </label>
                <input
                  id={`edit-task-desc-${task.id}`}
                  type="text"
                  className="swiss-input"
                  placeholder="Notas adicionales (opcional)"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="swiss-section-label" htmlFor={`edit-task-date-${task.id}`}>
                  Fecha de entrega
                </label>
                <input
                  id={`edit-task-date-${task.id}`}
                  type="date"
                  className="swiss-input"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>

              <div>
                <label className="swiss-section-label" htmlFor={`edit-task-prio-${task.id}`}>
                  Prioridad
                </label>
                <SwissSelect
                  id={`edit-task-prio-${task.id}`}
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as TaskPriority | '')}
                >
                  <option value="">Sin prioridad</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </SwissSelect>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {editDueDate ? (
                <SwissButton
                  variant="secondary"
                  onClick={() => setEditDueDate('')}
                >
                  Sin fecha
                </SwissButton>
              ) : null}
              <SwissButton variant="tertiary" onClick={cancelEditing}>
                Cancelar
              </SwissButton>
              <SwissButton type="submit" variant="primary" disabled={isSavingEdit}>
                {isSavingEdit ? 'Guardando…' : 'Guardar'}
              </SwissButton>
            </div>
          </form>
        </div>
      );
    }

    const diffDays = task.dueDate ? diffCalendarDays(task.dueDate, todayIso) : null;
    const isUrgent = !isDone && diffDays !== null && diffDays < 3;
    const dueDateLabel = task.dueDate ? formatShortDateEs(task.dueDate) : 'Sin fecha';
    const relLabel = isDone
      ? 'Completada'
      : diffDays !== null
        ? formatDueRelative(diffDays)
        : 'Pendiente';

    return (
      <div
        key={task.id}
        className={`tasks-item-row ${isDone ? 'is-done' : ''}`.trim()}
        data-task-id={task.id}
      >
        <SwissCheckbox
          checked={isDone}
          muted={isDone}
          ariaLabel={
            isDone
              ? `Marcar "${task.title}" como pendiente`
              : `Marcar "${task.title}" como completada`
          }
          onChange={() => void handleToggleTask(task.id)}
        />

        <div style={{ minWidth: 0 }}>
          <div className="tasks-item-title" title={task.title}>
            {task.title}
          </div>
          {task.description ? (
            <div className="swiss-meta tasks-item-desc" title={task.description}>
              {task.description}
            </div>
          ) : null}
        </div>

        <div style={{ minWidth: 0 }}>
          <button
            type="button"
            className="swiss-link tasks-item-course"
            title={task.courseName}
            onClick={() => onSelectCourse(task.courseId)}
          >
            {task.courseName}
          </button>
        </div>

        <div className="tasks-item-due">
          <span className="tasks-item-due-date">{dueDateLabel}</span>
          <span className={`tasks-item-due-rel ${isUrgent ? 'is-urgent' : ''}`.trim()}>
            {relLabel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isConfirmingDelete ? (
            <>
              <SwissLinkButton
                className="swiss-meta"
                onClick={() => void handleDeleteTask(task.id)}
              >
                Confirmar
              </SwissLinkButton>
              <SwissLinkButton
                className="swiss-meta"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </SwissLinkButton>
            </>
          ) : (
            <>
              <SwissLinkButton
                className="swiss-meta"
                onClick={() => startEditing(task)}
              >
                Editar
              </SwissLinkButton>
              <SwissLinkButton
                className="swiss-meta"
                onClick={() => {
                  setEditingTaskId(null);
                  setConfirmDeleteId(task.id);
                }}
              >
                Eliminar
              </SwissLinkButton>
            </>
          )}
        </div>
      </div>
    );
  }

  const filterOptions: Array<{ id: TaskViewFilter; label: string; count: number }> = [
    { id: 'open', label: 'Abiertas', count: viewCounts.open },
    { id: 'today', label: 'Hoy', count: viewCounts.today },
    { id: 'week', label: 'Esta semana', count: viewCounts.week },
    { id: 'done', label: 'Completadas', count: viewCounts.done },
  ];

  const hasOpenVisible =
    groupedTasks.thisWeek.length > 0 || groupedTasks.later.length > 0;

  return (
    <section aria-labelledby="main-title">
      <div className="swiss-page-head">
        <div className="swiss-page-head-left">
          <h1 id="main-title" tabIndex={-1} className="swiss-screen-title">
            Tareas
          </h1>
          <p className="swiss-meta-md">
            {viewCounts.open} {viewCounts.open === 1 ? 'abierta' : 'abiertas'} ·{' '}
            {viewCounts.today} para hoy · {viewCounts.week} esta semana
          </p>
        </div>

        <div className="swiss-page-actions">
          <SwissButton
            variant="primary"
            onClick={() => quickAddInputRef.current?.focus()}
          >
            + Nueva tarea
          </SwissButton>
        </div>
      </div>

      <div className="swiss-grid">
        <aside className="swiss-col-3" aria-label="Filtros de tareas">
          <div style={{ marginBottom: '28px' }}>
            <SwissSectionHeader title="Ver" />
          <div>
            {filterOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`swiss-list-row ${viewFilter === opt.id ? 'is-selected' : ''}`.trim()}
                aria-pressed={viewFilter === opt.id}
                onClick={() => setViewFilter(opt.id)}
              >
                <span
                  style={{
                    display: 'flex',
                    width: '100%',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: '8px',
                  }}
                >
                  <span>{opt.label}</span>
                  <span className="swiss-meta swiss-tabular">{opt.count}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <SwissSectionHeader
            title="Por materia"
            right={
              selectedCourseFilter ? (
                <SwissLinkButton
                  className="swiss-meta"
                  onClick={() => setSelectedCourseFilter(null)}
                >
                  Todas
                </SwissLinkButton>
              ) : undefined
            }
          />
          {courses.length === 0 ? (
            <p className="swiss-meta-md">No tenés materias activas.</p>
          ) : (
            <div>
              {courses.map((course) => {
                const isSelected = selectedCourseFilter === course.id;
                const count = countsByCourse.get(course.id) ?? 0;
                return (
                  <button
                    key={course.id}
                    type="button"
                    className={`swiss-list-row ${isSelected ? 'is-selected' : ''}`.trim()}
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedCourseFilter((prev) =>
                        prev === course.id ? null : course.id
                      )
                    }
                  >
                    <span
                      style={{
                        display: 'flex',
                        width: '100%',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: '8px',
                      }}
                    >
                      <span
                        title={course.name}
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {course.name}
                      </span>
                      <span className="swiss-meta swiss-tabular">{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="swiss-col-9">
        <form
          className="tasks-quickadd-bar"
          onSubmit={(e) => void handleQuickCreate(e)}
          aria-label="Alta rápida de tarea"
        >
          <span className="tasks-quickadd-plus" aria-hidden="true">
            +
          </span>
          <input
            ref={quickAddInputRef}
            type="text"
            className="tasks-quickadd-input"
            placeholder="Agregar tarea y presionar Enter…"
            aria-label="Título de la nueva tarea"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            disabled={isCreating}
          />
          <div className="tasks-quickadd-selects">
            <span className="tasks-inline-select-wrap">
              <select
                className="tasks-inline-select"
                aria-label="Materia de la nueva tarea"
                value={quickCourseId}
                onChange={(e) => setQuickCourseId(e.target.value)}
                disabled={isCreating}
              >
                <option value="">Materia</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              <span
                className="swiss-select-caret"
                aria-hidden="true"
                style={{ right: 0 }}
              >
                ▾
              </span>
            </span>

            <span className="tasks-inline-select-wrap">
              <select
                className="tasks-inline-select"
                aria-label="Fecha de la nueva tarea"
                value={quickDatePreset}
                onChange={(e) => {
                  const next = e.target.value as QuickDatePreset;
                  setQuickDatePreset(next);
                  if (next === 'custom' && !quickCustomDate) {
                    setQuickCustomDate(todayIso);
                  }
                }}
                disabled={isCreating}
              >
                <option value="unset">Fecha</option>
                <option value="today">Hoy</option>
                <option value="tomorrow">Mañana</option>
                <option value="in3days">En 3 días</option>
                <option value="none">Sin fecha</option>
                <option value="custom">Elegir fecha…</option>
              </select>
              <span
                className="swiss-select-caret"
                aria-hidden="true"
                style={{ right: 0 }}
              >
                ▾
              </span>
            </span>

            {quickDatePreset === 'custom' ? (
              <input
                type="date"
                className="tasks-inline-select"
                aria-label="Fecha personalizada de entrega"
                value={quickCustomDate}
                onChange={(e) => setQuickCustomDate(e.target.value)}
                disabled={isCreating}
              />
            ) : null}
          </div>
        </form>

        {errorMsg ? (
          <div style={{ marginBottom: '20px' }}>
            <SwissErrorAlert message={errorMsg} />
          </div>
        ) : null}

        {viewFilter === 'open' ? (
          <>
            {groupedTasks.thisWeek.length > 0 ? (
              <div className="tasks-group">
                <SwissSectionHeader
                  title="Esta semana"
                  right={`${groupedTasks.thisWeek.length}`}
                />
                <div>{groupedTasks.thisWeek.map(renderTaskRow)}</div>
              </div>
            ) : null}

            {groupedTasks.later.length > 0 ? (
              <div className="tasks-group">
                <SwissSectionHeader
                  title="Más adelante"
                  right={`${groupedTasks.later.length}`}
                />
                <div>{groupedTasks.later.map(renderTaskRow)}</div>
              </div>
            ) : null}

            {!hasOpenVisible ? (
              <SwissEmptyState
                title="No tenés tareas abiertas"
                description="Agregá una entrega arriba con Enter o cambiá el filtro lateral para revisar completadas."
                actionLabel={selectedCourseFilter ? 'Ver todas las materias' : undefined}
                onAction={
                  selectedCourseFilter
                    ? () => setSelectedCourseFilter(null)
                    : undefined
                }
              />
            ) : null}

            {groupedTasks.done.length > 0 ? (
              <div className="tasks-group">
                <SwissSectionHeader
                  title={`Completadas (${groupedTasks.done.length})`}
                  subtle
                  right={
                    <SwissLinkButton
                      onClick={() => setShowCompletedGroup((prev) => !prev)}
                    >
                      {showCompletedGroup ? 'Ocultar' : 'Mostrar'}
                    </SwissLinkButton>
                  }
                />
                {showCompletedGroup ? (
                  <div>{groupedTasks.done.map(renderTaskRow)}</div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {viewFilter === 'today' ? (
          groupedTasks.thisWeek.length > 0 ? (
            <div className="tasks-group">
              <SwissSectionHeader
                title="Hoy"
                right={`${groupedTasks.thisWeek.length}`}
              />
              <div>{groupedTasks.thisWeek.map(renderTaskRow)}</div>
            </div>
          ) : (
            <SwissEmptyState
              title="No tenés entregas para hoy"
              description="Cuando tengas tareas con vencimiento en la fecha actual van a aparecer acá."
              actionLabel={selectedCourseFilter ? 'Ver todas las materias' : undefined}
              onAction={
                selectedCourseFilter
                  ? () => setSelectedCourseFilter(null)
                  : undefined
              }
            />
          )
        ) : null}

        {viewFilter === 'week' ? (
          groupedTasks.thisWeek.length > 0 ? (
            <div className="tasks-group">
              <SwissSectionHeader
                title="Esta semana"
                right={`${groupedTasks.thisWeek.length}`}
              />
              <div>{groupedTasks.thisWeek.map(renderTaskRow)}</div>
            </div>
          ) : (
            <SwissEmptyState
              title="Semana despejada"
              description="No hay entregas pendientes para los próximos 7 días."
              actionLabel={selectedCourseFilter ? 'Ver todas las materias' : undefined}
              onAction={
                selectedCourseFilter
                  ? () => setSelectedCourseFilter(null)
                  : undefined
              }
            />
          )
        ) : null}

        {viewFilter === 'done' ? (
          groupedTasks.done.length > 0 ? (
            <div className="tasks-group">
              <SwissSectionHeader
                title="Completadas"
                right={`${groupedTasks.done.length}`}
              />
              <div>{groupedTasks.done.map(renderTaskRow)}</div>
            </div>
          ) : (
            <SwissEmptyState
              title="Todavía no completaste tareas"
              description="Marcá una tarea con el casillero para registrar tu avance."
              actionLabel={selectedCourseFilter ? 'Ver todas las materias' : undefined}
              onAction={
                selectedCourseFilter
                  ? () => setSelectedCourseFilter(null)
                  : undefined
              }
            />
          )
          ) : null}
        </div>
      </div>
    </section>
  );
}
