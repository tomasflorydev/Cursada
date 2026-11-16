import { BrowserWindow, dialog, ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  assertTrustedIpcEvent,
  resolveRendererRequestedPath,
} from '../security.js';
import { exportMarkdownFromDb } from '../services/exportService.js';
import type { ExportMarkdownRequest, ExportMarkdownResult } from '../types.js';

export function registerExportHandlers(): void {
  ipcMain.handle(
    'export:markdown',
    async (event, request: ExportMarkdownRequest): Promise<ExportMarkdownResult> => {
      assertTrustedIpcEvent(event);
      let targetDir = resolveRendererRequestedPath(request?.targetDir);

      if (!targetDir) {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions: Electron.OpenDialogOptions = {
          title: 'Elegir carpeta para exportar Markdown',
          properties: ['openDirectory', 'createDirectory'],
        };

        const dialogResult = focusedWindow
          ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
          return {
            canceled: true,
            targetDir: null,
            filesCreated: [],
            fileCount: 0,
            mode: 'filesystem',
          };
        }

        targetDir = dialogResult.filePaths[0];
      }

      const ctx = getAppDatabase();
      return exportMarkdownFromDb(ctx.db, {
        ...request,
        targetDir,
      });
    }
  );
}
