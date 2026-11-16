import fs from 'node:fs';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse, getCourseById, listCourses } from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import { createNote, listNotes } from '../../electron/db/notesRepo';
import { createTask, listTasks } from '../../electron/db/tasksRepo';
import {
  createBackup,
  listBackups,
  restoreBackup,
} from '../../electron/services/backupService';
import { CommandPalette } from '../components/command-palette/CommandPalette';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { CalendarPage } from '../pages/CalendarPage';
import { CoursesPage } from '../pages/CoursesPage';
import { ExamsPage } from '../pages/ExamsPage';
import { HomePage } from '../pages/HomePage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TasksPage } from '../pages/TasksPage';

const FULL_WEEKDAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const FULL_MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

describe('Phase 9 (v1.1.0): UI Declutter, Anotadores, Real Date on HomePage & 1-Click Backup Restore', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Task 9.1: removes page-subtitle, settings-description, assistant badge, and duplicate schedule text', async () => {
    const calendarView = render(<CalendarPage onSelectCourse={vi.fn()} />);
    expect(calendarView.container.querySelector('.page-subtitle')).toBeNull();
    calendarView.unmount();

    const tasksView = render(<TasksPage onSelectCourse={vi.fn()} />);
    expect(tasksView.container.querySelector('.page-subtitle')).toBeNull();
    tasksView.unmount();

    const examsView = render(<ExamsPage onSelectCourse={vi.fn()} />);
    expect(examsView.container.querySelector('.page-subtitle')).toBeNull();
    examsView.unmount();

    const coursesView = render(
      <CoursesPage selectedCourseId={null} onSelectCourse={vi.fn()} />
    );
    expect(coursesView.container.querySelector('.page-subtitle')).toBeNull();
    coursesView.unmount();

    const reportsView = render(<ReportsPage />);
    expect(reportsView.container.querySelector('.page-subtitle')).toBeNull();
    reportsView.unmount();

    const settingsView = render(
      <SettingsPage themeMode="dark" onChangeThemeMode={vi.fn()} />
    );
    expect(settingsView.container.querySelector('.page-subtitle')).toBeNull();
    expect(
      settingsView.container.querySelectorAll('.settings-description')
    ).toHaveLength(0);
    settingsView.unmount();

    // Detail view renders the clean 3-pane notebook without on-demand badge or duplicated schedule text
    const detailView = render(
      <CoursesPage selectedCourseId="ing-soft-1" onSelectCourse={vi.fn()} />
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('assistant-ondemand-badge')
    ).not.toBeInTheDocument();
    expect(
      detailView.container.querySelector('.course-schedule-formatted')
    ).toBeNull();
    expect(detailView.container.querySelector('.notebook-grid')).not.toBeNull();
  });

  it('Task 9.2: creates a non-university Materia without term, professor, or schedules and hides empty academic metadata', async () => {
    // 1. SQLite repository check
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);
    const createdRepoCourse = createCourse(ctx.db, {
      name: 'Lecturas de Filosofía',
      color: 'emerald',
    });
    expect(createdRepoCourse.term).toBe('');
    expect(createdRepoCourse.professor).toBe('');
    expect(createdRepoCourse.schedules).toEqual([]);
    expect(getCourseById(ctx.db, createdRepoCourse.id)?.name).toBe(
      'Lecturas de Filosofía'
    );
    ctx.close();

    // 2. UI flow on CoursesPage -> CourseFormModal -> CourseDetailView
    const onSelectCourse = vi.fn();
    const { rerender } = render(
      <CoursesPage selectedCourseId={null} onSelectCourse={onSelectCourse} />
    );

    await screen.findByRole('button', { name: 'Ingeniería de Software I' });
    fireEvent.click(screen.getByRole('button', { name: /\+ Nueva materia/i }));

    fireEvent.change(screen.getByLabelText(/Nombre de la materia/i), {
      target: { value: 'Proyecto Personal Mac' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }));

    const createdButton = await screen.findByRole('button', {
      name: 'Proyecto Personal Mac',
    });
    const row = createdButton.closest('[role="row"]') as HTMLElement;
    expect(
      within(row).queryByText(/Profesor sin asignar/i)
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByText(/Sin aula asignada/i)
    ).not.toBeInTheDocument();
    expect(within(row).getByText('Sin horario')).toBeInTheDocument();

    const allCourses = await cursadaClient.listCourses({ status: 'all' });
    const createdCourse = allCourses.find(
      (c) => c.name === 'Proyecto Personal Mac'
    );
    expect(createdCourse).toBeDefined();

    // Open detail view for the minimalist Materia
    rerender(
      <CoursesPage
        selectedCourseId={createdCourse!.id}
        onSelectCourse={onSelectCourse}
      />
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Proyecto Personal Mac',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Profesor sin asignar/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Sin horarios asignados/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Horarios de cursada/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Notas de la materia' })
    ).toBeInTheDocument();

    // Check CommandPalette reflects Materias terminology
    render(
      <CommandPalette
        isOpen={true}
        onClose={vi.fn()}
        onSelectTarget={vi.fn()}
      />
    );
    const paletteDialog = screen.getByTestId('command-palette-dialog');
    expect(
      within(paletteDialog).getByRole('button', { name: 'Materias' })
    ).toBeInTheDocument();
    expect(
      await within(paletteDialog).findByText('Proyecto Personal Mac')
    ).toBeInTheDocument();
  });

  it('Task 9.3 (HomePage): uses real system date by default without hardcoded week pill', async () => {
    const today = new Date();
    const expectedDay = String(today.getDate());
    const expectedWeekday = FULL_WEEKDAY_NAMES[today.getDay()];
    const expectedMonth = `de ${FULL_MONTH_NAMES[today.getMonth()]}`;

    const { container } = render(
      <HomePage onNavigateSection={vi.fn()} onSelectCourse={vi.fn()} />
    );

    await waitFor(() => {
      expect(container.querySelector('.home-day-number')?.textContent).toBe(
        expectedDay
      );
    });
    const dateLabel = container.querySelector('.home-date-label');
    expect(dateLabel?.textContent).toContain(expectedWeekday);
    expect(dateLabel?.textContent).toContain(expectedMonth);
    expect(screen.queryByText(/Semana 12/i)).not.toBeInTheDocument();
  });

  it('Task 9.3 (Backend SQLite): restoreBackup creates pre-restore backup, restores all tables + FTS5, and validates inputs', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const originalCourse = createCourse(ctx.db, {
      name: 'Álgebra Lineal',
      color: 'blue',
      term: '2026 - 1° Cuatrimestre',
    });
    createTask(ctx.db, {
      courseId: originalCourse.id,
      title: 'Guía de autovalores',
      dueDate: '2026-06-15',
    });
    createNote(ctx.db, {
      courseId: originalCourse.id,
      title: 'Apunte Diagonalización',
      content: 'Teorema espectral para matrices simétricas.',
    });

    const snapshotBackup = createBackup(ctx.db, ctx.dataDir, 'manual');

    // Mutate state after backup
    const extraCourse = createCourse(ctx.db, {
      name: 'Anotador Temporal Post-Backup',
      color: 'rose',
    });
    createNote(ctx.db, {
      courseId: extraCourse.id,
      title: 'Nota Que Debe Desaparecer',
      content: 'Contenido posterior al backup.',
    });
    expect(listCourses(ctx.db)).toHaveLength(2);

    // Invalid filename validation
    expect(() => restoreBackup(ctx.db, ctx.dataDir, '../evil.sqlite')).toThrow(
      /inválido/i
    );
    expect(() => restoreBackup(ctx.db, ctx.dataDir, 'not-a-db.txt')).toThrow(
      /inválido/i
    );
    expect(() =>
      restoreBackup(ctx.db, ctx.dataDir, 'missing-backup.sqlite')
    ).toThrow(/No se encontró el backup/i);

    // Restore valid backup
    const restoreResult = restoreBackup(
      ctx.db,
      ctx.dataDir,
      snapshotBackup.filename
    );

    expect(restoreResult.restoredFrom.filename).toBe(snapshotBackup.filename);
    expect(restoreResult.preRestoreBackup.filename).toContain('pre-restore');
    expect(fs.existsSync(restoreResult.preRestoreBackup.filePath)).toBe(true);

    // Verify restored courses, tasks, and FTS5 notes
    const restoredCourses = listCourses(ctx.db);
    expect(restoredCourses).toHaveLength(1);
    expect(restoredCourses[0].name).toBe('Álgebra Lineal');

    const restoredTasks = listTasks(ctx.db);
    expect(restoredTasks).toHaveLength(1);
    expect(restoredTasks[0].title).toBe('Guía de autovalores');

    const restoredNotes = listNotes(ctx.db, { query: 'espectral' });
    expect(restoredNotes).toHaveLength(1);
    expect(restoredNotes[0].title).toBe('Apunte Diagonalización');
    expect(listNotes(ctx.db, { query: 'Desaparecer' })).toHaveLength(0);

    // Pre-restore backup was registered in backups directory
    expect(
      listBackups(ctx.dataDir).some(
        (b) => b.filename === restoreResult.preRestoreBackup.filename
      )
    ).toBe(true);

    ctx.close();
  });

  it('Task 9.3 (SettingsPage UI): opens data directory and restores backup with safety confirmation', async () => {
    const openDirSpy = vi.spyOn(cursadaClient, 'openDataDir');

    // Create a clean backup first, then create an extra course
    const backupInfo = await cursadaClient.createBackup();
    await cursadaClient.createCourse({
      name: 'Anotador Posterior Al Backup',
      color: 'cyan',
    });

    const coursesBeforeRestore = await cursadaClient.listCourses({ status: 'all' });
    expect(
      coursesBeforeRestore.some((c) => c.name === 'Anotador Posterior Al Backup')
    ).toBe(true);

    render(<SettingsPage themeMode="system" onChangeThemeMode={vi.fn()} />);

    const openDirBtn = await screen.findByTestId('open-data-dir-button');
    fireEvent.click(openDirBtn);
    await waitFor(() => {
      expect(openDirSpy).toHaveBeenCalledTimes(1);
    });

    const restoreBtn = await screen.findByTestId(
      `restore-backup-btn-${backupInfo.filename}`
    );
    fireEvent.click(restoreBtn);

    const confirmBtn = await screen.findByTestId(
      `confirm-restore-btn-${backupInfo.filename}`
    );
    fireEvent.click(confirmBtn);

    const alertBox = await screen.findByTestId('backup-restored-alert');
    expect(alertBox).toHaveTextContent(/Restaurado desde/i);
    expect(alertBox).toHaveTextContent(backupInfo.filename);
    expect(alertBox).toHaveTextContent(/Respaldo preventivo creado/i);
    expect(alertBox).toHaveTextContent(/pre-restore/i);

    const coursesAfterRestore = await cursadaClient.listCourses({ status: 'all' });
    expect(
      coursesAfterRestore.some((c) => c.name === 'Anotador Posterior Al Backup')
    ).toBe(false);
  });
});
