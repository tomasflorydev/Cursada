import fs from 'node:fs';
import path from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { addDays, toIsoDateString } from '../lib/dates';

describe('Phase 10 (v2.0.0): Swiss Typographic System & 8-View Overhaul', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-note-size');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('navigates across all 8 views (Inicio, Materias, 3-pane Materia detail, Calendario, Tareas, Exámenes, Informes, Ajustes) with real mockClient data', async () => {
    const { container } = render(<App />);

    // 1. Inicio
    const banner = screen.getByRole('banner');
    const primaryNav = within(banner).getByRole('navigation', {
      name: 'Navegación principal',
    });
    expect(within(banner).getByRole('button', { name: 'Cursada' })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Inicio' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector('.home-day-number')?.textContent?.trim().length).toBeGreaterThan(0);
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: /Tareas · 4/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Esta semana' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Exámenes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Informes' })
    ).toBeInTheDocument();

    // 2. Materias
    fireEvent.click(within(primaryNav).getByRole('button', { name: 'Materias' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Materias' })
    ).toBeInTheDocument();
    const is1Btn = await screen.findByRole('button', {
      name: 'Ingeniería de Software I',
    });
    expect(
      screen.getByRole('button', { name: 'Base de Datos II' })
    ).toBeInTheDocument();

    // 3. Detalle Materia (3 panes) + header swap to "← Inicio"
    fireEvent.click(is1Btn);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    const detailBanner = screen.getByRole('banner');
    expect(
      within(detailBanner).getByRole('button', { name: '← Inicio' })
    ).toBeInTheDocument();
    expect(
      within(detailBanner).queryByRole('navigation', {
        name: 'Navegación principal',
      })
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('complementary', { name: 'Notas de la materia' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Título de la nota')).toBeInTheDocument();
    expect(screen.getByLabelText('Contenido de la nota')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Asistente e informes con IA' })
    ).toBeInTheDocument();

    // Return to Inicio via detail header back link
    fireEvent.click(
      within(detailBanner).getByRole('button', { name: '← Inicio' })
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Inicio' })
    ).toBeInTheDocument();

    // 4. Calendario
    const restoredNav = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });
    fireEvent.click(
      within(restoredNav).getByRole('button', { name: 'Calendario' })
    );
    expect(
      await screen.findByTestId('calendar-period-label')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Grilla semanal de cursada' })
    ).toBeInTheDocument();
    const viewGroup = screen.getByRole('group', {
      name: 'Modo de vista del calendario',
    });
    fireEvent.click(within(viewGroup).getByRole('button', { name: 'Mes' }));
    expect(
      await screen.findByRole('region', { name: 'Calendario mensual de cursada' })
    ).toBeInTheDocument();

    // 5. Tareas
    fireEvent.click(within(restoredNav).getByRole('button', { name: 'Tareas' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tareas' })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Entregar script de índices compuestos y análisis de plan de ejecución'
      )
    ).toBeInTheDocument();

    // 6. Exámenes
    fireEvent.click(
      within(restoredNav).getByRole('button', { name: 'Exámenes' })
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Exámenes' })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Ver anteriores/i })
    );
    expect(
      await screen.findByRole('region', { name: 'Exámenes anteriores' })
    ).toBeInTheDocument();

    // 7. Informes
    fireEvent.click(
      within(restoredNav).getByRole('button', { name: 'Informes' })
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Informes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Listado de informes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Contenido del informe' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Fuentes citadas' })
    ).toBeInTheDocument();

    // 8. Ajustes
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Ajustes' })
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ajustes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Apariencia' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Atajos de teclado' })
    ).toBeInTheDocument();
  });

  it('defaults to dark theme (data-theme="dark") and updates theme (Claro/Oscuro/Sistema) and note font size (Chico/Normal/Grande) immediately from Ajustes', async () => {
    render(<App />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-note-size')).toBe(
      'normal'
    );

    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Ajustes' })
    );

    const themeGroup = await screen.findByRole('group', {
      name: 'Tema de la aplicación',
    });
    const darkBtn = within(themeGroup).getByRole('button', { name: 'Oscuro' });
    const lightBtn = within(themeGroup).getByRole('button', { name: 'Claro' });
    const systemBtn = within(themeGroup).getByRole('button', {
      name: 'Sistema',
    });

    expect(darkBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(lightBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('color-scheme')).toBe('light');
    expect(lightBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(systemBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
    expect(localStorage.getItem('color-scheme')).toBe('system');
    expect(systemBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(darkBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('color-scheme')).toBe('dark');
    expect(darkBtn).toHaveAttribute('aria-pressed', 'true');

    const sizeGroup = screen.getByRole('group', {
      name: 'Tamaño de texto de notas',
    });
    const smallBtn = within(sizeGroup).getByRole('button', { name: 'Chico' });
    const normalBtn = within(sizeGroup).getByRole('button', { name: 'Normal' });
    const largeBtn = within(sizeGroup).getByRole('button', { name: 'Grande' });

    expect(normalBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(smallBtn);
    expect(document.documentElement.getAttribute('data-note-size')).toBe(
      'small'
    );
    expect(localStorage.getItem('cursada-note-size')).toBe('small');

    fireEvent.click(largeBtn);
    expect(document.documentElement.getAttribute('data-note-size')).toBe(
      'large'
    );
    expect(localStorage.getItem('cursada-note-size')).toBe('large');

    fireEvent.click(normalBtn);
    expect(document.documentElement.getAttribute('data-note-size')).toBe(
      'normal'
    );
  });

  it('supports Phase 10 keyboard shortcuts Cmd+1..Cmd+6, Cmd+, and contextual Cmd+N', async () => {
    render(<App />);

    // Cmd+2 -> Materias & Cmd+N -> Nueva materia dialog
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Materias' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    const courseDialog = await screen.findByRole('dialog', {
      name: /Nueva materia/i,
    });
    fireEvent.click(
      within(courseDialog).getByRole('button', { name: 'Cancelar' })
    );

    // Cmd+3 -> Calendario
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    expect(
      await screen.findByTestId('calendar-period-label')
    ).toBeInTheDocument();

    // Cmd+4 -> Tareas & Cmd+N -> focuses quick-add input
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tareas' })
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nueva tarea')).toHaveFocus();
    });

    // Cmd+5 -> Exámenes & Cmd+N -> Nuevo examen form
    fireEvent.keyDown(window, { key: '5', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Exámenes' })
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByRole('region', { name: 'Nuevo examen' })
    ).toBeInTheDocument();

    // Cmd+6 -> Informes & Cmd+N -> inline report form
    fireEvent.keyDown(window, { key: '6', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Informes' })
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByLabelText('Tipo de informe')
    ).toBeInTheDocument();

    // Cmd+, -> Ajustes
    fireEvent.keyDown(window, { key: ',', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ajustes' })
    ).toBeInTheDocument();

    // Cmd+1 -> Inicio & Cmd+N -> navigates to first course and creates Nueva nota
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Inicio' })
    ).toBeInTheDocument();
    const footer = screen.getByRole('contentinfo', {
      name: 'Materias activas',
    });
    await within(footer).findByRole('button', {
      name: /Ingeniería de Software I/i,
    });

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();
    const notesPane = screen.getByRole('complementary', {
      name: 'Notas de la materia',
    });
    expect(await within(notesPane).findByText('Nueva nota')).toBeInTheDocument();

    // Pressing Cmd+N while inside Materia creates and selects a new note in the editor
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nota')).toHaveValue(
        'Nueva nota'
      );
    });
  });

  it('generates report from Materia (Resumen de parcial) and from Exámenes (Generar guía de estudio), reads in Informes, and navigates on citation [1]', async () => {
    render(<App />);

    // Flow A: Generate Resumen de parcial from Materia -> open Informes -> click citation [1]
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ingeniería de Software I' })
    );

    const aiPane = await screen.findByRole('complementary', {
      name: 'Asistente e informes con IA',
    });
    await within(aiPane).findByRole('checkbox', {
      name: 'Incluir Resumen Patrones y Calidad.md',
    });

    fireEvent.click(
      within(aiPane).getByRole('button', { name: 'Resumen de parcial' })
    );

    expect(
      await within(aiPane).findByRole('heading', {
        level: 3,
        name: 'Resumen — Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    fireEvent.click(
      within(aiPane).getByRole('button', { name: 'Abrir informe →' })
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Informes' })
    ).toBeInTheDocument();
    const reportArticle = screen.getByRole('article', {
      name: 'Contenido del informe',
    });
    expect(
      within(reportArticle).getByRole('heading', {
        level: 2,
        name: 'Resumen — Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    // Click citation [1] inside report article -> navigates to the cited note in Ingeniería de Software I
    const articleCitations = within(reportArticle).getAllByRole('button', {
      name: 'Fuente [1]',
    });
    fireEvent.click(articleCitations[0]);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nota')).toHaveValue(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      );
    });

    // Flow B: Generate study guide from Exámenes -> Informes -> click citation [1]
    fireEvent.keyDown(window, { key: '5', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Exámenes' })
    ).toBeInTheDocument();

    let guideButtons = screen.queryAllByRole('button', {
      name: 'Generar guía de estudio',
    });
    if (guideButtons.length === 0) {
      await cursadaClient.createExam({
        courseId: 'diseno-sistemas',
        title: 'Evaluación Integradora Swiss',
        category: 'parcial',
        examDate: toIsoDateString(addDays(new Date(), 4)),
        topics: 'Strategy y State',
      });
      guideButtons = await screen.findAllByRole('button', {
        name: 'Generar guía de estudio',
      });
    }

    fireEvent.click(guideButtons[0]);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Informes' })
    ).toBeInTheDocument();
    const guideArticle = screen.getByRole('article', {
      name: 'Contenido del informe',
    });
    expect(
      await within(guideArticle).findByRole('heading', {
        level: 2,
        name: /Guía de estudio:/i,
      })
    ).toBeInTheDocument();

    const guideCitations = within(guideArticle).getAllByRole('button', {
      name: 'Fuente [1]',
    });
    fireEvent.click(guideCitations[0]);

    expect(
      await screen.findByRole('heading', { level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Título de la nota')).toBeInTheDocument();
  });

  it('enforces Swiss zero-ornament CSS rules (border-radius: 0, box-shadow: none, no gradients) and local @fontsource/archivo packaging', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const stylesDir = path.join(rootDir, 'src/styles');
    const cssFiles = fs
      .readdirSync(stylesDir)
      .filter((name) => name.endsWith('.css'));

    expect(cssFiles).toContain('index.css');
    expect(cssFiles.length).toBeGreaterThanOrEqual(7);

    const indexCssRaw = fs.readFileSync(
      path.join(stylesDir, 'index.css'),
      'utf8'
    );
    expect(indexCssRaw).toContain(":root[data-theme='dark']");
    expect(indexCssRaw).toContain('--bg: #1E2023');
    expect(indexCssRaw).toContain('--acc: #FF5F52');
    expect(indexCssRaw).toContain(":root[data-theme='light']");
    expect(indexCssRaw).toContain('--bg: #F4F4F2');
    expect(indexCssRaw).toContain('--acc: #C8201A');
    expect(indexCssRaw).toMatch(/--radius-sm:\s*0px/);
    expect(indexCssRaw).toMatch(/--radius-md:\s*0px/);
    expect(indexCssRaw).toMatch(/--radius-lg:\s*0px/);

    for (const file of cssFiles) {
      const raw = fs.readFileSync(path.join(stylesDir, file), 'utf8');
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '');

      // No gradients anywhere
      expect(stripped).not.toMatch(
        /(?:linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\s*\(/i
      );

      // Every border-radius declaration must be 0 or 0px (or var(--radius-*), which are 0px)
      const radiusMatches = stripped.matchAll(
        /border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;\}]+)/gi
      );
      for (const match of radiusMatches) {
        const value = match[1].trim();
        expect(value, `${file}: invalid border-radius "${value}"`).toMatch(
          /^(?:0(?:px)?|var\(--radius-(?:sm|md|lg)\))$/i
        );
      }

      // Every box-shadow declaration must be none
      const shadowMatches = stripped.matchAll(/box-shadow\s*:\s*([^;\}]+)/gi);
      for (const match of shadowMatches) {
        const value = match[1].trim();
        expect(value, `${file}: invalid box-shadow "${value}"`).toBe('none');
      }
    }

    // Check @fontsource/archivo in package.json and src/main.tsx + dark theme default in index.html
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
    ) as {
      version: string;
      dependencies?: Record<string, string>;
    };
    expect(pkgJson.version).toBe('2.4.0');
    expect(pkgJson.dependencies?.['@fontsource/archivo']).toBeDefined();

    const mainTsx = fs.readFileSync(path.join(rootDir, 'src/main.tsx'), 'utf8');
    expect(mainTsx).toContain("@fontsource/archivo/400.css");
    expect(mainTsx).toContain("@fontsource/archivo/500.css");
    expect(mainTsx).toContain("@fontsource/archivo/600.css");
    expect(mainTsx).toContain("@fontsource/archivo/800.css");

    const indexHtml = fs.readFileSync(
      path.join(rootDir, 'index.html'),
      'utf8'
    );
    expect(indexHtml).toContain('data-theme="dark"');
  });
});
