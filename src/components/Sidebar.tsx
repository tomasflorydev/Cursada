import React from 'react';
import type { NavSectionId, SampleCourse, ThemeMode } from '../types/design';
import { CURRENT_TERM_LABEL } from '../lib/sampleData';

interface SidebarProps {
  activeSection: NavSectionId;
  selectedCourseId: string | null;
  courses: SampleCourse[];
  pendingTasksCount: number;
  upcomingExamsCount: number;
  themeMode: ThemeMode;
  onSelectSection: (section: NavSectionId) => void;
  onSelectCourse: (courseId: string) => void;
  onChangeThemeMode: (mode: ThemeMode) => void;
}

interface NavItemConfig {
  id: NavSectionId;
  label: string;
  badge?: number;
  icon: React.ReactNode;
}

export function Sidebar({
  activeSection,
  selectedCourseId,
  courses,
  pendingTasksCount,
  upcomingExamsCount,
  themeMode,
  onSelectSection,
  onSelectCourse,
  onChangeThemeMode,
}: SidebarProps) {
  const mainNavItems: NavItemConfig[] = [
    {
      id: 'inicio',
      label: 'Inicio',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65">
          <path d="M3.5 8.2 10 3l6.5 5.2v7.3a1.5 1.5 0 0 1-1.5 1.5h-10a1.5 1.5 0 0 1-1.5-1.5V8.2Z" />
          <path d="M7.5 17v-5h5v5" />
        </svg>
      ),
    },
    {
      id: 'calendario',
      label: 'Calendario',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65">
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
          <path d="M6.5 3v3M13.5 3v3M3 8.5h14" />
        </svg>
      ),
    },
    {
      id: 'tareas',
      label: 'Tareas',
      badge: pendingTasksCount,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65">
          <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
          <path d="m7 10.2 2.1 2.1 4.1-4.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: 'examenes',
      label: 'Exámenes',
      badge: upcomingExamsCount,
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65">
          <path d="M10 3.5 2.5 7.2 10 11l7.5-3.8L10 3.5Z" strokeLinejoin="round" />
          <path d="M5.5 9.2v4.2c0 1.4 2 2.6 4.5 2.6s4.5-1.2 4.5-2.6V9.2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'notas',
      label: 'Notas',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65">
          <path d="M5 3.5h7.5L16 7v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" />
          <path d="M12 3.5V7h3.5M7 10.5h6M7 13.5h4.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'materias',
      label: 'Materias',
      icon: (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65">
          <path d="M3.5 5.5A1.5 1.5 0 0 1 5 4h3.4l1.5 1.8H15A1.5 1.5 0 0 1 16.5 7.3v7.2A1.5 1.5 0 0 1 15 16H5a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="app-sidebar" aria-label="Barra lateral de Cursada">
      <div className="sidebar-window-drag" aria-hidden="true" />

      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">
          C
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-app-name">Cursada</span>
          <span className="sidebar-term-caption">{CURRENT_TERM_LABEL}</span>
        </div>
      </div>

      <nav className="sidebar-nav-section" aria-label="Principal">
        <ul className="sidebar-nav-list">
          {mainNavItems.map((item) => {
            const isActive =
              activeSection === item.id && (item.id !== 'materias' || selectedCourseId === null);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`sidebar-nav-button ${isActive ? 'is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectSection(item.id)}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  <span className="sidebar-nav-label">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 ? (
                    <span className="sidebar-nav-badge" aria-label={`${item.badge} pendientes`}>
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-divider" role="separator" />

      <nav className="sidebar-courses-section" aria-label="Materias en curso">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">Cursada actual</span>
          <span className="sidebar-section-count">{courses.length}</span>
        </div>
        <ul className="sidebar-course-list">
          {courses.map((course) => {
            const isSelected = activeSection === 'materias' && selectedCourseId === course.id;
            return (
              <li key={course.id}>
                <button
                  type="button"
                  className={`sidebar-course-button ${isSelected ? 'is-active' : ''}`}
                  data-course-color={course.color}
                  onClick={() => onSelectCourse(course.id)}
                >
                  <span className="course-dot" data-course-color={course.color} aria-hidden="true" />
                  <span className="sidebar-course-name">{course.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div className="theme-switcher" role="group" aria-label="Apariencia de color">
          <button
            type="button"
            className={`theme-pill ${themeMode === 'system' ? 'is-active' : ''}`}
            aria-pressed={themeMode === 'system'}
            onClick={() => onChangeThemeMode('system')}
          >
            Auto
          </button>
          <button
            type="button"
            className={`theme-pill ${themeMode === 'light' ? 'is-active' : ''}`}
            aria-pressed={themeMode === 'light'}
            onClick={() => onChangeThemeMode('light')}
          >
            Claro
          </button>
          <button
            type="button"
            className={`theme-pill ${themeMode === 'dark' ? 'is-active' : ''}`}
            aria-pressed={themeMode === 'dark'}
            onClick={() => onChangeThemeMode('dark')}
          >
            Oscuro
          </button>
        </div>
      </div>
    </aside>
  );
}
