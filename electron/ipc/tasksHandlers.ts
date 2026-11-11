import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  createTask,
  deleteTask,
  listTasks,
  toggleTaskStatus,
  updateTask,
} from '../db/tasksRepo.js';
import type { CreateTaskInput, TaskFilters, UpdateTaskInput } from '../types.js';

export function registerTasksHandlers(): void {
  ipcMain.handle('tasks:list', (_event, filters?: TaskFilters) => {
    const ctx = getAppDatabase();
    return listTasks(ctx.db, filters);
  });

  ipcMain.handle('tasks:create', (_event, input: CreateTaskInput) => {
    const ctx = getAppDatabase();
    return createTask(ctx.db, input);
  });

  ipcMain.handle(
    'tasks:update',
    (_event, id: string, input: UpdateTaskInput) => {
      const ctx = getAppDatabase();
      return updateTask(ctx.db, id, input);
    }
  );

  ipcMain.handle('tasks:toggleStatus', (_event, id: string) => {
    const ctx = getAppDatabase();
    return toggleTaskStatus(ctx.db, id);
  });

  ipcMain.handle('tasks:delete', (_event, id: string) => {
    const ctx = getAppDatabase();
    deleteTask(ctx.db, id);
  });
}
