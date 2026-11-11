import type {
  SampleCourse,
  SampleNoteItem,
  UpcomingExamItem,
  UpcomingTaskItem,
  WeekDayPulse,
} from '../types/design';

export function CalendarioBasicView({
  courses,
  weekPulse,
}: {
  courses: SampleCourse[];
  weekPulse: WeekDayPulse[];
}) {
  return (
    <div className="basic-view">
      <header className="page-header">
        <div className="page-header-titles">
          <span className="page-date-text">Noviembre 2026 · Vista semanal</span>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Calendario
          </h1>
          <p className="page-subtitle">
            Vista base de la grilla semanal (Lunes a Domingo). En la Fase 1 y 2 mostrará los bloques
            horarios de cursada y las entregas de la semana.
          </p>
        </div>
        <div className="basic-header-actions">
          <button type="button" className="secondary-button">
            Semana anterior
          </button>
          <button type="button" className="secondary-button">
            Hoy
          </button>
          <button type="button" className="secondary-button">
            Semana siguiente
          </button>
        </div>
      </header>

      <section className="surface-panel calendar-skeleton-panel" aria-label="Grilla semanal">
        <div className="calendar-skeleton-header">
          {weekPulse.map((day) => (
            <div
              key={day.dayShort}
              className={`calendar-col-head ${day.isToday ? 'is-today' : ''}`}
            >
              <span className="week-day-short">{day.dayShort}</span>
              <span className="week-day-num">{day.dayNumber}</span>
            </div>
          ))}
        </div>

        <div className="calendar-skeleton-body">
          <div className="calendar-day-col">
            <span className="calendar-empty-slot">Sin clases</span>
          </div>
          <div className="calendar-day-col is-today">
            <div className="calendar-block" data-course-color="violet">
              <span className="calendar-block-time">14:00 – 18:00</span>
              <strong>Diseño de Sistemas</strong>
              <span>Aula 308 · Lima</span>
            </div>
            <div className="calendar-block" data-course-color="blue">
              <span className="calendar-block-time">18:30 – 22:30</span>
              <strong>Ingeniería de Software I</strong>
              <span>Aula 402 · Lima</span>
            </div>
          </div>
          <div className="calendar-day-col">
            <div className="calendar-block" data-course-color="emerald">
              <span className="calendar-block-time">18:30 – 22:30</span>
              <strong>Base de Datos II</strong>
              <span>Lab 504 · Lima</span>
            </div>
          </div>
          <div className="calendar-day-col">
            <div className="calendar-block" data-course-color="amber">
              <span className="calendar-block-time">14:00 – 18:00</span>
              <strong>Probabilidad y Estadística</strong>
              <span>Aula 215 · Monserrat</span>
            </div>
            <div className="calendar-block" data-course-color="violet">
              <span className="calendar-block-time">18:30 – 22:30</span>
              <strong>Diseño de Sistemas</strong>
              <span>Aula 308 · Lima</span>
            </div>
          </div>
          <div className="calendar-day-col">
            <div className="calendar-block" data-course-color="rose">
              <span className="calendar-block-time">18:30 – 22:30</span>
              <strong>Paradigmas de Programación</strong>
              <span>Virtual · Sincrónica</span>
            </div>
          </div>
          <div className="calendar-day-col">
            <span className="calendar-empty-slot">Sábado libre</span>
          </div>
          <div className="calendar-day-col">
            <span className="calendar-empty-slot">Domingo libre</span>
          </div>
        </div>
      </section>

      <div className="calendar-legend" role="list" aria-label="Referencias de materias">
        {courses.map((c) => (
          <span key={c.id} role="listitem" className="course-pill" data-course-color={c.color}>
            <span className="course-dot" data-course-color={c.color} aria-hidden="true" />
            {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TareasBasicView({
  tasks,
  onToggleTask,
}: {
  tasks: UpcomingTaskItem[];
  onToggleTask: (id: string) => void;
}) {
  return (
    <div className="basic-view">
      <header className="page-header">
        <div className="page-header-titles">
          <span className="page-date-text">Gestión de entregas</span>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Tareas
          </h1>
          <p className="page-subtitle">
            Vista base de tareas globales. En la Fase 2 permitirá filtrar por estado (Pendientes /
            Completadas) y por materia.
          </p>
        </div>
        <button type="button" className="primary-button">
          Nueva tarea
        </button>
      </header>

      <section className="surface-panel" aria-label="Lista de tareas">
        <div className="task-checklist">
          {tasks.map((task) => {
            const checkboxId = `tasks-view-${task.id}`;
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
                  <span className="course-pill" data-course-color={task.courseColor}>
                    <span
                      className="course-dot"
                      data-course-color={task.courseColor}
                      aria-hidden="true"
                    />
                    {task.courseName}
                  </span>
                  <span className={`task-due-badge urgency-${task.urgency}`}>
                    {task.completed ? 'Completada' : task.dueLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function ExamenesBasicView({ exams }: { exams: UpcomingExamItem[] }) {
  return (
    <div className="basic-view">
      <header className="page-header">
        <div className="page-header-titles">
          <span className="page-date-text">Parciales, TPs evaluativos y finales</span>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Exámenes
          </h1>
          <p className="page-subtitle">
            Vista base de instancias de evaluación. En la Fase 3 incluirá carga de calificaciones
            (escala 1 a 10) e historial de promedio por materia.
          </p>
        </div>
        <button type="button" className="primary-button">
          Agendar examen
        </button>
      </header>

      <div className="basic-exams-grid">
        {exams.map((exam) => (
          <article
            key={exam.id}
            className="surface-panel exam-ficha"
            data-course-color={exam.courseColor}
          >
            <div className={`exam-countdown-box ${exam.daysLeft <= 5 ? 'is-urgent' : ''}`}>
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
              <h2 className="exam-ficha-title">{exam.title}</h2>
              <p className="exam-ficha-topics">{exam.topics}</p>
              <div className="exam-ficha-footer">
                <span className="exam-category-tag">{exam.category}</span>
                <span className="exam-location-text">{exam.location}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function NotasBasicView({ notes }: { notes: SampleNoteItem[] }) {
  return (
    <div className="basic-view">
      <header className="page-header">
        <div className="page-header-titles">
          <span className="page-date-text">Apuntes en Markdown y resúmenes</span>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Notas
          </h1>
          <p className="page-subtitle">
            Vista base de apuntes de estudio. En la Fase 4 incorporará el editor Markdown en vivo y
            búsqueda instantánea sin distinción de tildes.
          </p>
        </div>
        <button type="button" className="primary-button">
          Nueva nota
        </button>
      </header>

      <div className="notes-basic-grid">
        {notes.map((note) => (
          <article key={note.id} className="surface-panel note-preview-card">
            <div className="note-card-top">
              <span className="course-pill" data-course-color={note.courseColor}>
                <span
                  className="course-dot"
                  data-course-color={note.courseColor}
                  aria-hidden="true"
                />
                {note.courseName}
              </span>
              <span className="note-updated-label">{note.updatedAtLabel}</span>
            </div>
            <h2 className="note-card-title">{note.title}</h2>
            <p className="note-card-excerpt">{note.excerpt}</p>
            <div className="note-card-footer">
              <span className="note-origin-tag">{note.originLabel}</span>
              {note.isPinned ? <span className="note-pinned-badge">Fijada</span> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function MateriasBasicView({
  courses,
  selectedCourseId,
  onSelectCourse,
}: {
  courses: SampleCourse[];
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
}) {
  const activeCourse = courses.find((c) => c.id === selectedCourseId) ?? null;

  return (
    <div className="basic-view">
      <header className="page-header">
        <div className="page-header-titles">
          <span className="page-date-text">2026 · 2° Cuatrimestre</span>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            {activeCourse ? activeCourse.name : 'Materias'}
          </h1>
          <p className="page-subtitle">
            {activeCourse
              ? `Prof. ${activeCourse.professor} · ${activeCourse.scheduleSummary} · ${activeCourse.location}`
              : 'Vista base de materias del cuatrimestre actual. Hacé clic en cualquier materia para ver su ficha.'}
          </p>
        </div>
        <div className="basic-header-actions">
          {activeCourse ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onSelectCourse(null)}
            >
              Ver todas las materias
            </button>
          ) : null}
          <button type="button" className="primary-button">
            Nueva materia
          </button>
        </div>
      </header>

      <div className="courses-cards-grid">
        {courses.map((course) => {
          const isFocused = activeCourse?.id === course.id;
          return (
            <article
              key={course.id}
              className={`surface-panel course-overview-card ${isFocused ? 'is-focused' : ''}`}
              data-course-color={course.color}
            >
              <div className="course-card-header">
                <span className="course-pill" data-course-color={course.color}>
                  <span className="course-dot" data-course-color={course.color} aria-hidden="true" />
                  {course.shortCode}
                </span>
                {course.averageGrade !== undefined ? (
                  <span className="course-grade-pill">
                    Promedio {course.averageGrade.toFixed(1)}
                  </span>
                ) : null}
              </div>

              <h2 className="course-card-title">
                <button
                  type="button"
                  className="inline-course-link"
                  onClick={() => onSelectCourse(course.id)}
                >
                  {course.name}
                </button>
              </h2>
              <p className="course-card-professor">Prof. {course.professor}</p>

              <div className="course-card-details">
                <div className="course-detail-row">
                  <span className="course-detail-label">Cursada</span>
                  <span className="course-detail-value">{course.scheduleSummary}</span>
                </div>
                <div className="course-detail-row">
                  <span className="course-detail-label">Aula / Modalidad</span>
                  <span className="course-detail-value">{course.location}</span>
                </div>
                <div className="course-detail-row">
                  <span className="course-detail-label">Pendientes</span>
                  <span className="course-detail-value">
                    {course.pendingTasksCount} tarea{course.pendingTasksCount === 1 ? '' : 's'}
                    {course.nextExamLabel ? ` · ${course.nextExamLabel}` : ''}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
