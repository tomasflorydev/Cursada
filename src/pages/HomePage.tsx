import type {
  HomeLayoutVariant,
  NavSectionId,
  ThemeMode,
  UpcomingExamItem,
  UpcomingTaskItem,
  WeekDayPulse,
} from '../types/design';
import { CURRENT_WEEK_LABEL, TODAY_DISPLAY_DATE } from '../lib/sampleData';

interface HomePageProps {
  variant: HomeLayoutVariant;
  onChangeVariant: (variant: HomeLayoutVariant) => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  tasks: UpcomingTaskItem[];
  exams: UpcomingExamItem[];
  weekPulse: WeekDayPulse[];
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
}

export function HomePage({
  variant,
  onChangeVariant,
  themeMode,
  onChangeThemeMode,
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: HomePageProps) {
  return (
    <div className={`home-page home-variant-${variant}`}>
      {/* Switcher limpio para comparar las 2 variantes finales en localhost */}
      <section className="variant-selector-bar" aria-label="Selector de propuesta de diseño">
        <div className="variant-selector-info">
          <span className="variant-selector-tag">Variante</span>
          <span className="text-secondary">Compará Bento con Aire vs. Swiss Editorial</span>
        </div>

        <div className="segmented-control" role="group" aria-label="Estilo de Inicio">
          <button
            type="button"
            className={`segmented-option ${variant === 'bento' ? 'is-active' : ''}`}
            aria-pressed={variant === 'bento'}
            onClick={() => onChangeVariant('bento')}
          >
            Bento con Aire
          </button>
          <button
            type="button"
            className={`segmented-option ${variant === 'swiss' ? 'is-active' : ''}`}
            aria-pressed={variant === 'swiss'}
            onClick={() => onChangeVariant('swiss')}
          >
            Swiss Editorial
          </button>
        </div>

        <div className="segmented-control" role="group" aria-label="Modo de color">
          <button
            type="button"
            className={`segmented-option ${themeMode === 'dark' ? 'is-active' : ''}`}
            aria-pressed={themeMode === 'dark'}
            onClick={() => onChangeThemeMode('dark')}
          >
            Oscuro Suave
          </button>
          <button
            type="button"
            className={`segmented-option ${themeMode === 'light' ? 'is-active' : ''}`}
            aria-pressed={themeMode === 'light'}
            onClick={() => onChangeThemeMode('light')}
          >
            Claro
          </button>
          <button
            type="button"
            className={`segmented-option ${themeMode === 'system' ? 'is-active' : ''}`}
            aria-pressed={themeMode === 'system'}
            onClick={() => onChangeThemeMode('system')}
          >
            Auto
          </button>
        </div>
      </section>

      {variant === 'bento' ? (
        <BentoAiryHomeLayout
          tasks={tasks}
          exams={exams}
          weekPulse={weekPulse}
          onToggleTask={onToggleTask}
          onNavigateSection={onNavigateSection}
          onSelectCourse={onSelectCourse}
        />
      ) : (
        <SwissEditorialHomeLayout
          tasks={tasks}
          exams={exams}
          weekPulse={weekPulse}
          onToggleTask={onToggleTask}
          onSelectCourse={onSelectCourse}
        />
      )}
    </div>
  );
}

interface LayoutSubProps {
  tasks: UpcomingTaskItem[];
  exams: UpcomingExamItem[];
  weekPulse: WeekDayPulse[];
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
}

/**
 * VARIANTE A: BENTO CON AIRE (REFINADO SIN CLASES DE HOY)
 * Paleta 1 (Pizarra & Índigo) + Fuente del sistema macOS + Tarjetas amplias con mucho aire
 */
function BentoAiryHomeLayout({
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: LayoutSubProps) {
  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="bento-airy-layout">
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

      {/* Row 1: Dos columnas asimétricas con aire generoso */}
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

      {/* Row 2: Pulso de la semana completo */}
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

/**
 * VARIANTE B: SWISS EDITORIAL DESIGN
 * Sin tarjetas ni cajas visibles. Jerarquía por escala tipográfica monumental y cuadrícula invisible.
 * Márgenes masivos, cero iconografía decorativa, líneas de 1px ultrafinas solo cuando es indispensable.
 */
function SwissEditorialHomeLayout({
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onSelectCourse,
}: Omit<LayoutSubProps, 'onNavigateSection'>) {
  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="swiss-editorial-layout">
      {/* Swiss Monumental Header */}
      <header className="swiss-header">
        <div className="swiss-header-topline">
          <span>{TODAY_DISPLAY_DATE}</span>
          <span>{CURRENT_WEEK_LABEL}</span>
        </div>

        <h1 id="main-title" tabIndex={-1} className="swiss-headline-huge">
          Resumen Académico
        </h1>

        <div className="swiss-lead-stat">
          <div className="swiss-stat-item">
            <span className="swiss-stat-number">{pendingCount}</span>
            <span className="swiss-stat-label">Entregas pendientes</span>
          </div>
          <span className="text-muted" aria-hidden="true">
            /
          </span>
          <div className="swiss-stat-item">
            <span className="swiss-stat-number">{exams[0]?.daysLeft ?? 0}</span>
            <span className="swiss-stat-label">Días para el 2° Parcial</span>
          </div>
        </div>
      </header>

      {/* Invisible Grid Duo (Tasks on left, Exams on right) */}
      <div className="swiss-grid-duo">
        {/* Module: Tareas por vencer */}
        <section className="swiss-module" aria-label="Tareas por vencer">
          <div className="swiss-module-header">
            <h2 className="swiss-module-eyebrow">Entregas por vencer</h2>
            <span className="swiss-module-meta">{pendingCount} activas</span>
          </div>

          <div className="swiss-task-list">
            {tasks.map((task, idx) => {
              const numLabel = String(idx + 1).padStart(2, '0');
              const isToday = task.urgency === 'today';
              return (
                <article
                  key={task.id}
                  className={`swiss-task-row ${task.completed ? 'is-completed' : ''}`}
                >
                  <div className="swiss-task-left">
                    <span className="swiss-task-index">{numLabel}</span>
                    <div className="swiss-task-body">
                      <button
                        type="button"
                        className="swiss-task-title"
                        onClick={() => onToggleTask(task.id)}
                      >
                        {task.title}
                      </button>
                      <span className="swiss-task-course">{task.courseName}</span>
                    </div>
                  </div>

                  <div className="swiss-task-right">
                    <span className={`swiss-task-urgency ${isToday ? 'is-urgent' : ''}`}>
                      {task.completed ? 'Hecho' : task.dueLabel}
                    </span>
                    <button
                      type="button"
                      className="swiss-check-action"
                      onClick={() => onToggleTask(task.id)}
                      aria-label={`Marcar como completada: ${task.title}`}
                    >
                      {task.completed ? 'Reabrir' : 'Listo'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Module: Próximos exámenes */}
        <section className="swiss-module" aria-label="Próximos exámenes">
          <div className="swiss-module-header">
            <h2 className="swiss-module-eyebrow">Fechas de examen</h2>
            <span className="swiss-module-meta">{exams.length} instancias</span>
          </div>

          <div className="swiss-exam-list">
            {exams.map((exam) => {
              const isUrgent = exam.daysLeft <= 5;
              return (
                <article key={exam.id} className="swiss-exam-row">
                  <div className="swiss-exam-big-number">
                    <span className={`swiss-huge-digit ${isUrgent ? 'is-soon' : ''}`}>
                      {exam.daysLeft}
                    </span>
                    <span className="swiss-huge-unit">Días</span>
                  </div>

                  <div className="swiss-exam-details">
                    <span className="swiss-exam-course-label">{exam.courseName}</span>
                    <h3 className="swiss-exam-headline">
                      <button
                        type="button"
                        className="inline-course-link"
                        onClick={() => onSelectCourse(exam.courseId)}
                      >
                        {exam.title}
                      </button>
                    </h3>
                    <p className="swiss-exam-topics-clean">{exam.topics}</p>
                    <span className="swiss-exam-meta-line">
                      {exam.dateLabel} · {exam.timeLabel} · {exam.location}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {/* Swiss Module: Pulso de la semana en grilla arquitectónica pura */}
      <section className="swiss-week-section" aria-label="Pulso semanal de cursada">
        <div className="swiss-module-header">
          <h2 className="swiss-module-eyebrow">Cronograma semanal</h2>
          <span className="swiss-module-meta">Lun 09 – Dom 15 nov</span>
        </div>

        <div className="swiss-week-grid" role="list">
          {weekPulse.map((day) => (
            <div
              key={day.dayShort}
              role="listitem"
              className={`swiss-week-cell ${day.isToday ? 'is-today' : ''}`}
            >
              <div className="swiss-week-cell-top">
                <span className="swiss-day-name">{day.dayName}</span>
                <span className="swiss-day-big-num">{day.dayNumber}</span>
              </div>
              <div className="swiss-week-cell-content">
                <span>{day.summary}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
