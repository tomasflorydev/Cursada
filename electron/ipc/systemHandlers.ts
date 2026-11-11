import { ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import { createBackup, listBackups } from '../services/backupService.js';

export function registerSystemHandlers(): void {
  ipcMain.handle('system:createBackup', () => {
    const ctx = getAppDatabase();
    return createBackup(ctx.db, ctx.dataDir, 'manual');
  });

  ipcMain.handle('system:listBackups', () => {
    const ctx = getAppDatabase();
    return listBackups(ctx.dataDir);
  });

  ipcMain.handle('system:getDataDir', () => {
    const ctx = getAppDatabase();
    return ctx.dataDir;
  });
}
