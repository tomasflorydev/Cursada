import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  createExam,
  deleteExam,
  listExams,
  updateExam,
} from '../db/examsRepo.js';
import { assertTrustedIpcEvent, assertValidIpcId } from '../security.js';
import type { CreateExamInput, ExamFilters, UpdateExamInput } from '../types.js';

export function registerExamsHandlers(): void {
  ipcMain.handle('exams:list', (event, filters?: ExamFilters) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return listExams(ctx.db, filters);
  });

  ipcMain.handle('exams:create', (event, input: CreateExamInput) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return createExam(ctx.db, input);
  });

  ipcMain.handle(
    'exams:update',
    (event, id: string, input: UpdateExamInput) => {
      assertTrustedIpcEvent(event);
      const validId = assertValidIpcId(id, 'ID de examen');
      const ctx = getAppDatabase();
      return updateExam(ctx.db, validId, input);
    }
  );

  ipcMain.handle('exams:delete', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de examen');
    const ctx = getAppDatabase();
    deleteExam(ctx.db, validId);
  });
}
