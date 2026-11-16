import { ipcMain } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { getAppDatabase } from '../db/database.js';
import {
  deleteStudyReport,
  getStudyReportById,
  listStudyReports,
  saveStudyReport,
} from '../db/reportsRepo.js';
import { assertTrustedIpcEvent, assertValidIpcId } from '../security.js';
import { generateStudyReportService } from '../services/reportService.js';
import type {
  GenerateStudyReportInput,
  SaveStudyReportInput,
} from '../types.js';

export interface RegisterReportHandlersContext {
  db?: DatabaseSync;
  fetchFn?: typeof fetch;
}

const activeReportControllers = new Map<string, AbortController>();

function sendReportStreamEvent(
  event: unknown,
  payload: {
    requestId: string;
    kind: 'report';
    delta?: string;
    accumulated?: string;
    stepLabel?: string;
  }
): void {
  const sender = (event as { sender?: { send?: (ch: string, p: unknown) => void } } | null)
    ?.sender;
  if (sender && typeof sender.send === 'function') {
    sender.send('ai:streamProgress', payload);
  }
}

/**
 * Registers IPC handlers for Map-Reduce study report generation and SQLite persistence.
 * Accepts an explicit `{ db, fetchFn }` context for testing or falls back to `getAppDatabase()`.
 */
export function registerReportHandlers(
  ctx?: RegisterReportHandlersContext
): void {
  ipcMain.handle(
    'reports:generate',
    async (event, input: GenerateStudyReportInput) => {
      assertTrustedIpcEvent(event);
      const db = ctx?.db ?? getAppDatabase().db;
      const requestId =
        typeof input?.requestId === 'string' ? input.requestId.trim() : '';
      const controller = requestId ? new AbortController() : undefined;
      if (requestId && controller) {
        activeReportControllers.set(requestId, controller);
      }

      try {
        return await generateStudyReportService(db, input, {
          fetchFn: ctx?.fetchFn,
          signal: controller?.signal,
          stream: Boolean(requestId),
          onStep: requestId
            ? (step) => {
                sendReportStreamEvent(event, {
                  requestId,
                  kind: 'report',
                  stepLabel: step.label,
                });
              }
            : undefined,
          onToken: requestId
            ? (delta, accumulated) => {
                sendReportStreamEvent(event, {
                  requestId,
                  kind: 'report',
                  delta,
                  accumulated,
                });
              }
            : undefined,
        });
      } finally {
        if (requestId) {
          activeReportControllers.delete(requestId);
        }
      }
    }
  );

  ipcMain.handle('reports:cancel', (event, requestId: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(requestId, 'ID de solicitud de informe');
    const controller = activeReportControllers.get(validId);
    if (controller) {
      controller.abort();
      activeReportControllers.delete(validId);
    }
  });

  ipcMain.handle('reports:list', (event, courseId?: string) => {
    assertTrustedIpcEvent(event);
    const db = ctx?.db ?? getAppDatabase().db;
    const validCourseId =
      typeof courseId === 'string' && courseId.trim()
        ? courseId.trim()
        : undefined;
    return listStudyReports(db, validCourseId);
  });

  ipcMain.handle('reports:getById', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de informe');
    const db = ctx?.db ?? getAppDatabase().db;
    return getStudyReportById(db, validId);
  });

  ipcMain.handle('reports:save', (event, input: SaveStudyReportInput) => {
    assertTrustedIpcEvent(event);
    const db = ctx?.db ?? getAppDatabase().db;
    return saveStudyReport(db, input);
  });

  ipcMain.handle('reports:delete', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de informe');
    const db = ctx?.db ?? getAppDatabase().db;
    deleteStudyReport(db, validId);
  });
}
