import { useEffect, useState } from 'react';
import type { NavSectionId, ThemeMode, UpcomingTaskItem } from './types/design';
import {
  SAMPLE_COURSES,
  SAMPLE_NOTES,
  UPCOMING_EXAMS,
  UPCOMING_TASKS,
  WEEK_PULSE,
} from './lib/sampleData';
import { Sidebar } from './components/Sidebar';
import { HomePage } from './pages/HomePage';
import {
  CalendarioBasicView,
  ExamenesBasicView,
  MateriasBasicView,
  NotasBasicView,
  TareasBasicView,
} from './pages/BasicViews';

const SECTION_TITLES: Record<NavSectionId, string> = {
  inicio: 'Inicio | Cursada',
  calendario: 'Calendario | Cursada',
  tareas: 'Tareas | Cursada',
  examenes: 'Exámenes | Cursada',
  notas: 'Notas | Cursada',
  materias: 'Materias | Cursada',
};

export function App() {
  const [activeSection, setActiveSection] = useState<NavSectionId>('inicio');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [tasks, setTasks] = useState<UpcomingTaskItem[]>(UPCOMING_TASKS);

  useEffect(() => {
    document.title = SECTION_TITLES[activeSection];
  }, [activeSection]);

  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', themeMode);
    }
  }, [themeMode]);

  function handleSelectSection(section: NavSectionId): void {
    setActiveSection(section);
    if (section !== 'materias') {
      setSelectedCourseId(null);
    }
  }

  function handleSelectCourse(courseId: string): void {
    setSelectedCourseId(courseId);
    setActiveSection('materias');
  }

  function handleToggleTask(taskId: string): void {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    );
  }

  const pendingTasksCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="app-shell">
      <a href="#main-title" className="skip-link visually-hidden">
        Saltar al contenido principal
      </a>

      <Sidebar
        activeSection={activeSection}
        selectedCourseId={selectedCourseId}
        courses={SAMPLE_COURSES}
        pendingTasksCount={pendingTasksCount}
        upcomingExamsCount={UPCOMING_EXAMS.length}
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
                tasks={tasks}
                exams={UPCOMING_EXAMS}
                weekPulse={WEEK_PULSE}
                onToggleTask={handleToggleTask}
                onNavigateSection={handleSelectSection}
                onSelectCourse={handleSelectCourse}
              />
            ) : null}

            {activeSection === 'calendario' ? (
              <CalendarioBasicView courses={SAMPLE_COURSES} weekPulse={WEEK_PULSE} />
            ) : null}

            {activeSection === 'tareas' ? (
              <TareasBasicView tasks={tasks} onToggleTask={handleToggleTask} />
            ) : null}

            {activeSection === 'examenes' ? (
              <ExamenesBasicView exams={UPCOMING_EXAMS} />
            ) : null}

            {activeSection === 'notas' ? <NotasBasicView notes={SAMPLE_NOTES} /> : null}

            {activeSection === 'materias' ? (
              <MateriasBasicView
                courses={SAMPLE_COURSES}
                selectedCourseId={selectedCourseId}
                onSelectCourse={setSelectedCourseId}
              />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
