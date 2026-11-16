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
import { createCourse } from '../../electron/db/coursesRepo';
import { updateGoogleCalendarConfig } from '../../electron/db/calendarSyncRepo';
import { createTestDatabase, type DatabaseContext } from '../../electron/db/database';
import {
  createSourceRecord,
  saveSourceChunksAndMarkReady,
} from '../../electron/db/sourcesRepo';
import { triggerAutoGoogleCalendarSync } from '../../electron/services/calendarSyncService';
import { generateStudyReportService } from '../../electron/services/reportService';
import { sendChatMessageService } from '../../electron/services/ragService';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { generateAndStoreReport } from '../lib/reportsStore';

describe('Phase 2 T2.3: AI preferences wiring, Google auto-sync trigger, and Source preview/reindex UI', () => {
  const contexts: DatabaseContext[] = [];

  function setupDb(): DatabaseContext {
    const ctx = createTestDatabase();
    contexts.push(ctx);
    return ctx;
  }

  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    for (const ctx of contexts.splice(0, contexts.length)) {
      const dir = ctx.dataDir;
      ctx.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('connects cursada-ai-report-language and cursada-ai-cite-sources from Settings to report and RAG generation', async () => {
    localStorage.setItem('cursada-ai-report-language', 'en');
    localStorage.setItem('cursada-ai-cite-sources', 'false');

    const spyGenerate = vi.spyOn(cursadaClient, 'generateStudyReport');
    const report = await generateAndStoreReport({
      courseId: 'ing-soft-1',
      reportType: 'summary',
    });

    expect(spyGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        reportLanguage: 'en',
        citeSources: false,
      })
    );
    expect(report.citations).toEqual([]);

    // Backend prompts also reflect reportLanguage='en' and citeSources=false
    const ctx = setupDb();
    const course = createCourse(ctx.db, {
      name: 'Distributed Systems',
      color: 'cyan',
      term: '2026-2C',
      schedules: [],
    });
    const source = createSourceRecord(ctx.db, {
      courseId: course.id,
      title: 'Raft Paper',
      sourceType: 'pasted_text',
      rawText: 'Raft separates leader election, log replication, and safety.',
      pageCount: 1,
    });
    saveSourceChunksAndMarkReady(
      ctx.db,
      source.id,
      [
        {
          chunkIndex: 0,
          pageNumber: 1,
          content: 'Raft separates leader election, log replication, and safety.',
          embedding: new Float32Array([0.5, 0.5, 0.5, 0.5]),
        },
      ],
      'nomic-embed-text'
    );

    const capturedPrompts: string[] = [];
    const fetchMock: typeof fetch = async (_url, init) => {
      const parsed = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      capturedPrompts.push(parsed.messages[0]?.content ?? '');
      return new Response(
        JSON.stringify({
          model: 'llama3.2',
          message: { role: 'assistant', content: 'Clean summary in English.' },
        }),
        { status: 200 }
      );
    };

    await generateStudyReportService(
      ctx.db,
      {
        courseId: course.id,
        reportType: 'summary',
        reportLanguage: 'en',
        citeSources: false,
        autoSaveAsNote: false,
      },
      { fetchFn: fetchMock }
    );
    expect(capturedPrompts[capturedPrompts.length - 1]).toContain('English');
    expect(capturedPrompts[capturedPrompts.length - 1]).toContain(
      'SIN incluir marcadores numéricos'
    );

    const ragResult = await sendChatMessageService(
      ctx.db,
      {
        courseId: course.id,
        content: 'What is Raft?',
        reportLanguage: 'en',
        citeSources: false,
      },
      {
        fetchFn: fetchMock,
        embedder: async (texts) => ({
          embeddings: texts.map(() => new Float32Array([0.5, 0.5, 0.5, 0.5])),
          modelUsed: 'nomic-embed-text',
        }),
      }
    );
    expect(ragResult.assistantMessage.citations).toEqual([]);
    expect(capturedPrompts[capturedPrompts.length - 1]).toContain(
      'academic English'
    );
  });

  it('triggers non-blocking Google Calendar auto-sync when connected and autoSyncEnabled is true', async () => {
    const ctx = setupDb();
    createCourse(ctx.db, {
      name: 'Bases de Datos II',
      color: 'emerald',
      term: '2026-2C',
      schedules: [
        { dayOfWeek: 1, startTime: '18:30', endTime: '22:30', location: 'A1' },
      ],
    });

    const fetchSpy = vi.fn<typeof fetch>();
    // Disabled by default -> does not sync
    triggerAutoGoogleCalendarSync(ctx.db, { fetchFn: fetchSpy });
    expect(fetchSpy).not.toHaveBeenCalled();

    // Enabled + connected -> runs background sync
    updateGoogleCalendarConfig(ctx.db, {
      isConnected: true,
      autoSyncEnabled: true,
      connectedEmail: 'student@uade.edu.ar',
    });
    triggerAutoGoogleCalendarSync(ctx.db, { fetchFn: fetchSpy });
    // Even in local loopback mode without Google OAuth tokens, it safely updates lastSyncedAt asynchronously
    await waitFor(async () => {
      const { getGoogleCalendarConfig } = await import(
        '../../electron/db/calendarSyncRepo'
      );
      expect(getGoogleCalendarConfig(ctx.db).lastSyncedAt).not.toBeNull();
    });
  });

  it('shows Ver preview dialog and Reindexar button for failed sources in CourseDetailView', async () => {
    const courses = await cursadaClient.listCourses({ status: 'active' });
    const targetCourse = courses[0];

    const created = await cursadaClient.createSourceFromText({
      courseId: targetCourse.id,
      title: 'Guía Fallida de Prueba',
      text: 'Contenido de ejemplo para previsualización y reindexado.',
    });

    const listSpy = vi.spyOn(cursadaClient, 'listSources').mockImplementation(
      async (courseId: string) => {
        const original = await (
          await import('../lib/api/mockSources')
        ).mockListSources(courseId);
        return original.map((s) =>
          s.id === created.id
            ? {
                ...s,
                indexingStatus: 'error',
                indexingError: 'Fallo temporal de embeddings',
              }
            : s
        );
      }
    );
    const reindexSpy = vi
      .spyOn(cursadaClient, 'reindexSource')
      .mockResolvedValue({ ...created, indexingStatus: 'ready' });

    render(
      <CourseDetailView courseId={targetCourse.id} onSelectCourse={vi.fn()} />
    );

    const previewBtn = await screen.findByRole('button', {
      name: `Ver ${created.title}`,
    });
    const reindexBtn = await screen.findByRole('button', {
      name: `Reindexar ${created.title}`,
    });

    fireEvent.click(reindexBtn);
    await waitFor(() => {
      expect(reindexSpy).toHaveBeenCalledWith(created.id);
    });

    fireEvent.click(previewBtn);
    const previewDialog = await screen.findByRole('dialog', {
      name: created.title,
    });
    expect(
      within(previewDialog).getByText(
        /Contenido de ejemplo para previsualización/i
      )
    ).toBeInTheDocument();

    fireEvent.click(
      within(previewDialog).getByRole('button', { name: 'Cerrar' })
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: created.title })
      ).not.toBeInTheDocument();
    });

    listSpy.mockRestore();
  });
});
