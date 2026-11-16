import { useCallback, useEffect, useState } from 'react';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { cursadaClient, DATA_CHANGED_EVENT } from './lib/api/client';
import { resolveGlobalShortcut } from './lib/shortcuts/commandPaletteSearch';
import { CalendarPage } from './pages/CalendarPage';
import { CoursesPage } from './pages/CoursesPage';
import { ExamsPage } from './pages/ExamsPage';
import { HomePage } from './pages/HomePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TasksPage } from './pages/TasksPage';
import type {
  CommandPaletteTarget,
  CourseTabId,
  CourseWithSchedules,
  NavSectionId,
  NoteFontSize,
  ThemeMode,
} from './types';
import { SwissHeader, type SwissCourseDetailHeader } from './ui';

const SECTION_TITLES: Record<NavSectionId, string> = {
  inicio: 'Inicio | Cursada',
  materias: 'Materias | Cursada',
  calendario: 'Calendario | Cursada',
  tareas: 'Tareas | Cursada',
  examenes: 'Exámenes | Cursada',
  informes: 'Informes | Cursada',
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
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'dark';
}

function readInitialNoteFontSize(): NoteFontSize {
  try {
    const stored = localStorage.getItem('cursada-note-size');
    if (stored === 'small' || stored === 'normal' || stored === 'large') {
      return stored;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'normal';
}

export function App() {
  const [activeSection, setActiveSection] = useState<NavSectionId>('inicio');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseDetailHeader, setCourseDetailHeader] = useState<{
    name: string;
    summary: string;
  } | null>(null);
  const [coursesCache, setCoursesCache] = useState<CourseWithSchedules[]>([]);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [noteFontSize, setNoteFontSize] = useState<NoteFontSize>(
    readInitialNoteFontSize
  );
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [courseNavTarget, setCourseNavTarget] = useState<CourseNavigationTargetState>({
    version: 0,
  });
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportNavVersion, setReportNavVersion] = useState<number>(0);

  const [tasksCreateVersion, setTasksCreateVersion] = useState<number>(0);
  const [examsCreateVersion, setExamsCreateVersion] = useState<number>(0);
  const [coursesCreateVersion, setCoursesCreateVersion] = useState<number>(0);
  const [reportsCreateVersion, setReportsCreateVersion] = useState<number>(0);
  const [newNoteRequestVersion, setNewNoteRequestVersion] = useState<number>(0);

  const refreshCoursesCache = useCallback(async () => {
    try {
      const loadedCourses = await cursadaClient.listCourses({ status: 'active' });
      setCoursesCache(loadedCourses);
    } catch {
      // Ignore cache load failure
    }
  }, []);

  useEffect(() => {
    void refreshCoursesCache();

    const handleDataChanged = () => {
      void refreshCoursesCache();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [refreshCoursesCache]);

  useEffect(() => {
    if (activeSection === 'materias' && selectedCourseId && courseDetailHeader?.name) {
      document.title = `${courseDetailHeader.name} | Cursada`;
      return;
    }
    document.title = SECTION_TITLES[activeSection];
  }, [activeSection, selectedCourseId, courseDetailHeader]);

  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    root.setAttribute('data-theme', themeMode);
    if (meta) {
      meta.content = themeMode === 'system' ? 'light dark' : themeMode;
    }
    try {
      localStorage.setItem('color-scheme', themeMode);
    } catch {
      // Ignore storage errors
    }
  }, [themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-note-size', noteFontSize);
    try {
      localStorage.setItem('cursada-note-size', noteFontSize);
    } catch {
      // Ignore storage errors
    }
  }, [noteFontSize]);

  const handleSelectSection = useCallback(
    (
      section: NavSectionId,
      opts?: { triggerCreate?: boolean; reportId?: string }
    ): void => {
      setActiveSection(section);
      setSelectedCourseId(null);
      setCourseDetailHeader(null);
      setCourseNavTarget((prev) => ({ version: prev.version }));
      setTasksCreateVersion(0);
      setExamsCreateVersion(0);
      setCoursesCreateVersion(0);
      setReportsCreateVersion(0);
      setNewNoteRequestVersion(0);

      if (section === 'informes' && opts?.reportId) {
        setSelectedReportId(opts.reportId);
        setReportNavVersion((v) => v + 1);
      }

      if (opts?.triggerCreate) {
        if (section === 'tareas') {
          setTasksCreateVersion((v) => v + 1);
        } else if (section === 'examenes') {
          setExamsCreateVersion((v) => v + 1);
        } else if (section === 'materias') {
          setCoursesCreateVersion((v) => v + 1);
        } else if (section === 'informes') {
          setReportsCreateVersion((v) => v + 1);
        }
      }
    },
    []
  );

  const handleSelectCourse = useCallback(
    (courseId: string | null, opts?: { noteId?: string }): void => {
      setSelectedCourseId(courseId);
      setActiveSection('materias');
      if (courseId === null) {
        setCourseDetailHeader(null);
      } else {
        const match = coursesCache.find((c) => c.id === courseId);
        if (match) {
          setCourseDetailHeader((prev) =>
            prev && prev.name === match.name
              ? prev
              : { name: match.name, summary: '' }
          );
        }
      }
      setCourseNavTarget((prev) => ({
        noteId: opts?.noteId ?? null,
        version: opts?.noteId ? prev.version + 1 : prev.version,
      }));
      setTasksCreateVersion(0);
      setExamsCreateVersion(0);
      setCoursesCreateVersion(0);
      setReportsCreateVersion(0);
    },
    [coursesCache]
  );

  const handleOpenReport = useCallback((reportId: string): void => {
    setSelectedCourseId(null);
    setCourseDetailHeader(null);
    setSelectedReportId(reportId);
    setReportNavVersion((v) => v + 1);
    setActiveSection('informes');
  }, []);

  const handleContextualCreate = useCallback((): void => {
    setIsCommandPaletteOpen(false);
    if (activeSection === 'materias' && selectedCourseId) {
      setNewNoteRequestVersion((v) => v + 1);
      return;
    }
    if (activeSection === 'tareas') {
      setTasksCreateVersion((v) => v + 1);
      return;
    }
    if (activeSection === 'examenes') {
      setExamsCreateVersion((v) => v + 1);
      return;
    }
    if (activeSection === 'informes') {
      setReportsCreateVersion((v) => v + 1);
      return;
    }
    if (activeSection === 'materias') {
      setCoursesCreateVersion((v) => v + 1);
      return;
    }
    const firstCourse = coursesCache[0];
    if (firstCourse) {
      setActiveSection('materias');
      setSelectedCourseId(firstCourse.id);
      setCourseDetailHeader({ name: firstCourse.name, summary: '' });
      setNewNoteRequestVersion((v) => v + 1);
      return;
    }
    setActiveSection('materias');
    setSelectedCourseId(null);
    setCoursesCreateVersion((v) => v + 1);
  }, [activeSection, selectedCourseId, coursesCache]);

  const handleCommandPaletteTarget = useCallback(
    (target: CommandPaletteTarget): void => {
      if (target.type === 'section') {
        handleSelectSection(target.section, {
          triggerCreate: target.triggerCreate,
          reportId: target.reportId,
        });
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
      setReportsCreateVersion(0);
      if (target.triggerCreate) {
        setNewNoteRequestVersion((v) => v + 1);
      }
    },
    [handleSelectSection]
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

  const headerCourseDetail: SwissCourseDetailHeader | null =
    activeSection === 'materias' && selectedCourseId
      ? {
          name:
            courseDetailHeader?.name ??
            coursesCache.find((c) => c.id === selectedCourseId)?.name ??
            'Materia',
          summary: courseDetailHeader?.summary ?? '',
          onBack: () => handleSelectSection('inicio'),
        }
      : null;

  return (
    <>
      <div className="swiss-drag-strip" aria-hidden="true" />
      <div className="swiss-shell">
        <a href="#main-title" className="skip-link visually-hidden">
          Saltar al contenido principal
        </a>

        <SwissHeader
          activeSection={activeSection}
          onSelectSection={(sec) => handleSelectSection(sec)}
          courseDetail={headerCourseDetail}
          activeCourseId={selectedCourseId}
          activeCourseName={
            headerCourseDetail?.name ??
            (selectedCourseId
              ? (coursesCache.find((c) => c.id === selectedCourseId)?.name ?? null)
              : null)
          }
        />

        <main className="swiss-main">
          {activeSection === 'inicio' ? (
            <HomePage
              onNavigateSection={handleSelectSection}
              onSelectCourse={(courseId, opts) =>
                handleSelectCourse(courseId, opts)
              }
            />
          ) : null}

          {activeSection === 'materias' ? (
            <CoursesPage
              selectedCourseId={selectedCourseId}
              onSelectCourse={handleSelectCourse}
              onCoursesChanged={() => void refreshCoursesCache()}
              onCourseDetailHeaderChange={setCourseDetailHeader}
              onOpenReport={handleOpenReport}
              initialCourseTab={courseNavTarget.tab}
              initialNoteId={courseNavTarget.noteId}
              courseNavigationVersion={courseNavTarget.version}
              createRequestVersion={coursesCreateVersion}
              newNoteRequestVersion={newNoteRequestVersion}
            />
          ) : null}

          {activeSection === 'calendario' ? (
            <CalendarPage
              onSelectCourse={(courseId) => handleSelectCourse(courseId)}
              onNavigateSection={(sec) => handleSelectSection(sec)}
            />
          ) : null}

          {activeSection === 'tareas' ? (
            <TasksPage
              onSelectCourse={(courseId) => handleSelectCourse(courseId)}
              onTasksChanged={() => void refreshCoursesCache()}
              externalCreateVersion={tasksCreateVersion}
            />
          ) : null}

          {activeSection === 'examenes' ? (
            <ExamsPage
              onSelectCourse={(courseId) => handleSelectCourse(courseId)}
              onExamsChanged={() => void refreshCoursesCache()}
              externalCreateVersion={examsCreateVersion}
              onOpenReport={handleOpenReport}
            />
          ) : null}

          {activeSection === 'informes' ? (
            <ReportsPage
              initialReportId={selectedReportId}
              reportNavigationVersion={reportNavVersion}
              createRequestVersion={reportsCreateVersion}
              onSelectCourseNote={(courseId, noteId) =>
                handleSelectCourse(courseId, noteId ? { noteId } : undefined)
              }
            />
          ) : null}

          {activeSection === 'ajustes' ? (
            <SettingsPage
              themeMode={themeMode}
              onChangeThemeMode={setThemeMode}
              noteFontSize={noteFontSize}
              onChangeNoteFontSize={setNoteFontSize}
            />
          ) : null}
        </main>

        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onSelectTarget={handleCommandPaletteTarget}
        />
      </div>
    </>
  );
}
