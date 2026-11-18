import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { resetAllMocks } from '../lib/api/mockClient';
import { CalendarPage } from '../pages/CalendarPage';
import { CoursesPage } from '../pages/CoursesPage';
import { SettingsPage } from '../pages/SettingsPage';

function readStylesheet(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Swiss Editorial & Minimal Neo-Brutalist UI Overhaul', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CourseDetailView collapsible sidebars and Knowledge Network relocation', () => {
    it('renders NoteBacklinksPanel inside the left sidebar below the notes list and not in the center editor pane', async () => {
      const { container } = render(
        <CourseDetailView
          courseId="diseno-sistemas"
          initialNoteId="note-2"
          onSelectCourse={vi.fn()}
        />
      );

      const leftSidebar = await screen.findByLabelText('Notas de la materia');
      const backlinksPanel = await screen.findByTestId('note-backlinks-panel');
      const editorPane = container.querySelector('.notebook-editor-pane');
      const notesTop = leftSidebar.querySelector('.notebook-notes-top');
      const knowledgeSection = leftSidebar.querySelector('.notebook-knowledge-section');

      expect(editorPane).not.toBeNull();
      expect(leftSidebar).toContainElement(backlinksPanel);
      expect(editorPane!).not.toContainElement(backlinksPanel);
      expect(notesTop).not.toBeNull();
      expect(knowledgeSection).not.toBeNull();
      expect(knowledgeSection!).toContainElement(backlinksPanel);

      const children = Array.from(leftSidebar.children);
      expect(children.indexOf(notesTop!)).toBeLessThan(
        children.indexOf(knowledgeSection!)
      );
    });

    it('collapses and expands both left and right sidebars via isLeftSidebarOpen / isRightSidebarOpen toggles', async () => {
      const { container } = render(
        <CourseDetailView
          courseId="diseno-sistemas"
          initialNoteId="note-2"
          onSelectCourse={vi.fn()}
        />
      );

      await screen.findByLabelText('Notas de la materia');
      await screen.findByLabelText('Asistente e informes con IA');

      const grid = container.querySelector('section.notebook-grid');
      expect(grid).not.toBeNull();
      expect(grid).not.toHaveClass('is-left-collapsed');
      expect(grid).not.toHaveClass('is-right-collapsed');

      // Collapse left sidebar from its own header button
      const notesPane = await screen.findByLabelText('Notas de la materia');
      fireEvent.click(
        within(notesPane).getByRole('button', { name: 'Colapsar panel izquierdo' })
      );
      expect(screen.queryByLabelText('Notas de la materia')).not.toBeInTheDocument();
      expect(grid).toHaveClass('is-left-collapsed');

      const leftCollapsedRail = screen.getByLabelText('Panel de notas colapsado');
      const restoreLeftBtn = within(leftCollapsedRail).getByRole('button', {
        name: 'Mostrar panel de notas',
      });
      expect(restoreLeftBtn).toHaveAttribute('aria-expanded', 'false');

      // Collapse right sidebar from its own header button while left is collapsed
      const aiPane = await screen.findByLabelText('Asistente e informes con IA');
      fireEvent.click(
        within(aiPane).getByRole('button', { name: 'Colapsar panel derecho' })
      );
      expect(
        screen.queryByLabelText('Asistente e informes con IA')
      ).not.toBeInTheDocument();
      expect(grid).toHaveClass('is-left-collapsed');
      expect(grid).toHaveClass('is-right-collapsed');

      // Restore both sidebars from their respective collapsed rails
      fireEvent.click(restoreLeftBtn);
      expect(await screen.findByLabelText('Notas de la materia')).toBeInTheDocument();
      expect(grid).not.toHaveClass('is-left-collapsed');

      const rightCollapsedRail = screen.getByLabelText(
        'Panel de asistente IA colapsado'
      );
      fireEvent.click(
        within(rightCollapsedRail).getByRole('button', {
          name: 'Mostrar panel de asistente IA',
        })
      );
      expect(
        await screen.findByLabelText('Asistente e informes con IA')
      ).toBeInTheDocument();
      expect(grid).not.toHaveClass('is-right-collapsed');
    });

    it('removes graph view toggle from CourseDetailView and CoursesPage while keeping Obsidian import in SettingsPage', async () => {
      render(
        <CourseDetailView
          courseId="diseno-sistemas"
          initialNoteId="note-2"
          onSelectCourse={vi.fn()}
        />
      );

      await screen.findByLabelText('Notas de la materia');
      expect(
        screen.queryByRole('button', { name: 'Vista de grafo' })
      ).not.toBeInTheDocument();

      const { unmount } = render(
        <CoursesPage selectedCourseId={null} onSelectCourse={vi.fn()} />
      );
      await screen.findByRole('heading', { name: 'Materias' });
      expect(
        screen.queryByRole('button', { name: 'Grafo global' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Importar Vault de Obsidian' })
      ).not.toBeInTheDocument();
      unmount();

      render(
        <SettingsPage
          themeMode="dark"
          onChangeThemeMode={vi.fn()}
          noteFontSize="normal"
          onChangeNoteFontSize={vi.fn()}
        />
      );
      const settingsObsidianBtn = await screen.findByTestId(
        'settings-import-obsidian-button'
      );
      expect(settingsObsidianBtn).toHaveTextContent('Importar Vault de Obsidian');
      fireEvent.click(settingsObsidianBtn);
      expect(
        await screen.findByRole('heading', { name: 'Importar bóveda de Obsidian' })
      ).toBeInTheDocument();
    });
  });

  describe('App minimal view transitions & navigation', () => {
    it('wraps main view switching in the framer-motion view-transition-stage container', async () => {
      render(<App />);

      const stage = await screen.findByTestId('view-transition-stage');
      expect(stage).toBeInTheDocument();

      const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
      fireEvent.click(nav.querySelectorAll('button')[2]!);

      await waitFor(() => {
        const updatedStage = screen.getByTestId('view-transition-stage');
        expect(updatedStage).toBeInTheDocument();
        expect(updatedStage).toContainElement(
          screen.getByTestId('calendar-period-label')
        );
      });
    });
  });

  describe('Calendar monthly deliverable cell alignment', () => {
    it('renders day number at the top and stacked full-width deliverable badges below without nested buttons', async () => {
      render(
        <CalendarPage
          onSelectCourse={vi.fn()}
          initialDate={new Date(2026, 10, 10)}
          initialViewMode="month"
        />
      );

      await waitFor(() => {
        const cell = document.querySelector('[data-date="2026-11-10"]');
        expect(cell).not.toBeNull();
        expect(cell!.querySelector('.calendar-month-deliverables')).not.toBeNull();
      });

      const targetCell = document.querySelector('[data-date="2026-11-10"]') as HTMLElement;
      const dayNum = targetCell.querySelector('.calendar-month-daynum');
      const deliverables = targetCell.querySelector('.calendar-month-deliverables');
      const badges = targetCell.querySelectorAll('.calendar-month-badge');

      expect(dayNum).not.toBeNull();
      expect(dayNum).toHaveTextContent('10');
      expect(deliverables).not.toBeNull();
      expect(badges.length).toBeGreaterThan(0);

      // Keep day badges non-button spans so singular agenda buttons keep unique roles
      expect(targetCell.querySelectorAll('button').length).toBe(0);

      const children = Array.from(targetCell.children);
      expect(children.indexOf(dayNum!)).toBeLessThan(children.indexOf(deliverables!));
    });
  });

  describe('Swiss editorial CSS & Light/Dark toggle contrast contracts', () => {
    it('enforces 16px root typography scale, aligned header flexbox, generous 3-pane spacing, and editorial citations', () => {
      const indexCss = readStylesheet('src/styles/index.css');

      expect(indexCss).toContain('font-size: 16px;');
      expect(indexCss).toContain('.swiss-header {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;');
      expect(indexCss).toContain('.swiss-header-right {\n    display: flex;\n    align-items: center;');
      expect(indexCss).toContain('gap: 32px;');
      expect(indexCss).toContain('padding: 24px;\n    border: 1px solid var(--ink);');

      // Editorial citations: transparent background, neutral ink, subtle underline
      expect(indexCss).toContain(
        '.swiss-citation {\n    display: inline;\n    background-color: transparent;\n    color: var(--ink);'
      );
      expect(indexCss).toContain('text-underline-offset: 4px;');

      // Vertical calendar month cell alignment
      expect(indexCss).toContain(
        '.calendar-month-cell {\n    min-height: 112px;\n    padding: 8px;\n    border-bottom: 1px solid var(--grid);\n    border-left: 1px solid var(--grid);\n    border-right: 0;\n    display: flex;\n    flex-direction: column;\n    align-items: stretch;\n    justify-content: flex-start;\n    gap: 6px;'
      );
    });

    it('enforces strict black/white inversion tokens for active toggles across themes and styles stage pills', () => {
      const indexCss = readStylesheet('src/styles/index.css');
      const activeStudyCss = readStylesheet('src/styles/active-study.css');

      // Dark mode: white active background, black active text
      expect(indexCss).toContain('--toggle-active-bg: #FFFFFF;\n    --toggle-active-fg: #000000;');
      // Light mode: black active background, white active text
      expect(indexCss).toContain('--toggle-active-bg: #000000;\n    --toggle-active-fg: #FFFFFF;');

      expect(indexCss).toContain('.swiss-segmented-btn.is-active {\n    background-color: var(--toggle-active-bg);\n    color: var(--toggle-active-fg);');
      expect(activeStudyCss).toContain('.stage-pill.is-active {\n    background-color: var(--toggle-active-bg);\n    color: var(--toggle-active-fg);');
    });

    it('declares cascade layers before @import and direct CSS imports so reset never overrides component button colors', () => {
      const indexCss = readStylesheet('src/styles/index.css');
      const knowledgeCss = readStylesheet('src/styles/knowledge.css');
      const calendarSyncCss = readStylesheet('src/styles/calendar-sync.css');
      const mainTsx = readStylesheet('src/main.tsx');

      const layerDecl = '@layer reset, tokens, base, layout, components, utilities;';
      expect(indexCss.indexOf(layerDecl)).toBeGreaterThanOrEqual(0);
      expect(indexCss.indexOf(layerDecl)).toBeLessThan(indexCss.indexOf("@import '"));
      expect(indexCss).toContain(':where(input, button, textarea, select)');

      expect(knowledgeCss.indexOf(layerDecl)).toBeGreaterThanOrEqual(0);
      expect(knowledgeCss.indexOf(layerDecl)).toBeLessThan(
        knowledgeCss.indexOf('@layer components')
      );

      expect(calendarSyncCss.indexOf(layerDecl)).toBeGreaterThanOrEqual(0);
      expect(calendarSyncCss.indexOf(layerDecl)).toBeLessThan(
        calendarSyncCss.indexOf('@layer components')
      );

      expect(mainTsx.indexOf("import './styles/index.css';")).toBeLessThan(
        mainTsx.indexOf("import { App } from './App';")
      );
    });
  });

  describe('Calendar and Settings segmented controls visibility and active state', () => {
    it('renders Semana and Mes segmented buttons in CalendarPage and switches active state', async () => {
      render(
        <CalendarPage
          onSelectCourse={vi.fn()}
          initialDate={new Date(2026, 10, 10)}
          initialViewMode="week"
        />
      );

      const group = await screen.findByRole('group', {
        name: 'Modo de vista del calendario',
      });
      const weekBtn = screen.getByRole('button', { name: 'Semana' });
      const monthBtn = screen.getByRole('button', { name: 'Mes' });

      expect(group).toContainElement(weekBtn);
      expect(group).toContainElement(monthBtn);
      expect(weekBtn).toHaveClass('swiss-segmented-btn', 'is-active');
      expect(weekBtn).toHaveAttribute('aria-pressed', 'true');
      expect(monthBtn).toHaveClass('swiss-segmented-btn');
      expect(monthBtn).not.toHaveClass('is-active');

      fireEvent.click(monthBtn);
      await waitFor(() => {
        expect(monthBtn).toHaveClass('is-active');
        expect(monthBtn).toHaveAttribute('aria-pressed', 'true');
        expect(weekBtn).not.toHaveClass('is-active');
      });
    });

    it('renders Tema and Tamaño de texto de notas segmented controls in SettingsPage', async () => {
      const onChangeThemeMode = vi.fn();
      const onChangeNoteFontSize = vi.fn();

      render(
        <SettingsPage
          themeMode="dark"
          onChangeThemeMode={onChangeThemeMode}
          noteFontSize="normal"
          onChangeNoteFontSize={onChangeNoteFontSize}
        />
      );

      const themeGroup = await screen.findByRole('group', {
        name: 'Tema de la aplicación',
      });
      const lightBtn = screen.getByRole('button', { name: 'Claro' });
      const darkBtn = screen.getByRole('button', { name: 'Oscuro' });
      const systemBtn = screen.getByRole('button', { name: 'Sistema' });

      expect(themeGroup).toContainElement(lightBtn);
      expect(themeGroup).toContainElement(darkBtn);
      expect(themeGroup).toContainElement(systemBtn);
      expect(darkBtn).toHaveClass('swiss-segmented-btn', 'is-active');
      expect(darkBtn).toHaveAttribute('aria-pressed', 'true');

      const fontGroup = screen.getByRole('group', {
        name: 'Tamaño de texto de notas',
      });
      const smallBtn = screen.getByRole('button', { name: 'Chico' });
      const normalBtn = screen.getByRole('button', { name: 'Normal' });
      const largeBtn = screen.getByRole('button', { name: 'Grande' });

      expect(fontGroup).toContainElement(smallBtn);
      expect(fontGroup).toContainElement(normalBtn);
      expect(fontGroup).toContainElement(largeBtn);
      expect(normalBtn).toHaveClass('swiss-segmented-btn', 'is-active');
      expect(normalBtn).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(lightBtn);
      expect(onChangeThemeMode).toHaveBeenCalledWith('light');

      fireEvent.click(largeBtn);
      expect(onChangeNoteFontSize).toHaveBeenCalledWith('large');
    });
  });
});
