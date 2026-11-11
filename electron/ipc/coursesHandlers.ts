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
import { createBackup } from '../services/backupService.js';
import type { CourseStatus, CreateCourseInput, UpdateCourseInput } from '../types.js';

export function registerCoursesHandlers(): void {
  ipcMain.handle(
    'courses:list',
    (_event, opts?: { status?: CourseStatus | 'all' }) => {
      const ctx = getAppDatabase();
      return listCourses(ctx.db, opts);
    }
  );

  ipcMain.handle('courses:getById', (_event, id: string) => {
    const ctx = getAppDatabase();
    return getCourseById(ctx.db, id);
  });

  ipcMain.handle('courses:create', (_event, input: CreateCourseInput) => {
    const ctx = getAppDatabase();
    return createCourse(ctx.db, input);
  });

  ipcMain.handle(
    'courses:update',
    (_event, id: string, input: UpdateCourseInput) => {
      const ctx = getAppDatabase();
      return updateCourse(ctx.db, id, input);
    }
  );

  ipcMain.handle('courses:getDeleteImpact', (_event, id: string) => {
    const ctx = getAppDatabase();
    return getCourseDeleteImpact(ctx.db, id);
  });

  ipcMain.handle('courses:delete', (_event, id: string) => {
    const ctx = getAppDatabase();
    // Automatic safety backup prior to deleting a course and its cascaded tasks/schedules
    if (!ctx.isInMemory) {
      createBackup(ctx.db, ctx.dataDir, 'pre-course-delete');
    }
    deleteCourse(ctx.db, id);
  });
}
