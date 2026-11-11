import type {
  HomeLayoutVariant,
  NavSectionId,
  SampleCourse,
  TodayClassItem,
  UpcomingExamItem,
  UpcomingTaskItem,
  WeekDayPulse,
} from '../types/design';
import { CURRENT_WEEK_LABEL, TODAY_DISPLAY_DATE } from '../lib/sampleData';

interface HomePageProps {
  variant: HomeLayoutVariant;
  onChangeVariant: (variant: HomeLayoutVariant) => void;
  todayClasses: TodayClassItem[];
  tasks: UpcomingTaskItem[];
  exams: UpcomingExamItem[];
  weekPulse: WeekDayPulse[];
  courses: SampleCourse[];
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
}

export function HomePage({
  variant,
  onChangeVariant,
  todayClasses,
  tasks,
  exams,
  weekPulse,
  courses,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: HomePageProps) {
  const pendingTasks = tasks.filter((t) => !t.completed);
  const nextClass = todayClasses.find((c) => c.status !== 'completed') ?? todayClasses[0];

  return (
    <div className={`home-page home-variant-${variant}`}>
      <header className="page-header home-header">
        <div className="page-header-titles">
          <div className="page-date-row">
            <span className="page-date-text">{TODAY_DISPLAY_DATE}</span>
            <span className="page-week-pill">{CURRENT_WEEK_LABEL}</span>
          </div>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Inicio
          </h1>
          <p className="page-subtitle">
            Tenés <strong>{todayClasses.length} clases</strong> programadas hoy,{' '}
            <strong>{pendingTasks.length} entregas pendientes</strong> esta semana y tu próximo
            parcial es en <strong>{exams[0]?.daysLeft ?? 0} días</strong>.
          </p>
        </div>

        <div className="home-header-controls">
          <div className="variant-switcher-wrap">
            <span className="variant-switcher-caption" id="variant-switcher-label">
              Propuesta de diseño
            </span>
            <div
              className="segmented-control"
              role="group"
              aria-labelledby="variant-switcher-label"
            >
              <button
                type="button"
                className={`segmented-option ${variant === 'bento' ? 'is-active' : ''}`}
                aria-pressed={variant === 'bento'}
                onClick={() => onChangeVariant('bento')}
              >
                A · Bento
              </button>
              <button
                type="button"
                className={`segmented-option ${variant === 'agenda' ? 'is-active' : ''}`}
                aria-pressed={variant === 'agenda'}
                onClick={() => onChangeVariant('agenda')}
              >
                B · Agenda
              </button>
              <button
                type="button"
                className={`segmented-option ${variant === 'editorial' ? 'is-active' : ''}`}
                aria-pressed={variant === 'editorial'}
                onClick={() => onChangeVariant('editorial')}
              >
                C · Editorial
              </button>
            </div>
          </div>
        </div>
      </header>

      {variant === 'bento' ? (
        <BentoHomeLayout
          todayClasses={todayClasses}
          tasks={tasks}
          exams={exams}
          weekPulse={weekPulse}
          courses={courses}
          onToggleTask={onToggleTask}
          onNavigateSection={onNavigateSection}
          onSelectCourse={onSelectCourse}
        />
      ) : null}

      {variant === 'agenda' ? (
        <AgendaHomeLayout
          todayClasses={todayClasses}
          nextClass={nextClass}
          tasks={tasks}
          exams={exams}
          weekPulse={weekPulse}
          onToggleTask={onToggleTask}
          onNavigateSection={onNavigateSection}
          onSelectCourse={onSelectCourse}
        />
      ) : null}

      {variant === 'editorial' ? (
        <EditorialHomeLayout
          todayClasses={todayClasses}
          tasks={tasks}
          exams={exams}
          weekPulse={weekPulse}
          onToggleTask={onToggleTask}
          onNavigateSection={onNavigateSection}
          onSelectCourse={onSelectCourse}
        />
      ) : null}
    </div>
  );
}

interface LayoutSubProps {
  todayClasses: TodayClassItem[];
  nextClass?: TodayClassItem;
  tasks: UpcomingTaskItem[];
  exams: UpcomingExamItem[];
  weekPulse: WeekDayPulse[];
  courses?: SampleCourse[];
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
}

function BentoHomeLayout({
  todayClasses,
  tasks,
  exams,
  weekPulse,
  courses = [],
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: LayoutSubProps) {
  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="bento-layout">
      {/* Row 1: Today's classes strip */}
      <section className="dashboard-block classes-today-block">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 className="section-title">Clases de hoy</h2>
            <span className="section-counter">{todayClasses.length} bloques</span>
          </div>
          <button
            type="button"
            className="ghost-action-button"
            onClick={() => onNavigateSection('calendario')}
          >
            Ver horario semanal
          </button>
        </div>

        <div className="today-classes-grid">
          {todayClasses.map((item) => (
            <article
              key={item.id}
              className={`schedule-strip-card ${item.status === 'upcoming' ? 'is-featured' : ''} ${
                item.status === 'completed' ? 'is-past' : ''
              }`}
              data-course-color={item.courseColor}
            >
              <div className="schedule-strip-top">
                <span className="schedule-time-range">
                  {item.startTime} – {item.endTime}
                </span>
                <span className={`schedule-status-badge status-${item.status}`}>
                  {item.statusLabel}
                </span>
              </div>
              <h3 className="schedule-course-title">
                <button
                  type="button"
                  className="inline-course-link"
                  onClick={() => onSelectCourse(item.courseId)}
                >
                  {item.courseName}
                </button>
              </h3>
              <p className="schedule-topic-text">{item.sessionTopic}</p>
              <div className="schedule-meta-footer">
                <span className="schedule-location-pill">{item.location}</span>
                <span className="schedule-professor-name">Prof. {item.professor}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Row 2: Main 2-column asymmetric split */}
      <div className="bento-main-columns">
        <div className="bento-left-column">
          {/* Tasks due soon */}
          <section className="dashboard-block surface-panel">
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
                Abrir todas
              </button>
            </div>

            <TaskListWidget tasks={tasks} onToggleTask={onToggleTask} />
          </section>

          {/* Week summary strip */}
          <section className="dashboard-block surface-panel">
            <div className="section-heading-bar">
              <div className="section-heading-left">
                <h2 className="section-title">Pulso de la semana</h2>
                <span className="section-counter">Lun 09 – Dom 15 nov</span>
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

        <div className="bento-right-column">
          {/* Upcoming exams */}
          <section className="dashboard-block surface-panel">
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
                Ver calendario de mesas
              </button>
            </div>

            <div className="exams-stack">
              {exams.map((exam) => (
                <ExamFicha key={exam.id} exam={exam} onSelectCourse={onSelectCourse} />
              ))}
            </div>
          </section>

          {/* Compact active courses card */}
          <section className="dashboard-block surface-panel">
            <div className="section-heading-bar">
              <div className="section-heading-left">
                <h2 className="section-title">Materias del cuatrimestre</h2>
                <span className="section-counter">{courses.length} activas</span>
              </div>
            </div>
            <ul className="compact-courses-list" role="list">
              {courses.map((course) => (
                <li key={course.id} className="compact-course-row">
                  <button
                    type="button"
                    className="compact-course-button"
                    onClick={() => onSelectCourse(course.id)}
                  >
                    <span
                      className="course-dot"
                      data-course-color={course.color}
                      aria-hidden="true"
                    />
                    <span className="compact-course-name">{course.name}</span>
                    <span className="compact-course-schedule">{course.scheduleSummary}</span>
                    {course.averageGrade !== undefined ? (
                      <span className="compact-course-grade">
                        Prom. {course.averageGrade.toFixed(1)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function AgendaHomeLayout({
  todayClasses,
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: LayoutSubProps) {
  const todayDueTasks = tasks.filter((t) => t.urgency === 'today');
  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="agenda-layout">
      {/* Left Fixed Day Timeline Column */}
      <aside className="agenda-day-column surface-panel" aria-label="Agenda cronológica de hoy">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 className="section-title">Agenda de hoy</h2>
            <span className="section-counter">Martes 10</span>
          </div>
        </div>

        <div className="timeline-list">
          {todayClasses.map((item) => (
            <div
              key={item.id}
              className={`timeline-entry ${item.status === 'upcoming' ? 'is-featured' : ''}`}
              data-course-color={item.courseColor}
            >
              <div className="timeline-hours">
                <span className="timeline-start">{item.startTime}</span>
                <span className="timeline-end">{item.endTime}</span>
              </div>
              <div className="timeline-card">
                <div className="timeline-card-top">
                  <span className="course-pill" data-course-color={item.courseColor}>
                    {item.courseName}
                  </span>
                  <span className={`schedule-status-badge status-${item.status}`}>
                    {item.statusLabel}
                  </span>
                </div>
                <p className="timeline-topic">{item.sessionTopic}</p>
                <span className="timeline-meta">
                  {item.location} · Prof. {item.professor}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="agenda-today-deliveries">
          <h3 className="agenda-sub-heading">Cierres del día (23:59)</h3>
          <ul className="agenda-mini-deliveries" role="list">
            {todayDueTasks.map((t) => (
              <li key={t.id} className="agenda-mini-delivery-item">
                <span className="course-dot" data-course-color={t.courseColor} aria-hidden="true" />
                <span className={t.completed ? 'is-done-text' : ''}>{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Right Fluid Tray */}
      <div className="agenda-main-tray">
        <section className="dashboard-block surface-panel">
          <div className="section-heading-bar">
            <div className="section-heading-left">
              <h2 className="section-title">Bandeja de tareas por vencer</h2>
              <span className="section-counter">{pendingCount} pendientes</span>
            </div>
            <button
              type="button"
              className="ghost-action-button"
              onClick={() => onNavigateSection('tareas')}
            >
              Ir a Tareas
            </button>
          </div>
          <TaskListWidget tasks={tasks} onToggleTask={onToggleTask} />
        </section>

        <section className="dashboard-block">
          <div className="section-heading-bar">
            <div className="section-heading-left">
              <h2 className="section-title">Próximos exámenes</h2>
              <span className="section-counter">{exams.length} instancias</span>
            </div>
            <button
              type="button"
              className="ghost-action-button"
              onClick={() => onNavigateSection('examenes')}
            >
              Ver todos
            </button>
          </div>
          <div className="agenda-exams-grid">
            {exams.map((exam) => (
              <ExamFicha key={exam.id} exam={exam} onSelectCourse={onSelectCourse} />
            ))}
          </div>
        </section>

        <section className="dashboard-block surface-panel">
          <div className="section-heading-bar">
            <h2 className="section-title">Semana actual</h2>
          </div>
          <div className="week-pulse-strip" role="list">
            {weekPulse.map((day) => (
              <div
                key={day.dayShort}
                role="listitem"
                className={`week-day-cell ${day.isToday ? 'is-today' : ''}`}
              >
                <div className="week-day-header">
                  <span className="week-day-short">{day.dayShort}</span>
                  <span className="week-day-num">{day.dayNumber}</span>
                </div>
                <span className="week-day-summary">{day.summary}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EditorialHomeLayout({
  todayClasses,
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onSelectCourse,
}: LayoutSubProps) {
  return (
    <div className="editorial-layout">
      <section className="editorial-section">
        <div className="editorial-section-header">
          <h2 className="section-title">Hoy en la facultad</h2>
          <span className="section-counter">Martes 10 de noviembre</span>
        </div>
        <div className="editorial-classes-list">
          {todayClasses.map((item) => (
            <div
              key={item.id}
              className={`editorial-class-row ${item.status === 'upcoming' ? 'is-featured' : ''}`}
              data-course-color={item.courseColor}
            >
              <span className="editorial-class-time">
                {item.startTime} – {item.endTime}
              </span>
              <div className="editorial-class-body">
                <div className="editorial-class-title-line">
                  <button
                    type="button"
                    className="inline-course-link"
                    onClick={() => onSelectCourse(item.courseId)}
                  >
                    <strong>{item.courseName}</strong>
                  </button>
                  <span className={`schedule-status-badge status-${item.status}`}>
                    {item.statusLabel}
                  </span>
                </div>
                <p className="editorial-class-topic">{item.sessionTopic}</p>
              </div>
              <span className="editorial-class-location">{item.location}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-section-header">
          <h2 className="section-title">Tareas por vencer</h2>
          <span className="section-counter">
            {tasks.filter((t) => !t.completed).length} pendientes
          </span>
        </div>
        <TaskListWidget tasks={tasks} onToggleTask={onToggleTask} />
      </section>

      <section className="editorial-section">
        <div className="editorial-section-header">
          <h2 className="section-title">Próximas fechas de examen</h2>
          <span className="section-counter">Noviembre 2026</span>
        </div>
        <div className="editorial-exams-list">
          {exams.map((exam) => (
            <div key={exam.id} className="editorial-exam-row" data-course-color={exam.courseColor}>
              <div className="editorial-exam-countdown">
                <span className="editorial-exam-date">{exam.dateLabel}</span>
                <span className={`countdown-chip ${exam.daysLeft <= 5 ? 'is-soon' : ''}`}>
                  en {exam.daysLeft} días
                </span>
              </div>
              <div className="editorial-exam-info">
                <div className="editorial-exam-heading">
                  <span className="course-pill" data-course-color={exam.courseColor}>
                    {exam.courseName}
                  </span>
                  <h3 className="editorial-exam-title">{exam.title}</h3>
                </div>
                <p className="editorial-exam-topics">{exam.topics}</p>
              </div>
              <span className="editorial-exam-room">
                {exam.timeLabel} · {exam.location}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-section-header">
          <h2 className="section-title">Resumen de la semana</h2>
        </div>
        <div className="week-pulse-strip" role="list">
          {weekPulse.map((day) => (
            <div
              key={day.dayShort}
              role="listitem"
              className={`week-day-cell ${day.isToday ? 'is-today' : ''}`}
            >
              <div className="week-day-header">
                <span className="week-day-short">{day.dayShort}</span>
                <span className="week-day-num">{day.dayNumber}</span>
              </div>
              <span className="week-day-summary">{day.summary}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface TaskListWidgetProps {
  tasks: UpcomingTaskItem[];
  onToggleTask: (taskId: string) => void;
}

function TaskListWidget({ tasks, onToggleTask }: TaskListWidgetProps) {
  return (
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
  );
}

interface ExamFichaProps {
  exam: UpcomingExamItem;
  onSelectCourse: (courseId: string) => void;
}

function ExamFicha({ exam, onSelectCourse }: ExamFichaProps) {
  const isUrgent = exam.daysLeft <= 5;
  return (
    <article className="exam-ficha" data-course-color={exam.courseColor}>
      <div className={`exam-countdown-box ${isUrgent ? 'is-urgent' : ''}`}>
        <span className="exam-countdown-number">{exam.daysLeft}</span>
        <span className="exam-countdown-unit">días</span>
      </div>

      <div className="exam-ficha-body">
        <div className="exam-ficha-top">
          <span className="course-pill" data-course-color={exam.courseColor}>
            <span className="course-dot" data-course-color={exam.courseColor} aria-hidden="true" />
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
}
