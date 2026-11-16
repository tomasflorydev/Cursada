import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  createTask,
  deleteTask,
  listTasks,
  toggleTaskStatus,
  updateTask,
} from '../db/tasksRepo.js';
import { assertTrustedIpcEvent, assertValidIpcId } from '../security.js';
import type { CreateTaskInput, TaskFilters, UpdateTaskInput } from '../types.js';

export function registerTasksHandlers(): void {
  ipcMain.handle('tasks:list', (event, filters?: TaskFilters) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return listTasks(ctx.db, filters);
  });

  ipcMain.handle('tasks:create', (event, input: CreateTaskInput) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return createTask(ctx.db, input);
  });

  ipcMain.handle(
    'tasks:update',
    (event, id: string, input: UpdateTaskInput) => {
      assertTrustedIpcEvent(event);
      const validId = assertValidIpcId(id, 'ID de tarea');
      const ctx = getAppDatabase();
      return updateTask(ctx.db, validId, input);
    }
  );

  ipcMain.handle('tasks:toggleStatus', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de tarea');
    const ctx = getAppDatabase();
    return toggleTaskStatus(ctx.db, validId);
  });

  ipcMain.handle('tasks:delete', (event, id: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(id, 'ID de tarea');
    const ctx = getAppDatabase();
    deleteTask(ctx.db, validId);
  });
}
