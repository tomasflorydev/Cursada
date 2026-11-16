import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  createCourse,
  deleteCourse,
  getCourseById,
  getCourseDeleteImpact,
  listCourses,
  updateCourse,
} from '../db/coursesRepo.js';
import { assertTrustedIpcEvent, assertValidIpcId } from '../security.js';
import { createBackup } from '../services/backupService.js';
import { triggerAutoGoogleCalendarSync } from '../services/calendarSyncService.js';
import type { CourseStatus, CreateCourseInput, UpdateCourseInput } from '../types.js';

export function registerCoursesHandlers(): void {
  ipcMain.handle(
    'courses:list',
    (event, opts?: { status?: CourseStatus | 'all' }) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return listCourses(ctx.db, opts);
    }
  );

  ipcMain.handle('courses:getById', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de materia');
    const ctx = getAppDatabase();
    return getCourseById(ctx.db, validId);
  });

  ipcMain.handle('courses:create', (event, input: CreateCourseInput) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    const created = createCourse(ctx.db, input);
    triggerAutoGoogleCalendarSync(ctx.db);
    return created;
  });

  ipcMain.handle(
    'courses:update',
    (event, id: string, input: UpdateCourseInput) => {
      assertTrustedIpcEvent(event);
      const validId = assertValidIpcId(id, 'ID de materia');
      const ctx = getAppDatabase();
      const updated = updateCourse(ctx.db, validId, input);
      triggerAutoGoogleCalendarSync(ctx.db);
      return updated;
    }
  );

  ipcMain.handle('courses:getDeleteImpact', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de materia');
    const ctx = getAppDatabase();
    return getCourseDeleteImpact(ctx.db, validId);
  });

  ipcMain.handle('courses:delete', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de materia');
    const ctx = getAppDatabase();
    // Automatic safety backup prior to deleting a course and its cascaded tasks/schedules
    if (!ctx.isInMemory) {
      createBackup(ctx.db, ctx.dataDir, 'pre-course-delete');
    }
    deleteCourse(ctx.db, validId, ctx.dataDir);
    triggerAutoGoogleCalendarSync(ctx.db);
  });
}
