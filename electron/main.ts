import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAppDatabase, initAppDatabase } from './db/database.js';
import { registerAllIpcHandlers } from './ipc/handlers.js';
import { createElectronNotificationDispatcher } from './ipc/notificationHandlers.js';
import { checkAndDispatchDueReminders } from './services/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1000;

app.setName('Cursada');

function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(process.resourcesPath ?? '', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function createMainWindow(): void {
  const iconPath = resolveAppIconPath();

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Cursada',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#21262d',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

  if (!app.isPackaged && !process.env.CURSADA_LOAD_DIST) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  if (process.env.CURSADA_SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        app.quit();
      }, 300);
    });
  }
}

function startReminderScheduler(): void {
  if (process.env.CURSADA_SMOKE_TEST === '1') {
    return;
  }

  const runCheck = () => {
    try {
      const ctx = getAppDatabase();
      checkAndDispatchDueReminders(ctx.db, {
        dispatch: true,
        dispatcher: createElectronNotificationDispatcher(),
      });
    } catch {
      // Non-fatal: background reminder check must never crash the main process
    }
  };

  runCheck();
  const timer = setInterval(runCheck, REMINDER_POLL_INTERVAL_MS);
  timer.unref();
}

void app.whenReady().then(() => {
  initAppDatabase();
  registerAllIpcHandlers();

  const iconPath = resolveAppIconPath();
  if (process.platform === 'darwin' && iconPath && app.dock) {
    app.dock.setIcon(iconPath);
  }

  createMainWindow();
  startReminderScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
