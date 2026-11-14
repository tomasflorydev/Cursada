import { useCallback, useEffect, useState } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from './lib/api/client';
import type { SidebarCourseItem } from './components/Sidebar';
import { Sidebar } from './components/Sidebar';
import {
  SAMPLE_COURSES,
  UPCOMING_EXAMS,
  UPCOMING_TASKS,
} from './lib/sampleData';
import { CalendarPage } from './pages/CalendarPage';
import { CoursesPage } from './pages/CoursesPage';
import { ExamsPage } from './pages/ExamsPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import type { NavSectionId, ThemeMode } from './types';

const SECTION_TITLES: Record<NavSectionId, string> = {
  inicio: 'Inicio | Cursada',
  calendario: 'Calendario | Cursada',
  tareas: 'Tareas | Cursada',
  examenes: 'Exámenes | Cursada',
  materias: 'Materias | Cursada',
  ajustes: 'Ajustes | Cursada',
};

function readInitialThemeMode(): ThemeMode {
  try {
    const stored = localStorage.getItem('color-scheme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'system';
}

export function App() {
  const [activeSection, setActiveSection] = useState<NavSectionId>('inicio');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [sidebarCourses, setSidebarCourses] = useState<SidebarCourseItem[]>(() =>
    SAMPLE_COURSES.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      status: 'active',
      term: c.term,
    }))
  );
  const [pendingTasksCount, setPendingTasksCount] = useState<number>(
    () => UPCOMING_TASKS.filter((t) => !t.completed).length
  );
  const [upcomingExamsCount, setUpcomingExamsCount] = useState<number>(
    () => UPCOMING_EXAMS.length
  );

  const refreshSidebarData = useCallback(async () => {
    try {
      const [loadedCourses, loadedTasks, loadedExams] = await Promise.all([
        cursadaClient.listCourses({ status: 'all' }),
        cursadaClient.listTasks({ status: 'pending' }),
        cursadaClient.listExams({ graded: 'ungraded' }),
      ]);
      setSidebarCourses(
        loadedCourses.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          status: c.status,
          term: c.term,
        }))
      );
      setPendingTasksCount(loadedTasks.length);
      setUpcomingExamsCount(loadedExams.length);
    } catch {
      // Keep fallback state if loading fails
    }
  }, []);

  useEffect(() => {
    void refreshSidebarData();

    const handleDataChanged = () => {
      void refreshSidebarData();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [refreshSidebarData]);

  useEffect(() => {
    document.title = SECTION_TITLES[activeSection];
  }, [activeSection]);

  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');

    if (themeMode === 'system') {
      root.removeAttribute('data-theme');
      if (meta) {
        meta.content = 'light dark';
      }
      try {
        localStorage.removeItem('color-scheme');
      } catch {
        // Ignore storage errors
      }
    } else {
      root.setAttribute('data-theme', themeMode);
      if (meta) {
        meta.content = themeMode;
      }
      try {
        localStorage.setItem('color-scheme', themeMode);
      } catch {
        // Ignore storage errors
      }
    }
  }, [themeMode]);

  function handleSelectSection(section: NavSectionId): void {
    setActiveSection(section);
    setSelectedCourseId(null);
  }

  /**
   * Shared navigation contract:
   * - Passing a `courseId` navigates to `materias` with that course selected (used by Sidebar & Calendar blocks).
   * - Passing `null` returns to the overview of all courses in `materias`.
   */
  function handleSelectCourse(courseId: string | null): void {
    setSelectedCourseId(courseId);
    setActiveSection('materias');
  }

  return (
    <div className="app-shell">
      <a href="#main-title" className="skip-link visually-hidden">
        Saltar al contenido principal
      </a>

      <Sidebar
        activeSection={activeSection}
        selectedCourseId={selectedCourseId}
        courses={sidebarCourses}
        pendingTasksCount={pendingTasksCount}
        upcomingExamsCount={upcomingExamsCount}
        themeMode={themeMode}
        onSelectSection={handleSelectSection}
        onSelectCourse={handleSelectCourse}
        onChangeThemeMode={setThemeMode}
      />

      <div className="app-main-wrapper">
        <div className="content-window-drag" aria-hidden="true" />
        <main className="app-main-content">
          <div className="content-container">
            {activeSection === 'inicio' ? (
              <HomePage
                onNavigateSection={handleSelectSection}
                onSelectCourse={handleSelectCourse}
              />
            ) : null}

            {activeSection === 'calendario' ? (
              <CalendarPage onSelectCourse={handleSelectCourse} />
            ) : null}

            {activeSection === 'tareas' ? (
              <TasksPage
                onSelectCourse={handleSelectCourse}
                onTasksChanged={() => void refreshSidebarData()}
              />
            ) : null}

            {activeSection === 'examenes' ? (
              <ExamsPage
                onSelectCourse={handleSelectCourse}
                onExamsChanged={() => void refreshSidebarData()}
              />
            ) : null}

            {activeSection === 'materias' ? (
              <CoursesPage
                selectedCourseId={selectedCourseId}
                onSelectCourse={handleSelectCourse}
                onCoursesChanged={() => void refreshSidebarData()}
              />
            ) : null}

            {activeSection === 'ajustes' ? (
              <SettingsPage themeMode={themeMode} onChangeThemeMode={setThemeMode} />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
