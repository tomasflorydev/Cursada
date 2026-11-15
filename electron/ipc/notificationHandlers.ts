import { Notification, ipcMain } from 'electron';
import { getAppDatabase } from '../db/database.js';
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../db/notificationSettingsRepo.js';
import {
  checkAndDispatchDueReminders,
  sendTestNotification,
  type NotificationDispatcher,
} from '../services/notificationService.js';
import type {
  NotificationDispatchResult,
  UpdateNotificationSettingsInput,
} from '../types.js';

export function createElectronNotificationDispatcher(): NotificationDispatcher {
  return (title: string, body: string): NotificationDispatchResult => {
    const dispatchedAt = new Date().toISOString();

    if (process.env.VITEST || process.env.CURSADA_SMOKE_TEST === '1') {
      return {
        supported: true,
        dispatched: true,
        title,
        body,
        dispatchedAt,
        mode: 'simulated',
      };
    }

    if (!Notification.isSupported()) {
      return {
        supported: false,
        dispatched: false,
        title,
        body,
        dispatchedAt,
        mode: 'electron-native',
      };
    }

    const notification = new Notification({
      title,
      body,
      silent: false,
    });
    notification.show();

    return {
      supported: true,
      dispatched: true,
      title,
      body,
      dispatchedAt,
      mode: 'electron-native',
    };
  };
}

export function registerNotificationHandlers(): void {
  ipcMain.handle('notifications:getSettings', () => {
    const ctx = getAppDatabase();
    return getNotificationSettings(ctx.db);
  });

  ipcMain.handle(
    'notifications:updateSettings',
    (_event, input: UpdateNotificationSettingsInput) => {
      const ctx = getAppDatabase();
      return updateNotificationSettings(ctx.db, input);
    }
  );

  ipcMain.handle('notifications:sendTest', () => {
    return sendTestNotification(createElectronNotificationDispatcher());
  });

  ipcMain.handle(
    'notifications:checkReminders',
    (_event, opts?: { referenceIso?: string; dispatch?: boolean }) => {
      let referenceDate: Date | undefined;
      if (opts?.referenceIso !== undefined) {
        const parsed = new Date(opts.referenceIso);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error(
            `Fecha de referencia inválida "${String(opts.referenceIso)}".`
          );
        }
        referenceDate = parsed;
      }

      const ctx = getAppDatabase();
      return checkAndDispatchDueReminders(ctx.db, {
        referenceDate,
        dispatch: opts?.dispatch,
        dispatcher: createElectronNotificationDispatcher(),
      });
    }
  );
}
