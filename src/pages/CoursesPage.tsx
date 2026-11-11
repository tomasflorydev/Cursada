import { useEffect, useState } from 'react';
import { cursadaClient } from '../lib/api/client';
import type { CourseWithSchedules } from '../types';

export interface CoursesPageProps {
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string | null) => void;
  onCoursesChanged?: () => void;
}

export function CoursesPage({
  selectedCourseId,
  onSelectCourse,
}: CoursesPageProps) {
  const [courses, setCourses] = useState<CourseWithSchedules[]>([]);

  useEffect(() => {
    let active = true;
    void cursadaClient.listCourses({ status: 'all' }).then((loaded) => {
      if (active) {
        setCourses(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedCourseId]);

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
              ? `Prof. ${activeCourse.professor} · ${activeCourse.term}`
              : 'Vista de materias del cuatrimestre. Hacé clic en cualquier materia para ver su ficha.'}
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
                  {course.term}
                </span>
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
            </article>
          );
        })}
      </div>
    </div>
  );
}
