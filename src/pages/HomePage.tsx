import type {
  NavSectionId,
  UpcomingExamItem,
  UpcomingTaskItem,
  WeekDayPulse,
} from '../types/design';
import { CURRENT_WEEK_LABEL, TODAY_DISPLAY_DATE } from '../lib/sampleData';

interface HomePageProps {
  tasks: UpcomingTaskItem[];
  exams: UpcomingExamItem[];
  weekPulse: WeekDayPulse[];
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
}

export function HomePage({
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: HomePageProps) {
  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="home-page bento-airy-layout">
      {/* Header Bento */}
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

      {/* Nivel 1: Columnas asimétricas (Tareas y Exámenes) con aire generoso */}
      <div className="bento-airy-columns">
        <section className="surface-panel" aria-label="Tareas por vencer">
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
              const checkboxId = `bento-task-${task.id}`;
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

        <section className="surface-panel" aria-label="Próximos exámenes">
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
              Ver calendario
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
      </div>

      {/* Nivel 2: Pulso de la semana completo */}
      <section className="surface-panel" aria-label="Pulso de la semana">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 className="section-title">Pulso de la semana</h2>
            <span className="section-counter">Lunes 09 al Domingo 15 de noviembre</span>
          </div>
        </div>

        <div className="week-pulse-strip" role="list">
          {weekPulse.map((day) => (
            <div
              key={day.dayShort}
              role="listitem"
              className={`week-day-cell ${day.isToday ? 'is-today' : ''} ${
                day.hasExam ? 'has-exam' : ''
              }`}
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
