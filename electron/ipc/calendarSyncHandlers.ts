import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  getGoogleCalendarConfig,
  updateGoogleCalendarConfig,
} from '../db/calendarSyncRepo.js';
import { getAppDatabase } from '../db/database.js';
import {
  addCalendarFeedService,
  connectGoogleCalendarService,
  disconnectGoogleCalendarService,
  exportCalendarIcsService,
  listCalendarFeedsService,
  listExternalCalendarEventsService,
  removeCalendarFeedService,
  syncAllCalendarFeedsService,
  syncGoogleCalendarNowService,
} from '../services/calendarSyncService.js';
import type {
  CreateCalendarFeedInput,
  ExportIcsInput,
  ExportIcsResult,
  UpdateGoogleCalendarConfigInput,
} from '../types.js';

export function registerCalendarSyncHandlers(): void {
  ipcMain.handle(
    'calendarSync:exportIcs',
    async (_event, input?: ExportIcsInput): Promise<ExportIcsResult> => {
      let targetPath = input?.targetPath?.trim();

      if (!targetPath) {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const dialogOptions: Electron.SaveDialogOptions = {
          title: 'Exportar calendario iCal (.ics)',
          defaultPath: 'cursada-calendario.ics',
          filters: [{ name: 'iCalendar', extensions: ['ics'] }],
        };

        const dialogResult = focusedWindow
          ? await dialog.showSaveDialog(focusedWindow, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions);

        if (dialogResult.canceled || !dialogResult.filePath) {
          return {
            canceled: true,
            filePath: null,
            icsContent: '',
            eventsCount: 0,
            mode: 'filesystem',
          };
        }

        targetPath = dialogResult.filePath;
      }

      const ctx = getAppDatabase();
      return exportCalendarIcsService(ctx.db, {
        ...input,
        targetPath,
      });
    }
  );

  ipcMain.handle('calendarSync:listFeeds', () => {
    const ctx = getAppDatabase();
    return listCalendarFeedsService(ctx.db);
  });

  ipcMain.handle(
    'calendarSync:addFeed',
    (_event, input: CreateCalendarFeedInput) => {
      const ctx = getAppDatabase();
      return addCalendarFeedService(ctx.db, input);
    }
  );

  ipcMain.handle('calendarSync:removeFeed', (_event, feedId: string) => {
    const ctx = getAppDatabase();
    removeCalendarFeedService(ctx.db, feedId);
  });

  ipcMain.handle('calendarSync:syncFeeds', () => {
    const ctx = getAppDatabase();
    return syncAllCalendarFeedsService(ctx.db);
  });

  ipcMain.handle(
    'calendarSync:listExternalEvents',
    (_event, opts?: { dateFrom?: string; dateTo?: string }) => {
      const ctx = getAppDatabase();
      return listExternalCalendarEventsService(ctx.db, opts);
    }
  );

  ipcMain.handle('calendarSync:getGoogleConfig', () => {
    const ctx = getAppDatabase();
    return getGoogleCalendarConfig(ctx.db);
  });

  ipcMain.handle(
    'calendarSync:updateGoogleConfig',
    (_event, input: UpdateGoogleCalendarConfigInput) => {
      const ctx = getAppDatabase();
      return updateGoogleCalendarConfig(ctx.db, input);
    }
  );

  ipcMain.handle(
    'calendarSync:connectGoogle',
    (_event, opts?: { email?: string; clientId?: string }) => {
      const ctx = getAppDatabase();
      return connectGoogleCalendarService(ctx.db, opts, {
        openExternalUrl: (url) => shell.openExternal(url),
      });
    }
  );

  ipcMain.handle('calendarSync:disconnectGoogle', () => {
    const ctx = getAppDatabase();
    return disconnectGoogleCalendarService(ctx.db);
  });

  ipcMain.handle('calendarSync:syncGoogleNow', () => {
    const ctx = getAppDatabase();
    return syncGoogleCalendarNowService(ctx.db);
  });
}
