import { app, BrowserWindow, dialog, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAppDatabase, initAppDatabase } from './db/database.js';
import { registerAllIpcHandlers } from './ipc/handlers.js';
import { createElectronNotificationDispatcher } from './ipc/notificationHandlers.js';
import {
  getDevCspDirectives,
  isAllowedAppNavigation,
  isSafeExternalUrl,
  PROD_CSP_DIRECTIVES,
  resolveUnifiedUserDataDir,
  setRuntimeAppOriginOptions,
  type AppOriginOptions,
} from './security.js';
import { checkAndDispatchDueReminders } from './services/notificationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distElectronDir =
  path.basename(__dirname) === 'electron' ? path.dirname(__dirname) : __dirname;
const appRootDir = path.dirname(distElectronDir);

const REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1000;

app.setName('Cursada');
try {
  const appDataDir = app.getPath('appData');
  if (appDataDir) {
    app.setPath('userData', resolveUnifiedUserDataDir(appDataDir, process.env));
  }
} catch {
  // Ignore if appData path resolution is unavailable in constrained environments
}

function getAppOriginOptions(): AppOriginOptions {
  const isPackagedBundle =
    app.isPackaged ||
    __dirname.includes(`${path.sep}Contents${path.sep}Resources${path.sep}app`) ||
    !fs.existsSync(path.join(appRootDir, 'src'));

  return {
    isPackagedBundle,
    loadDist: process.env.CURSADA_LOAD_DIST === '1',
    devServerUrl: process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173',
    distHtmlPath: path.join(appRootDir, 'dist/index.html'),
  };
}

function resolveAppIconPath(): string | undefined {
  const candidates = [
    path.join(appRootDir, 'build/icon.png'),
    path.join(process.resourcesPath ?? '', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function configureSessionSecurity(originOptions: AppOriginOptions): void {
  const defaultSession = session.defaultSession;
  if (!defaultSession) {
    return;
  }

  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  defaultSession.setPermissionCheckHandler(() => false);

  const cspHeaderValue =
    !originOptions.isPackagedBundle && !originOptions.loadDist
      ? getDevCspDirectives(originOptions.devServerUrl)
      : PROD_CSP_DIRECTIVES;

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const headers = { ...(details.responseHeaders ?? {}) };
    headers['Content-Security-Policy'] = [cspHeaderValue];
    callback({ responseHeaders: headers });
  });
}

function createMainWindow(originOptions: AppOriginOptions): void {
  const iconPath = resolveAppIconPath();

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 640,
    title: 'Cursada',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#1E2023',
    icon: iconPath,
    webPreferences: {
      preload: path.join(distElectronDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedAppNavigation(targetUrl, originOptions)) {
      event.preventDefault();
      if (isSafeExternalUrl(targetUrl)) {
        void shell.openExternal(targetUrl);
      }
    }
  });

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  if (!originOptions.isPackagedBundle && !originOptions.loadDist) {
    void mainWindow.loadURL(originOptions.devServerUrl);
  } else {
    void mainWindow.loadFile(originOptions.distHtmlPath);
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

void app
  .whenReady()
  .then(() => {
    const originOptions = getAppOriginOptions();
    setRuntimeAppOriginOptions(originOptions);
    initAppDatabase();
    registerAllIpcHandlers();
    configureSessionSecurity(originOptions);

    const iconPath = resolveAppIconPath();
    if (process.platform === 'darwin' && iconPath && app.dock) {
      app.dock.setIcon(iconPath);
    }

    createMainWindow(originOptions);
    startReminderScheduler();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(originOptions);
      }
    });
  })
  .catch((err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[startup-fatal]', err);
    try {
      dialog.showErrorBox(
        'Error al iniciar Cursada',
        `No se pudo inicializar la base de datos o la ventana principal.\n\nDetalle: ${detail}`
      );
    } catch {
      // Ignore if dialog cannot be shown in headless shutdown
    }
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
