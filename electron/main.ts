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

  const isPackagedBundle =
    app.isPackaged ||
    __dirname.includes(`${path.sep}Contents${path.sep}Resources${path.sep}app`) ||
    !fs.existsSync(path.join(__dirname, '../src'));

  const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

  if (!isPackagedBundle && !process.env.CURSADA_LOAD_DIST) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}:`, error);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[did-fail-load] ${errorCode} ${errorDescription} (${validatedURL})`);
  });

  if (process.env.CURSADA_SMOKE_TEST === '1') {
    mainWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) {
        console.error(`[renderer-console:${level}] ${message}`);
      }
    });
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const info = await mainWindow.webContents.executeJavaScript(
            `({
              hasApi: typeof window.cursadaApi,
              rootLen: document.getElementById('root')?.innerHTML?.length ?? -1,
              rootText: document.getElementById('root')?.innerText?.slice(0, 120) ?? '',
              title: document.title,
            })`
          );
          console.log('[CURSADA_SMOKE_TEST]', JSON.stringify(info));
        } catch (err) {
          console.error('[CURSADA_SMOKE_TEST] eval failed:', err);
        }
        app.quit();
      }, 600);
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
