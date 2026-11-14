import fs from 'node:fs';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { updateAiSettings } from '../../electron/db/aiSettingsRepo';
import { createCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import {
  createOllamaSourceEmbedder,
  createSourceFromTextService,
  searchSourceChunksService,
} from '../../electron/services/sourcesService';
import { resetAllMocks } from '../lib/api/mockClient';

describe('Phase 5 Integration: CourseDetailView Fuentes, DeleteCourseImpact, and Ollama Embedder Pipeline', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('mounts SourcesWorkspace inside CourseDetailView Fuentes tab, indexes pasted text, and reports sourcesCount on DeleteCourseDialog', async () => {
    render(<App />);

    // Navigate to "Ingeniería de Software I" via sidebar
    const coursesNav = screen.getByRole('navigation', {
      name: 'Materias en curso',
    });
    const courseBtn = await within(coursesNav).findByRole('button', {
      name: /Ingeniería de Software I/i,
    });
    fireEvent.click(courseBtn);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    // Switch to "Fuentes" tab
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Fuentes' }));

    const sourcesPanel = screen.getByTestId('course-sources-tab-panel');
    expect(sourcesPanel).toBeInTheDocument();

    // Verify seeded sources appear
    expect(
      await within(sourcesPanel).findByText(
        'Apuntes Unidad 2 — Ingeniería de Requerimientos'
      )
    ).toBeInTheDocument();

    // Add a new source via "Pegar texto directo"
    fireEvent.click(
      within(sourcesPanel).getByRole('button', { name: /Pegar texto directo/i })
    );

    fireEvent.change(screen.getByLabelText(/^Título$/i), {
      target: { value: 'Resumen Integración Continua' },
    });
    fireEvent.change(screen.getByLabelText(/^Contenido$/i), {
      target: {
        value:
          'Cada pull request ejecuta pruebas automatizadas, typecheck y build reproducible.',
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Guardar e indexar/i })
    );

    const addedTitle = await within(sourcesPanel).findByText(
      'Resumen Integración Continua'
    );
    const addedCard = addedTitle.closest('li') as HTMLElement;
    expect(within(addedCard).getByText('Indexado')).toBeInTheDocument();

    // Verify DeleteCourseDialog reports 3 associated sources (2 seeded + 1 created)
    fireEvent.click(
      screen.getByRole('button', { name: 'Eliminar materia' })
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Eliminar materia' })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('3 fuentes asociadas')).toBeInTheDocument();
    });
  });

  it('connects sourcesService with aiSettingsRepo and ollamaClient via createOllamaSourceEmbedder on SQLite', async () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    try {
      const course = createCourse(ctx.db, {
        name: 'Arquitectura de Software',
        color: 'cyan',
        professor: 'Sofía Pereyra',
        term: '2026 - 2° Cuatrimestre',
        schedules: [],
      });

      updateAiSettings(ctx.db, {
        baseUrl: 'http://127.0.0.1:11434',
        embeddingModel: 'mxbai-embed-large',
      });

      const embedCalls: Array<{ url: string; model: string; input: string[] }> = [];
      const mockFetch: typeof fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as {
          model: string;
          input: string[];
        };
        embedCalls.push({ url, model: parsedBody.model, input: parsedBody.input });

        const embeddings = parsedBody.input.map((text) =>
          text.toLowerCase().includes('microservicios')
            ? [0.98, 0.02, 0, 0]
            : [0.1, 0.9, 0, 0]
        );
        return new Response(JSON.stringify({ embeddings }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const ollamaEmbedder = createOllamaSourceEmbedder(ctx.db, {
        fetchImpl: mockFetch,
        allowLocalFallback: false,
      });

      const indexedSource = await createSourceFromTextService(
        ctx.db,
        {
          courseId: course.id,
          title: 'Patrones Distribuidos',
          text: 'La arquitectura basada en microservicios aísla dominios y escalamiento independiente.',
          sourceType: 'markdown',
        },
        { embedder: ollamaEmbedder }
      );

      expect(indexedSource.indexingStatus).toBe('ready');
      expect(indexedSource.embeddingModel).toBe('mxbai-embed-large');
      expect(embedCalls[0]).toEqual({
        url: 'http://127.0.0.1:11434/api/embed',
        model: 'mxbai-embed-large',
        input: [
          'La arquitectura basada en microservicios aísla dominios y escalamiento independiente.',
        ],
      });

      const hits = await searchSourceChunksService(
        ctx.db,
        {
          courseId: course.id,
          query: 'microservicios dominios',
          limit: 5,
        },
        { embedder: ollamaEmbedder }
      );

      expect(hits).toHaveLength(1);
      expect(hits[0].sourceTitle).toBe('Patrones Distribuidos');
      expect(hits[0].vectorScore).toBeGreaterThan(0.9);
      expect(hits[0].ftsScore).toBeGreaterThan(0);
      expect(embedCalls).toHaveLength(2);
    } finally {
      ctx.close();
    }
  });
});
