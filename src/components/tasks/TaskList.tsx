import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import { toIsoDateString } from '../../lib/dates';
import type {
  CourseWithSchedules,
  TaskFilters,
  TaskPriority,
  TaskStatus,
  TaskWithCourse,
} from '../../types';

export interface TaskListProps {
  courseId?: string;
  onSelectCourse?: (courseId: string | null) => void;
  onTasksChanged?: () => void;
  showCreateButton?: boolean;
  createRequestVersion?: number;
}

const SHORT_MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatShortSpanishDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const monthIndex = Number(match[2]) - 1;
  const dayNumber = Number(match[3]);
  const monthName = SHORT_MONTHS_ES[monthIndex] ?? match[2];
  return `${dayNumber} ${monthName}`;
}

export function getTaskDueBadgeInfo(
  task: Pick<TaskWithCourse, 'status' | 'dueDate'>,
  referenceDate: Date = new Date()
): { label: string; className: string; isOverdue: boolean } {
  if (task.status === 'done') {
    return {
      label: 'Completada',
      className: 'task-due-badge is-done',
      isOverdue: false,
    };
  }

  if (!task.dueDate) {
    return {
      label: 'Sin fecha',
      className: 'task-due-badge urgency-none',
      isOverdue: false,
    };
  }

  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const tomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1
  );
  const todayIso = toIsoDateString(today);
  const tomorrowIso = toIsoDateString(tomorrow);

  if (task.dueDate < todayIso) {
    return {
      label: `Vencida · ${formatShortSpanishDate(task.dueDate)}`,
      className: 'task-due-badge urgency-overdue',
      isOverdue: true,
    };
  }

  if (task.dueDate === todayIso) {
    return {
      label: 'Hoy',
      className: 'task-due-badge urgency-today',
      isOverdue: false,
    };
  }

  if (task.dueDate === tomorrowIso) {
    return {
      label: 'Mañana',
      className: 'task-due-badge urgency-tomorrow',
      isOverdue: false,
    };
  }

  return {
    label: formatShortSpanishDate(task.dueDate),
    className: 'task-due-badge urgency-week',
    isOverdue: false,
  };
}

function getPriorityBadgeInfo(
  priority: TaskPriority | null
): { label: string; className: string } | null {
  if (priority === 'high') {
    return { label: 'Prioridad alta', className: 'priority-indicator is-high' };
  }
  if (priority === 'medium') {
    return { label: 'Media', className: 'priority-indicator is-medium' };
  }
  if (priority === 'low') {
    return { label: 'Baja', className: 'priority-indicator is-low' };
  }
  return null;
}

export function TaskList({
  courseId,
  onSelectCourse,
  onTasksChanged,
  showCreateButton = true,
  createRequestVersion = 0,
}: TaskListProps) {
  const [tasks, setTasks] = useState<TaskWithCourse[]>([]);
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');

  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCourseId, setFormCourseId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority | ''>('');
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveCourseFilter = courseId ?? (courseFilter === 'all' ? undefined : courseFilter);

  const loadData = useCallback(async () => {
    const filters: TaskFilters = {
      status: statusFilter,
    };
    if (effectiveCourseFilter) {
      filters.courseId = effectiveCourseFilter;
    }

    const [loadedTasks, loadedCourses] = await Promise.all([
      cursadaClient.listTasks(filters),
      courseId ? Promise.resolve([]) : cursadaClient.listCourses({ status: 'active' }),
    ]);

    setTasks(loadedTasks);
    if (!courseId) {
      setCourses(loadedCourses);
    }
  }, [courseId, effectiveCourseFilter, statusFilter]);

  useEffect(() => {
    let active = true;
    const filters: TaskFilters = {
      status: statusFilter,
    };
    if (effectiveCourseFilter) {
      filters.courseId = effectiveCourseFilter;
    }

    void Promise.all([
      cursadaClient.listTasks(filters),
      courseId ? Promise.resolve([]) : cursadaClient.listCourses({ status: 'active' }),
    ]).then(([loadedTasks, loadedCourses]) => {
      if (!active) return;
      setTasks(loadedTasks);
      if (!courseId) {
        setCourses(loadedCourses);
      }
    });

    const handleExternalChange = () => {
      void loadData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleExternalChange);

    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleExternalChange);
    };
  }, [courseId, effectiveCourseFilter, statusFilter, loadData]);

  const openCreateForm = useCallback(() => {
    const defaultCourseId =
      courseId ??
      (courseFilter !== 'all' ? courseFilter : (courses[0]?.id ?? ''));
    setFormMode('create');
    setEditingTaskId(null);
    setFormTitle('');
    setFormCourseId(defaultCourseId);
    setFormDescription('');
    setFormDueDate('');
    setFormPriority('');
    setFormError(null);
  }, [courseId, courseFilter, courses]);

  useEffect(() => {
    if (createRequestVersion > 0) {
      openCreateForm();
    }
  }, [createRequestVersion, openCreateForm]);

  useEffect(() => {
    if (formMode === 'create' && !courseId && !formCourseId && courses.length > 0) {
      setFormCourseId(
        courseFilter !== 'all' ? courseFilter : courses[0].id
      );
    }
  }, [formMode, courseId, formCourseId, courses, courseFilter]);

  function handleStartEdit(task: TaskWithCourse): void {
    setFormMode('edit');
    setEditingTaskId(task.id);
    setFormTitle(task.title);
    setFormCourseId(task.courseId);
    setFormDescription(task.description);
    setFormDueDate(task.dueDate ?? '');
    setFormPriority(task.priority ?? '');
    setFormError(null);
  }

  function handleCancelForm(): void {
    setFormMode('closed');
    setEditingTaskId(null);
    setFormError(null);
  }

  async function handleSubmitForm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setFormError('El título de la tarea es obligatorio.');
      return;
    }

    const targetCourseId = courseId ?? formCourseId;
    if (!targetCourseId) {
      setFormError('Seleccioná una materia para la tarea.');
      return;
    }

    const normalizedDueDate = formDueDate.trim() ? formDueDate.trim() : null;
    const normalizedPriority: TaskPriority | null =
      formPriority === '' ? null : formPriority;

    try {
      if (formMode === 'create') {
        await cursadaClient.createTask({
          courseId: targetCourseId,
          title: trimmedTitle,
          description: formDescription.trim(),
          dueDate: normalizedDueDate,
          priority: normalizedPriority,
        });
      } else if (formMode === 'edit' && editingTaskId) {
        await cursadaClient.updateTask(editingTaskId, {
          courseId: targetCourseId,
          title: trimmedTitle,
          description: formDescription.trim(),
          dueDate: normalizedDueDate,
          priority: normalizedPriority,
        });
      }

      setFormMode('closed');
      setEditingTaskId(null);
      await loadData();
      onTasksChanged?.();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo guardar la tarea.'
      );
    }
  }

  async function handleToggle(taskId: string): Promise<void> {
    await cursadaClient.toggleTaskStatus(taskId);
    await loadData();
    onTasksChanged?.();
  }

  async function handleDelete(taskId: string): Promise<void> {
    await cursadaClient.deleteTask(taskId);
    if (editingTaskId === taskId) {
      handleCancelForm();
    }
    await loadData();
    onTasksChanged?.();
  }

  return (
    <section className="surface-panel task-list-panel" aria-label="Lista de tareas">
      <div className="task-list-toolbar">
        <div
          className="task-status-segmented"
          role="group"
          aria-label="Filtrar por estado"
        >
          <button
            type="button"
            className={`task-filter-pill ${statusFilter === 'pending' ? 'is-active' : ''}`}
            aria-pressed={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
          >
            Pendientes
          </button>
          <button
            type="button"
            className={`task-filter-pill ${statusFilter === 'done' ? 'is-active' : ''}`}
            aria-pressed={statusFilter === 'done'}
            onClick={() => setStatusFilter('done')}
          >
            Completadas
          </button>
          <button
            type="button"
            className={`task-filter-pill ${statusFilter === 'all' ? 'is-active' : ''}`}
            aria-pressed={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          >
            Todas
          </button>
        </div>

        <div className="task-toolbar-right">
          {!courseId ? (
            <div className="task-course-filter-field">
              <label htmlFor="task-course-filter" className="visually-hidden">
                Filtrar por materia
              </label>
              <select
                id="task-course-filter"
                className="task-select"
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
              >
                <option value="all">Todas las materias</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {showCreateButton ? (
            <button
              type="button"
              className="primary-button"
              onClick={openCreateForm}
            >
              Nueva tarea
            </button>
          ) : null}
        </div>
      </div>

      {formMode !== 'closed' ? (
        <form
          className="task-editor-form"
          aria-label={formMode === 'create' ? 'Nueva tarea' : 'Editar tarea'}
          onSubmit={(e) => void handleSubmitForm(e)}
        >
          <div className="task-editor-header">
            <h3 className="task-editor-title">
              {formMode === 'create' ? 'Nueva tarea' : 'Editar tarea'}
            </h3>
          </div>

          {formError ? (
            <div role="alert" className="task-form-error">
              {formError}
            </div>
          ) : null}

          <div className="task-editor-grid">
            <div className="task-form-field is-wide">
              <label htmlFor="task-form-title" className="task-form-label">
                Título
              </label>
              <input
                id="task-form-title"
                type="text"
                className="task-input"
                placeholder="Ej. Entregar informe de laboratorio"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            {!courseId ? (
              <div className="task-form-field">
                <label htmlFor="task-form-course" className="task-form-label">
                  Materia
                </label>
                <select
                  id="task-form-course"
                  className="task-select"
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="task-form-field">
              <label htmlFor="task-form-due-date" className="task-form-label">
                Fecha de entrega
              </label>
              <input
                id="task-form-due-date"
                type="date"
                className="task-input"
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
              />
            </div>

            <div className="task-form-field">
              <label htmlFor="task-form-priority" className="task-form-label">
                Prioridad
              </label>
              <select
                id="task-form-priority"
                className="task-select"
                value={formPriority}
                onChange={(e) =>
                  setFormPriority(e.target.value as TaskPriority | '')
                }
              >
                <option value="">Sin prioridad</option>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
              </select>
            </div>

            <div className="task-form-field is-full">
              <label htmlFor="task-form-description" className="task-form-label">
                Descripción
              </label>
              <textarea
                id="task-form-description"
                className="task-textarea"
                rows={2}
                placeholder="Notas o consignas adicionales (opcional)"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="task-editor-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleCancelForm}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button">
              {formMode === 'create' ? 'Guardar tarea' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      ) : null}

      {tasks.length === 0 ? (
        <div className="task-empty-state">
          <p className="task-empty-title">No hay tareas para mostrar</p>
          <p className="task-empty-subtitle">
            Probá cambiando los filtros o creá una nueva tarea para hacer seguimiento de tus entregas.
          </p>
        </div>
      ) : (
        <div className="task-checklist">
          {tasks.map((task) => {
            const checkboxId = `task-list-item-${task.id}`;
            const isCompleted = task.status === 'done';
            const dueBadge = getTaskDueBadgeInfo(task);
            const priorityBadge = getPriorityBadgeInfo(task.priority);

            return (
              <div
                key={task.id}
                className={`task-row ${isCompleted ? 'is-completed' : ''} ${
                  dueBadge.isOverdue ? 'is-overdue' : ''
                }`}
                data-course-color={task.courseColor}
              >
                <div className="task-row-main">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    className="task-checkbox"
                    checked={isCompleted}
                    onChange={() => void handleToggle(task.id)}
                  />
                  <div className="task-row-text">
                    <label htmlFor={checkboxId} className="task-title-label">
                      {task.title}
                    </label>
                    {task.description ? (
                      <p className="task-description-text">{task.description}</p>
                    ) : null}
                  </div>
                </div>

                <div className="task-row-meta">
                  {priorityBadge ? (
                    <span className={priorityBadge.className}>
                      {priorityBadge.label}
                    </span>
                  ) : null}

                  {!courseId ? (
                    <button
                      type="button"
                      className="inline-course-link"
                      onClick={() => onSelectCourse?.(task.courseId)}
                    >
                      <span
                        className="course-pill"
                        data-course-color={task.courseColor}
                      >
                        <span
                          className="course-dot"
                          data-course-color={task.courseColor}
                          aria-hidden="true"
                        />
                        {task.courseName}
                      </span>
                    </button>
                  ) : null}

                  <span className={dueBadge.className}>{dueBadge.label}</span>

                  <div className="task-row-actions">
                    <button
                      type="button"
                      className="ghost-action-button task-action-btn"
                      aria-label={`Editar ${task.title}`}
                      onClick={() => handleStartEdit(task)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ghost-action-button task-action-btn is-danger"
                      aria-label={`Eliminar ${task.title}`}
                      onClick={() => void handleDelete(task.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
