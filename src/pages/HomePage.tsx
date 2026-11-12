import { useCallback, useEffect, useMemo, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  DAY_SHORT_NAMES_ES,
  formatWeekRangeEs,
  getWeekDaysMondayToSunday,
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../lib/dates';
import { CURRENT_WEEK_LABEL } from '../lib/sampleData';
import type {
  CourseWithSchedules,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  NavSectionId,
  TaskWithCourse,
  WeekDayPulse,
} from '../types';

export interface HomePageProps {
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
  referenceDate?: Date;
}

const DEFAULT_REFERENCE_DATE = new Date(2026, 10, 10);

const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'Entrega TP',
};

const FULL_WEEKDAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const FULL_MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function formatFullSpanishDate(date: Date): string {
  const dayName = FULL_WEEKDAY_NAMES[date.getDay()];
  const dayNum = date.getDate();
  const monthName = FULL_MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `${dayName}, ${dayNum} de ${monthName} de ${year}`;
}

function diffCalendarDays(targetIso: string, refIso: string): number {
  const target = parseIsoDateLocal(targetIso);
  const ref = parseIsoDateLocal(refIso);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - ref.getTime()) / msPerDay);
}

function formatShortDateEs(isoDate: string): string {
  const d = parseIsoDateLocal(isoDate);
  const jsDay = d.getDay();
  const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const dayShort = DAY_SHORT_NAMES_ES[dayOfWeek];
  const dayNum = String(d.getDate()).padStart(2, '0');
  const monthShort = MONTH_SHORT_NAMES_ES[d.getMonth()] ?? '';
  return `${dayShort} ${dayNum} ${monthShort}`;
}

function getTaskDuePresentation(
  dueDate: string | null,
  status: 'pending' | 'done',
  refIso: string
): { dueLabel: string; urgency: 'today' | 'soon' | 'normal' } {
  if (status === 'done') {
    return { dueLabel: 'Completada', urgency: 'normal' };
  }
  if (!dueDate) {
    return { dueLabel: 'Sin fecha', urgency: 'normal' };
  }
  const diff = diffCalendarDays(dueDate, refIso);
  if (diff < 0) {
    return { dueLabel: `Venció (${formatShortDateEs(dueDate)})`, urgency: 'today' };
  }
  if (diff === 0) {
    return { dueLabel: 'Vence hoy', urgency: 'today' };
  }
  if (diff === 1) {
    return { dueLabel: 'Mañana', urgency: 'soon' };
  }
  if (diff <= 4) {
    return { dueLabel: formatShortDateEs(dueDate), urgency: 'soon' };
  }
  return { dueLabel: formatShortDateEs(dueDate), urgency: 'normal' };
}

function buildDayPulseSummary(
  classesCount: number,
  tasksCount: number,
  examsCount: number
): string {
  const parts: string[] = [];
  if (examsCount > 0) {
    parts.push(examsCount === 1 ? '1 examen' : `${examsCount} exámenes`);
  }
  if (classesCount > 0 && examsCount === 0) {
    parts.push(classesCount === 1 ? '1 clase' : `${classesCount} clases`);
  } else if (classesCount > 0 && tasksCount === 0) {
    parts.unshift(classesCount === 1 ? '1 clase' : `${classesCount} clases`);
  }
  if (tasksCount > 0) {
    parts.push(tasksCount === 1 ? '1 entrega' : `${tasksCount} entregas`);
  }
  if (parts.length === 0) {
    return 'Libre';
  }
  return parts.join(' · ');
}

export function HomePage({
  onNavigateSection,
  onSelectCourse,
  referenceDate = DEFAULT_REFERENCE_DATE,
}: HomePageProps) {
  const [tasks, setTasks] = useState<TaskWithCourse[]>([]);
  const [exams, setExams] = useState<ExamWithCourse[]>([]);
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refIso = useMemo(() => toIsoDateString(referenceDate), [referenceDate]);

  const loadHomeData = useCallback(async () => {
    try {
      const [loadedTasks, loadedExams, loadedCourses] = await Promise.all([
        cursadaClient.listTasks({ status: 'all' }),
        cursadaClient.listExams({ graded: 'all' }),
        cursadaClient.listCourses({ status: 'active' }),
      ]);
      setTasks(loadedTasks);
      setExams(loadedExams);
      setCourses(loadedCourses);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHomeData();
    const handleDataChanged = () => {
      void loadHomeData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadHomeData]);

  async function handleToggleTask(taskId: string): Promise<void> {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, status: task.status === 'done' ? 'pending' : 'done' }
          : task
      )
    );
    await cursadaClient.toggleTaskStatus(taskId);
    await loadHomeData();
  }

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status === 'pending'),
    [tasks]
  );

  const visibleHomeTasks = useMemo(() => {
    return [...tasks]
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'pending' ? -1 : 1;
        }
        if (a.dueDate && b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      })
      .slice(0, 6);
  }, [tasks]);

  const upcomingExams = useMemo(() => {
    return exams
      .filter((exam) => exam.grade === null && exam.examDate >= refIso)
      .sort((a, b) => a.examDate.localeCompare(b.examDate));
  }, [exams, refIso]);

  const nextExamDaysLeft = useMemo(() => {
    if (upcomingExams.length === 0) {
      return null;
    }
    return Math.max(0, diffCalendarDays(upcomingExams[0].examDate, refIso));
  }, [upcomingExams, refIso]);

  const weekDays = useMemo(
    () => getWeekDaysMondayToSunday(referenceDate, referenceDate),
    [referenceDate]
  );

  const weekPulse: WeekDayPulse[] = useMemo(() => {
    return weekDays.map((day) => {
      const classesCount = courses.reduce((acc, course) => {
        const blocksToday = course.schedules.filter(
          (s) => s.dayOfWeek === day.dayOfWeek
        ).length;
        return acc + blocksToday;
      }, 0);

      const tasksCount = tasks.filter(
        (task) => task.dueDate === day.dateIso && task.status === 'pending'
      ).length;

      const examsToday = exams.filter((exam) => exam.examDate === day.dateIso);
      const hasExam = examsToday.length > 0;

      return {
        dayShort: day.dayShort,
        dayName: day.dayName,
        dayNumber: day.dayNumber,
        isToday: day.isToday,
        classesCount,
        tasksCount,
        hasExam,
        summary: buildDayPulseSummary(classesCount, tasksCount, examsToday.length),
      };
    });
  }, [weekDays, courses, tasks, exams]);

  const weekRangeLabel = useMemo(
    () => formatWeekRangeEs(referenceDate),
    [referenceDate]
  );

  return (
    <div className="home-page bento-airy-layout">
      {/* Header Bento */}
      <header className="bento-header">
        <div className="bento-header-titles">
          <div className="page-date-row">
            <span className="page-date-text">{formatFullSpanishDate(referenceDate)}</span>
            <span className="page-week-pill">{CURRENT_WEEK_LABEL}</span>
          </div>
          <h1 id="main-title" tabIndex={-1} className="bento-title">
            Inicio
          </h1>
          <p className="bento-subtitle" data-testid="home-summary-subtitle">
            Tenés <strong>{pendingTasks.length} entregas pendientes</strong>
            {nextExamDaysLeft !== null ? (
              <>
                {' '}
                y tu próximo examen es en <strong>{nextExamDaysLeft} días</strong>.
              </>
            ) : (
              <> y no tenés exámenes próximos agendados.</>
            )}
          </p>
        </div>
      </header>

      {/* Nivel 1: Columnas asimétricas (Tareas y Exámenes) con aire generoso */}
      <div className="bento-airy-columns">
        <section className="surface-panel" aria-label="Tareas por vencer">
          <div className="section-heading-bar">
            <div className="section-heading-left">
              <h2 className="section-title">Tareas por vencer</h2>
              <span className="section-counter" data-testid="home-pending-tasks-counter">
                {pendingTasks.length} pendientes
              </span>
            </div>
            <button
              type="button"
              className="ghost-action-button"
              onClick={() => onNavigateSection('tareas')}
            >
              Ver todas
            </button>
          </div>

          {!loading && visibleHomeTasks.length === 0 ? (
            <div className="empty-state-box">
              <p className="empty-state-title">Estás al día con tus entregas</p>
              <p className="empty-state-text">
                No hay tareas pendientes cargadas en este momento.
              </p>
            </div>
          ) : (
            <div className="task-checklist">
              {visibleHomeTasks.map((task) => {
                const isDone = task.status === 'done';
                const checkboxId = `bento-task-${task.id}`;
                const { dueLabel, urgency } = getTaskDuePresentation(
                  task.dueDate,
                  task.status,
                  refIso
                );
                return (
                  <div
                    key={task.id}
                    className={`task-row ${isDone ? 'is-completed' : ''}`}
                    data-course-color={task.courseColor}
                    data-testid={`home-task-row-${task.id}`}
                  >
                    <div className="task-row-main">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="task-checkbox"
                        checked={isDone}
                        onChange={() => void handleToggleTask(task.id)}
                      />
                      <label htmlFor={checkboxId} className="task-title-label">
                        {task.title}
                      </label>
                    </div>
                    <div className="task-row-meta">
                      {task.priority === 'high' && !isDone ? (
                        <span className="priority-indicator is-high">Prioridad alta</span>
                      ) : null}
                      <span className="course-pill" data-course-color={task.courseColor}>
                        <span
                          className="course-dot"
                          data-course-color={task.courseColor}
                          aria-hidden="true"
                        />
                        {task.courseName}
                      </span>
                      <span
                        className={`task-due-badge urgency-${urgency} ${
                          isDone ? 'is-done' : ''
                        }`}
                      >
                        {dueLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="surface-panel" aria-label="Próximos exámenes">
          <div className="section-heading-bar">
            <div className="section-heading-left">
              <h2 className="section-title">Próximos exámenes</h2>
              <span className="section-counter" data-testid="home-upcoming-exams-counter">
                {upcomingExams.length} fechas
              </span>
            </div>
            <button
              type="button"
              className="ghost-action-button"
              onClick={() => onNavigateSection('examenes')}
            >
              Ver calendario
            </button>
          </div>

          {!loading && upcomingExams.length === 0 ? (
            <div className="empty-state-box">
              <p className="empty-state-title">Sin mesas ni parciales próximos</p>
              <p className="empty-state-text">
                Podés agendar fechas de parciales, recuperatorios o finales desde Exámenes.
              </p>
            </div>
          ) : (
            <div className="exams-stack">
              {upcomingExams.map((exam) => {
                const daysLeft = Math.max(0, diffCalendarDays(exam.examDate, refIso));
                const isUrgent = daysLeft <= 5;
                return (
                  <article
                    key={exam.id}
                    className="exam-ficha"
                    data-course-color={exam.courseColor}
                    data-testid={`home-exam-card-${exam.id}`}
                  >
                    <div className={`exam-countdown-box ${isUrgent ? 'is-urgent' : ''}`}>
                      <span className="exam-countdown-number">{daysLeft}</span>
                      <span className="exam-countdown-unit">
                        {daysLeft === 1 ? 'día' : 'días'}
                      </span>
                    </div>

                    <div className="exam-ficha-body">
                      <div className="exam-ficha-top">
                        <span className="course-pill" data-course-color={exam.courseColor}>
                          <span
                            className="course-dot"
                            data-course-color={exam.courseColor}
                            aria-hidden="true"
                          />
                          {exam.courseName}
                        </span>
                        <span className="exam-date-meta">
                          {formatShortDateEs(exam.examDate)}
                          {exam.examTime ? ` · ${exam.examTime}` : ''}
                        </span>
                      </div>

                      <h3 className="exam-ficha-title">
                        <button
                          type="button"
                          className="inline-course-link"
                          onClick={() => onSelectCourse(exam.courseId)}
                        >
                          {exam.title}
                        </button>
                      </h3>

                      {exam.topics ? (
                        <p className="exam-ficha-topics">{exam.topics}</p>
                      ) : null}

                      <div className="exam-ficha-footer">
                        <span className="exam-category-tag">
                          {EXAM_CATEGORY_LABELS[exam.category]}
                        </span>
                        {exam.location ? (
                          <span className="exam-location-text">{exam.location}</span>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Nivel 2: Pulso de la semana completo */}
      <section className="surface-panel" aria-label="Pulso de la semana">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 className="section-title">Pulso de la semana</h2>
            <span className="section-counter" data-testid="home-week-range-label">
              {weekRangeLabel}
            </span>
          </div>
        </div>

        <div className="week-pulse-strip" role="list">
          {weekPulse.map((day) => (
            <div
              key={`${day.dayShort}-${day.dayNumber}`}
              role="listitem"
              className={`week-day-cell ${day.isToday ? 'is-today' : ''} ${
                day.hasExam ? 'has-exam' : ''
              }`}
              data-testid={`week-pulse-day-${day.dayShort}`}
            >
              <div className="week-day-header">
                <span className="week-day-short">{day.dayShort}</span>
                <span className="week-day-num">{day.dayNumber}</span>
              </div>
              <span className="week-day-summary">{day.summary}</span>
              <div className="week-day-dots" aria-hidden="true">
                {Array.from({ length: day.classesCount }).map((_, idx) => (
                  <span key={`c-${idx}`} className="pulse-dot is-class" />
                ))}
                {Array.from({ length: day.tasksCount }).map((_, idx) => (
                  <span key={`t-${idx}`} className="pulse-dot is-task" />
                ))}
                {day.hasExam ? <span className="pulse-dot is-exam" /> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
