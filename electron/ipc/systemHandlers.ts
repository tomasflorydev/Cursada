import { ipcMain, shell } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  createBackup,
  listBackups,
  restoreBackup,
} from '../services/backupService.js';

export function registerSystemHandlers(): void {
  ipcMain.handle('system:createBackup', () => {
    const ctx = getAppDatabase();
    return createBackup(ctx.db, ctx.dataDir, 'manual');
  });

  ipcMain.handle('system:listBackups', () => {
    const ctx = getAppDatabase();
    return listBackups(ctx.dataDir);
  });

  ipcMain.handle('system:restoreBackup', (_event, filename: string) => {
    const ctx = getAppDatabase();
    return restoreBackup(ctx.db, ctx.dataDir, filename);
  });

  ipcMain.handle('system:getDataDir', () => {
    const ctx = getAppDatabase();
    return ctx.dataDir;
  });

  ipcMain.handle('system:openDataDir', async () => {
    const ctx = getAppDatabase();
    const err = await shell.openPath(ctx.dataDir);
    return {
      dataDir: ctx.dataDir,
      opened: err === '',
    };
  });
}
