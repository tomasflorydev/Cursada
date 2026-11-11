import { useCallback, useEffect, useState } from 'react';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { CourseFormModal } from '../components/courses/CourseFormModal';
import { DeleteCourseDialog } from '../components/courses/DeleteCourseDialog';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import { formatSchedulesSummary } from '../lib/dates';
import type {
  CourseDeleteImpact,
  CourseWithSchedules,
  CreateCourseInput,
  UpdateCourseInput,
} from '../types';

export interface CoursesPageProps {
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
  onCoursesChanged?: () => void;
}

export function CoursesPage({
  selectedCourseId,
  onSelectCourse,
  onCoursesChanged,
}: CoursesPageProps) {
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseWithSchedules | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<CourseDeleteImpact | null>(null);

  const loadCourses = useCallback(async () => {
    const loaded = await cursadaClient.listCourses({ status: 'all' });
    setCourses(loaded);
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
            {course.term}
          </span>
          <span
            className={`course-status-pill ${isArchived ? 'is-archived' : 'is-active'}`}
          >
            {isArchived ? 'Archivada' : 'En curso'}
          </span>
        </div>

        <h3 className="course-card-title">
          <button
            type="button"
            className="inline-course-link"
            onClick={() => onSelectCourse(course.id)}
          >
            {course.name}
          </button>
        </h3>
        <p className="course-card-professor">
          {course.professor ? `Prof. ${course.professor}` : 'Profesor sin asignar'}
        </p>

        <div className="course-card-details">
          <div className="course-detail-row">
            <span className="course-detail-label">Cursada</span>
            <span className="course-detail-value">{scheduleSummary}</span>
          </div>
          <div className="course-detail-row">
            <span className="course-detail-label">Bloques semanales</span>
            <span className="course-detail-value">
              {course.schedules.length}{' '}
              {course.schedules.length === 1 ? 'bloque' : 'bloques'}
            </span>
          </div>
        </div>

        <footer className="course-card-actions">
          <button
            type="button"
            className="ghost-action-button"
            onClick={() => onSelectCourse(course.id)}
          >
            Abrir ficha
          </button>
          <div className="course-card-actions-right">
            <button
              type="button"
              className="ghost-action-button"
              aria-label={`Editar ${course.name}`}
              onClick={() => handleOpenEdit(course)}
            >
              Editar
            </button>
            <button
              type="button"
              className="ghost-action-button"
              aria-label={`${isArchived ? 'Activar' : 'Archivar'} ${course.name}`}
              onClick={() => void handleToggleArchive(course)}
            >
              {isArchived ? 'Activar' : 'Archivar'}
            </button>
            <button
              type="button"
              className="ghost-action-button is-danger"
              aria-label={`Eliminar ${course.name}`}
              onClick={() => void handleRequestDelete(course.id)}
            >
              Eliminar
            </button>
          </div>
        </footer>
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
                Gestioná las materias del cuatrimestre actual, sus bloques horarios de cursada y el
                archivo de cuatrimestres anteriores.
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

          <section aria-labelledby="active-courses-heading" className="courses-group-section">
            <div className="section-heading-bar">
              <div className="section-heading-left">
                <h2 id="active-courses-heading" className="section-title">
                  Materias en curso
                </h2>
                <span className="section-counter">{activeCourses.length}</span>
              </div>
            </div>

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
          </section>

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

            {archivedCourses.length === 0 ? (
              <div className="surface-panel courses-empty-state is-subtle">
                <p className="course-empty-text">
                  No hay materias archivadas. Cuando termines una cursada, podés archivarla para
                  conservar sus notas, tareas y fuentes en tu historial.
                </p>
              </div>
            ) : (
              <div className="courses-cards-grid">
                {archivedCourses.map((course) => renderCourseCard(course))}
              </div>
            )}
          </section>
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
