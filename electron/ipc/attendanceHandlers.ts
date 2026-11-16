import { ipcMain } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import {
  deleteAttendanceRecord,
  getCourseAttendance,
  recordAttendance,
  updateCourseAttendanceConfig,
} from '../db/attendanceRepo.js';
import { getAppDatabase } from '../db/database.js';
import type {
  RecordAttendanceInput,
  UpdateCourseAttendanceConfigInput,
} from '../types.js';

export interface AttendanceHandlersContext {
  db?: DatabaseSync;
}

export function registerAttendanceHandlers(
  ctx?: AttendanceHandlersContext
): void {
  const resolveDb = (): DatabaseSync => ctx?.db ?? getAppDatabase().db;

  ipcMain.handle('attendance:getCourse', (_event, courseId: string) => {
    return getCourseAttendance(resolveDb(), courseId);
  });

  ipcMain.handle(
    'attendance:updateConfig',
    (_event, input: UpdateCourseAttendanceConfigInput) => {
      return updateCourseAttendanceConfig(resolveDb(), input);
    }
  );

  ipcMain.handle(
    'attendance:record',
    (_event, input: RecordAttendanceInput) => {
      return recordAttendance(resolveDb(), input);
    }
  );

  ipcMain.handle('attendance:deleteRecord', (_event, recordId: string) => {
    return deleteAttendanceRecord(resolveDb(), recordId);
  });
}
