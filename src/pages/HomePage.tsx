import type {
  HomeLayoutVariant,
  NavSectionId,
  PaletteVariant,
  SampleCourse,
  ThemeMode,
  TodayClassItem,
  TypographyVariant,
  UpcomingExamItem,
  UpcomingTaskItem,
  WeekDayPulse,
} from '../types/design';
import { CURRENT_WEEK_LABEL, TODAY_DISPLAY_DATE } from '../lib/sampleData';

interface HomePageProps {
  variant: HomeLayoutVariant;
  onChangeVariant: (variant: HomeLayoutVariant) => void;
  palette: PaletteVariant;
  onChangePalette: (palette: PaletteVariant) => void;
  typography: TypographyVariant;
  onChangeTypography: (typography: TypographyVariant) => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
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
  palette,
  onChangePalette,
  typography,
  onChangeTypography,
  themeMode,
  onChangeThemeMode,
  todayClasses,
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: HomePageProps) {
  const pendingTasks = tasks.filter((t) => !t.completed);

  return (
    <div className={`home-page home-variant-${variant}`}>
      {/* Design Lab Bar for comparing Variants, Palettes, Typography and Theme in localhost */}
      <section className="design-lab-bar" aria-label="Selector de propuestas de diseño">
        <div className="design-lab-group">
          <span className="design-lab-label" id="lab-screen-label">
            1. Pantalla (Layout)
          </span>
          <div className="segmented-control" role="group" aria-labelledby="lab-screen-label">
            <button
              type="button"
              className={`segmented-option ${variant === 'github' ? 'is-active' : ''}`}
              aria-pressed={variant === 'github'}
              onClick={() => onChangeVariant('github')}
            >
              Estilo GitHub
            </button>
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
              className={`segmented-option ${variant === 'agenda' ? 'is-active' : ''}`}
              aria-pressed={variant === 'agenda'}
              onClick={() => onChangeVariant('agenda')}
            >
              Agenda con Personalidad
            </button>
          </div>
        </div>

        <div className="design-lab-group">
          <span className="design-lab-label" id="lab-palette-label">
            2. Paleta
          </span>
          <div className="segmented-control" role="group" aria-labelledby="lab-palette-label">
            <button
              type="button"
              className={`segmented-option ${palette === 'p1' ? 'is-active' : ''}`}
              aria-pressed={palette === 'p1'}
              onClick={() => onChangePalette('p1')}
            >
              <span className="swatch-dot swatch-p1" aria-hidden="true" />
              P1 · Pizarra
            </button>
            <button
              type="button"
              className={`segmented-option ${palette === 'p2' ? 'is-active' : ''}`}
              aria-pressed={palette === 'p2'}
              onClick={() => onChangePalette('p2')}
            >
              <span className="swatch-dot swatch-p2" aria-hidden="true" />
              P2 · Piedra
            </button>
            <button
              type="button"
              className={`segmented-option ${palette === 'p3' ? 'is-active' : ''}`}
              aria-pressed={palette === 'p3'}
              onClick={() => onChangePalette('p3')}
            >
              <span className="swatch-dot swatch-p3" aria-hidden="true" />
              P3 · Bruma y Pino
            </button>
          </div>
        </div>

        <div className="design-lab-group">
          <span className="design-lab-label" id="lab-font-label">
            3. Tipografía
          </span>
          <div className="segmented-control" role="group" aria-labelledby="lab-font-label">
            <button
              type="button"
              className={`segmented-option ${typography === 't1' ? 'is-active' : ''}`}
              aria-pressed={typography === 't1'}
              onClick={() => onChangeTypography('t1')}
            >
              T1 · Plus Jakarta
            </button>
            <button
              type="button"
              className={`segmented-option ${typography === 't2' ? 'is-active' : ''}`}
              aria-pressed={typography === 't2'}
              onClick={() => onChangeTypography('t2')}
            >
              T2 · Serif + Sans
            </button>
            <button
              type="button"
              className={`segmented-option ${typography === 't3' ? 'is-active' : ''}`}
              aria-pressed={typography === 't3'}
              onClick={() => onChangeTypography('t3')}
            >
              T3 · IBM Plex
            </button>
          </div>
        </div>

        <div className="design-lab-group">
          <span className="design-lab-label" id="lab-theme-label">
            4. Modo
          </span>
          <div className="segmented-control" role="group" aria-labelledby="lab-theme-label">
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
              Sistema
            </button>
          </div>
        </div>
      </section>

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
            Tenés <strong>{todayClasses.length} clases</strong> hoy,{' '}
            <strong>{pendingTasks.length} entregas pendientes</strong> esta semana y tu próximo
            parcial es en <strong>{exams[0]?.daysLeft ?? 0} días</strong>.
          </p>
        </div>
      </header>

      {variant === 'github' ? (
        <GitHubHomeLayout
          todayClasses={todayClasses}
          tasks={tasks}
          exams={exams}
          weekPulse={weekPulse}
          onToggleTask={onToggleTask}
          onNavigateSection={onNavigateSection}
          onSelectCourse={onSelectCourse}
        />
      ) : null}

      {variant === 'bento' ? (
        <BentoAiryHomeLayout
          todayClasses={todayClasses}
          tasks={tasks}
          exams={exams}
          weekPulse={weekPulse}
          onToggleTask={onToggleTask}
          onNavigateSection={onNavigateSection}
          onSelectCourse={onSelectCourse}
        />
      ) : null}

      {variant === 'agenda' ? (
        <AgendaPersonalityHomeLayout
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
  tasks: UpcomingTaskItem[];
  exams: UpcomingExamItem[];
  weekPulse: WeekDayPulse[];
  onToggleTask: (taskId: string) => void;
  onNavigateSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
}

/**
 * PANTALLA 1: NUEVO ESTILO GITHUB (Sobrio, limpio, mucho orden, en reemplazo del Editorial aburrido)
 */
function GitHubHomeLayout({
  todayClasses,
  tasks,
  exams,
  weekPulse,
  onToggleTask,
  onNavigateSection,
  onSelectCourse,
}: LayoutSubProps) {
  const pendingCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="gh-layout">
      {/* Pinned Classes of Today (inspired by GitHub Pinned Repos) */}
      <section className="gh-section">
        <div className="gh-section-bar">
          <div className="section-heading-left">
            <h2 className="section-title">Clases de hoy</h2>
            <span className="gh-counter-pill">{todayClasses.length}</span>
          </div>
          <button
            type="button"
            className="ghost-action-button"
            onClick={() => onNavigateSection('calendario')}
          >
            Ver horario completo
          </button>
        </div>

        <div className="gh-pinned-grid">
          {todayClasses.map((item) => (
            <article
              key={item.id}
              className={`gh-pinned-card ${item.status === 'upcoming' ? 'is-next' : ''}`}
              data-course-color={item.courseColor}
            >
              <div className="gh-pinned-top">
                <div className="gh-pinned-title-wrap">
                  <span
                    className="course-dot"
                    data-course-color={item.courseColor}
                    aria-hidden="true"
                  />
                  <h3 className="gh-pinned-title">
                    <button
                      type="button"
                      className="inline-course-link"
                      onClick={() => onSelectCourse(item.courseId)}
                    >
                      {item.courseName}
                    </button>
                  </h3>
                </div>
                <span className={`gh-status-tag status-${item.status}`}>{item.statusLabel}</span>
              </div>

              <p className="gh-pinned-desc">{item.sessionTopic}</p>

              <div className="gh-pinned-footer">
                <span className="gh-mono-meta">
                  {item.startTime} – {item.endTime}
                </span>
                <span className="gh-dot-sep" aria-hidden="true">
                  ·
                </span>
                <span>{item.location}</span>
                <span className="gh-dot-sep" aria-hidden="true">
                  ·
                </span>
                <span>Prof. {item.professor}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Main 2-column Structured Boxes (Issues-style list + Exams & Week box) */}
      <div className="gh-columns">
        {/* Left: Boxed Table for Tasks */}
        <section className="gh-box" aria-label="Tareas por vencer">
          <div className="gh-box-header">
            <div className="section-heading-left">
              <h2 className="section-title">Tareas por vencer</h2>
              <span className="gh-counter-pill">{pendingCount} pendientes</span>
            </div>
            <button
              type="button"
              className="ghost-action-button"
              onClick={() => onNavigateSection('tareas')}
            >
              Abrir todas
            </button>
          </div>

          <div className="gh-box-list">
            {tasks.map((task) => {
              const checkboxId = `gh-task-${task.id}`;
              return (
                <div
                  key={task.id}
                  className={`gh-list-row ${task.completed ? 'is-completed' : ''}`}
                  data-course-color={task.courseColor}
                >
                  <div className="gh-row-left">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      className="task-checkbox"
                      checked={task.completed}
                      onChange={() => onToggleTask(task.id)}
                    />
                    <div className="gh-row-text">
                      <label htmlFor={checkboxId} className="task-title-label">
                        {task.title}
                      </label>
                      <div className="gh-row-submeta">
                        <span
                          className="course-dot"
                          data-course-color={task.courseColor}
                          aria-hidden="true"
                        />
                        <span>{task.courseName}</span>
                        {task.priority === 'Alta' && !task.completed ? (
                          <span className="gh-outline-tag is-high">Prioridad alta</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`gh-due-tag urgency-${task.urgency} ${
                      task.completed ? 'is-done' : ''
                    }`}
                  >
                    {task.completed ? 'Completada' : task.dueLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Boxed Exams + Boxed Week Pulse */}
        <div className="gh-right-stack">
          <section className="gh-box" aria-label="Próximos exámenes">
            <div className="gh-box-header">
              <div className="section-heading-left">
                <h2 className="section-title">Próximos exámenes</h2>
                <span className="gh-counter-pill">{exams.length}</span>
              </div>
              <button
                type="button"
                className="ghost-action-button"
                onClick={() => onNavigateSection('examenes')}
              >
                Ver mesas
              </button>
            </div>

            <div className="gh-box-list">
              {exams.map((exam) => (
                <div key={exam.id} className="gh-exam-row" data-course-color={exam.courseColor}>
                  <div className="gh-exam-main">
                    <div className="gh-exam-title-line">
                      <span
                        className="course-dot"
                        data-course-color={exam.courseColor}
                        aria-hidden="true"
                      />
                      <h3 className="gh-exam-title">
                        <button
                          type="button"
                          className="inline-course-link"
                          onClick={() => onSelectCourse(exam.courseId)}
                        >
                          {exam.title}
                        </button>
                      </h3>
                    </div>
                    <span className="gh-exam-course-name">{exam.courseName}</span>
                    <p className="gh-exam-topics">{exam.topics}</p>
                    <span className="gh-mono-meta">
                      {exam.dateLabel} · {exam.timeLabel} · {exam.location}
                    </span>
                  </div>

                  <span className={`gh-countdown-badge ${exam.daysLeft <= 5 ? 'is-soon' : ''}`}>
                    {exam.daysLeft} días
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="gh-box" aria-label="Pulso de la semana">
            <div className="gh-box-header">
              <h2 className="section-title">Pulso de la semana</h2>
              <span className="gh-mono-meta">Lun 09 – Dom 15 nov</span>
            </div>
            <div className="gh-week-box-body">
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
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * PANTALLA 2: BENTO CON AIRE (Mantiene Clases de hoy y Pulso de la semana, mucho más aire y menos sobrecarga)
 */
function BentoAiryHomeLayout({
  todayClasses,
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
      {/* Row 1: Kept Today's classes cards with generous breathing room */}
      <section className="dashboard-block">
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

        <div className="today-classes-grid is-airy">
          {todayClasses.map((item) => (
            <article
              key={item.id}
              className={`schedule-strip-card is-airy ${
                item.status === 'upcoming' ? 'is-featured' : ''
              } ${item.status === 'completed' ? 'is-past' : ''}`}
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

      {/* Row 2: Uncluttered 2-column split with generous padding and gap */}
      <div className="bento-airy-columns">
        <section className="surface-panel is-airy">
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

          <TaskListWidget tasks={tasks} onToggleTask={onToggleTask} airy />
        </section>

        <section className="surface-panel is-airy">
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
              Ver mesas
            </button>
          </div>

          <div className="exams-stack is-airy">
            {exams.map((exam) => (
              <ExamFicha key={exam.id} exam={exam} onSelectCourse={onSelectCourse} />
            ))}
          </div>
        </section>
      </div>

      {/* Row 3: Kept Week Pulse spanning full width with generous breathing room */}
      <section className="surface-panel is-airy">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 className="section-title">Pulso de la semana</h2>
            <span className="section-counter">Lunes 09 al Domingo 15 de noviembre</span>
          </div>
        </div>

        <div className="week-pulse-strip is-airy" role="list">
          {weekPulse.map((day) => (
            <div
              key={day.dayShort}
              role="listitem"
              className={`week-day-cell is-airy ${day.isToday ? 'is-today' : ''} ${
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
 * PANTALLA 3: AGENDA CON PERSONALIDAD (Mantiene todos los paneles, alinea columnas y suma riel cronológico en vivo)
 */
function AgendaPersonalityHomeLayout({
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
    <div className="agenda-personality-layout">
      {/* Left Column: Live Day Rail with "NOW" node and Day Progress */}
      <aside className="agenda-rail-panel surface-panel" aria-label="Agenda cronológica de hoy">
        <div className="agenda-rail-header">
          <div>
            <span className="agenda-rail-eyebrow">Cronograma en vivo</span>
            <h2 className="section-title">Agenda de hoy</h2>
          </div>
          <span className="agenda-clock-pill">17:55 hs</span>
        </div>

        <div className="agenda-progress-box">
          <div className="agenda-progress-labels">
            <span>1 de 2 clases cursadas</span>
            <span>50% del día</span>
          </div>
          <div className="agenda-progress-track" aria-hidden="true">
            <div className="agenda-progress-fill" style={{ width: '50%' }} />
          </div>
        </div>

        <div className="agenda-vertical-rail">
          {/* First class (completed) */}
          {todayClasses[0] ? (
            <div className="rail-node is-past" data-course-color={todayClasses[0].courseColor}>
              <span
                className="rail-dot"
                data-course-color={todayClasses[0].courseColor}
                aria-hidden="true"
              />
              <div className="rail-content">
                <div className="rail-time-row">
                  <span className="rail-time">
                    {todayClasses[0].startTime} – {todayClasses[0].endTime}
                  </span>
                  <span className="rail-state-tag">{todayClasses[0].statusLabel}</span>
                </div>
                <h3 className="rail-title">{todayClasses[0].courseName}</h3>
                <p className="rail-topic">{todayClasses[0].sessionTopic}</p>
                <span className="rail-meta">{todayClasses[0].location}</span>
              </div>
            </div>
          ) : null}

          {/* LIVE "NOW" Marker */}
          <div className="rail-now-marker">
            <span className="rail-now-pulse" aria-hidden="true" />
            <span className="rail-now-label">Ahora · 35 min libres antes de entrar a cursar</span>
          </div>

          {/* Next class (featured) */}
          {todayClasses[1] ? (
            <div className="rail-node is-featured" data-course-color={todayClasses[1].courseColor}>
              <span
                className="rail-dot"
                data-course-color={todayClasses[1].courseColor}
                aria-hidden="true"
              />
              <div className="rail-content is-featured-card">
                <div className="rail-time-row">
                  <span className="rail-time">
                    {todayClasses[1].startTime} – {todayClasses[1].endTime}
                  </span>
                  <span className="schedule-status-badge status-upcoming">
                    {todayClasses[1].statusLabel}
                  </span>
                </div>
                <h3 className="rail-title">
                  <button
                    type="button"
                    className="inline-course-link"
                    onClick={() => onSelectCourse(todayClasses[1].courseId)}
                  >
                    {todayClasses[1].courseName}
                  </button>
                </h3>
                <p className="rail-topic">{todayClasses[1].sessionTopic}</p>
                <span className="rail-meta">
                  {todayClasses[1].location} · Prof. {todayClasses[1].professor}
                </span>
              </div>
            </div>
          ) : null}

          {/* 23:59 Deliveries anchored on the same rail */}
          {todayDueTasks.map((t) => (
            <div key={t.id} className="rail-node is-deadline" data-course-color={t.courseColor}>
              <span className="rail-dot" data-course-color={t.courseColor} aria-hidden="true" />
              <div className="rail-content">
                <div className="rail-time-row">
                  <span className="rail-time">23:59 · Cierre de entrega</span>
                  <span className="course-pill" data-course-color={t.courseColor}>
                    {t.courseName}
                  </span>
                </div>
                <p className={`rail-deadline-title ${t.completed ? 'is-done-text' : ''}`}>
                  {t.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Right Column: Aligned top-to-bottom stack keeping all panels */}
      <div className="agenda-right-column">
        <section className="surface-panel">
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
              Ir a Tareas
            </button>
          </div>
          <TaskListWidget tasks={tasks} onToggleTask={onToggleTask} />
        </section>

        <section className="surface-panel">
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

        <section className="surface-panel">
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
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

interface TaskListWidgetProps {
  tasks: UpcomingTaskItem[];
  onToggleTask: (taskId: string) => void;
  airy?: boolean;
}

function TaskListWidget({ tasks, onToggleTask, airy = false }: TaskListWidgetProps) {
  return (
    <div className={`task-checklist ${airy ? 'is-airy' : ''}`}>
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
