import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { CourseFormModal } from '../components/courses/CourseFormModal';
import { DeleteCourseDialog } from '../components/courses/DeleteCourseDialog';
import { ObsidianImportModal } from '../components/courses/ObsidianImportModal';
import { NotesGraphView } from '../components/notes/NotesGraphView';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import {
  DAY_SHORT_NAMES_ES,
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../lib/dates';
import { deleteStoredReportsByCourse } from '../lib/reportsStore';
import type {
  CourseDeleteImpact,
  CourseTabId,
  CourseWithSchedules,
  CreateCourseInput,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  NoteWithCourse,
  UpdateCourseInput,
} from '../types';
import { SwissButton, SwissEmptyState, SwissLinkButton } from '../ui';

export interface CoursesPageProps {
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null, opts?: { noteId?: string }) => void;
  onCoursesChanged?: () => void;
  onCourseDetailHeaderChange?: (header: { name: string; summary: string } | null) => void;
  onOpenReport?: (reportId: string) => void;
  initialCourseTab?: CourseTabId;
  initialNoteId?: string | null;
  courseNavigationVersion?: number;
  createRequestVersion?: number;
  newNoteRequestVersion?: number;
}

const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'TP',
};

function diffCalendarDays(targetIso: string, refIso: string): number {
  const target = parseIsoDateLocal(targetIso);
  const ref = parseIsoDateLocal(refIso);
  return Math.round((target.getTime() - ref.getTime()) / 86_400_000);
}

function formatShortExamDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  const d = parseIsoDateLocal(isoDate);
  const monthShort = MONTH_SHORT_NAMES_ES[d.getMonth()] ?? '';
  return `${d.getDate()} ${monthShort}`;
}

function formatNextClassLabel(course: CourseWithSchedules, now: Date): string {
  if (course.schedules.length === 0) {
    return 'Sin horario';
  }
  const jsDay = now.getDay();
  const todayDow = (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let best: { dayOfWeek: DayOfWeek; startTime: string; offsetMinutes: number } | null = null;
  for (const sched of course.schedules) {
    const [hh, mm] = sched.startTime.split(':').map(Number);
    const startMinutes = (hh || 0) * 60 + (mm || 0);
    let dayOffset = sched.dayOfWeek - todayDow;
    if (dayOffset < 0 || (dayOffset === 0 && startMinutes < nowMinutes)) {
      dayOffset += 7;
    }
    const offsetMinutes = dayOffset * 1440 + (startMinutes - nowMinutes);
    if (!best || offsetMinutes < best.offsetMinutes) {
      best = {
        dayOfWeek: sched.dayOfWeek,
        startTime: sched.startTime,
        offsetMinutes,
      };
    }
  }

  if (!best) {
    return 'Sin horario';
  }
  if (best.dayOfWeek === todayDow && best.offsetMinutes < 1440) {
    return `Hoy ${best.startTime}`;
  }
  return `${DAY_SHORT_NAMES_ES[best.dayOfWeek]} ${best.startTime}`;
}

function getCommonTermLabel(courses: CourseWithSchedules[]): string {
  const counts = new Map<string, number>();
  for (const c of courses) {
    const t = c.term.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let topTerm = 'Cursada actual';
  let topCount = 0;
  for (const [term, count] of counts.entries()) {
    if (count > topCount) {
      topTerm = term;
      topCount = count;
    }
  }
  return topTerm;
}

export function CoursesPage({
  selectedCourseId,
  onSelectCourse,
  onCoursesChanged,
  onCourseDetailHeaderChange,
  onOpenReport,
  initialNoteId,
  courseNavigationVersion,
  createRequestVersion = 0,
  newNoteRequestVersion = 0,
}: CoursesPageProps) {
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [pendingByCourse, setPendingByCourse] = useState<Record<string, number>>({});
  const [notesByCourse, setNotesByCourse] = useState<Record<string, number>>({});
  const [examsByCourse, setExamsByCourse] = useState<Record<string, ExamWithCourse[]>>(
    {}
  );
  const [showArchived, setShowArchived] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseWithSchedules | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<CourseDeleteImpact | null>(null);
  const [isGlobalGraphOpen, setIsGlobalGraphOpen] = useState(false);
  const [isObsidianModalOpen, setIsObsidianModalOpen] = useState(false);

  const lastCreateRequestVersionRef = useRef<number>(0);

  useEffect(() => {
    const hasNewCreateRequest =
      Boolean(createRequestVersion) &&
      createRequestVersion > lastCreateRequestVersionRef.current;

    if (hasNewCreateRequest) {
      lastCreateRequestVersionRef.current = createRequestVersion;
      if (selectedCourseId === null) {
        setEditingCourse(null);
        setIsFormOpen(true);
      }
    }
  }, [createRequestVersion, selectedCourseId]);

  const loadCourses = useCallback(async () => {
    const [loaded, pendingTasks, allExams, allNotes]: [
      CourseWithSchedules[],
      Awaited<ReturnType<typeof cursadaClient.listTasks>>,
      ExamWithCourse[],
      NoteWithCourse[],
    ] = await Promise.all([
      cursadaClient.listCourses({ status: 'all' }),
      cursadaClient.listTasks({ status: 'pending' }),
      cursadaClient.listExams({ graded: 'all' }),
      cursadaClient.listNotes(),
    ]);

    const taskCounts: Record<string, number> = {};
    for (const task of pendingTasks) {
      taskCounts[task.courseId] = (taskCounts[task.courseId] ?? 0) + 1;
    }

    const noteCounts: Record<string, number> = {};
    for (const note of allNotes) {
      noteCounts[note.courseId] = (noteCounts[note.courseId] ?? 0) + 1;
    }

    const groupedExams: Record<string, ExamWithCourse[]> = {};
    for (const exam of allExams) {
      if (!groupedExams[exam.courseId]) {
        groupedExams[exam.courseId] = [];
      }
      groupedExams[exam.courseId].push(exam);
    }

    setCourses(loaded);
    setPendingByCourse(taskCounts);
    setNotesByCourse(noteCounts);
    setExamsByCourse(groupedExams);
  }, []);

  useEffect(() => {
    void loadCourses();

    const handleDataChanged = () => {
      void loadCourses();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadCourses, selectedCourseId]);

  const activeCourses = useMemo(
    () => courses.filter((c) => c.status === 'active'),
    [courses]
  );
  const archivedCourses = useMemo(
    () => courses.filter((c) => c.status === 'archived'),
    [courses]
  );

  const now = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => toIsoDateString(now), [now]);

  const nextExamByCourse = useMemo(() => {
    const result: Record<string, ExamWithCourse | null> = {};
    for (const course of activeCourses) {
      const upcoming = (examsByCourse[course.id] ?? [])
        .filter((e) => e.grade === null && e.examDate >= todayIso)
        .sort((a, b) => a.examDate.localeCompare(b.examDate));
      result[course.id] = upcoming[0] ?? null;
    }
    return result;
  }, [activeCourses, examsByCourse, todayIso]);

  const globalClosestExamId = useMemo(() => {
    let closest: ExamWithCourse | null = null;
    for (const course of activeCourses) {
      const candidate = nextExamByCourse[course.id];
      if (!candidate) continue;
      if (!closest || candidate.examDate.localeCompare(closest.examDate) < 0) {
        closest = candidate;
      }
    }
    return closest?.id ?? null;
  }, [activeCourses, nextExamByCourse]);

  const totalActiveNotes = useMemo(
    () => activeCourses.reduce((acc, c) => acc + (notesByCourse[c.id] ?? 0), 0),
    [activeCourses, notesByCourse]
  );

  const termLabel = useMemo(() => getCommonTermLabel(activeCourses), [activeCourses]);

  function handleOpenCreate(): void {
    setEditingCourse(null);
    setIsFormOpen(true);
  }

  function handleOpenEdit(course: CourseWithSchedules): void {
    setEditingCourse(course);
    setIsFormOpen(true);
  }

  async function handleFormSubmit(
    data: CreateCourseInput | UpdateCourseInput,
    courseId?: string
  ): Promise<void> {
    if (courseId) {
      await cursadaClient.updateCourse(courseId, data as UpdateCourseInput);
    } else {
      await cursadaClient.createCourse(data as CreateCourseInput);
    }
    await loadCourses();
    onCoursesChanged?.();
  }

  async function handleToggleArchive(course: CourseWithSchedules): Promise<void> {
    const nextStatus = course.status === 'active' ? 'archived' : 'active';
    await cursadaClient.updateCourse(course.id, { status: nextStatus });
    if (nextStatus === 'archived' && selectedCourseId === course.id) {
      onSelectCourse(null);
    }
    await loadCourses();
    onCoursesChanged?.();
  }

  async function handleRequestDelete(courseId: string): Promise<void> {
    const impact = await cursadaClient.getCourseDeleteImpact(courseId);
    setDeleteImpact(impact);
  }

  async function handleConfirmDelete(courseId: string): Promise<void> {
    await cursadaClient.deleteCourse(courseId);
    deleteStoredReportsByCourse(courseId);
    setDeleteImpact(null);
    if (selectedCourseId === courseId) {
      onSelectCourse(null);
    }
    await loadCourses();
    onCoursesChanged?.();
  }

  return (
    <>
      {selectedCourseId !== null ? (
        <CourseDetailView
          key={selectedCourseId}
          courseId={selectedCourseId}
          initialNoteId={initialNoteId}
          navigationVersion={courseNavigationVersion}
          newNoteRequestVersion={newNoteRequestVersion}
          onSelectCourse={onSelectCourse}
          onHeaderMetaChange={onCourseDetailHeaderChange}
          onOpenReport={onOpenReport}
          onEditCourse={handleOpenEdit}
          onArchiveCourse={(c) => void handleToggleArchive(c)}
          onDeleteCourse={(id) => void handleRequestDelete(id)}
          onCoursesChanged={() => {
            void loadCourses();
            onCoursesChanged?.();
          }}
        />
      ) : (
        <section aria-labelledby="main-title">
          <header className="swiss-page-head">
            <div className="swiss-page-head-left">
              <h1 id="main-title" tabIndex={-1} className="swiss-screen-title">
                Materias
              </h1>
              <p className="swiss-meta-md">
                {activeCourses.length} {activeCourses.length === 1 ? 'activa' : 'activas'} ·{' '}
                {termLabel} · {totalActiveNotes}{' '}
                {totalActiveNotes === 1 ? 'nota' : 'notas'} en total
              </p>
            </div>

            <div className="swiss-page-actions">
              <SwissButton
                variant="secondary"
                onClick={() => setIsGlobalGraphOpen((v) => !v)}
              >
                {isGlobalGraphOpen ? 'Ver listado' : 'Grafo global'}
              </SwissButton>
              <SwissButton
                variant="secondary"
                onClick={() => setIsObsidianModalOpen(true)}
              >
                Importar Vault de Obsidian
              </SwissButton>
              <SwissButton variant="secondary" onClick={handleOpenCreate}>
                + Nueva materia
              </SwissButton>
            </div>
          </header>

          {isGlobalGraphOpen ? (
            <NotesGraphView
              onSelectNote={(noteId, targetCourseId) => {
                setIsGlobalGraphOpen(false);
                onSelectCourse(targetCourseId, { noteId });
              }}
              onClose={() => setIsGlobalGraphOpen(false)}
            />
          ) : activeCourses.length === 0 ? (
            <SwissEmptyState
              title="No tenés materias activas"
              description="Creá una materia para organizar tus notas, fuentes, tareas y próximos exámenes."
              actionLabel="+ Nueva materia"
              onAction={handleOpenCreate}
            />
          ) : (
            <div className="courses-table" role="table" aria-label="Materias activas">
              <div className="courses-table-head" role="row">
                <span className="swiss-section-label" role="columnheader">
                  Nº
                </span>
                <span className="swiss-section-label" role="columnheader">
                  Materia
                </span>
                <span className="swiss-section-label" role="columnheader">
                  Próxima clase
                </span>
                <span className="swiss-section-label" role="columnheader">
                  Notas
                </span>
                <span className="swiss-section-label" role="columnheader">
                  Tareas
                </span>
                <span className="swiss-section-label" role="columnheader">
                  Próximo examen
                </span>
                <span className="visually-hidden" role="columnheader">
                  Acción
                </span>
              </div>

              {activeCourses.map((course, idx) => {
                const indexText = String(idx + 1).padStart(2, '0');
                const notesCount = notesByCourse[course.id] ?? 0;
                const tasksCount = pendingByCourse[course.id] ?? 0;
                const nextExam = nextExamByCourse[course.id];
                const isGlobalClosest =
                  nextExam !== null && nextExam.id === globalClosestExamId;
                const daysLeft = nextExam
                  ? Math.max(0, diffCalendarDays(nextExam.examDate, todayIso))
                  : null;

                return (
                  <div
                    key={course.id}
                    className="courses-table-row"
                    role="row"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      onSelectCourse(course.id);
                    }}
                  >
                    <span className="courses-row-idx" role="cell">
                      {indexText}
                    </span>

                    <div role="cell">
                      <button
                        type="button"
                        className="courses-row-name"
                        onClick={() => onSelectCourse(course.id)}
                      >
                        {course.name}
                      </button>
                      <div className="swiss-meta">
                        {course.professor.trim() ? `${course.professor.trim()} · ` : ''}
                        <SwissLinkButton
                          style={{ fontSize: '12px', fontWeight: 500 }}
                          onClick={() => handleOpenEdit(course)}
                        >
                          Editar
                        </SwissLinkButton>
                        {' · '}
                        <SwissLinkButton
                          style={{ fontSize: '12px', fontWeight: 500 }}
                          onClick={() => void handleToggleArchive(course)}
                        >
                          Archivar
                        </SwissLinkButton>
                        {' · '}
                        <SwissLinkButton
                          style={{ fontSize: '12px', fontWeight: 500 }}
                          onClick={() => void handleRequestDelete(course.id)}
                        >
                          Eliminar
                        </SwissLinkButton>
                      </div>
                    </div>

                    <span className="courses-row-nextclass" role="cell">
                      {formatNextClassLabel(course, now)}
                    </span>

                    <span className="courses-row-num" role="cell">
                      {notesCount}
                    </span>

                    <span className="courses-row-num" role="cell">
                      {tasksCount}
                    </span>

                    <div className="courses-row-exam" role="cell">
                      {nextExam && daysLeft !== null ? (
                        <>
                          <span
                            className={`courses-row-exam-label ${isGlobalClosest ? 'is-closest' : ''}`}
                          >
                            {EXAM_CATEGORY_LABELS[nextExam.category]} ·{' '}
                            {daysLeft === 0
                              ? 'hoy'
                              : daysLeft === 1
                                ? 'en 1 día'
                                : `en ${daysLeft} días`}
                          </span>
                          <span className="courses-row-exam-sub">
                            {formatShortExamDate(nextExam.examDate)} · {nextExam.title}
                          </span>
                        </>
                      ) : (
                        <span className="swiss-meta">Sin exámenes</span>
                      )}
                    </div>

                    <div className="courses-row-actions" role="cell">
                      <SwissLinkButton
                        aria-label={`Abrir ${course.name}`}
                        onClick={() => onSelectCourse(course.id)}
                      >
                        →
                      </SwissLinkButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <footer className="courses-footer">
            <span className="swiss-meta-md">
              Materias archivadas: {archivedCourses.length}
            </span>
            <SwissLinkButton onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Ocultar archivadas' : 'Ver archivadas →'}
            </SwissLinkButton>
          </footer>

          {showArchived ? (
            <section
              aria-label="Materias archivadas"
              style={{ marginTop: '16px', paddingTop: '12px' }}
            >
              {archivedCourses.length === 0 ? (
                <p className="swiss-meta-md">No tenés materias archivadas.</p>
              ) : (
                <div className="courses-table">
                  {archivedCourses.map((course, idx) => (
                    <div key={course.id} className="courses-table-row">
                      <span className="courses-row-idx">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="courses-row-name"
                          onClick={() => onSelectCourse(course.id)}
                        >
                          {course.name}
                        </button>
                        {course.term.trim() ? (
                          <div className="swiss-meta">{course.term.trim()}</div>
                        ) : null}
                      </div>
                      <span className="swiss-meta">Archivada</span>
                      <span className="courses-row-num">
                        {notesByCourse[course.id] ?? 0}
                      </span>
                      <span className="courses-row-num">
                        {pendingByCourse[course.id] ?? 0}
                      </span>
                      <div className="courses-row-actions" style={{ gridColumn: 'span 2' }}>
                        <SwissButton
                          variant="secondary"
                          onClick={() => void handleToggleArchive(course)}
                        >
                          Restaurar
                        </SwissButton>
                        <SwissButton
                          variant="secondary"
                          onClick={() => void handleRequestDelete(course.id)}
                        >
                          Eliminar
                        </SwissButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </section>
      )}

      <CourseFormModal
        isOpen={isFormOpen}
        initialCourse={editingCourse}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      <DeleteCourseDialog
        impact={deleteImpact}
        onCancel={() => setDeleteImpact(null)}
        onConfirm={handleConfirmDelete}
      />

      <ObsidianImportModal
        isOpen={isObsidianModalOpen}
        onClose={() => setIsObsidianModalOpen(false)}
        onImported={() => {
          void loadCourses();
          onCoursesChanged?.();
        }}
      />
    </>
  );
}
