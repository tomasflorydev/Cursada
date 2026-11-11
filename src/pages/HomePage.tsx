import type {
  NavSectionId,
  UpcomingExamItem,
  UpcomingTaskItem,
  WeekCalendarDay,
  WeekDayPulse,
} from '../types/design';
import {
  CURRENT_WEEK_LABEL,
  SAMPLE_COURSES,
  TODAY_DISPLAY_DATE,
  WEEK_CALENDAR_DAYS,
} from '../lib/sampleData';

interface HomePageProps {
  tasks: UpcomingTaskItem[];
  exams: UpcomingExamItem[];
  weekCalendar?: WeekCalendarDay[];
  weekPulse?: WeekDayPulse[];
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
}

export function HomePage({
  tasks,
  exams,
  weekCalendar = WEEK_CALENDAR_DAYS,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: HomePageProps) {
  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="home-page bento-airy-layout">
      {/* Header Bento con fecha, semana actual y resumen directo */}
      <header className="bento-header">
        <div className="bento-header-titles">
          <div className="page-date-row">
            <span className="page-date-text">{TODAY_DISPLAY_DATE}</span>
            <span className="page-week-pill">{CURRENT_WEEK_LABEL}</span>
          </div>
          <h1 id="main-title" tabIndex={-1} className="bento-title">
            Inicio
          </h1>
          <p className="bento-subtitle">
            Tenés <strong>{pendingCount} entregas pendientes</strong> y tu próximo examen es en{' '}
            <strong>{exams[0]?.daysLeft ?? 0} días</strong>.
          </p>
        </div>
      </header>

      {/* Bento asimétrico: Calendario semanal protagonista (izq) + Columna lateral de entregas y parciales (der) */}
      <div className="home-hero-grid">
        {/* Columna Izquierda: Vista previa del calendario semanal como protagonista */}
        <section
          className="surface-panel home-calendar-hero"
          aria-label="Calendario de la semana"
        >
          <div className="section-heading-bar">
            <div className="section-heading-left">
              <h2 className="section-title">Calendario de la semana</h2>
              <span className="section-counter">Semana 12 · 09 al 15 de nov</span>
            </div>
            <button
              type="button"
              className="ghost-action-button"
              onClick={() => onNavigateSection('calendario')}
            >
              Ver calendario completo
            </button>
          </div>

          <div
            className="home-cal-week-grid"
            role="grid"
            aria-label="Grilla semanal de clases y exámenes"
          >
            {weekCalendar.map((day) => {
              const isToday = Boolean(day.isToday);
              return (
                <div
                  key={day.dayShort}
                  className={`home-cal-day-col ${isToday ? 'is-today' : ''}`}
                  role="gridcell"
                >
                  <div className="home-cal-day-head">
                    <span className="home-cal-day-short">{day.dayShort}</span>
                    <span className="home-cal-day-num">{day.dayNumber}</span>
                    {isToday ? <span className="home-cal-today-badge">Hoy</span> : null}
                  </div>

                  <div className="home-cal-day-events">
                    {day.events.length === 0 ? (
                      <div className="home-cal-empty-slot">
                        <span className="home-cal-empty-dot" aria-hidden="true" />
                        <span className="home-cal-empty-text">Libre</span>
                      </div>
                    ) : (
                      day.events.map((event) => (
                        <article
                          key={event.id}
                          className={`home-cal-event-card ${
                            event.isExam ? 'is-exam-card' : ''
                          }`}
                          data-course-color={event.courseColor}
                        >
                          <div className="home-cal-event-top">
                            <span className="home-cal-event-time">
                              {event.startTime} – {event.endTime}
                            </span>
                            {event.isExam ? (
                              <span className="home-cal-exam-tag">Examen</span>
                            ) : null}
                          </div>

                          <h3 className="home-cal-event-title">
                            <button
                              type="button"
                              className="inline-course-link"
                              onClick={() => onSelectCourse(event.courseId)}
                            >
                              {event.courseName}
                            </button>
                          </h3>

                          <span className="home-cal-event-loc">{event.location}</span>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra sutil de materias cursadas en la semana */}
          <div className="home-cal-footer-legend">
            <span className="home-cal-legend-label">Materias del cuatrimestre:</span>
            <div className="home-cal-legend-pills">
              {SAMPLE_COURSES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="course-pill legend-course-btn"
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
          </div>
        </section>

        {/* Columna Derecha: Panel vertical con Tareas por vencer y Próximos exámenes */}
        <aside className="home-sidebar-column">
          {/* Tarjetas de Tareas por vencer */}
          <section className="surface-panel home-tasks-panel" aria-label="Tareas por vencer">
            <div className="section-heading-bar">
              <div className="section-heading-left">
                <h2 className="section-title">Tareas por vencer</h2>
                <span className="section-counter">{pendingCount} pendientes</span>
              </div>
              <button
                type="button"
                className="ghost-action-button"
                onClick={() => onNavigateSection('tareas')}
              >
                Ver todas
              </button>
            </div>

            <div className="task-checklist">
              {tasks.map((task) => {
                const checkboxId = `home-task-${task.id}`;
                return (
                  <div
                    key={task.id}
                    className={`task-row ${task.completed ? 'is-completed' : ''}`}
                    data-course-color={task.courseColor}
                  >
                    <div className="task-row-main">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="task-checkbox"
                        checked={task.completed}
                        onChange={() => onToggleTask(task.id)}
                      />
                      <label htmlFor={checkboxId} className="task-title-label">
                        {task.title}
                      </label>
                    </div>
                    <div className="task-row-meta">
                      {task.priority === 'Alta' && !task.completed ? (
                        <span className="priority-indicator is-high">Alta</span>
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
                        className={`task-due-badge urgency-${task.urgency} ${
                          task.completed ? 'is-done' : ''
                        }`}
                      >
                        {task.completed ? 'Completada' : task.dueLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Tarjetas de Próximos exámenes */}
          <section
            className="surface-panel home-exams-panel"
            aria-label="Próximos exámenes"
          >
            <div className="section-heading-bar">
              <div className="section-heading-left">
                <h2 className="section-title">Próximos exámenes</h2>
                <span className="section-counter">{exams.length} fechas</span>
              </div>
              <button
                type="button"
                className="ghost-action-button"
                onClick={() => onNavigateSection('examenes')}
              >
                Ver todos
              </button>
            </div>

            <div className="exams-stack">
              {exams.map((exam) => {
                const isUrgent = exam.daysLeft <= 5;
                return (
                  <article
                    key={exam.id}
                    className="exam-ficha"
                    data-course-color={exam.courseColor}
                  >
                    <div className={`exam-countdown-box ${isUrgent ? 'is-urgent' : ''}`}>
                      <span className="exam-countdown-number">{exam.daysLeft}</span>
                      <span className="exam-countdown-unit">días</span>
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
                          {exam.dateLabel} · {exam.timeLabel}
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

                      <p className="exam-ficha-topics">{exam.topics}</p>

                      <div className="exam-ficha-footer">
                        <span className="exam-category-tag">{exam.category}</span>
                        <span className="exam-location-text">{exam.location}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
