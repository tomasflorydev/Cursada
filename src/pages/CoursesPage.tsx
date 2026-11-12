import { useCallback, useEffect, useState } from 'react';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { CourseFormModal } from '../components/courses/CourseFormModal';
import { DeleteCourseDialog } from '../components/courses/DeleteCourseDialog';
import {
  calculateAverageFromExams,
  formatExamDateLabel,
} from '../components/exams/ExamList';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import { formatSchedulesSummary } from '../lib/dates';
import type {
  CourseDeleteImpact,
  CourseWithSchedules,
  CreateCourseInput,
  ExamWithCourse,
  UpdateCourseInput,
} from '../types';

export interface CoursesPageProps {
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
  onCoursesChanged?: () => void;
}

const KNOWN_SHORT_CODES: Record<string, string> = {
  'ing-soft-1': 'IS1',
  'diseno-sistemas': 'DDS',
  'bd-2': 'BD2',
  'proba-estadistica': 'PyE',
  paradigmas: 'PdeP',
};

function getCourseShortCode(course: CourseWithSchedules): string {
  if (KNOWN_SHORT_CODES[course.id]) {
    return KNOWN_SHORT_CODES[course.id];
  }
  const stopWords = new Set(['de', 'del', 'la', 'el', 'y', 'e', 'en', 'para']);
  const tokens = course.name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !stopWords.has(w.toLowerCase()));
  if (tokens.length === 0) {
    return course.name.slice(0, 3).toUpperCase();
  }
  return tokens
    .slice(0, 4)
    .map((w) => (/^[IVX0-9]+$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase()))
    .join('');
}

function formatCourseLocationSummary(course: CourseWithSchedules): string {
  const locations = Array.from(
    new Set(
      course.schedules
        .map((s) => s.location.trim())
        .filter((loc) => loc.length > 0)
    )
  );
  if (locations.length === 0) {
    return 'Sin aula asignada';
  }
  return locations.join(' · ');
}

export function CoursesPage({
  selectedCourseId,
  onSelectCourse,
  onCoursesChanged,
}: CoursesPageProps) {
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [pendingByCourse, setPendingByCourse] = useState<Record<string, number>>({});
  const [examsByCourse, setExamsByCourse] = useState<Record<string, ExamWithCourse[]>>(
    {}
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseWithSchedules | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<CourseDeleteImpact | null>(null);

  const loadCourses = useCallback(async () => {
    const [loaded, pendingTasks, allExams] = await Promise.all([
      cursadaClient.listCourses({ status: 'all' }),
      cursadaClient.listTasks({ status: 'pending' }),
      cursadaClient.listExams(),
    ]);
    const counts: Record<string, number> = {};
    for (const task of pendingTasks) {
      counts[task.courseId] = (counts[task.courseId] ?? 0) + 1;
    }
    const groupedExams: Record<string, ExamWithCourse[]> = {};
    for (const exam of allExams) {
      if (!groupedExams[exam.courseId]) {
        groupedExams[exam.courseId] = [];
      }
      groupedExams[exam.courseId].push(exam);
    }
    setCourses(loaded);
    setPendingByCourse(counts);
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

  const activeCourse =
    selectedCourseId !== null
      ? courses.find((c) => c.id === selectedCourseId) ?? null
      : null;

  const activeCourses = courses.filter((c) => c.status === 'active');
  const archivedCourses = courses.filter((c) => c.status === 'archived');

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
    await loadCourses();
    onCoursesChanged?.();
  }

  async function handleRequestDelete(courseId: string): Promise<void> {
    const impact = await cursadaClient.getCourseDeleteImpact(courseId);
    setDeleteImpact(impact);
  }

  async function handleConfirmDelete(courseId: string): Promise<void> {
    await cursadaClient.deleteCourse(courseId);
    setDeleteImpact(null);
    if (selectedCourseId === courseId) {
      onSelectCourse(null);
    }
    await loadCourses();
    onCoursesChanged?.();
  }

  function renderCourseCard(course: CourseWithSchedules) {
    const isArchived = course.status === 'archived';
    const scheduleSummary = formatSchedulesSummary(course.schedules);
    const locationSummary = formatCourseLocationSummary(course);
    const pendingCount = pendingByCourse[course.id] ?? 0;
    const courseExams = examsByCourse[course.id] ?? [];
    const averageGrade = calculateAverageFromExams(courseExams);
    const nextExam = courseExams.find((e) => e.grade === null) ?? null;
    const shortCode = getCourseShortCode(course);

    return (
      <article
        key={course.id}
        className={`surface-panel course-overview-card ${isArchived ? 'is-archived' : ''}`}
        data-course-color={course.color}
      >
        <div className="course-card-header">
          <span className="course-pill" data-course-color={course.color}>
            <span
              className="course-dot"
              data-course-color={course.color}
              aria-hidden="true"
            />
            {shortCode}
          </span>
          <span className="course-grade-pill">
            {averageGrade !== null
              ? `Promedio ${averageGrade.toFixed(1)}`
              : isArchived
                ? `Archivada · ${course.term}`
                : course.term}
          </span>
        </div>

        <h2 className="course-card-title">
          <button
            type="button"
            className="inline-course-link card-link"
            onClick={() => onSelectCourse(course.id)}
          >
            {course.name}
          </button>
        </h2>
        <p className="course-card-professor">
          {course.professor ? `Prof. ${course.professor}` : 'Profesor sin asignar'}
        </p>

        <div className="course-card-details">
          <div className="course-detail-row">
            <span className="course-detail-label">Cursada</span>
            <span className="course-detail-value">{scheduleSummary}</span>
          </div>
          <div className="course-detail-row">
            <span className="course-detail-label">Aula / Modalidad</span>
            <span className="course-detail-value">{locationSummary}</span>
          </div>
          <div className="course-detail-row">
            <span className="course-detail-label">Pendientes</span>
            <span className="course-detail-value">
              {pendingCount} {pendingCount === 1 ? 'tarea' : 'tareas'}
              {nextExam
                ? ` · ${formatExamDateLabel(nextExam.examDate)}`
                : ''}
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <>
      {activeCourse ? (
        <CourseDetailView
          course={activeCourse}
          onBackToAll={() => onSelectCourse(null)}
          onEdit={handleOpenEdit}
          onToggleArchive={(c) => void handleToggleArchive(c)}
          onRequestDelete={(id) => void handleRequestDelete(id)}
        />
      ) : (
        <div className="basic-view">
          <header className="page-header">
            <div className="page-header-titles">
              <span className="page-date-text">2026 · 2° Cuatrimestre</span>
              <h1 id="main-title" tabIndex={-1} className="page-title">
                Materias
              </h1>
              <p className="page-subtitle">
                Materias del cuatrimestre actual. Hacé clic en cualquier materia para abrir su ficha,
                horarios y entregas.
              </p>
            </div>
            <div className="basic-header-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleOpenCreate}
              >
                Nueva materia
              </button>
            </div>
          </header>

          {activeCourses.length === 0 ? (
            <div className="surface-panel courses-empty-state">
              <p className="course-empty-text">
                No tenés materias activas en este cuatrimestre. Creá una con el botón &ldquo;Nueva
                materia&rdquo;.
              </p>
            </div>
          ) : (
            <div className="courses-cards-grid">
              {activeCourses.map((course) => renderCourseCard(course))}
            </div>
          )}

          {archivedCourses.length > 0 ? (
            <section
              aria-labelledby="archived-courses-heading"
              className="courses-group-section courses-archived-section"
            >
              <div className="section-heading-bar">
                <div className="section-heading-left">
                  <h2 id="archived-courses-heading" className="section-title">
                    Archivo · Cuatrimestres anteriores
                  </h2>
                  <span className="section-counter">{archivedCourses.length}</span>
                </div>
              </div>

              <div className="courses-cards-grid">
                {archivedCourses.map((course) => renderCourseCard(course))}
              </div>
            </section>
          ) : null}
        </div>
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
    </>
  );
}
