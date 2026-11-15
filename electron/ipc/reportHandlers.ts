import { ipcMain } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import { getAppDatabase } from '../db/database.js';
import { generateStudyReportService } from '../services/reportService.js';
import type { GenerateStudyReportInput } from '../types.js';

export interface RegisterReportHandlersContext {
  db?: DatabaseSync;
  fetchFn?: typeof fetch;
}

/**
 * Registers IPC handlers for Map-Reduce study report generation.
 * Accepts an explicit `{ db, fetchFn }` context for testing or falls back to `getAppDatabase()`.
 */
export function registerReportHandlers(
  ctx?: RegisterReportHandlersContext
): void {
  ipcMain.handle(
    'reports:generate',
    (_event, input: GenerateStudyReportInput) => {
      const db = ctx?.db ?? getAppDatabase().db;
      return generateStudyReportService(db, input, {
        fetchFn: ctx?.fetchFn,
      });
    }
  );
}
