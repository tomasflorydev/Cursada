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

/**
 * Registers IPC handlers for Map-Reduce study report generation and SQLite persistence.
 * Accepts an explicit `{ db, fetchFn }` context for testing or falls back to `getAppDatabase()`.
 */
export function registerReportHandlers(
  ctx?: RegisterReportHandlersContext
): void {
  ipcMain.handle(
    'reports:generate',
    (event, input: GenerateStudyReportInput) => {
      assertTrustedIpcEvent(event);
      const db = ctx?.db ?? getAppDatabase().db;
      return generateStudyReportService(db, input, {
        fetchFn: ctx?.fetchFn,
      });
    }
  );

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
