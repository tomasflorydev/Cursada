import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  getGoogleCalendarConfig,
  updateGoogleCalendarConfig,
} from '../db/calendarSyncRepo.js';
import { getAppDatabase } from '../db/database.js';
import {
  assertTrustedIpcEvent,
  assertValidIpcId,
  resolveRendererRequestedPath,
} from '../security.js';
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
    async (event, input?: ExportIcsInput): Promise<ExportIcsResult> => {
      assertTrustedIpcEvent(event);
      let targetPath = resolveRendererRequestedPath(input?.targetPath);

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

  ipcMain.handle('calendarSync:listFeeds', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return listCalendarFeedsService(ctx.db);
  });

  ipcMain.handle(
    'calendarSync:addFeed',
    (event, input: CreateCalendarFeedInput) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return addCalendarFeedService(ctx.db, input);
    }
  );

  ipcMain.handle('calendarSync:removeFeed', (event, feedId: string) => {
    assertTrustedIpcEvent(event);
    const validId = assertValidIpcId(feedId, 'ID del feed');
    const ctx = getAppDatabase();
    removeCalendarFeedService(ctx.db, validId);
  });

  ipcMain.handle('calendarSync:syncFeeds', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return syncAllCalendarFeedsService(ctx.db);
  });

  ipcMain.handle(
    'calendarSync:listExternalEvents',
    (event, opts?: { dateFrom?: string; dateTo?: string }) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return listExternalCalendarEventsService(ctx.db, opts);
    }
  );

  ipcMain.handle('calendarSync:getGoogleConfig', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return getGoogleCalendarConfig(ctx.db);
  });

  ipcMain.handle(
    'calendarSync:updateGoogleConfig',
    (event, input: UpdateGoogleCalendarConfigInput) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return updateGoogleCalendarConfig(ctx.db, input);
    }
  );

  ipcMain.handle(
    'calendarSync:connectGoogle',
    (event, opts?: { email?: string; clientId?: string }) => {
      assertTrustedIpcEvent(event);
      const ctx = getAppDatabase();
      return connectGoogleCalendarService(ctx.db, opts, {
        openExternalUrl: (url) => shell.openExternal(url),
      });
    }
  );

  ipcMain.handle('calendarSync:disconnectGoogle', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return disconnectGoogleCalendarService(ctx.db);
  });

  ipcMain.handle('calendarSync:syncGoogleNow', (event) => {
    assertTrustedIpcEvent(event);
    const ctx = getAppDatabase();
    return syncGoogleCalendarNowService(ctx.db);
  });
}
