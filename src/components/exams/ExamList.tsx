import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import {
  DAY_SHORT_NAMES_ES,
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../../lib/dates';
import type {
  CourseWithSchedules,
  DayOfWeek,
  ExamCategory,
  ExamFilters,
  ExamWithCourse,
} from '../../types/domain';

export const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'TP evaluativo',
};

export function formatExamDateLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  const date = parseIsoDateLocal(isoDate);
  const jsDay = date.getDay();
  const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const dayShort = DAY_SHORT_NAMES_ES[dayOfWeek];
  const monthShort = MONTH_SHORT_NAMES_ES[date.getMonth()] ?? '';
  return `${dayShort} ${date.getDate()} ${monthShort}`;
}

export function calculateDaysLeft(
  examDateIso: string,
  referenceDate: Date = new Date()
): number {
  const target = parseIsoDateLocal(examDateIso);
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / 86_400_000);
}

export function calculateAverageFromExams(
  exams: ReadonlyArray<Pick<ExamWithCourse, 'grade'>>
): number | null {
  const graded = exams.filter(
    (e): e is { grade: number } => typeof e.grade === 'number' && !Number.isNaN(e.grade)
  );
  if (graded.length === 0) {
    return null;
  }
  const sum = graded.reduce((acc, item) => acc + item.grade, 0);
  return Math.round((sum / graded.length) * 100) / 100;
}

export interface ExamListProps {
  courseId?: string;
  onSelectCourse?: (courseId: string | null) => void;
  onExamsChanged?: () => void;
  showCreateButton?: boolean;
  createRequestVersion?: number;
  referenceDate?: Date;
}

export function ExamList({
  courseId,
  onSelectCourse,
  onExamsChanged,
  showCreateButton = true,
  createRequestVersion = 0,
  referenceDate,
}: ExamListProps) {
  const [exams, setExams] = useState<ExamWithCourse[]>([]);
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [viewFilter, setViewFilter] = useState<'all' | 'upcoming' | 'graded'>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');

  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCourseId, setFormCourseId] = useState('');
  const [formCategory, setFormCategory] = useState<ExamCategory>('parcial');
  const [formExamDate, setFormExamDate] = useState('');
  const [formExamTime, setFormExamTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formTopics, setFormTopics] = useState('');
  const [formGrade, setFormGrade] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveCourseFilter =
    courseId ?? (courseFilter === 'all' ? undefined : courseFilter);

  const loadData = useCallback(async () => {
    const filters: ExamFilters = {};
    if (effectiveCourseFilter) {
      filters.courseId = effectiveCourseFilter;
    }

    const [loadedExams, loadedCourses] = await Promise.all([
      cursadaClient.listExams(filters),
      courseId ? Promise.resolve([]) : cursadaClient.listCourses({ status: 'active' }),
    ]);

    setExams(loadedExams);
    if (!courseId) {
      setCourses(loadedCourses);
    }
  }, [courseId, effectiveCourseFilter]);

  useEffect(() => {
    let active = true;
    const filters: ExamFilters = {};
    if (effectiveCourseFilter) {
      filters.courseId = effectiveCourseFilter;
    }

    void Promise.all([
      cursadaClient.listExams(filters),
      courseId ? Promise.resolve([]) : cursadaClient.listCourses({ status: 'active' }),
    ]).then(([loadedExams, loadedCourses]) => {
      if (!active) return;
      setExams(loadedExams);
      if (!courseId) {
        setCourses(loadedCourses);
      }
    });

    const handleExternalChange = () => {
      void loadData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleExternalChange);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleExternalChange);
    };
  }, [courseId, effectiveCourseFilter, loadData]);

  const openCreateForm = useCallback(() => {
    const defaultCourseId =
      courseId ?? (courseFilter !== 'all' ? courseFilter : (courses[0]?.id ?? ''));
    setFormMode('create');
    setEditingExamId(null);
    setFormTitle('');
    setFormCourseId(defaultCourseId);
    setFormCategory('parcial');
    setFormExamDate('');
    setFormExamTime('18:30');
    setFormLocation('');
    setFormTopics('');
    setFormGrade('');
    setFormError(null);
  }, [courseId, courseFilter, courses]);

  useEffect(() => {
    if (createRequestVersion > 0) {
      openCreateForm();
    }
  }, [createRequestVersion, openCreateForm]);

  useEffect(() => {
    if (formMode === 'create' && !courseId && !formCourseId && courses.length > 0) {
      setFormCourseId(courseFilter !== 'all' ? courseFilter : courses[0].id);
    }
  }, [formMode, courseId, formCourseId, courses, courseFilter]);

  const todayIso = useMemo(
    () => toIsoDateString(referenceDate ?? new Date()),
    [referenceDate]
  );

  const visibleExams = useMemo(() => {
    if (viewFilter === 'upcoming') {
      return exams.filter((e) => e.grade === null && e.examDate >= todayIso);
    }
    if (viewFilter === 'graded') {
      return exams.filter((e) => e.grade !== null);
    }
    // Sort upcoming ungraded first (nearest first), then graded/past
    return [...exams].sort((a, b) => {
      const aUpcoming = a.grade === null ? 0 : 1;
      const bUpcoming = b.grade === null ? 0 : 1;
      if (aUpcoming !== bUpcoming) {
        return aUpcoming - bUpcoming;
      }
      return a.examDate.localeCompare(b.examDate);
    });
  }, [exams, viewFilter, todayIso]);

  const averageGrade = useMemo(() => calculateAverageFromExams(exams), [exams]);
  const gradedCount = useMemo(
    () => exams.filter((e) => e.grade !== null).length,
    [exams]
  );

  function handleStartEdit(exam: ExamWithCourse): void {
    setFormMode('edit');
    setEditingExamId(exam.id);
    setFormTitle(exam.title);
    setFormCourseId(exam.courseId);
    setFormCategory(exam.category);
    setFormExamDate(exam.examDate);
    setFormExamTime(exam.examTime ?? '');
    setFormLocation(exam.location);
    setFormTopics(exam.topics);
    setFormGrade(exam.grade !== null ? String(exam.grade) : '');
    setFormError(null);
  }

  function handleCancelForm(): void {
    setFormMode('closed');
    setEditingExamId(null);
    setFormError(null);
  }

  async function handleSubmitForm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setFormError('El título del examen es obligatorio.');
      return;
    }

    const targetCourseId = courseId ?? formCourseId;
    if (!targetCourseId) {
      setFormError('Seleccioná una materia para el examen.');
      return;
    }

    const trimmedDate = formExamDate.trim();
    if (!trimmedDate) {
      setFormError('La fecha del examen es obligatoria.');
      return;
    }

    let parsedGrade: number | null = null;
    if (formGrade.trim() !== '') {
      const num = Number(formGrade.replace(',', '.'));
      if (Number.isNaN(num) || num < 1 || num > 10) {
        setFormError('La nota debe estar en la escala de 1 a 10.');
        return;
      }
      parsedGrade = Math.round(num * 100) / 100;
    }

    try {
      if (formMode === 'create') {
        await cursadaClient.createExam({
          courseId: targetCourseId,
          title: trimmedTitle,
          category: formCategory,
          examDate: trimmedDate,
          examTime: formExamTime.trim() || null,
          location: formLocation.trim(),
          topics: formTopics.trim(),
          grade: parsedGrade,
        });
      } else if (formMode === 'edit' && editingExamId) {
        await cursadaClient.updateExam(editingExamId, {
          courseId: targetCourseId,
          title: trimmedTitle,
          category: formCategory,
          examDate: trimmedDate,
          examTime: formExamTime.trim() || null,
          location: formLocation.trim(),
          topics: formTopics.trim(),
          grade: parsedGrade,
        });
      }

      setFormMode('closed');
      setEditingExamId(null);
      await loadData();
      onExamsChanged?.();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo guardar el examen.'
      );
    }
  }

  async function handleDelete(examId: string): Promise<void> {
    await cursadaClient.deleteExam(examId);
    if (editingExamId === examId) {
      handleCancelForm();
    }
    await loadData();
    onExamsChanged?.();
  }

  return (
    <div className="exams-view-container">
      <div className="surface-panel exams-toolbar-panel">
        <div className="task-list-toolbar exams-toolbar">
          <div
            className="task-status-segmented"
            role="group"
            aria-label="Filtrar exámenes"
          >
            <button
              type="button"
              className={`task-filter-pill ${viewFilter === 'all' ? 'is-active' : ''}`}
              aria-pressed={viewFilter === 'all'}
              onClick={() => setViewFilter('all')}
            >
              Todos ({exams.length})
            </button>
            <button
              type="button"
              className={`task-filter-pill ${viewFilter === 'upcoming' ? 'is-active' : ''}`}
              aria-pressed={viewFilter === 'upcoming'}
              onClick={() => setViewFilter('upcoming')}
            >
              Próximos
            </button>
            <button
              type="button"
              className={`task-filter-pill ${viewFilter === 'graded' ? 'is-active' : ''}`}
              aria-pressed={viewFilter === 'graded'}
              onClick={() => setViewFilter('graded')}
            >
              Rendidos ({gradedCount})
            </button>
          </div>

          <div className="task-toolbar-right">
            {averageGrade !== null ? (
              <span
                className="exam-average-summary-pill"
                data-testid="exams-average-pill"
              >
                Promedio {averageGrade.toFixed(1)} ({gradedCount}{' '}
                {gradedCount === 1 ? 'nota' : 'notas'})
              </span>
            ) : null}

            {!courseId ? (
              <div className="task-course-filter-field">
                <label htmlFor="exam-course-filter" className="visually-hidden">
                  Filtrar exámenes por materia
                </label>
                <select
                  id="exam-course-filter"
                  className="task-select"
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                >
                  <option value="all">Todas las materias</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {showCreateButton ? (
              <button
                type="button"
                className="primary-button"
                onClick={openCreateForm}
              >
                Agendar examen
              </button>
            ) : null}
          </div>
        </div>

        {formMode !== 'closed' ? (
          <form
            className="task-editor-form exam-editor-form"
            aria-label={formMode === 'create' ? 'Agendar examen' : 'Editar examen'}
            onSubmit={(e) => void handleSubmitForm(e)}
          >
            <div className="task-editor-header">
              <h3 className="task-editor-title">
                {formMode === 'create' ? 'Agendar examen' : 'Editar examen'}
              </h3>
            </div>

            {formError ? (
              <div role="alert" className="task-form-error">
                {formError}
              </div>
            ) : null}

            <div className="task-editor-grid">
              <div className="task-form-field is-wide">
                <label htmlFor="exam-form-title" className="task-form-label">
                  Instancia / Título
                </label>
                <input
                  id="exam-form-title"
                  type="text"
                  className="task-input"
                  placeholder="Ej. 2° Parcial Teórico-Práctico"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {!courseId ? (
                <div className="task-form-field">
                  <label htmlFor="exam-form-course" className="task-form-label">
                    Materia
                  </label>
                  <select
                    id="exam-form-course"
                    className="task-select"
                    value={formCourseId}
                    onChange={(e) => setFormCourseId(e.target.value)}
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="task-form-field">
                <label htmlFor="exam-form-category" className="task-form-label">
                  Categoría
                </label>
                <select
                  id="exam-form-category"
                  className="task-select"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ExamCategory)}
                >
                  <option value="parcial">Parcial</option>
                  <option value="recuperatorio">Recuperatorio</option>
                  <option value="final">Final</option>
                  <option value="tp">TP evaluativo</option>
                </select>
              </div>

              <div className="task-form-field">
                <label htmlFor="exam-form-date" className="task-form-label">
                  Fecha
                </label>
                <input
                  id="exam-form-date"
                  type="date"
                  className="task-input"
                  value={formExamDate}
                  onChange={(e) => setFormExamDate(e.target.value)}
                />
              </div>

              <div className="task-form-field">
                <label htmlFor="exam-form-time" className="task-form-label">
                  Horario (opcional)
                </label>
                <input
                  id="exam-form-time"
                  type="time"
                  className="task-input"
                  value={formExamTime}
                  onChange={(e) => setFormExamTime(e.target.value)}
                />
              </div>

              <div className="task-form-field">
                <label htmlFor="exam-form-location" className="task-form-label">
                  Aula / Modalidad (opcional)
                </label>
                <input
                  id="exam-form-location"
                  type="text"
                  className="task-input"
                  placeholder="Ej. Aula 402 · Lima"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>

              <div className="task-form-field">
                <label htmlFor="exam-form-grade" className="task-form-label">
                  Nota obtenida (1 a 10, opcional)
                </label>
                <input
                  id="exam-form-grade"
                  type="number"
                  min={1}
                  max={10}
                  step="0.1"
                  className="task-input"
                  placeholder="Sin rendir"
                  value={formGrade}
                  onChange={(e) => setFormGrade(e.target.value)}
                />
              </div>

              <div className="task-form-field is-full">
                <label htmlFor="exam-form-topics" className="task-form-label">
                  Temas a evaluar
                </label>
                <textarea
                  id="exam-form-topics"
                  className="task-textarea"
                  rows={2}
                  placeholder="Unidades, capítulos o temas que entran en el examen"
                  value={formTopics}
                  onChange={(e) => setFormTopics(e.target.value)}
                />
              </div>
            </div>

            <div className="task-editor-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleCancelForm}
              >
                Cancelar
              </button>
              <button type="submit" className="primary-button">
                {formMode === 'create' ? 'Guardar examen' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {visibleExams.length === 0 ? (
        <div className="surface-panel task-empty-state">
          <p className="task-empty-title">No hay exámenes para mostrar</p>
          <p className="task-empty-subtitle">
            Agendá tus próximos parciales, TPs evaluativos o finales para seguir la cuenta
            regresiva y calcular tu promedio.
          </p>
        </div>
      ) : (
        <div className="basic-exams-grid">
          {visibleExams.map((exam) => {
            const daysLeft = calculateDaysLeft(exam.examDate, referenceDate);
            const isGraded = exam.grade !== null;
            const isUrgent = !isGraded && daysLeft >= 0 && daysLeft <= 5;
            const dateLabel = formatExamDateLabel(exam.examDate);

            return (
              <article
                key={exam.id}
                className="surface-panel exam-ficha"
                data-course-color={exam.courseColor}
                data-exam-id={exam.id}
              >
                <div
                  className={`exam-countdown-box ${isUrgent ? 'is-urgent' : ''} ${
                    isGraded ? 'is-graded' : ''
                  }`}
                >
                  {isGraded ? (
                    <>
                      <span className="exam-countdown-number">
                        {exam.grade!.toFixed(1)}
                      </span>
                      <span className="exam-countdown-unit">nota</span>
                    </>
                  ) : daysLeft < 0 ? (
                    <>
                      <span className="exam-countdown-number">—</span>
                      <span className="exam-countdown-unit">rendido</span>
                    </>
                  ) : (
                    <>
                      <span className="exam-countdown-number">{daysLeft}</span>
                      <span className="exam-countdown-unit">
                        {daysLeft === 1 ? 'día' : 'días'}
                      </span>
                    </>
                  )}
                </div>

                <div className="exam-ficha-body">
                  <div className="exam-ficha-top">
                    {!courseId && onSelectCourse ? (
                      <button
                        type="button"
                        className="inline-course-link"
                        onClick={() => onSelectCourse(exam.courseId)}
                      >
                        <span
                          className="course-pill"
                          data-course-color={exam.courseColor}
                        >
                          <span
                            className="course-dot"
                            data-course-color={exam.courseColor}
                            aria-hidden="true"
                          />
                          {exam.courseName}
                        </span>
                      </button>
                    ) : (
                      <span
                        className="course-pill"
                        data-course-color={exam.courseColor}
                      >
                        <span
                          className="course-dot"
                          data-course-color={exam.courseColor}
                          aria-hidden="true"
                        />
                        {exam.courseName}
                      </span>
                    )}

                    <span className="exam-date-meta">
                      {dateLabel}
                      {exam.examTime ? ` · ${exam.examTime}` : ''}
                    </span>
                  </div>

                  <h2 className="exam-ficha-title">{exam.title}</h2>

                  {exam.topics ? (
                    <p className="exam-ficha-topics">{exam.topics}</p>
                  ) : null}

                  <div className="exam-ficha-footer">
                    <div className="exam-ficha-footer-meta">
                      <span className="exam-category-tag">
                        {EXAM_CATEGORY_LABELS[exam.category]}
                      </span>
                      {exam.location ? (
                        <span className="exam-location-text">{exam.location}</span>
                      ) : null}
                    </div>

                    <div className="task-row-actions exam-ficha-actions">
                      <button
                        type="button"
                        className="ghost-action-button task-action-btn"
                        aria-label={`Editar ${exam.title}`}
                        onClick={() => handleStartEdit(exam)}
                      >
                        {isGraded ? 'Editar' : 'Editar / Nota'}
                      </button>
                      <button
                        type="button"
                        className="ghost-action-button task-action-btn is-danger"
                        aria-label={`Eliminar ${exam.title}`}
                        onClick={() => void handleDelete(exam.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
