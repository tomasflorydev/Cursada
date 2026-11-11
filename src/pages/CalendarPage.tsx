import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatShortSpanishDate } from '../components/tasks/TaskList';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  addWeeks,
  formatWeekRangeEs,
  getWeekDaysMondayToSunday,
  timeToMinutes,
} from '../lib/dates';
import type {
  CourseColor,
  CourseWithSchedules,
  DayOfWeek,
  TaskPriority,
  TaskWithCourse,
} from '../types/domain';

export interface CalendarPageProps {
  onSelectCourse: (courseId: string | null) => void;
  initialDate?: Date;
}

interface CalendarClassBlock {
  scheduleId: string;
  courseId: string;
  courseName: string;
  courseColor: CourseColor;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location: string;
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export function CalendarPage({
  onSelectCourse,
  initialDate,
}: CalendarPageProps) {
  const dialogTitleId = useId();
  const taskDialogRef = useRef<HTMLDialogElement | null>(null);

  const [referenceDate, setReferenceDate] = useState<Date>(
    () => initialDate ?? new Date()
  );
  const [activeCourses, setActiveCourses] = useState<CourseWithSchedules[]>([]);
  const [weekTasks, setWeekTasks] = useState<TaskWithCourse[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const weekDays = useMemo(
    () => getWeekDaysMondayToSunday(referenceDate),
    [referenceDate]
  );

  const weekStartIso = weekDays[0].dateIso;
  const weekEndIso = weekDays[6].dateIso;

  const loadCalendarData = useCallback(async () => {
    const [loadedCourses, loadedTasks] = await Promise.all([
      cursadaClient.listCourses({ status: 'active' }),
      cursadaClient.listTasks({ dueFrom: weekStartIso, dueTo: weekEndIso }),
    ]);
    setActiveCourses(loadedCourses);
    setWeekTasks(loadedTasks);
  }, [weekStartIso, weekEndIso]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      cursadaClient.listCourses({ status: 'active' }),
      cursadaClient.listTasks({ dueFrom: weekStartIso, dueTo: weekEndIso }),
    ]).then(([loadedCourses, loadedTasks]) => {
      if (!active) return;
      setActiveCourses(loadedCourses);
      setWeekTasks(loadedTasks);
    });

    const handleDataChanged = () => {
      if (!active) return;
      void loadCalendarData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadCalendarData, weekStartIso, weekEndIso]);

  const selectedTask = useMemo(
    () => weekTasks.find((t) => t.id === selectedTaskId) ?? null,
    [weekTasks, selectedTaskId]
  );

  useEffect(() => {
    const dialog = taskDialogRef.current;
    if (!dialog) return;

    if (selectedTask) {
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
  }, [selectedTask]);

  const weekRangeLabel = useMemo(
    () => formatWeekRangeEs(referenceDate),
    [referenceDate]
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskWithCourse[]>();
    for (const day of weekDays) {
      map.set(day.dateIso, []);
    }
    for (const task of weekTasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate);
      if (list) {
        list.push(task);
      }
    }
    return map;
  }, [weekDays, weekTasks]);

  const blocksByDay = useMemo(() => {
    const map = new Map<DayOfWeek, CalendarClassBlock[]>([
      [1, []],
      [2, []],
      [3, []],
      [4, []],
      [5, []],
      [6, []],
      [7, []],
    ]);

    for (const course of activeCourses) {
      for (const sched of course.schedules) {
        const list = map.get(sched.dayOfWeek);
        if (list) {
          list.push({
            scheduleId: sched.id,
            courseId: course.id,
            courseName: course.name,
            courseColor: course.color,
            dayOfWeek: sched.dayOfWeek,
            startTime: sched.startTime,
            endTime: sched.endTime,
            location: sched.location,
          });
        }
      }
    }

    for (const [day, list] of map.entries()) {
      list.sort((a, b) => {
        const diff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        if (diff !== 0) {
          return diff;
        }
        return a.courseName.localeCompare(b.courseName);
      });
      map.set(day, list);
    }

    return map;
  }, [activeCourses]);

  function handlePrevWeek(): void {
    setReferenceDate((prev) => addWeeks(prev, -1));
  }

  function handleNextWeek(): void {
    setReferenceDate((prev) => addWeeks(prev, 1));
  }

  function handleToday(): void {
    setReferenceDate(initialDate ?? new Date());
  }

  async function handleToggleTask(taskId: string): Promise<void> {
    await cursadaClient.toggleTaskStatus(taskId);
    await loadCalendarData();
  }

  function handleCloseTaskDialog(): void {
    const dialog = taskDialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
    setSelectedTaskId(null);
  }

  return (
    <div className="basic-view calendar-page-view">
      <header className="page-header">
        <div className="page-header-titles">
          <div className="page-date-row">
            <span className="page-date-text" data-testid="calendar-week-range">
              {weekRangeLabel}
            </span>
            <span className="page-week-pill">Lunes a Domingo</span>
          </div>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Calendario
          </h1>
          <p className="page-subtitle">
            Horario semanal de cursada y entregas de la semana. Hacé clic en una clase para ir a su
            materia o marcá y abrí tus entregas directamente desde cada día.
          </p>
        </div>

        <div className="basic-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handlePrevWeek}
          >
            Semana anterior
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleToday}
          >
            Hoy
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleNextWeek}
          >
            Semana siguiente
          </button>
        </div>
      </header>

      <section
        className="surface-panel calendar-skeleton-panel calendar-week-grid-panel"
        aria-label="Grilla semanal de cursada"
      >
        <div className="calendar-skeleton-header">
          {weekDays.map((day) => {
            const dayTasks = tasksByDate.get(day.dateIso) ?? [];
            return (
              <div
                key={day.dateIso}
                className={`calendar-col-head ${day.isToday ? 'is-today' : ''}`}
                data-date={day.dateIso}
              >
                <div className="calendar-col-head-top">
                  <span className="week-day-short" title={day.dayName}>
                    {day.dayShort}
                  </span>
                  <span className="week-day-num">{day.dayNumber}</span>
                </div>
                {dayTasks.length > 0 ? (
                  <span className="calendar-col-tasks-count">
                    {dayTasks.length} {dayTasks.length === 1 ? 'entrega' : 'entregas'}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="calendar-skeleton-body">
          {weekDays.map((day) => {
            const dayBlocks = blocksByDay.get(day.dayOfWeek) ?? [];
            const dayTasks = tasksByDate.get(day.dateIso) ?? [];
            const emptyLabel =
              day.dayOfWeek === 6
                ? 'Sábado libre'
                : day.dayOfWeek === 7
                  ? 'Domingo libre'
                  : 'Sin clases';

            return (
              <div
                key={day.dateIso}
                className={`calendar-day-col ${day.isToday ? 'is-today' : ''}`}
                data-date={day.dateIso}
                data-day-of-week={day.dayOfWeek}
              >
                {dayTasks.length > 0 ? (
                  <div
                    className="calendar-day-tasks-overlay"
                    data-testid={`calendar-tasks-${day.dateIso}`}
                    aria-label={`Entregas del ${day.dayName} ${day.dayNumber}`}
                  >
                    {dayTasks.map((task) => {
                      const isCompleted = task.status === 'done';
                      return (
                        <div
                          key={task.id}
                          className={`calendar-task-card ${isCompleted ? 'is-completed' : ''}`}
                          data-course-color={task.courseColor}
                          data-task-id={task.id}
                          data-status={task.status}
                        >
                          <div className="calendar-task-card-header">
                            <input
                              type="checkbox"
                              className="calendar-task-checkbox"
                              checked={isCompleted}
                              aria-label={`Marcar entrega ${task.title}`}
                              onChange={() => void handleToggleTask(task.id)}
                            />
                            <span
                              className={`calendar-task-status-badge ${
                                isCompleted ? 'is-done' : 'is-pending'
                              }`}
                            >
                              {isCompleted ? 'Completada' : 'Entrega'}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="calendar-task-title-btn"
                            onClick={() => setSelectedTaskId(task.id)}
                          >
                            {task.title}
                          </button>

                          <div className="calendar-task-course-row">
                            <span
                              className="course-dot"
                              data-course-color={task.courseColor}
                              aria-hidden="true"
                            />
                            <span className="calendar-task-course-name">
                              {task.courseName}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {dayBlocks.length === 0 ? (
                  <span className="calendar-empty-slot">{emptyLabel}</span>
                ) : (
                  dayBlocks.map((block) => (
                    <button
                      key={block.scheduleId}
                      type="button"
                      className="calendar-block calendar-block-button"
                      data-course-color={block.courseColor}
                      data-course-id={block.courseId}
                      onClick={() => onSelectCourse(block.courseId)}
                    >
                      <span className="calendar-block-time">
                        {block.startTime} – {block.endTime}
                      </span>
                      <strong className="calendar-block-title">
                        {block.courseName}
                      </strong>
                      {block.location ? (
                        <span className="calendar-block-location">
                          {block.location}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div
        className="calendar-legend"
        role="list"
        aria-label="Referencias de materias activas"
      >
        {activeCourses.map((c) => (
          <button
            key={c.id}
            type="button"
            role="listitem"
            className="course-pill calendar-legend-pill"
            data-course-color={c.color}
            onClick={() => onSelectCourse(c.id)}
          >
            <span
              className="course-dot"
              data-course-color={c.color}
              aria-hidden="true"
            />
            {c.name}
          </button>
        ))}
      </div>

      <dialog
        ref={taskDialogRef}
        className="cursada-modal-dialog cursada-confirm-dialog calendar-task-dialog"
        aria-labelledby={dialogTitleId}
        onClose={() => setSelectedTaskId(null)}
      >
        {selectedTask ? (
          <div className="cursada-modal-content" data-course-color={selectedTask.courseColor}>
            <div className="cursada-modal-header">
              <span className="course-pill" data-course-color={selectedTask.courseColor}>
                <span
                  className="course-dot"
                  data-course-color={selectedTask.courseColor}
                  aria-hidden="true"
                />
                {selectedTask.courseName}
              </span>
              <span
                className={`task-due-badge ${
                  selectedTask.status === 'done' ? 'is-done' : 'urgency-today'
                }`}
              >
                {selectedTask.status === 'done' ? 'Completada' : 'Pendiente'}
              </span>
            </div>

            <div className="calendar-task-dialog-body">
              <h2 id={dialogTitleId} className="cursada-modal-title">
                {selectedTask.title}
              </h2>

              {selectedTask.description ? (
                <p className="calendar-task-dialog-desc">{selectedTask.description}</p>
              ) : null}

              <dl className="course-meta-list">
                <div className="course-meta-row">
                  <dt className="course-detail-label">Fecha de entrega</dt>
                  <dd className="course-detail-value">
                    {selectedTask.dueDate
                      ? formatShortSpanishDate(selectedTask.dueDate)
                      : 'Sin fecha'}
                  </dd>
                </div>
                {selectedTask.priority ? (
                  <div className="course-meta-row">
                    <dt className="course-detail-label">Prioridad</dt>
                    <dd className="course-detail-value">
                      {PRIORITY_LABELS[selectedTask.priority]}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="cursada-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handleCloseTaskDialog}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const targetCourseId = selectedTask.courseId;
                  handleCloseTaskDialog();
                  onSelectCourse(targetCourseId);
                }}
              >
                Ir a {selectedTask.courseName}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleToggleTask(selectedTask.id)}
              >
                {selectedTask.status === 'done'
                  ? 'Marcar como pendiente'
                  : 'Marcar como completada'}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
