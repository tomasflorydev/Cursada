import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  createExam,
  deleteExam,
  listExams,
  updateExam,
} from '../db/examsRepo.js';
import type { CreateExamInput, ExamFilters, UpdateExamInput } from '../types.js';

export function registerExamsHandlers(): void {
  ipcMain.handle('exams:list', (_event, filters?: ExamFilters) => {
    const ctx = getAppDatabase();
    return listExams(ctx.db, filters);
  });

  ipcMain.handle('exams:create', (_event, input: CreateExamInput) => {
    const ctx = getAppDatabase();
    return createExam(ctx.db, input);
  });

  ipcMain.handle(
    'exams:update',
    (_event, id: string, input: UpdateExamInput) => {
      const ctx = getAppDatabase();
      return updateExam(ctx.db, id, input);
    }
  );

  ipcMain.handle('exams:delete', (_event, id: string) => {
    const ctx = getAppDatabase();
    deleteExam(ctx.db, id);
  });
}
