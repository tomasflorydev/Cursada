import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  EXAM_CATEGORY_LABELS,
  formatExamDateLabel,
} from '../components/exams/ExamList';
import { formatShortSpanishDate } from '../components/tasks/TaskList';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  addMonths,
  addWeeks,
  DAY_SHORT_NAMES_ES,
  formatMonthYearEs,
  formatWeekRangeEs,
  getMonthCalendarGrid,
  getWeekDaysMondayToSunday,
  timeToMinutes,
} from '../lib/dates';
import type {
  CourseColor,
  CourseWithSchedules,
  DayOfWeek,
  ExamWithCourse,
  TaskPriority,
  TaskWithCourse,
} from '../types/domain';

export interface CalendarPageProps {
  onSelectCourse: (courseId: string | null) => void;
  initialDate?: Date;
  initialViewMode?: 'month' | 'week';
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

const WEEKDAY_ORDER: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

export function CalendarPage({
  onSelectCourse,
  initialDate,
  initialViewMode = 'month',
}: CalendarPageProps) {
  const dialogTitleId = useId();
  const detailDialogRef = useRef<HTMLDialogElement | null>(null);

  const [viewMode, setViewMode] = useState<'month' | 'week'>(initialViewMode);
  const [referenceDate, setReferenceDate] = useState<Date>(
    () => initialDate ?? new Date()
  );
  const [activeCourses, setActiveCourses] = useState<CourseWithSchedules[]>([]);
  const [periodTasks, setPeriodTasks] = useState<TaskWithCourse[]>([]);
  const [periodExams, setPeriodExams] = useState<ExamWithCourse[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  const monthDays = useMemo(
    () => getMonthCalendarGrid(referenceDate),
    [referenceDate]
  );

  const weekDays = useMemo(
    () => getWeekDaysMondayToSunday(referenceDate),
    [referenceDate]
  );

  const visibleDays = viewMode === 'month' ? monthDays : weekDays;
  const periodStartIso = visibleDays[0].dateIso;
  const periodEndIso = visibleDays[visibleDays.length - 1].dateIso;

  const loadCalendarData = useCallback(async () => {
    const [loadedCourses, loadedTasks, loadedExams] = await Promise.all([
      cursadaClient.listCourses({ status: 'active' }),
      cursadaClient.listTasks({ dueFrom: periodStartIso, dueTo: periodEndIso }),
      cursadaClient.listExams({ dateFrom: periodStartIso, dateTo: periodEndIso }),
    ]);
    setActiveCourses(loadedCourses);
    setPeriodTasks(loadedTasks);
    setPeriodExams(loadedExams);
  }, [periodStartIso, periodEndIso]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      cursadaClient.listCourses({ status: 'active' }),
      cursadaClient.listTasks({ dueFrom: periodStartIso, dueTo: periodEndIso }),
      cursadaClient.listExams({ dateFrom: periodStartIso, dateTo: periodEndIso }),
    ]).then(([loadedCourses, loadedTasks, loadedExams]) => {
      if (!active) return;
      setActiveCourses(loadedCourses);
      setPeriodTasks(loadedTasks);
      setPeriodExams(loadedExams);
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
  }, [loadCalendarData, periodStartIso, periodEndIso]);

  const selectedTask = useMemo(
    () => periodTasks.find((t) => t.id === selectedTaskId) ?? null,
    [periodTasks, selectedTaskId]
  );

  const selectedExam = useMemo(
    () => periodExams.find((e) => e.id === selectedExamId) ?? null,
    [periodExams, selectedExamId]
  );

  const isDialogOpen = Boolean(selectedTask || selectedExam);

  useEffect(() => {
    const dialog = detailDialogRef.current;
    if (!dialog) return;

    if (isDialogOpen) {
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
  }, [isDialogOpen]);

  const monthLabel = useMemo(
    () => `${formatMonthYearEs(referenceDate)} · Vista mensual`,
    [referenceDate]
  );

  const weekRangeLabel = useMemo(
    () => formatWeekRangeEs(referenceDate),
    [referenceDate]
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskWithCourse[]>();
    for (const day of visibleDays) {
      map.set(day.dateIso, []);
    }
    for (const task of periodTasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate);
      if (list) {
        list.push(task);
      }
    }
    return map;
  }, [visibleDays, periodTasks]);

  const examsByDate = useMemo(() => {
    const map = new Map<string, ExamWithCourse[]>();
    for (const day of visibleDays) {
      map.set(day.dateIso, []);
    }
    for (const exam of periodExams) {
      const list = map.get(exam.examDate);
      if (list) {
        list.push(exam);
      }
    }
    return map;
  }, [visibleDays, periodExams]);

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

  function handlePrev(): void {
    setReferenceDate((prev) =>
      viewMode === 'month' ? addMonths(prev, -1) : addWeeks(prev, -1)
    );
  }

  function handleNext(): void {
    setReferenceDate((prev) =>
      viewMode === 'month' ? addMonths(prev, 1) : addWeeks(prev, 1)
    );
  }

  function handleToday(): void {
    setReferenceDate(initialDate ?? new Date());
  }

  async function handleToggleTask(taskId: string): Promise<void> {
    await cursadaClient.toggleTaskStatus(taskId);
    await loadCalendarData();
  }

  function handleCloseDetailDialog(): void {
    const dialog = detailDialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
    setSelectedTaskId(null);
    setSelectedExamId(null);
  }

  function renderDayExamsOverlay(dayExams: ExamWithCourse[], dateIso: string) {
    if (dayExams.length === 0) return null;
    return (
      <div
        className="calendar-day-exams-overlay"
        data-testid={`calendar-exams-${dateIso}`}
      >
        {dayExams.map((exam) => (
          <button
            key={exam.id}
            type="button"
            className="calendar-exam-card"
            data-course-color={exam.courseColor}
            data-exam-id={exam.id}
            title={`${EXAM_CATEGORY_LABELS[exam.category]} · ${exam.title} (${exam.courseName})`}
            onClick={() => {
              setSelectedTaskId(null);
              setSelectedExamId(exam.id);
            }}
          >
            <span className="calendar-exam-badge">
              {EXAM_CATEGORY_LABELS[exam.category]}
              {exam.examTime ? ` · ${exam.examTime}` : ''}
            </span>
            <strong className="calendar-exam-title">{exam.title}</strong>
          </button>
        ))}
      </div>
    );
  }

  function renderDayTasksOverlay(
    dayTasks: TaskWithCourse[],
    dateIso: string,
    dayName: string,
    dayNumber: string
  ) {
    if (dayTasks.length === 0) return null;
    return (
      <div
        className="calendar-day-tasks-overlay"
        data-testid={`calendar-tasks-${dateIso}`}
        aria-label={`Entregas del ${dayName} ${dayNumber}`}
      >
        {dayTasks.map((task) => {
          const isCompleted = task.status === 'done';
          return (
            <div
              key={task.id}
              className={`calendar-task-card is-compact ${
                isCompleted ? 'is-completed' : ''
              }`}
              data-course-color={task.courseColor}
              data-task-id={task.id}
              data-status={task.status}
            >
              <input
                type="checkbox"
                className="calendar-task-checkbox"
                checked={isCompleted}
                aria-label={`Marcar entrega ${task.title}`}
                onChange={() => void handleToggleTask(task.id)}
              />
              <button
                type="button"
                className="calendar-task-title-btn"
                title={`${task.title} (${task.courseName})`}
                onClick={() => {
                  setSelectedExamId(null);
                  setSelectedTaskId(task.id);
                }}
              >
                {task.title}
              </button>
              <span className="visually-hidden">
                {isCompleted ? 'Completada' : 'Entrega'}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="basic-view calendar-page-view">
      <header className="page-header">
        <div className="page-header-titles">
          <div className="page-date-row">
            <span className="page-date-text" data-testid="calendar-period-label">
              {viewMode === 'month' ? monthLabel : weekRangeLabel}
            </span>
            <span
              className="page-week-pill"
              data-testid="calendar-week-range"
              title={weekRangeLabel}
            >
              {viewMode === 'month' ? formatMonthYearEs(referenceDate) : weekRangeLabel}
            </span>
          </div>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Calendario
          </h1>
          <p className="page-subtitle">
            {viewMode === 'month'
              ? 'Vista mensual de cursada, entregas y exámenes. Hacé clic en una clase para ir a su materia o abrí cada entrega o examen para ver su detalle.'
              : 'Vista semanal detallada de bloques horarios, entregas y exámenes de Lunes a Domingo.'}
          </p>
        </div>

        <div className="basic-header-actions calendar-header-controls">
          <div
            className="task-status-segmented"
            role="group"
            aria-label="Modo de vista del calendario"
          >
            <button
              type="button"
              className={`task-filter-pill ${viewMode === 'month' ? 'is-active' : ''}`}
              aria-pressed={viewMode === 'month'}
              onClick={() => setViewMode('month')}
            >
              Mensual
            </button>
            <button
              type="button"
              className={`task-filter-pill ${viewMode === 'week' ? 'is-active' : ''}`}
              aria-pressed={viewMode === 'week'}
              onClick={() => setViewMode('week')}
            >
              Semanal
            </button>
          </div>

          <div className="basic-header-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handlePrev}
            >
              {viewMode === 'month' ? 'Mes anterior' : 'Semana anterior'}
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
              onClick={handleNext}
            >
              {viewMode === 'month' ? 'Mes siguiente' : 'Semana siguiente'}
            </button>
          </div>
        </div>
      </header>

      {viewMode === 'month' ? (
        <section
          className="surface-panel calendar-skeleton-panel calendar-month-panel"
          aria-label="Calendario mensual de cursada"
        >
          <div className="calendar-skeleton-header calendar-month-weekdays">
            {WEEKDAY_ORDER.map((dayOfWeek) => (
              <div key={dayOfWeek} className="calendar-col-head calendar-month-weekday-head">
                <span className="week-day-short">{DAY_SHORT_NAMES_ES[dayOfWeek]}</span>
              </div>
            ))}
          </div>

          <div className="calendar-month-grid">
            {monthDays.map((day) => {
              const dayBlocks = day.isCurrentMonth
                ? (blocksByDay.get(day.dayOfWeek) ?? [])
                : [];
              const dayTasks = tasksByDate.get(day.dateIso) ?? [];
              const dayExams = examsByDate.get(day.dateIso) ?? [];

              return (
                <div
                  key={day.dateIso}
                  className={`calendar-day-col calendar-month-cell ${
                    day.isToday ? 'is-today' : ''
                  } ${!day.isCurrentMonth ? 'is-outside-month' : ''} ${
                    dayExams.length > 0 ? 'has-exam' : ''
                  }`}
                  data-date={day.dateIso}
                  data-day-of-week={day.dayOfWeek}
                >
                  <div className="calendar-month-cell-header">
                    <span
                      className={`calendar-month-day-number ${
                        day.isToday ? 'is-today' : ''
                      }`}
                    >
                      {Number(day.dayNumber)}
                    </span>
                    <div className="calendar-month-cell-dots" aria-hidden="true">
                      {dayExams.length > 0 ? (
                        <span className="pulse-dot is-exam" title="Examen" />
                      ) : null}
                      {dayTasks.length > 0 ? (
                        <span className="pulse-dot is-task" title="Entrega" />
                      ) : null}
                    </div>
                  </div>

                  {renderDayExamsOverlay(dayExams, day.dateIso)}
                  {renderDayTasksOverlay(
                    dayTasks,
                    day.dateIso,
                    day.dayName,
                    day.dayNumber
                  )}

                  {dayBlocks.length > 0 ? (
                    <div className="calendar-month-classes-stack">
                      {dayBlocks.map((block) => (
                        <button
                          key={`${day.dateIso}-${block.scheduleId}`}
                          type="button"
                          className="calendar-block calendar-block-button calendar-block-compact"
                          data-course-color={block.courseColor}
                          data-course-id={block.courseId}
                          title={`${block.courseName} · ${block.startTime}–${block.endTime}${
                            block.location ? ` · ${block.location}` : ''
                          }`}
                          onClick={() => onSelectCourse(block.courseId)}
                        >
                          <span className="calendar-block-time">{block.startTime}</span>
                          <strong className="calendar-block-title">
                            {block.courseName}
                          </strong>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section
          className="surface-panel calendar-skeleton-panel calendar-week-grid-panel"
          aria-label="Grilla semanal de cursada"
        >
          <div className="calendar-skeleton-header">
            {weekDays.map((day) => (
              <div
                key={day.dateIso}
                className={`calendar-col-head ${day.isToday ? 'is-today' : ''}`}
                data-date={day.dateIso}
              >
                <span className="week-day-short" title={day.dayName}>
                  {day.dayShort}
                </span>
                <span className="week-day-num">{day.dayNumber}</span>
              </div>
            ))}
          </div>

          <div className="calendar-skeleton-body">
            {weekDays.map((day) => {
              const dayBlocks = blocksByDay.get(day.dayOfWeek) ?? [];
              const dayTasks = tasksByDate.get(day.dateIso) ?? [];
              const dayExams = examsByDate.get(day.dateIso) ?? [];
              const emptyLabel =
                day.dayOfWeek === 6
                  ? 'Sábado libre'
                  : day.dayOfWeek === 7
                    ? 'Domingo libre'
                    : 'Sin clases';

              return (
                <div
                  key={day.dateIso}
                  className={`calendar-day-col ${day.isToday ? 'is-today' : ''} ${
                    dayExams.length > 0 ? 'has-exam' : ''
                  }`}
                  data-date={day.dateIso}
                  data-day-of-week={day.dayOfWeek}
                >
                  {renderDayExamsOverlay(dayExams, day.dateIso)}
                  {renderDayTasksOverlay(
                    dayTasks,
                    day.dateIso,
                    day.dayName,
                    day.dayNumber
                  )}

                  {dayBlocks.length === 0 &&
                  dayTasks.length === 0 &&
                  dayExams.length === 0 ? (
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
      )}

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
        ref={detailDialogRef}
        className="cursada-modal-dialog cursada-confirm-dialog calendar-task-dialog"
        aria-labelledby={dialogTitleId}
        onClose={() => {
          setSelectedTaskId(null);
          setSelectedExamId(null);
        }}
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
                onClick={handleCloseDetailDialog}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const targetCourseId = selectedTask.courseId;
                  handleCloseDetailDialog();
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
        ) : selectedExam ? (
          <div className="cursada-modal-content" data-course-color={selectedExam.courseColor}>
            <div className="cursada-modal-header">
              <span className="course-pill" data-course-color={selectedExam.courseColor}>
                <span
                  className="course-dot"
                  data-course-color={selectedExam.courseColor}
                  aria-hidden="true"
                />
                {selectedExam.courseName}
              </span>
              <span className="task-due-badge urgency-tomorrow">
                {EXAM_CATEGORY_LABELS[selectedExam.category]}
                {selectedExam.grade !== null
                  ? ` · Nota ${selectedExam.grade.toFixed(1)}`
                  : ''}
              </span>
            </div>

            <div className="calendar-task-dialog-body">
              <h2 id={dialogTitleId} className="cursada-modal-title">
                {selectedExam.title}
              </h2>

              {selectedExam.topics ? (
                <p className="calendar-task-dialog-desc">{selectedExam.topics}</p>
              ) : null}

              <dl className="course-meta-list">
                <div className="course-meta-row">
                  <dt className="course-detail-label">Fecha y horario</dt>
                  <dd className="course-detail-value">
                    {formatExamDateLabel(selectedExam.examDate)}
                    {selectedExam.examTime ? ` · ${selectedExam.examTime}` : ''}
                  </dd>
                </div>
                {selectedExam.location ? (
                  <div className="course-meta-row">
                    <dt className="course-detail-label">Aula / Modalidad</dt>
                    <dd className="course-detail-value">{selectedExam.location}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="cursada-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handleCloseDetailDialog}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const targetCourseId = selectedExam.courseId;
                  handleCloseDetailDialog();
                  onSelectCourse(targetCourseId);
                }}
              >
                Ir a {selectedExam.courseName}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
