import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { cursadaClient, DATA_CHANGED_EVENT } from './lib/api/client';
import { resolveGlobalShortcut } from './lib/shortcuts/commandPaletteSearch';
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
import type {
  CommandPaletteTarget,
  CourseTabId,
  NavSectionId,
  ThemeMode,
} from './types';

const SECTION_TITLES: Record<NavSectionId, string> = {
  inicio: 'Inicio | Cursada',
  calendario: 'Calendario | Cursada',
  tareas: 'Tareas | Cursada',
  examenes: 'Exámenes | Cursada',
  materias: 'Materias | Cursada',
  ajustes: 'Ajustes | Cursada',
};

interface CourseNavigationTargetState {
  tab?: CourseTabId;
  noteId?: string | null;
  version: number;
}

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
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [courseNavTarget, setCourseNavTarget] = useState<CourseNavigationTargetState>({
    version: 0,
  });
  const [tasksCreateVersion, setTasksCreateVersion] = useState<number>(0);
  const [examsCreateVersion, setExamsCreateVersion] = useState<number>(0);
  const [coursesCreateVersion, setCoursesCreateVersion] = useState<number>(0);
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

  const handleSelectSection = useCallback((section: NavSectionId): void => {
    setActiveSection(section);
    setSelectedCourseId(null);
    setCourseNavTarget((prev) => ({ version: prev.version }));
    setTasksCreateVersion(0);
    setExamsCreateVersion(0);
    setCoursesCreateVersion(0);
  }, []);

  /**
   * Shared navigation contract:
   * - Passing a `courseId` navigates to `materias` with that course selected (used by Sidebar & Calendar blocks).
   * - Passing `null` returns to the overview of all courses in `materias`.
   */
  const handleSelectCourse = useCallback((courseId: string | null): void => {
    setSelectedCourseId(courseId);
    setActiveSection('materias');
    setCourseNavTarget((prev) => ({ version: prev.version }));
    setTasksCreateVersion(0);
    setExamsCreateVersion(0);
    setCoursesCreateVersion(0);
  }, []);

  const handleContextualCreate = useCallback((): void => {
    setIsCommandPaletteOpen(false);
    if (activeSection === 'tareas') {
      setTasksCreateVersion((v) => v + 1);
      return;
    }
    if (activeSection === 'examenes') {
      setExamsCreateVersion((v) => v + 1);
      return;
    }
    if (activeSection === 'materias') {
      setCoursesCreateVersion((v) => v + 1);
      return;
    }
    // From Inicio, Calendario, or Ajustes, Cmd+N jumps to Tareas and opens new task
    setActiveSection('tareas');
    setSelectedCourseId(null);
    setExamsCreateVersion(0);
    setCoursesCreateVersion(0);
    setTasksCreateVersion((v) => v + 1);
  }, [activeSection]);

  const handleCommandPaletteTarget = useCallback(
    (target: CommandPaletteTarget): void => {
      if (target.type === 'section') {
        setActiveSection(target.section);
        setSelectedCourseId(null);
        setCourseNavTarget((prev) => ({ version: prev.version }));
        if (target.triggerCreate) {
          if (target.section === 'tareas') {
            setExamsCreateVersion(0);
            setCoursesCreateVersion(0);
            setTasksCreateVersion((v) => v + 1);
          } else if (target.section === 'examenes') {
            setTasksCreateVersion(0);
            setCoursesCreateVersion(0);
            setExamsCreateVersion((v) => v + 1);
          } else if (target.section === 'materias') {
            setTasksCreateVersion(0);
            setExamsCreateVersion(0);
            setCoursesCreateVersion((v) => v + 1);
          }
        } else {
          setTasksCreateVersion(0);
          setExamsCreateVersion(0);
          setCoursesCreateVersion(0);
        }
        return;
      }

      setActiveSection('materias');
      setSelectedCourseId(target.courseId);
      setCourseNavTarget((prev) => ({
        tab: target.tab,
        noteId: target.noteId ?? null,
        version: prev.version + 1,
      }));
      setTasksCreateVersion(0);
      setExamsCreateVersion(0);
      if (target.triggerCreate) {
        setCoursesCreateVersion((v) => v + 1);
      } else {
        setCoursesCreateVersion(0);
      }
    },
    []
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveGlobalShortcut(event);
      if (!action) {
        return;
      }

      event.preventDefault();

      if (action.type === 'toggle_palette') {
        setIsCommandPaletteOpen((open) => !open);
        return;
      }

      if (action.type === 'navigate_section') {
        setIsCommandPaletteOpen(false);
        handleSelectSection(action.section);
        return;
      }

      if (action.type === 'contextual_new') {
        handleContextualCreate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleContextualCreate, handleSelectSection]);

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
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
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
                externalCreateVersion={tasksCreateVersion}
              />
            ) : null}

            {activeSection === 'examenes' ? (
              <ExamsPage
                onSelectCourse={handleSelectCourse}
                onExamsChanged={() => void refreshSidebarData()}
                externalCreateVersion={examsCreateVersion}
              />
            ) : null}

            {activeSection === 'materias' ? (
              <CoursesPage
                selectedCourseId={selectedCourseId}
                onSelectCourse={handleSelectCourse}
                onCoursesChanged={() => void refreshSidebarData()}
                initialCourseTab={courseNavTarget.tab}
                initialNoteId={courseNavTarget.noteId}
                courseNavigationVersion={courseNavTarget.version}
                createRequestVersion={coursesCreateVersion}
              />
            ) : null}

            {activeSection === 'ajustes' ? (
              <SettingsPage themeMode={themeMode} onChangeThemeMode={setThemeMode} />
            ) : null}
          </div>
        </main>
      </div>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTarget={handleCommandPaletteTarget}
      />
    </div>
  );
}
