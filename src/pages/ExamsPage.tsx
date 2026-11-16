import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  DAY_SHORT_NAMES_ES,
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../lib/dates';
import { generateAndStoreReport } from '../lib/reportsStore';
import type {
  CourseWithSchedules,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  NoteWithCourse,
} from '../types/domain';
import {
  SwissButton,
  SwissEmptyState,
  SwissErrorAlert,
  SwissLinkButton,
  SwissLoadingBar,
  SwissProgressBar,
  SwissSectionHeader,
  SwissSelect,
} from '../ui';

export interface ExamsPageProps {
  onSelectCourse: (courseId: string | null) => void;
  onExamsChanged?: () => void;
  onOpenReport?: (reportId: string) => void;
  referenceDate?: Date;
  externalCreateVersion?: number;
}

const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'TP evaluativo',
};

function formatExamDateShort(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  const date = parseIsoDateLocal(isoDate);
  const jsDay = date.getDay();
  const dayOfWeek = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const dayShort = DAY_SHORT_NAMES_ES[dayOfWeek].toLowerCase();
  const monthShort = MONTH_SHORT_NAMES_ES[date.getMonth()] ?? '';
  return `${dayShort} ${date.getDate()} ${monthShort}`;
}

function calculateDaysLeft(examDateIso: string, referenceDate: Date): number {
  const target = parseIsoDateLocal(examDateIso);
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function calculateOverallAverage(
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

function formatHeaderMeta(upcoming: ExamWithCourse[], effectiveDate: Date): string {
  if (upcoming.length === 0) {
    return 'Sin exámenes próximos agendados';
  }
  const firstDays = Math.max(0, calculateDaysLeft(upcoming[0].examDate, effectiveDate));
  const countPart =
    upcoming.length === 1 ? '1 próximo' : `${upcoming.length} próximos`;
  const whenPart =
    firstDays === 0
      ? upcoming.length === 1
        ? 'rinde hoy'
        : 'el primero es hoy'
      : upcoming.length === 1
        ? `en ${firstDays} ${firstDays === 1 ? 'día' : 'días'}`
        : `el primero en ${firstDays} ${firstDays === 1 ? 'día' : 'días'}`;
  return `${countPart} · ${whenPart}`;
}

export function ExamsPage({
  onSelectCourse,
  onExamsChanged,
  onOpenReport,
  referenceDate,
  externalCreateVersion = 0,
}: ExamsPageProps) {
  const effectiveDate = useMemo(() => referenceDate ?? new Date(), [referenceDate]);
  const todayIso = useMemo(() => toIsoDateString(effectiveDate), [effectiveDate]);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const lastExternalCreateVersionRef = useRef<number>(0);

  const [exams, setExams] = useState<ExamWithCourse[]>([]);
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [notes, setNotes] = useState<NoteWithCourse[]>([]);
  const [showPastExams, setShowPastExams] = useState<boolean>(false);

  // Create / edit form state
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCourseId, setFormCourseId] = useState('');
  const [formCategory, setFormCategory] = useState<ExamCategory>('parcial');
  const [formExamDate, setFormExamDate] = useState('');
  const [formExamTime, setFormExamTime] = useState('18:30');
  const [formLocation, setFormLocation] = useState('');
  const [formTopics, setFormTopics] = useState('');
  const [formGrade, setFormGrade] = useState('');
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Quick inline grade entry & delete confirm
  const [gradingExamId, setGradingExamId] = useState<string | null>(null);
  const [quickGradeValue, setQuickGradeValue] = useState('');
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Guide generation state
  const [generatingExamId, setGeneratingExamId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [loadedExams, loadedCourses, loadedNotes] = await Promise.all([
        cursadaClient.listExams({ graded: 'all' }),
        cursadaClient.listCourses({ status: 'active' }),
        cursadaClient.listNotes(),
      ]);
      setExams(loadedExams);
      setCourses(loadedCourses);
      setNotes(loadedNotes);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudieron cargar los exámenes.'
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      cursadaClient.listExams({ graded: 'all' }),
      cursadaClient.listCourses({ status: 'active' }),
      cursadaClient.listNotes(),
    ])
      .then(([loadedExams, loadedCourses, loadedNotes]) => {
        if (!active) return;
        setExams(loadedExams);
        setCourses(loadedCourses);
        setNotes(loadedNotes);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'No se pudieron cargar los exámenes.'
        );
      });

    const handleDataChanged = () => {
      if (!active) return;
      void loadData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadData]);

  const openCreateForm = useCallback(() => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setGradingExamId(null);
    setConfirmDeleteId(null);
    setFormMode('create');
    setEditingExamId(null);
    setFormTitle('');
    setFormCourseId(courses[0]?.id ?? '');
    setFormCategory('parcial');
    setFormExamDate(todayIso);
    setFormExamTime('18:30');
    setFormLocation('');
    setFormTopics('');
    setFormGrade('');
  }, [courses, todayIso]);

  useEffect(() => {
    if (
      externalCreateVersion > 0 &&
      externalCreateVersion !== lastExternalCreateVersionRef.current
    ) {
      lastExternalCreateVersionRef.current = externalCreateVersion;
      openCreateForm();
    } else if (externalCreateVersion === 0) {
      lastExternalCreateVersionRef.current = 0;
    }
  }, [externalCreateVersion, openCreateForm]);

  useEffect(() => {
    if (formMode !== 'closed') {
      titleInputRef.current?.focus();
    }
  }, [formMode]);

  const upcomingExams = useMemo(() => {
    return exams
      .filter((exam) => exam.grade === null && exam.examDate >= todayIso)
      .sort((a, b) => {
        const dateCmp = a.examDate.localeCompare(b.examDate);
        if (dateCmp !== 0) return dateCmp;
        return (a.examTime ?? '').localeCompare(b.examTime ?? '');
      });
  }, [exams, todayIso]);

  const pastExams = useMemo(() => {
    return exams
      .filter((exam) => exam.grade !== null || exam.examDate < todayIso)
      .sort((a, b) => b.examDate.localeCompare(a.examDate));
  }, [exams, todayIso]);

  const overallAverage = useMemo(() => calculateOverallAverage(exams), [exams]);

  const noteProgressByCourse = useMemo(() => {
    const map = new Map<string, { reviewed: number; total: number }>();
    for (const note of notes) {
      const current = map.get(note.courseId) ?? { reviewed: 0, total: 0 };
      current.total += 1;
      if (note.isPinned || note.origin !== 'manual') {
        current.reviewed += 1;
      }
      map.set(note.courseId, current);
    }
    return map;
  }, [notes]);

  function openEditForm(exam: ExamWithCourse): void {
    setErrorMsg(null);
    setFeedbackMsg(null);
    setGradingExamId(null);
    setConfirmDeleteId(null);
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
  }

  function closeForm(): void {
    setFormMode('closed');
    setEditingExamId(null);
    setErrorMsg(null);
  }

  async function handleSubmitForm(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      setErrorMsg('El título del examen es obligatorio.');
      return;
    }
    if (!formCourseId) {
      setErrorMsg('Seleccioná una materia.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formExamDate)) {
      setErrorMsg('Ingresá una fecha válida.');
      return;
    }

    let parsedGrade: number | null = null;
    if (formGrade.trim() !== '') {
      const n = Number(formGrade.replace(',', '.'));
      if (!Number.isFinite(n) || n < 1 || n > 10) {
        setErrorMsg('La nota debe estar entre 1 y 10.');
        return;
      }
      parsedGrade = Math.round(n * 100) / 100;
    }

    setIsSubmittingForm(true);
    setErrorMsg(null);
    try {
      if (formMode === 'edit' && editingExamId) {
        await cursadaClient.updateExam(editingExamId, {
          courseId: formCourseId,
          title: trimmedTitle,
          category: formCategory,
          examDate: formExamDate,
          examTime: formExamTime.trim() ? formExamTime.trim() : null,
          location: formLocation.trim(),
          topics: formTopics.trim(),
          grade: parsedGrade,
        });
      } else {
        await cursadaClient.createExam({
          courseId: formCourseId,
          title: trimmedTitle,
          category: formCategory,
          examDate: formExamDate,
          examTime: formExamTime.trim() ? formExamTime.trim() : null,
          location: formLocation.trim(),
          topics: formTopics.trim(),
          grade: parsedGrade,
        });
      }
      setFormMode('closed');
      setEditingExamId(null);
      await loadData();
      onExamsChanged?.();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo guardar el examen.'
      );
    } finally {
      setIsSubmittingForm(false);
    }
  }

  async function handleSaveQuickGrade(
    e: FormEvent<HTMLFormElement>,
    examId: string
  ): Promise<void> {
    e.preventDefault();
    const trimmed = quickGradeValue.trim();
    let nextGrade: number | null = null;

    if (trimmed !== '') {
      const parsed = Number(trimmed.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
        setErrorMsg('Ingresá una nota válida entre 1 y 10 (o dejá vacío para quitarla).');
        return;
      }
      nextGrade = Math.round(parsed * 100) / 100;
    }

    setIsSavingGrade(true);
    setErrorMsg(null);
    try {
      await cursadaClient.updateExam(examId, { grade: nextGrade });
      setGradingExamId(null);
      setQuickGradeValue('');
      await loadData();
      onExamsChanged?.();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo actualizar la nota.'
      );
    } finally {
      setIsSavingGrade(false);
    }
  }

  async function handleDeleteExam(examId: string): Promise<void> {
    setErrorMsg(null);
    try {
      await cursadaClient.deleteExam(examId);
      setConfirmDeleteId(null);
      if (editingExamId === examId) {
        setFormMode('closed');
        setEditingExamId(null);
      }
      await loadData();
      onExamsChanged?.();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo eliminar el examen.'
      );
    }
  }

  async function handleGenerateStudyGuide(exam: ExamWithCourse): Promise<void> {
    setGeneratingExamId(exam.id);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const report = await generateAndStoreReport({
        courseId: exam.courseId,
        courseName: exam.courseName,
        reportType: 'study_guide',
        title: `Guía de estudio: ${exam.title}`,
        customInstructions: exam.topics.trim()
          ? `Enfocar el repaso en los temas del examen: ${exam.topics.trim()}`
          : undefined,
        includeNotes: true,
        autoSaveAsNote: false,
      });
      if (onOpenReport) {
        onOpenReport(report.id);
      } else {
        setFeedbackMsg(`Guía generada: ${report.title}`);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo generar la guía de estudio.'
      );
    } finally {
      setGeneratingExamId(null);
    }
  }

  return (
    <section aria-labelledby="main-title">
      <header className="swiss-page-head">
        <div className="swiss-page-head-left">
          <h1 id="main-title" tabIndex={-1} className="swiss-screen-title">
            Exámenes
          </h1>
          <p className="swiss-meta-md">
            {formatHeaderMeta(upcomingExams, effectiveDate)}
          </p>
        </div>

        <div className="swiss-page-actions">
          <SwissButton variant="secondary" onClick={openCreateForm}>
            + Nuevo examen
          </SwissButton>
        </div>
      </header>

      {errorMsg ? (
        <div style={{ marginBottom: '20px' }}>
          <SwissErrorAlert message={errorMsg} />
        </div>
      ) : null}

      {feedbackMsg ? (
        <div
          role="status"
          aria-live="polite"
          className="swiss-meta-md"
          style={{
            borderLeft: '4px solid var(--acc)',
            padding: '8px 12px',
            marginBottom: '20px',
            color: 'var(--ink)',
          }}
        >
          {feedbackMsg}
        </div>
      ) : null}

      {formMode !== 'closed' ? (
        <section
          aria-label={formMode === 'edit' ? 'Editar examen' : 'Nuevo examen'}
          style={{
            borderTop: '3px solid var(--ink)',
            borderBottom: '3px solid var(--ink)',
            padding: '20px 0',
            marginBottom: '28px',
          }}
        >
          <SwissSectionHeader
            title={formMode === 'edit' ? 'Editar examen' : 'Nuevo examen'}
            subtle
          />
          <form
            onSubmit={(e) => void handleSubmitForm(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div className="swiss-grid">
              <div className="swiss-col-6">
                <label className="swiss-section-label" htmlFor="exam-form-title">
                  Título
                </label>
                <input
                  ref={titleInputRef}
                  id="exam-form-title"
                  type="text"
                  className="swiss-input"
                  placeholder="Ej. 2° Parcial Teórico-Práctico"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div className="swiss-col-3">
                <label className="swiss-section-label" htmlFor="exam-form-course">
                  Materia
                </label>
                <SwissSelect
                  id="exam-form-course"
                  value={formCourseId}
                  onChange={(e) => setFormCourseId(e.target.value)}
                  required
                >
                  {courses.length === 0 ? (
                    <option value="">Sin materias activas</option>
                  ) : null}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </SwissSelect>
              </div>

              <div className="swiss-col-3">
                <label className="swiss-section-label" htmlFor="exam-form-category">
                  Instancia
                </label>
                <SwissSelect
                  id="exam-form-category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as ExamCategory)}
                >
                  <option value="parcial">Parcial</option>
                  <option value="recuperatorio">Recuperatorio</option>
                  <option value="final">Final</option>
                  <option value="tp">TP evaluativo</option>
                </SwissSelect>
              </div>
            </div>

            <div className="swiss-grid">
              <div className="swiss-col-3">
                <label className="swiss-section-label" htmlFor="exam-form-date">
                  Fecha
                </label>
                <input
                  id="exam-form-date"
                  type="date"
                  className="swiss-input"
                  value={formExamDate}
                  onChange={(e) => setFormExamDate(e.target.value)}
                  required
                />
              </div>

              <div className="swiss-col-3">
                <label className="swiss-section-label" htmlFor="exam-form-time">
                  Horario (opcional)
                </label>
                <input
                  id="exam-form-time"
                  type="time"
                  className="swiss-input"
                  value={formExamTime}
                  onChange={(e) => setFormExamTime(e.target.value)}
                />
              </div>

              <div className="swiss-col-3">
                <label className="swiss-section-label" htmlFor="exam-form-location">
                  Aula / Modalidad
                </label>
                <input
                  id="exam-form-location"
                  type="text"
                  className="swiss-input"
                  placeholder="Ej. Aula 308 · Lima"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>

              <div className="swiss-col-3">
                <label className="swiss-section-label" htmlFor="exam-form-grade">
                  Nota (1–10, opcional)
                </label>
                <input
                  id="exam-form-grade"
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  className="swiss-input"
                  placeholder="Sin calificar"
                  value={formGrade}
                  onChange={(e) => setFormGrade(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="swiss-section-label" htmlFor="exam-form-topics">
                Temas a evaluar
              </label>
              <textarea
                id="exam-form-topics"
                rows={2}
                className="swiss-input"
                placeholder="Lista de unidades o temas incluidos en la evaluación…"
                value={formTopics}
                onChange={(e) => setFormTopics(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <SwissButton variant="secondary" onClick={closeForm}>
                Cancelar
              </SwissButton>
              <SwissButton
                type="submit"
                variant="primary"
                disabled={isSubmittingForm || courses.length === 0}
              >
                {isSubmittingForm
                  ? 'Guardando…'
                  : formMode === 'edit'
                    ? 'Guardar cambios'
                    : 'Agendar examen'}
              </SwissButton>
            </div>
          </form>
        </section>
      ) : null}

      {upcomingExams.length === 0 ? (
        <div className="exams-table">
          <SwissEmptyState
            title="No tenés exámenes próximos"
            description="Agendá tu próximo parcial, final o entrega evaluativa para seguir el conteo de días y armar guías de estudio."
            actionLabel="+ Nuevo examen"
            onAction={openCreateForm}
          />
        </div>
      ) : (
        <div className="exams-table" role="list" aria-label="Próximos exámenes">
          {upcomingExams.map((exam, index) => {
            const daysLeft = Math.max(0, calculateDaysLeft(exam.examDate, effectiveDate));
            const isNearest = index === 0;
            const progress = noteProgressByCourse.get(exam.courseId) ?? {
              reviewed: 0,
              total: 0,
            };
            const isGeneratingThis = generatingExamId === exam.id;
            const isGradingThis = gradingExamId === exam.id;
            const isConfirmingDelete = confirmDeleteId === exam.id;

            return (
              <div
                key={exam.id}
                role="listitem"
                className={`exams-item-row ${isNearest ? 'is-nearest' : ''}`.trim()}
                data-exam-id={exam.id}
              >
                <div className="exams-days-big" aria-label={`Faltan ${daysLeft} días`}>
                  {daysLeft}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div className="swiss-section-label">
                    DÍAS · {formatExamDateShort(exam.examDate)}
                    {exam.examTime ? ` · ${exam.examTime}` : ''}
                  </div>
                  <h2 className="exams-info-title">{exam.title}</h2>
                  <div className="swiss-meta-md" style={{ marginTop: '6px' }}>
                    <SwissLinkButton
                      className="swiss-meta-md"
                      onClick={() => onSelectCourse(exam.courseId)}
                    >
                      {exam.courseName}
                    </SwissLinkButton>
                    {exam.location ? ` · ${exam.location}` : ''}
                    {` · ${EXAM_CATEGORY_LABELS[exam.category]}`}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                      marginTop: '10px',
                    }}
                  >
                    <SwissLinkButton
                      className="swiss-meta"
                      onClick={() => openEditForm(exam)}
                    >
                      Editar
                    </SwissLinkButton>
                    <SwissLinkButton
                      className="swiss-meta"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        setGradingExamId(isGradingThis ? null : exam.id);
                        setQuickGradeValue(
                          exam.grade !== null ? String(exam.grade) : ''
                        );
                      }}
                    >
                      Cargar nota
                    </SwissLinkButton>
                    {isConfirmingDelete ? (
                      <>
                        <SwissLinkButton
                          className="swiss-meta"
                          onClick={() => void handleDeleteExam(exam.id)}
                        >
                          Confirmar eliminación
                        </SwissLinkButton>
                        <SwissLinkButton
                          className="swiss-meta"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancelar
                        </SwissLinkButton>
                      </>
                    ) : (
                      <SwissLinkButton
                        className="swiss-meta"
                        onClick={() => {
                          setGradingExamId(null);
                          setConfirmDeleteId(exam.id);
                        }}
                      >
                        Eliminar
                      </SwissLinkButton>
                    )}
                  </div>

                  {isGradingThis ? (
                    <form
                      onSubmit={(e) => void handleSaveQuickGrade(e, exam.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '10px',
                      }}
                    >
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        className="swiss-input"
                        style={{ width: '110px' }}
                        placeholder="Nota 1–10"
                        aria-label={`Nota para ${exam.title}`}
                        value={quickGradeValue}
                        onChange={(e) => setQuickGradeValue(e.target.value)}
                      />
                      <SwissButton
                        type="submit"
                        variant="primary"
                        disabled={isSavingGrade}
                      >
                        {isSavingGrade ? 'Guardando…' : 'Guardar'}
                      </SwissButton>
                      <SwissButton
                        variant="secondary"
                        onClick={() => setGradingExamId(null)}
                      >
                        Cancelar
                      </SwissButton>
                    </form>
                  ) : null}
                </div>

                <div className="exams-topics-cell">
                  <span className="swiss-section-label">Temas</span>
                  <p className="exams-topics-text">
                    {exam.topics.trim() || 'Sin temas cargados todavía.'}
                  </p>
                  <SwissProgressBar
                    value={progress.reviewed}
                    max={progress.total}
                    ariaLabel={`Notas repasadas de ${exam.courseName}`}
                  />
                  <span className="swiss-meta">
                    {progress.reviewed} de {progress.total} notas repasadas
                  </span>
                </div>

                <div>
                  {isGeneratingThis ? (
                    <div style={{ minWidth: '190px' }}>
                      <SwissLoadingBar text="Generando guía…" />
                    </div>
                  ) : (
                    <SwissButton
                      variant={isNearest ? 'primary' : 'secondary'}
                      disabled={generatingExamId !== null}
                      onClick={() => void handleGenerateStudyGuide(exam)}
                    >
                      Generar guía de estudio
                    </SwissButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="courses-footer">
        <span className="swiss-meta-md">
          Anteriores: {pastExams.length}
          {overallAverage !== null
            ? ` · Promedio general: ${overallAverage.toFixed(1)}`
            : ''}
        </span>
        <SwissLinkButton onClick={() => setShowPastExams((prev) => !prev)}>
          {showPastExams ? 'Ocultar anteriores' : 'Ver anteriores →'}
        </SwissLinkButton>
      </footer>

      {showPastExams ? (
        <section
          aria-label="Exámenes anteriores"
          style={{ marginTop: '24px' }}
        >
          <SwissSectionHeader
            title="Exámenes anteriores"
            right={
              overallAverage !== null
                ? `Promedio general: ${overallAverage.toFixed(1)}`
                : undefined
            }
          />
          {pastExams.length === 0 ? (
            <SwissEmptyState
              title="No hay exámenes anteriores"
              description="Cuando rindas o califiques un examen va a quedar registrado en este historial."
            />
          ) : (
            <div>
              {pastExams.map((exam) => {
                const isGradingThis = gradingExamId === exam.id;
                const isConfirmingDelete = confirmDeleteId === exam.id;
                return (
                  <div
                    key={exam.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px minmax(0, 1.5fr) 120px auto',
                      alignItems: 'center',
                      gap: '20px',
                      padding: '16px 0',
                      borderTop: '1px solid var(--rule)',
                    }}
                  >
                    <div className="swiss-meta-md">
                      {formatExamDateShort(exam.examDate)}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>
                        {exam.title}
                      </div>
                      <div className="swiss-meta">
                        <SwissLinkButton
                          className="swiss-meta"
                          onClick={() => onSelectCourse(exam.courseId)}
                        >
                          {exam.courseName}
                        </SwissLinkButton>
                        {` · ${EXAM_CATEGORY_LABELS[exam.category]}`}
                        {exam.location ? ` · ${exam.location}` : ''}
                      </div>

                      {isGradingThis ? (
                        <form
                          onSubmit={(e) => void handleSaveQuickGrade(e, exam.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '8px',
                          }}
                        >
                          <input
                            type="number"
                            min="1"
                            max="10"
                            step="0.5"
                            className="swiss-input"
                            style={{ width: '110px' }}
                            placeholder="Nota 1–10"
                            aria-label={`Nota para ${exam.title}`}
                            value={quickGradeValue}
                            onChange={(e) => setQuickGradeValue(e.target.value)}
                          />
                          <SwissButton
                            type="submit"
                            variant="primary"
                            disabled={isSavingGrade}
                          >
                            {isSavingGrade ? 'Guardando…' : 'Guardar'}
                          </SwissButton>
                          <SwissButton
                            variant="secondary"
                            onClick={() => setGradingExamId(null)}
                          >
                            Cancelar
                          </SwissButton>
                        </form>
                      ) : null}
                    </div>

                    <div className="swiss-tabular" style={{ fontWeight: 600 }}>
                      {exam.grade !== null ? `Nota: ${exam.grade.toFixed(1)}` : 'Sin nota'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <SwissLinkButton
                        className="swiss-meta"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          setGradingExamId(isGradingThis ? null : exam.id);
                          setQuickGradeValue(
                            exam.grade !== null ? String(exam.grade) : ''
                          );
                        }}
                      >
                        {exam.grade !== null ? 'Cambiar nota' : 'Cargar nota'}
                      </SwissLinkButton>
                      <SwissLinkButton
                        className="swiss-meta"
                        onClick={() => openEditForm(exam)}
                      >
                        Editar
                      </SwissLinkButton>
                      {isConfirmingDelete ? (
                        <>
                          <SwissLinkButton
                            className="swiss-meta"
                            onClick={() => void handleDeleteExam(exam.id)}
                          >
                            Confirmar
                          </SwissLinkButton>
                          <SwissLinkButton
                            className="swiss-meta"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancelar
                          </SwissLinkButton>
                        </>
                      ) : (
                        <SwissLinkButton
                          className="swiss-meta"
                          onClick={() => {
                            setGradingExamId(null);
                            setConfirmDeleteId(exam.id);
                          }}
                        >
                          Eliminar
                        </SwissLinkButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
