import { ipcMain } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import {
  deleteAttendanceRecord,
  getCourseAttendance,
  recordAttendance,
  updateCourseAttendanceConfig,
} from '../db/attendanceRepo.js';
import { getAppDatabase } from '../db/database.js';
import { assertTrustedIpcEvent, assertValidIpcId } from '../security.js';
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

  ipcMain.handle('attendance:getCourse', (event, courseId: string) => {
    assertTrustedIpcEvent(event);
    const validCourseId = assertValidIpcId(courseId, 'ID de materia');
    return getCourseAttendance(resolveDb(), validCourseId);
  });

  ipcMain.handle(
    'attendance:updateConfig',
    (event, input: UpdateCourseAttendanceConfigInput) => {
      assertTrustedIpcEvent(event);
      return updateCourseAttendanceConfig(resolveDb(), input);
    }
  );

  ipcMain.handle(
    'attendance:record',
    (event, input: RecordAttendanceInput) => {
      assertTrustedIpcEvent(event);
      return recordAttendance(resolveDb(), input);
    }
  );

  ipcMain.handle('attendance:deleteRecord', (event, recordId: string) => {
    assertTrustedIpcEvent(event);
    const validRecordId = assertValidIpcId(recordId, 'ID de registro');
    return deleteAttendanceRecord(resolveDb(), validRecordId);
  });
}
