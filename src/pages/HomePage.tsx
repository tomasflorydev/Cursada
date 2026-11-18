import { useCallback, useEffect, useMemo, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  DAY_NAMES_ES,
  DAY_SHORT_NAMES_ES,
  MONTH_NAMES_ES,
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../lib/dates';
import {
  getLatestStoredReport,
  listStoredReports,
  refreshStoredReports,
  subscribeReports,
  type StoredReport,
} from '../lib/reportsStore';
import type {
  CourseWithSchedules,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  NavSectionId,
  NoteWithCourse,
  TaskWithCourse,
} from '../types';
import { SwissLinkButton, SwissSectionHeader } from '../ui';

export interface HomePageProps {
  onNavigateSection: (
    section: NavSectionId,
    opts?: { triggerCreate?: boolean; reportId?: string }
  ) => void;
  onSelectCourse: (courseId: string, opts?: { noteId?: string }) => void;
  referenceDate?: Date;
}

const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'TP evaluativo',
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

function diffCalendarDays(targetIso: string, refIso: string): number {
  const target = parseIsoDateLocal(targetIso);
  const ref = parseIsoDateLocal(refIso);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - ref.getTime()) / msPerDay);
}

function formatShortTaskDue(dueDate: string | null, refIso: string): string {
  if (!dueDate) {
    return 'Sin fecha';
  }
  const diff = diffCalendarDays(dueDate, refIso);
  if (diff < 0) {
    return 'Vencida';
  }
  if (diff === 0) {
    return 'Hoy';
  }
  if (diff === 1) {
    return 'Mañana';
  }
  const date = parseIsoDateLocal(dueDate);
  const monthShort = MONTH_SHORT_NAMES_ES[date.getMonth()] ?? '';
  return `${date.getDate()} ${monthShort}`;
}

function formatShortExamDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  const d = parseIsoDateLocal(isoDate);
  const jsDay = d.getDay();
  const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const dayShort = DAY_SHORT_NAMES_ES[dayOfWeek];
  const monthShort = MONTH_SHORT_NAMES_ES[d.getMonth()] ?? '';
  return `${dayShort} ${d.getDate()} ${monthShort}`;
}

interface NextClassInfo {
  courseId: string;
  courseName: string;
  dayLabel: string;
  startTime: string;
  isToday: boolean;
}

function findNextClass(
  courses: CourseWithSchedules[],
  referenceDate: Date
): NextClassInfo | null {
  const jsDay = referenceDate.getDay();
  const todayDow = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();

  const candidates: Array<NextClassInfo & { offsetMinutes: number }> = [];

  for (const course of courses) {
    for (const sched of course.schedules) {
      const [hh, mm] = sched.startTime.split(':').map(Number);
      const startMinutes = (hh || 0) * 60 + (mm || 0);
      let dayOffset = sched.dayOfWeek - todayDow;
      if (dayOffset < 0 || (dayOffset === 0 && startMinutes < nowMinutes)) {
        dayOffset += 7;
      }
      const offsetMinutes = dayOffset * 1440 + (startMinutes - nowMinutes);
      candidates.push({
        courseId: course.id,
        courseName: course.name,
        dayLabel: dayOffset === 0 ? 'hoy' : `el ${DAY_NAMES_ES[sched.dayOfWeek].toLowerCase()}`,
        startTime: sched.startTime,
        isToday: dayOffset === 0,
        offsetMinutes,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.offsetMinutes - b.offsetMinutes);
  const best = candidates[0];
  return {
    courseId: best.courseId,
    courseName: best.courseName,
    dayLabel: best.dayLabel,
    startTime: best.startTime,
    isToday: best.isToday,
  };
}

export function HomePage({
  onNavigateSection,
  onSelectCourse,
  referenceDate,
}: HomePageProps) {
  const [tasks, setTasks] = useState<TaskWithCourse[]>([]);
  const [exams, setExams] = useState<ExamWithCourse[]>([]);
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [notes, setNotes] = useState<NoteWithCourse[]>([]);
  const [reports, setReports] = useState<StoredReport[]>(() => listStoredReports());
  const [latestReport, setLatestReport] = useState<StoredReport | null>(() =>
    getLatestStoredReport()
  );

  const effectiveDate = useMemo(
    () => referenceDate ?? new Date(),
    [referenceDate]
  );

  const refIso = useMemo(() => toIsoDateString(effectiveDate), [effectiveDate]);

  const loadHomeData = useCallback(async () => {
    const [loadedTasks, loadedExams, loadedCourses, loadedNotes, loadedReports] =
      await Promise.all([
        cursadaClient.listTasks({ status: 'all' }),
        cursadaClient.listExams({ graded: 'all' }),
        cursadaClient.listCourses({ status: 'active' }),
        cursadaClient.listNotes(),
        refreshStoredReports(),
      ]);
    setTasks(loadedTasks);
    setExams(loadedExams);
    setCourses(loadedCourses);
    setNotes(loadedNotes);
    setReports(loadedReports);
    setLatestReport(loadedReports[0] ?? null);
  }, []);

  useEffect(() => {
    void loadHomeData();
    const handleDataChanged = () => {
      void loadHomeData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    const unsubscribeReports = subscribeReports(() => {
      setReports(listStoredReports());
      setLatestReport(getLatestStoredReport());
    });
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
      unsubscribeReports();
    };
  }, [loadHomeData]);

  const pendingTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'pending')
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      });
  }, [tasks]);

  const visibleTasks = useMemo(() => pendingTasks.slice(0, 4), [pendingTasks]);

  const weeklyClasses = useMemo(() => {
    const items: Array<{
      id: string;
      courseId: string;
      courseName: string;
      dayOfWeek: DayOfWeek;
      startTime: string;
    }> = [];

    for (const course of courses) {
      for (const sched of course.schedules) {
        items.push({
          id: sched.id,
          courseId: course.id,
          courseName: course.name,
          dayOfWeek: sched.dayOfWeek,
          startTime: sched.startTime,
        });
      }
    }

    return items.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }
      return a.startTime.localeCompare(b.startTime);
    });
  }, [courses]);

  const upcomingExams = useMemo(() => {
    return exams
      .filter((exam) => exam.grade === null && exam.examDate >= refIso)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
      .slice(0, 3);
  }, [exams, refIso]);

  const notesCountByCourse = useMemo(() => {
    const map: Record<string, number> = {};
    for (const note of notes) {
      map[note.courseId] = (map[note.courseId] ?? 0) + 1;
    }
    return map;
  }, [notes]);

  const nextClass = useMemo(
    () => findNextClass(courses, effectiveDate),
    [courses, effectiveDate]
  );

  const dayOfMonth = String(effectiveDate.getDate());
  const weekdayName = FULL_WEEKDAY_NAMES[effectiveDate.getDay()] ?? '';
  const monthName = MONTH_NAMES_ES[effectiveDate.getMonth()] ?? '';

  const tasksSummaryText =
    pendingTasks.length === 0
      ? 'no tenés tareas abiertas'
      : pendingTasks.length === 1
        ? 'tenés 1 tarea abierta'
        : `tenés ${pendingTasks.length} tareas abiertas`;

  const reportsSummaryText =
    reports.length === 0
      ? 'sin informes generados todavía'
      : reports.length === 1
        ? '1 informe listo para repasar'
        : `${reports.length} informes listos para repasar`;

  const nextClassSummaryText = nextClass
    ? `Tu próxima clase es ${nextClass.courseName} ${nextClass.dayLabel} a las ${nextClass.startTime}.`
    : 'No tenés clases semanales cargadas.';

  const statusSummarySentence =
    pendingTasks.length === 0 && reports.length === 0
      ? 'No tenés tareas abiertas ni informes generados todavía.'
      : pendingTasks.length === 0
        ? `No tenés tareas abiertas y tenés ${reportsSummaryText}.`
        : `Hoy ${tasksSummaryText} y ${reportsSummaryText}.`;

  const footerCourses = useMemo(() => courses.slice(0, 6), [courses]);

  return (
    <div className="home-page">
      <div className="swiss-grid is-home">
        {/* Columna izquierda: Día + fecha + resumen real */}
        <section className="swiss-col-4" aria-labelledby="main-title">
          <h1 id="main-title" tabIndex={-1} className="visually-hidden">
            Inicio
          </h1>

          <div className="home-day-number">{dayOfMonth}</div>
          <p className="home-date-label">
            {weekdayName}
            <br />
            de {monthName}
          </p>
          <p className="home-summary">
            {nextClassSummaryText} {statusSummarySentence}
          </p>
        </section>

        {/* Columna central: Tareas + Esta semana */}
        <div className="swiss-col-4 home-col-stack">
          <section aria-label="Tareas abiertas">
            <SwissSectionHeader
              title={`Tareas · ${pendingTasks.length}`}
              right={
                <SwissLinkButton onClick={() => onNavigateSection('tareas')}>
                  Todas →
                </SwissLinkButton>
              }
            />

            {visibleTasks.length === 0 ? (
              <p className="swiss-meta-md">No tenés entregas pendientes.</p>
            ) : (
              <div>
                {visibleTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="home-row"
                    onClick={() => onNavigateSection('tareas')}
                  >
                    <span className="home-row-title home-row-course" title={task.title}>
                      {task.title}
                    </span>
                    <span className="home-row-right">
                      {formatShortTaskDue(task.dueDate, refIso)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              className="home-add-task-row"
              onClick={() => onNavigateSection('tareas', { triggerCreate: true })}
            >
              + Agregar tarea
            </button>
          </section>

          <section aria-label="Esta semana">
            <SwissSectionHeader
              title="Esta semana"
              right={
                <SwissLinkButton onClick={() => onNavigateSection('calendario')}>
                  Calendario →
                </SwissLinkButton>
              }
            />

            {weeklyClasses.length === 0 ? (
              <p className="swiss-meta-md">Sin horarios semanales asignados.</p>
            ) : (
              <div>
                {weeklyClasses.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="home-row"
                    onClick={() => onSelectCourse(item.courseId)}
                  >
                    <span className="home-row-day">
                      {DAY_SHORT_NAMES_ES[item.dayOfWeek]}
                    </span>
                    <span className="home-row-course" title={item.courseName}>
                      {item.courseName}
                    </span>
                    <span className="home-row-right">{item.startTime}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Columna derecha: Exámenes + Informe listo */}
        <div className="swiss-col-4 home-col-stack">
          <section aria-label="Próximos exámenes">
            <SwissSectionHeader
              title="Exámenes"
              right={
                <SwissLinkButton onClick={() => onNavigateSection('examenes')}>
                  Ver todos →
                </SwissLinkButton>
              }
            />

            {upcomingExams.length === 0 ? (
              <p className="swiss-meta-md">Sin parciales ni finales próximos.</p>
            ) : (
              <div>
                {upcomingExams.map((exam, index) => {
                  const daysLeft = Math.max(0, diffCalendarDays(exam.examDate, refIso));
                  const unitLabel =
                    daysLeft === 0 ? 'hoy' : daysLeft === 1 ? 'día' : 'días';
                  return (
                    <button
                      key={exam.id}
                      type="button"
                      className={`home-exam-row ${index === 0 ? 'is-nearest' : ''}`}
                      onClick={() => onNavigateSection('examenes')}
                    >
                      <span className="home-exam-days">{daysLeft}</span>
                      <span className="home-exam-meta">
                        <span className="home-exam-unit">{unitLabel}</span>
                        <span
                          className="home-exam-name"
                          title={`${exam.courseName} · ${EXAM_CATEGORY_LABELS[exam.category]}`}
                        >
                          {exam.courseName} · {EXAM_CATEGORY_LABELS[exam.category]}
                        </span>
                        <span className="home-exam-date">
                          {formatShortExamDate(exam.examDate)}
                          {exam.examTime ? ` · ${exam.examTime}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label="Informes">
            <SwissSectionHeader title="Informes" />

            <div className="home-report-block">
              {latestReport ? (
                <>
                  <p className="home-report-copy">
                    <strong>{latestReport.title}</strong> · {latestReport.summaryLine}
                  </p>
                  <div>
                    <SwissLinkButton
                      underlined
                      onClick={() =>
                        onNavigateSection('informes', { reportId: latestReport.id })
                      }
                    >
                      Abrir informe →
                    </SwissLinkButton>
                  </div>
                </>
              ) : (
                <>
                  <p className="home-report-copy">
                    Todavía no generaste informes con tus notas y fuentes.
                  </p>
                  <div>
                    <SwissLinkButton
                      underlined
                      onClick={() => onNavigateSection('informes')}
                    >
                      Ir a informes →
                    </SwissLinkButton>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Sección inferior: Hasta 6 materias activas */}
      <footer className="home-footer" aria-label="Materias activas">
        <SwissSectionHeader
          title={`Materias · ${courses.length}`}
          right={
            <SwissLinkButton
              aria-label="Todas las materias"
              onClick={() => onNavigateSection('materias')}
            >
              Todas →
            </SwissLinkButton>
          }
        />

        {footerCourses.length === 0 ? (
          <p className="swiss-meta-md">No tenés materias activas.</p>
        ) : (
          <div className="home-footer-grid">
            {footerCourses.map((course) => {
              const count = notesCountByCourse[course.id] ?? 0;
              return (
                <button
                  key={course.id}
                  type="button"
                  className="home-footer-item"
                  title={course.name}
                  onClick={() => onSelectCourse(course.id)}
                >
                  <span className="home-footer-name" title={course.name}>
                    {course.name}
                  </span>
                  <span className="home-footer-count">
                    {count === 1 ? '1 nota' : `${count} notas`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </footer>
    </div>
  );
}
