import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '../components/command-palette/CommandPalette';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { NotesWorkspace } from '../components/notes/NotesWorkspace';
import { Sidebar } from '../components/Sidebar';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
  normalizeSearchText,
  resolveGlobalShortcut,
} from '../lib/shortcuts/commandPaletteSearch';
import { CoursesPage } from '../pages/CoursesPage';
import type {
  CourseWithSchedules,
  ExamWithCourse,
  NoteWithCourse,
  TaskWithCourse,
} from '../types/domain';

describe('Phase 8 Task 8.1: CommandPalette, search helpers, shortcuts, and deep navigation', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('commandPaletteSearch helpers', () => {
    it('normalizes text removing accents, lowercasing, trimming, and collapsing whitespace', () => {
      expect(normalizeSearchText('  Álgebra   y   Diseño  de Árboles  ')).toBe(
        'algebra y diseno de arboles'
      );
      expect(normalizeSearchText('Programación\n\tFuncional — Haskell')).toBe(
        'programacion funcional — haskell'
      );
      expect(normalizeSearchText('   ')).toBe('');
    });

    it('builds command palette items for courses, notes, tasks, exams, and quick actions', async () => {
      const [courses, notes, tasks, exams] = await Promise.all([
        cursadaClient.listCourses({ status: 'all' }),
        cursadaClient.listNotes(),
        cursadaClient.listTasks({ status: 'all' }),
        cursadaClient.listExams(),
      ]);

      const items = buildCommandPaletteItems({ courses, notes, tasks, exams });

      const courseItem = items.find((i) => i.id === 'course:ing-soft-1');
      expect(courseItem).toMatchObject({
        kind: 'course',
        title: 'Ingeniería de Software I',
        badge: 'Materia',
        courseColor: 'blue',
        target: { type: 'course', courseId: 'ing-soft-1', tab: 'resumen' },
      });
      expect(courseItem?.subtitle).toContain('Prof. Martín Echeverría');

      const noteItem = items.find((i) => i.id === 'note:note-2');
      expect(noteItem).toMatchObject({
        kind: 'note',
        title: 'Comparativa práctica: Strategy vs. State en el dominio de envíos',
        badge: 'Nota',
        courseId: 'diseno-sistemas',
        courseColor: 'violet',
        target: {
          type: 'course',
          courseId: 'diseno-sistemas',
          tab: 'notas',
          noteId: 'note-2',
        },
      });
      expect(noteItem?.subtitle).toContain('Diseño de Sistemas');

      const doneTaskItem = items.find((i) => i.id === 'task:task-5');
      expect(doneTaskItem).toMatchObject({
        kind: 'task',
        badge: 'Tarea completada',
        target: { type: 'course', courseId: 'diseno-sistemas', tab: 'tareas' },
      });

      const pendingTaskItem = items.find((i) => i.id === 'task:task-1');
      expect(pendingTaskItem).toMatchObject({
        kind: 'task',
        badge: 'Tarea pendiente',
        target: { type: 'course', courseId: 'bd-2', tab: 'tareas' },
      });

      const gradedExamItem = items.find((i) => i.id === 'exam:exam-past-3');
      expect(gradedExamItem).toMatchObject({
        kind: 'exam',
        badge: 'Examen',
        target: { type: 'course', courseId: 'bd-2', tab: 'examenes' },
      });
      expect(gradedExamItem?.subtitle).toContain('Nota 8');

      expect(items.find((i) => i.id === 'action:new-task')).toMatchObject({
        kind: 'action',
        title: 'Nueva tarea',
        shortcutHint: '⌘N',
        target: { type: 'section', section: 'tareas', triggerCreate: true },
      });
      expect(items.find((i) => i.id === 'action:nav-ajustes')).toMatchObject({
        kind: 'action',
        title: 'Ir a Ajustes',
        shortcutHint: '⌘,',
        target: { type: 'section', section: 'ajustes' },
      });
    });

    it('filters by kind, matches accent-insensitively across multiple tokens, and ranks accurately', () => {
      const courses: CourseWithSchedules[] = [
        {
          id: 'c1',
          name: 'Álgebra Lineal',
          color: 'blue',
          professor: 'Ana Pérez',
          term: '2026 - 2° Cuatrimestre',
          status: 'active',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-01T00:00:00Z',
          schedules: [],
        },
        {
          id: 'c2',
          name: 'Sistemas Operativos',
          color: 'emerald',
          professor: 'Carlos Ruiz',
          term: '2026 - 1° Cuatrimestre',
          status: 'archived',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
          schedules: [],
        },
      ];
      const notes: NoteWithCourse[] = [
        {
          id: 'n1',
          courseId: 'c1',
          courseName: 'Álgebra Lineal',
          courseColor: 'blue',
          title: 'Espacios Vectoriales y Matrices',
          content: 'Definición de subespacios de álgebra.',
          origin: 'manual',
          isPinned: false,
          createdAt: '2026-09-01T00:00:00Z',
          updatedAt: '2026-09-01T00:00:00Z',
        },
        {
          id: 'n2',
          courseId: 'c2',
          courseName: 'Sistemas Operativos',
          courseColor: 'emerald',
          title: 'Introducción al Álgebra Booleana en Circuitos',
          content: 'Compuertas lógicas',
          origin: 'manual',
          isPinned: false,
          createdAt: '2026-09-02T00:00:00Z',
          updatedAt: '2026-09-02T00:00:00Z',
        },
      ];
      const tasks: TaskWithCourse[] = [
        {
          id: 't1',
          courseId: 'c2',
          courseName: 'Sistemas Operativos',
          courseColor: 'emerald',
          title: 'TP Planificación',
          description: 'Incluye ejercicio de álgebra de procesos',
          dueDate: null,
          priority: 'medium',
          status: 'pending',
          completedAt: null,
          createdAt: '2026-09-03T00:00:00Z',
          updatedAt: '2026-09-03T00:00:00Z',
        },
      ];
      const exams: ExamWithCourse[] = [
        {
          id: 'e1',
          courseId: 'c1',
          courseName: 'Álgebra Lineal',
          courseColor: 'blue',
          title: '1° Parcial',
          category: 'parcial',
          examDate: '2026-10-10',
          examTime: '18:30',
          location: 'Aula 10',
          topics: 'Autovalores',
          grade: null,
          createdAt: '2026-09-04T00:00:00Z',
          updatedAt: '2026-09-04T00:00:00Z',
        },
      ];

      const items = buildCommandPaletteItems({ courses, notes, tasks, exams });

      // Empty query orders course -> note -> task -> exam -> action
      const emptyOrdered = filterCommandPaletteItems(items, '');
      expect(emptyOrdered[0].kind).toBe('course');
      expect(emptyOrdered[2].kind).toBe('note');
      expect(emptyOrdered[4].kind).toBe('task');
      expect(emptyOrdered[5].kind).toBe('exam');
      expect(emptyOrdered[6].kind).toBe('action');

      // Ranking for "algebra":
      // 1) course:c1 (title prefix "algebra")
      // 2) note:n2 (title substring "algebra")
      // 3) note:n1 / exam:e1 (courseName/subtitle "algebra")
      // 4) task:t1 (keywords "algebra")
      const ranked = filterCommandPaletteItems(items, 'algebra');
      expect(ranked.map((item) => item.id)).toEqual([
        'course:c1',
        'note:n2',
        'note:n1',
        'exam:e1',
        'task:t1',
      ]);

      // Multi-token search across title and courseName
      const multiToken = filterCommandPaletteItems(items, 'algebra matrices');
      expect(multiToken.map((item) => item.id)).toEqual(['note:n1']);

      // Kind filter
      const onlyNotes = filterCommandPaletteItems(items, 'algebra', 'note');
      expect(onlyNotes.map((item) => item.id)).toEqual(['note:n2', 'note:n1']);

      const onlyActions = filterCommandPaletteItems(items, 'ajustes', 'action');
      expect(onlyActions.map((item) => item.id)).toEqual(['action:nav-ajustes']);
    });

    it('resolves global macOS and Ctrl shortcuts and ignores modified/prevented events', () => {
      expect(
        resolveGlobalShortcut({
          key: 'k',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'toggle_palette' });

      expect(
        resolveGlobalShortcut({
          key: 'K',
          metaKey: false,
          ctrlKey: true,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'toggle_palette' });

      expect(
        resolveGlobalShortcut({
          key: ',',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'navigate_section', section: 'ajustes' });

      expect(
        resolveGlobalShortcut({
          key: '1',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'navigate_section', section: 'inicio' });

      expect(
        resolveGlobalShortcut({
          key: '2',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'navigate_section', section: 'calendario' });

      expect(
        resolveGlobalShortcut({
          key: '3',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'navigate_section', section: 'tareas' });

      expect(
        resolveGlobalShortcut({
          key: '4',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'navigate_section', section: 'examenes' });

      expect(
        resolveGlobalShortcut({
          key: '5',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'navigate_section', section: 'materias' });

      expect(
        resolveGlobalShortcut({
          key: 'N',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toEqual({ type: 'contextual_new' });

      // Ignored cases
      expect(
        resolveGlobalShortcut({
          key: 'k',
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toBeNull();

      expect(
        resolveGlobalShortcut({
          key: 'k',
          metaKey: true,
          ctrlKey: false,
          altKey: true,
          shiftKey: false,
          defaultPrevented: false,
        })
      ).toBeNull();

      expect(
        resolveGlobalShortcut({
          key: 'k',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: true,
          defaultPrevented: false,
        })
      ).toBeNull();

      expect(
        resolveGlobalShortcut({
          key: 'k',
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          defaultPrevented: true,
        })
      ).toBeNull();
    });
  });

  describe('<CommandPalette /> component', () => {
    it('renders nothing when closed, loads mock data when opened, filters accent-insensitively, navigates with arrows + Enter, and closes on Escape or backdrop click', async () => {
      await cursadaClient.createNote({
        courseId: 'bd-2',
        title: 'Álgebra Relacional y Cálculo Tuplas',
        content: 'Operadores selección, proyección y join natural.',
      });

      const onClose = vi.fn();
      const onSelectTarget = vi.fn();

      const { rerender } = render(
        <CommandPalette
          isOpen={false}
          onClose={onClose}
          onSelectTarget={onSelectTarget}
        />
      );
      expect(
        screen.queryByTestId('command-palette-dialog')
      ).not.toBeInTheDocument();

      rerender(
        <CommandPalette
          isOpen={true}
          onClose={onClose}
          onSelectTarget={onSelectTarget}
        />
      );

      const dialog = screen.getByTestId('command-palette-dialog');
      expect(dialog).toHaveAttribute('role', 'dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Paleta de búsqueda rápida');

      const input = screen.getByTestId('command-palette-input');
      expect(input).toHaveFocus();

      // Wait for mockClient data to load
      await within(dialog).findByText('Ingeniería de Software I');

      // Search accent-insensitively for "algebra"
      fireEvent.change(input, { target: { value: 'algebra' } });

      await waitFor(() => {
        expect(
          within(dialog).getByText('Álgebra Relacional y Cálculo Tuplas')
        ).toBeInTheDocument();
        expect(
          within(dialog).getByText('1° Parcial de Modelado Relacional y Álgebra')
        ).toBeInTheDocument();
      });

      // Filter by "Notas" pill and search "diseno"
      fireEvent.click(within(dialog).getByRole('button', { name: 'Notas' }));
      fireEvent.change(input, { target: { value: 'diseno' } });

      await waitFor(() => {
        expect(
          within(dialog).getByText(
            'Comparativa práctica: Strategy vs. State en el dominio de envíos'
          )
        ).toBeInTheDocument();
        expect(
          within(dialog).queryByText('Diseño de Sistemas')
        ).not.toBeInTheDocument();
      });

      // Reset to "Todo" and search "diseno" -> returns Course, Note, Task, Exam
      fireEvent.click(within(dialog).getByRole('button', { name: 'Todo' }));
      await waitFor(() => {
        expect(
          within(dialog).getByText('Diseño de Sistemas')
        ).toBeInTheDocument();
      });

      // Navigate with ArrowDown / ArrowUp (including wrap-around) and confirm with Enter
      // Ranked for "diseno":
      //   0 = Diseño de Sistemas (course, title prefix)
      //   1 = 1° Parcial de Ingeniería de Requerimientos y Diseño (exam, title substring)
      //   2 = Comparativa práctica: Strategy vs. State en el dominio de envíos (note, courseName match)
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSelectTarget).toHaveBeenCalledTimes(1);
      expect(onSelectTarget).toHaveBeenCalledWith({
        type: 'course',
        courseId: 'diseno-sistemas',
        tab: 'notas',
        noteId: 'note-2',
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      // Test ArrowUp wrap-around from index 0 (change query so activeIndex resets to 0)
      onSelectTarget.mockClear();
      onClose.mockClear();
      fireEvent.change(input, { target: { value: 'diseno de' } });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowDown' }); // wraps back to index 0 ('Diseño de Sistemas')
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSelectTarget).toHaveBeenCalledWith({
        type: 'course',
        courseId: 'diseno-sistemas',
        tab: 'resumen',
      });

      // Test Escape closes without selecting
      onSelectTarget.mockClear();
      onClose.mockClear();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSelectTarget).not.toHaveBeenCalled();

      // Test backdrop click closes
      onClose.mockClear();
      fireEvent.click(screen.getByTestId('command-palette-dialog'));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('command-palette-backdrop'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('<Sidebar /> command palette trigger', () => {
    it('renders the quick search trigger outside Principal nav and invokes onOpenCommandPalette', () => {
      const onOpenCommandPalette = vi.fn();
      render(
        <Sidebar
          activeSection="inicio"
          selectedCourseId={null}
          courses={[]}
          pendingTasksCount={0}
          upcomingExamsCount={0}
          themeMode="system"
          onSelectSection={vi.fn()}
          onSelectCourse={vi.fn()}
          onChangeThemeMode={vi.fn()}
          onOpenCommandPalette={onOpenCommandPalette}
        />
      );

      const trigger = screen.getByTestId('sidebar-command-palette-trigger');
      expect(trigger).toHaveTextContent('Buscar…');
      expect(trigger).toHaveTextContent('⌘K');

      const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
      expect(
        within(primaryNav).queryByTestId('sidebar-command-palette-trigger')
      ).not.toBeInTheDocument();

      fireEvent.click(trigger);
      expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
    });
  });

  describe('Deep navigation & contextual creation wiring', () => {
    it('selects initialNoteId in NotesWorkspace without overwriting later user selections and triggers creation on createRequestVersion', async () => {
      const { rerender } = render(
        <NotesWorkspace initialNoteId="note-2" createRequestVersion={0} />
      );

      const titleInput = (await screen.findByLabelText(
        'Título de la nota'
      )) as HTMLInputElement;

      await waitFor(() => {
        expect(titleInput.value).toBe(
          'Comparativa práctica: Strategy vs. State en el dominio de envíos'
        );
      });

      // User manually chooses note-1
      const sidebar = screen.getByLabelText('Listado de notas');
      fireEvent.click(
        within(sidebar).getByText(
          'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
        )
      );
      expect(titleInput.value).toBe(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      );

      // Rerender with same initialNoteId must NOT overwrite user selection
      rerender(<NotesWorkspace initialNoteId="note-2" createRequestVersion={0} />);
      expect(titleInput.value).toBe(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      );

      // Incrementing createRequestVersion creates a new note
      rerender(<NotesWorkspace initialNoteId="note-2" createRequestVersion={1} />);
      await waitFor(() => {
        expect(titleInput.value).toBe('Nuevo apunte');
      });
    });

    it('opens target tab and note in CoursesPage and handles createRequestVersion both on overview and detail view', async () => {
      const onSelectCourse = vi.fn();
      const { rerender } = render(
        <CoursesPage
          selectedCourseId="diseno-sistemas"
          onSelectCourse={onSelectCourse}
          initialCourseTab="notas"
          initialNoteId="note-2"
          courseNavigationVersion={1}
          createRequestVersion={0}
        />
      );

      const titleInput = (await screen.findByLabelText(
        'Título de la nota'
      )) as HTMLInputElement;
      await waitFor(() => {
        expect(titleInput.value).toBe(
          'Comparativa práctica: Strategy vs. State en el dominio de envíos'
        );
      });

      // Trigger create inside notes tab -> creates new note
      rerender(
        <CoursesPage
          selectedCourseId="diseno-sistemas"
          onSelectCourse={onSelectCourse}
          initialCourseTab="notas"
          initialNoteId="note-2"
          courseNavigationVersion={1}
          createRequestVersion={1}
        />
      );
      await waitFor(() => {
        expect(titleInput.value).toBe('Nuevo apunte');
      });

      // Switch to overview (selectedCourseId = null) without triggering modal
      rerender(
        <CoursesPage
          selectedCourseId={null}
          onSelectCourse={onSelectCourse}
          createRequestVersion={1}
        />
      );
      expect(
        screen.queryByRole('heading', { name: 'Nueva materia' })
      ).not.toBeInTheDocument();

      // Trigger create on overview -> opens Nueva materia modal
      rerender(
        <CoursesPage
          selectedCourseId={null}
          onSelectCourse={onSelectCourse}
          createRequestVersion={2}
        />
      );
      expect(
        await screen.findByRole('heading', { name: 'Nueva materia' })
      ).toBeInTheDocument();
    });

    it('routes createRequestVersion in CourseDetailView according to activeTab', async () => {
      const courses = await cursadaClient.listCourses({ status: 'all' });
      const course = courses[0];

      const { rerender } = render(
        <CourseDetailView
          course={course}
          onBackToAll={vi.fn()}
          onEdit={vi.fn()}
          onToggleArchive={vi.fn()}
          onRequestDelete={vi.fn()}
          initialTab="resumen"
          createRequestVersion={0}
        />
      );

      // From resumen, createRequestVersion switches to tareas and opens task form
      rerender(
        <CourseDetailView
          course={course}
          onBackToAll={vi.fn()}
          onEdit={vi.fn()}
          onToggleArchive={vi.fn()}
          onRequestDelete={vi.fn()}
          initialTab="resumen"
          createRequestVersion={1}
        />
      );
      expect(
        await screen.findByRole('form', { name: 'Nueva tarea' })
      ).toBeInTheDocument();

      // Switch to examenes tab and trigger createRequestVersion -> opens exam form
      fireEvent.click(screen.getByRole('tab', { name: 'Exámenes' }));
      rerender(
        <CourseDetailView
          course={course}
          onBackToAll={vi.fn()}
          onEdit={vi.fn()}
          onToggleArchive={vi.fn()}
          onRequestDelete={vi.fn()}
          initialTab="resumen"
          createRequestVersion={2}
        />
      );
      expect(
        await screen.findByRole('form', { name: 'Agendar examen' })
      ).toBeInTheDocument();
    });
  });
});
