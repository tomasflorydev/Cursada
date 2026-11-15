import { useEffect, useId, useRef, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import {
  DAY_NAMES_ES,
  formatScheduleBlock,
  formatSchedulesSummary,
} from '../../lib/dates';
import type {
  CourseTabId,
  CourseWithSchedules,
  ExamWithCourse,
} from '../../types/domain';
import { CourseAssistantWorkspace } from '../assistant/CourseAssistantWorkspace';
import { calculateAverageFromExams, ExamList } from '../exams/ExamList';
import { ExportMarkdownButton } from '../export/ExportMarkdownButton';
import { NotesWorkspace } from '../notes/NotesWorkspace';
import { SourcesWorkspace } from '../sources/SourcesWorkspace';
import { TaskList } from '../tasks/TaskList';
import { getCourseColorLabel } from './courseColors';

export type { CourseTabId } from '../../types/domain';

interface CourseTabDefinition {
  id: CourseTabId;
  label: string;
}

const COURSE_TABS: readonly CourseTabDefinition[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'tareas', label: 'Tareas' },
  { id: 'examenes', label: 'Exámenes' },
  { id: 'notas', label: 'Notas' },
  { id: 'fuentes', label: 'Fuentes' },
  { id: 'asistente', label: 'Asistente IA' },
];

export interface CourseDetailViewProps {
  course: CourseWithSchedules;
  onBackToAll: () => void;
  onEdit: (course: CourseWithSchedules) => void;
  onToggleArchive: (course: CourseWithSchedules) => void;
  onRequestDelete: (courseId: string) => void;
  initialTab?: CourseTabId;
  initialNoteId?: string | null;
  navigationVersion?: number;
  createRequestVersion?: number;
}

export function CourseDetailView({
  course,
  onBackToAll,
  onEdit,
  onToggleArchive,
  onRequestDelete,
  initialTab,
  initialNoteId,
  navigationVersion,
  createRequestVersion = 0,
}: CourseDetailViewProps) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<CourseTabId>(initialTab ?? 'resumen');
  const [courseExams, setCourseExams] = useState<ExamWithCourse[]>([]);
  const [taskCreateVersion, setTaskCreateVersion] = useState<number>(0);
  const [examCreateVersion, setExamCreateVersion] = useState<number>(0);
  const [noteCreateVersion, setNoteCreateVersion] = useState<number>(0);
  const lastCreateVersionRef = useRef<number>(0);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, navigationVersion]);

  useEffect(() => {
    if (!createRequestVersion || createRequestVersion <= lastCreateVersionRef.current) {
      return;
    }
    lastCreateVersionRef.current = createRequestVersion;
    if (activeTab === 'notas') {
      setNoteCreateVersion((v) => v + 1);
    } else if (activeTab === 'examenes') {
      setExamCreateVersion((v) => v + 1);
    } else {
      if (activeTab !== 'tareas') {
        setActiveTab('tareas');
      }
      setTaskCreateVersion((v) => v + 1);
    }
  }, [createRequestVersion, activeTab]);

  useEffect(() => {
    let active = true;
    const loadExams = async () => {
      const loaded = await cursadaClient.listExams({ courseId: course.id });
      if (active) {
        setCourseExams(loaded);
      }
    };
    void loadExams();

    const handleChanged = () => {
      void loadExams();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleChanged);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleChanged);
    };
  }, [course.id]);

  const isArchived = course.status === 'archived';
  const scheduleSummaryText = formatSchedulesSummary(course.schedules);
  const colorLabel = getCourseColorLabel(course.color);
  const averageGrade = calculateAverageFromExams(courseExams);

  function handleSelectTab(tabId: CourseTabId): void {
    setActiveTab(tabId);
    setTaskCreateVersion(0);
    setExamCreateVersion(0);
    setNoteCreateVersion(0);
  }

  function handleTabKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ): void {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') {
      return;
    }
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + delta + COURSE_TABS.length) % COURSE_TABS.length;
    const nextTab = COURSE_TABS[nextIndex];
    handleSelectTab(nextTab.id);
    const nextButton = document.getElementById(`${baseId}-tab-${nextTab.id}`);
    nextButton?.focus();
  }

  return (
    <div className="basic-view course-detail-view" data-course-color={course.color}>
      <header className="page-header course-detail-header">
        <div className="page-header-titles">
          <div className="course-detail-badges-row">
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
            {averageGrade !== null ? (
              <span
                className="exam-average-summary-pill"
                data-testid="course-detail-average-pill"
              >
                Promedio {averageGrade.toFixed(1)}
              </span>
            ) : null}
          </div>

          <h1 id="main-title" tabIndex={-1} className="page-title">
            {course.name}
          </h1>

          <p className="page-subtitle">
            {course.professor ? `Prof. ${course.professor}` : 'Profesor sin asignar'} ·{' '}
            {scheduleSummaryText}
          </p>
        </div>

        <div className="basic-header-actions course-detail-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onBackToAll}
          >
            Ver todas las materias
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onEdit(course)}
          >
            Editar materia
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onToggleArchive(course)}
          >
            {isArchived ? 'Activar materia' : 'Archivar materia'}
          </button>
          <button
            type="button"
            className="danger-outline-button"
            onClick={() => onRequestDelete(course.id)}
          >
            Eliminar materia
          </button>
        </div>
      </header>

      <div
        className="course-tabs-bar"
        role="tablist"
        aria-label={`Secciones de ${course.name}`}
      >
        {COURSE_TABS.map((tab, index) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={`course-tab-button ${isSelected ? 'is-active' : ''}`}
              onClick={() => handleSelectTab(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'resumen' ? (
        <section
          id={`${baseId}-panel-resumen`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-resumen`}
          className="course-tab-panel"
        >
          <div className="course-summary-grid">
            <div className="surface-panel course-info-panel">
              <div className="section-heading-bar">
                <h2 className="section-title">Ficha de la materia</h2>
              </div>

              <dl className="course-meta-list">
                <div className="course-meta-row">
                  <dt className="course-detail-label">Materia</dt>
                  <dd className="course-detail-value">{course.name}</dd>
                </div>
                <div className="course-meta-row">
                  <dt className="course-detail-label">Profesor / Cátedra</dt>
                  <dd className="course-detail-value">
                    {course.professor || 'Sin asignar'}
                  </dd>
                </div>
                <div className="course-meta-row">
                  <dt className="course-detail-label">Cuatrimestre</dt>
                  <dd className="course-detail-value">{course.term}</dd>
                </div>
                <div className="course-meta-row">
                  <dt className="course-detail-label">Estado</dt>
                  <dd className="course-detail-value">
                    {isArchived ? 'Archivada (Cuatrimestre anterior)' : 'Activa (En curso)'}
                  </dd>
                </div>
                <div className="course-meta-row">
                  <dt className="course-detail-label">Color</dt>
                  <dd className="course-detail-value">
                    <span className="course-pill" data-course-color={course.color}>
                      <span
                        className="course-dot"
                        data-course-color={course.color}
                        aria-hidden="true"
                      />
                      {colorLabel}
                    </span>
                  </dd>
                </div>
              </dl>

              <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)' }}>
                <ExportMarkdownButton
                  scope="course"
                  courseId={course.id}
                  label="Exportar materia (.md)"
                  className="secondary-button"
                  data-testid="export-course-markdown-btn"
                />
              </div>
            </div>

            <div className="surface-panel course-schedules-panel">
              <div className="section-heading-bar">
                <div className="section-heading-left">
                  <h2 className="section-title">Horarios de cursada</h2>
                  <span className="section-counter">{course.schedules.length}</span>
                </div>
                <button
                  type="button"
                  className="ghost-action-button"
                  onClick={() => onEdit(course)}
                >
                  Editar horarios
                </button>
              </div>

              {course.schedules.length === 0 ? (
                <p className="course-empty-text">
                  Esta materia no tiene bloques de horario semanal cargados todavía.
                </p>
              ) : (
                <ul className="course-schedules-list" role="list">
                  {course.schedules.map((sched) => (
                    <li
                      key={sched.id}
                      className="course-schedule-card"
                      data-course-color={course.color}
                    >
                      <div className="course-schedule-card-main">
                        <span className="course-schedule-day">
                          {DAY_NAMES_ES[sched.dayOfWeek]}
                        </span>
                        <span className="course-schedule-time">
                          {sched.startTime} – {sched.endTime}
                        </span>
                      </div>
                      <div className="course-schedule-card-sub">
                        <span className="course-schedule-location">
                          {sched.location || 'Sin aula / modalidad especificada'}
                        </span>
                        <span className="course-schedule-formatted">
                          {formatScheduleBlock(sched)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'tareas' ? (
        <section
          id={`${baseId}-panel-tareas`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-tareas`}
          data-testid="course-tasks-tab-panel"
          className="course-tab-panel"
        >
          <TaskList
            courseId={course.id}
            createRequestVersion={taskCreateVersion}
          />
        </section>
      ) : null}

      {activeTab === 'examenes' ? (
        <section
          id={`${baseId}-panel-examenes`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-examenes`}
          data-testid="course-exams-tab-panel"
          className="course-tab-panel"
        >
          <ExamList
            courseId={course.id}
            createRequestVersion={examCreateVersion}
          />
        </section>
      ) : null}

      {activeTab === 'notas' ? (
        <section
          id={`${baseId}-panel-notas`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-notas`}
          data-testid="course-notes-tab-panel"
          className="course-tab-panel"
        >
          <NotesWorkspace
            courseId={course.id}
            initialNoteId={initialNoteId}
            createRequestVersion={noteCreateVersion}
          />
        </section>
      ) : null}

      {activeTab === 'fuentes' ? (
        <section
          id={`${baseId}-panel-fuentes`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-fuentes`}
          data-testid="course-sources-tab-panel"
          className="course-tab-panel"
        >
          <SourcesWorkspace courseId={course.id} courseName={course.name} />
        </section>
      ) : null}

      {activeTab === 'asistente' ? (
        <section
          id={`${baseId}-panel-asistente`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-asistente`}
          className="course-tab-panel"
          data-testid="course-assistant-tab-panel"
        >
          <CourseAssistantWorkspace
            courseId={course.id}
            courseName={course.name}
            onOpenNotesTab={() => handleSelectTab('notas')}
          />
        </section>
      ) : null}
    </div>
  );
}
