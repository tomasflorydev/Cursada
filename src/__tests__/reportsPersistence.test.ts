import fs from 'node:fs';
import { createElement } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
    removeHandler: vi.fn(),
  },
}));

import { createCourse, deleteCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase, type DatabaseContext } from '../../electron/db/database';
import { createNote, deleteNote } from '../../electron/db/notesRepo';
import {
  deleteStudyReport,
  getStudyReportById,
  listStudyReports,
  saveStudyReport,
} from '../../electron/db/reportsRepo';
import { registerReportHandlers } from '../../electron/ipc/reportHandlers';
import { createBackup, restoreBackup } from '../../electron/services/backupService';
import { resetAllMocks } from '../lib/api/mockClient';
import { resetStoredReports } from '../lib/reportsStore';
import { ReportsPage } from '../pages/ReportsPage';

describe('Phase 2 T2.1: study_reports SQLite V9 persistence, backup/restore, and ReportsPage deletion', () => {
  const contexts: DatabaseContext[] = [];

  function setupDb(): DatabaseContext {
    const ctx = createTestDatabase();
    contexts.push(ctx);
    return ctx;
  }

  beforeEach(() => {
    handleMock.mockReset();
    localStorage.clear();
    resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    delete (window as { cursadaApi?: unknown }).cursadaApi;
    localStorage.clear();
    resetStoredReports();
    for (const ctx of contexts.splice(0, contexts.length)) {
      const dir = ctx.dataDir;
      ctx.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists, updates, cascades, and restores study_reports in SQLite backups', () => {
    const ctx = setupDb();
    const db: DatabaseSync = ctx.db;

    const course = createCourse(db, {
      name: 'Sistemas Operativos',
      color: 'blue',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });
    const note = createNote(db, {
      courseId: course.id,
      title: 'Planificación CPU',
      content: 'Round Robin y SJF.',
    });

    const saved = saveStudyReport(db, {
      courseId: course.id,
      courseName: course.name,
      title: 'Resumen Parcial SO',
      reportType: 'summary',
      summaryLine: 'Generado desde 1 nota.',
      content: '## Planificación\nRound Robin evita inanición [1].',
      notesCount: 1,
      pdfsCount: 0,
      usedLocalModel: true,
      modelLabel: 'modelo local',
      noteId: note.id,
      citations: [
        {
          index: 1,
          kind: 'note',
          id: note.id,
          title: note.title,
          snippet: 'Round Robin y SJF.',
        },
      ],
      sourceIds: [],
      noteIds: [note.id],
      examStage: 'parcial_1',
      includeNotes: true,
    });

    expect(listStudyReports(db)).toHaveLength(1);
    expect(getStudyReportById(db, saved.id)?.title).toBe('Resumen Parcial SO');
    expect(getStudyReportById(db, saved.id)?.noteId).toBe(note.id);

    const backup = createBackup(db, ctx.dataDir, 'with-reports');

    // Deleting linked note sets note_id = NULL without deleting the study_report
    deleteNote(db, note.id);
    expect(getStudyReportById(db, saved.id)?.noteId).toBeNull();

    // Deleting study_report removes it cleanly
    deleteStudyReport(db, saved.id);
    expect(listStudyReports(db)).toHaveLength(0);

    // Restoring SQLite backup recovers study_reports along with note/course
    restoreBackup(db, ctx.dataDir, backup.filename);
    const restoredReports = listStudyReports(db);
    expect(restoredReports).toHaveLength(1);
    expect(restoredReports[0].id).toBe(saved.id);
    expect(restoredReports[0].noteId).toBe(note.id);

    // Deleting course cascades study_reports
    deleteCourse(db, course.id, ctx.dataDir);
    expect(listStudyReports(db)).toHaveLength(0);
  });

  it('registers reports:list, reports:getById, reports:save, and reports:delete IPC handlers', () => {
    const ctx = setupDb();
    registerReportHandlers({ db: ctx.db });

    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    for (const [channel, fn] of handleMock.mock.calls as Array<
      [string, (...args: unknown[]) => unknown]
    >) {
      handlers.set(channel, fn);
    }

    const course = createCourse(ctx.db, {
      name: 'Redes',
      color: 'cyan',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });

    const saveHandler = handlers.get('reports:save')!;
    const listHandler = handlers.get('reports:list')!;
    const getHandler = handlers.get('reports:getById')!;
    const deleteHandler = handlers.get('reports:delete')!;

    const created = saveHandler({}, {
      courseId: course.id,
      title: 'Guía TCP/UDP',
      reportType: 'study_guide',
      content: 'Handshake de tres vías.',
    }) as { id: string; title: string };

    expect((listHandler({}, course.id) as Array<{ id: string }>).length).toBe(1);
    expect((getHandler({}, created.id) as { title: string }).title).toBe(
      'Guía TCP/UDP'
    );

    deleteHandler({}, created.id);
    expect(getHandler({}, created.id)).toBeNull();
  });

  it('starts empty when SQLite backend returns no reports (never injects INITIAL_REPORTS or reads localStorage) and deletes reports from ReportsPage', async () => {
    // 1. Seed fake localStorage entry to prove production mode ignores localStorage completely
    localStorage.setItem(
      'cursada-reports-v2',
      JSON.stringify([{ id: 'stale-local', title: 'Stale LocalStorage Report' }])
    );

    const mockBridgeReports: Array<Record<string, unknown>> = [];
    (window as { cursadaApi?: Record<string, unknown> }).cursadaApi = {
      platform: 'darwin',
      listCourses: async () => [],
      listStudyReports: async () => [...mockBridgeReports],
      deleteStudyReport: async (id: string) => {
        const idx = mockBridgeReports.findIndex((r) => r.id === id);
        if (idx >= 0) mockBridgeReports.splice(idx, 1);
      },
    };

    render(createElement(ReportsPage));

    expect(
      await screen.findByText(/Todavía no hay informes/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Stale LocalStorage Report/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Resumen para el parcial de Base de Datos/i)
    ).not.toBeInTheDocument();
    cleanup();
    delete (window as { cursadaApi?: unknown }).cursadaApi;
    localStorage.clear();
    resetAllMocks();

    // 2. With mockClient (preview/web), ReportsPage loads mock reports without touching localStorage and allows deleting them
    render(createElement(ReportsPage));
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Resumen para el parcial de Base de Datos',
      })
    ).toBeInTheDocument();

    const listAside = screen.getByRole('complementary', {
      name: 'Listado de informes',
    });
    expect(within(listAside).getByText('Informes · 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar informe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));

    await waitFor(() => {
      expect(within(listAside).getByText('Informes · 1')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Resumen para el parcial de Base de Datos')
    ).not.toBeInTheDocument();
    expect(localStorage.getItem('cursada-reports-v2')).toBeNull();
  });
});
