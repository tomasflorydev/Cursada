import { ipcMain, shell } from 'electron';
import { getAppDatabase } from '../db/database.js';
import { assertTrustedIpcEvent } from '../security.js';
import {
  createBackup,
  listBackups,
  restoreBackup,
} from '../services/backupService.js';

export function registerSystemHandlers(): void {
  ipcMain.handle('system:createBackup', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return createBackup(ctx.db, ctx.dataDir, 'manual');
  });

  ipcMain.handle('system:listBackups', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return listBackups(ctx.dataDir);
  });

  ipcMain.handle('system:restoreBackup', (event, filename: string) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return restoreBackup(ctx.db, ctx.dataDir, filename);
  });

  ipcMain.handle('system:getDataDir', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return ctx.dataDir;
  });

  ipcMain.handle('system:openDataDir', async (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    const err = await shell.openPath(ctx.dataDir);
    return {
      dataDir: ctx.dataDir,
      opened: err === '',
    };
  });
}
