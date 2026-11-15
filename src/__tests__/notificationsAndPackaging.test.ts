import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from '../../electron/db/coursesRepo';
import {
  getAppDatabase,
  openDatabase,
} from '../../electron/db/database';
import { createExam } from '../../electron/db/examsRepo';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  getNotificationSettings,
  updateNotificationSettings,
} from '../../electron/db/notificationSettingsRepo';
import { createTask, toggleTaskStatus } from '../../electron/db/tasksRepo';
import { registerNotificationHandlers } from '../../electron/ipc/notificationHandlers';
import {
  checkAndDispatchDueReminders,
  clearDispatchedRemindersCache,
  evaluateDueReminders,
  sendTestNotification,
} from '../../electron/services/notificationService';
// @ts-expect-error Pure Node ESM script without TypeScript declarations
import * as packagerModule from '../../scripts/package-macos-app.mjs';

interface PackagerExports {
  generateIconPngBuffer: (size?: number) => Buffer;
  packageMacOsApp: (options?: {
    projectRoot?: string;
    outputDir?: string;
    electronAppPath?: string;
    skipIcons?: boolean;
    skipCodesign?: boolean;
  }) => {
    appPath: string;
    bundleIdentifier: string;
    iconIcnsPath: string | null;
    iconPngPath: string | null;
  };
}

const { generateIconPngBuffer, packageMacOsApp } =
  packagerModule as unknown as PackagerExports;
import { mockCreateCourse } from '../lib/api/mockCourses';
import { mockCreateExam } from '../lib/api/mockExams';
import {
  mockCheckDueReminders,
  mockGetNotificationSettings,
  mockSendTestNotification,
  mockUpdateNotificationSettings,
  resetMockNotifications,
} from '../lib/api/mockNotifications';
import { mockCreateTask } from '../lib/api/mockTasks';
import { resetAllMocks } from '../lib/api/mockClient';

const ipcHandleMap = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      ipcHandleMap.set(channel, listener);
    },
  },
  Notification: class MockElectronNotification {
    static isSupported() {
      return true;
    }
    show() {}
  },
}));

function toLocalIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('Phase 8 Task 8.2 Backend: notificationSettingsRepo, notificationService & macOS packaging', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    clearDispatchedRemindersCache();
    resetAllMocks();
    resetMockNotifications();
    vi.restoreAllMocks();
    delete process.env.CURSADA_DATA_DIR;
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns defaults, updates, and validates notification settings in SQLite app_settings', () => {
    const ctx = openDatabase({ inMemory: true, runStartupBackup: false });
    tempDirs.push(ctx.dataDir);

    try {
      expect(getNotificationSettings(ctx.db)).toEqual(
        DEFAULT_NOTIFICATION_SETTINGS
      );

      const updated = updateNotificationSettings(ctx.db, {
        classLeadMinutes: 30,
        examLeadDays: 7,
        tasksDueTodayEnabled: false,
      });
      expect(updated).toEqual({
        enabled: true,
        upcomingClassesEnabled: true,
        classLeadMinutes: 30,
        tasksDueTodayEnabled: false,
        upcomingExamsEnabled: true,
        examLeadDays: 7,
      });

      const partial = updateNotificationSettings(ctx.db, { enabled: false });
      expect(partial).toEqual({
        enabled: false,
        upcomingClassesEnabled: true,
        classLeadMinutes: 30,
        tasksDueTodayEnabled: false,
        upcomingExamsEnabled: true,
        examLeadDays: 7,
      });

      expect(() =>
        updateNotificationSettings(ctx.db, { classLeadMinutes: 4 })
      ).toThrow(/5 y 180/);
      expect(() =>
        updateNotificationSettings(ctx.db, { classLeadMinutes: 181 })
      ).toThrow(/5 y 180/);
      expect(() =>
        updateNotificationSettings(ctx.db, { classLeadMinutes: 15.5 })
      ).toThrow(/5 y 180/);
      expect(() =>
        updateNotificationSettings(ctx.db, { examLeadDays: 0 })
      ).toThrow(/1 y 30/);
      expect(() =>
        updateNotificationSettings(ctx.db, { examLeadDays: 31 })
      ).toThrow(/1 y 30/);
      expect(() =>
        updateNotificationSettings(ctx.db, { examLeadDays: 2.5 })
      ).toThrow(/1 y 30/);

      // Invalid calls did not corrupt stored values
      expect(getNotificationSettings(ctx.db)).toEqual(partial);
    } finally {
      ctx.close();
    }
  });

  it('evaluates upcoming class, task due today, and upcoming exam reminders and deduplicates dispatch', () => {
    const ctx = openDatabase({ inMemory: true, runStartupBackup: false });
    tempDirs.push(ctx.dataDir);

    try {
      // Monday 2026-11-16 at 14:00 local time (dayOfWeek = 1)
      const referenceDate = new Date(2026, 10, 16, 14, 0, 0, 0);

      const activeCourse = createCourse(ctx.db, {
        name: 'Algoritmos II',
        color: 'blue',
        term: '2026-2C',
        status: 'active',
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '14:15',
            endTime: '16:15',
            location: 'Aula 402',
          },
          {
            dayOfWeek: 1,
            startTime: '16:30', // outside default 15 min lead
            endTime: '18:30',
            location: 'Aula 402',
          },
          {
            dayOfWeek: 1,
            startTime: '13:30', // already started
            endTime: '14:10',
            location: 'Aula 101',
          },
        ],
      });

      const archivedCourse = createCourse(ctx.db, {
        name: 'Física I (Archivada)',
        color: 'slate',
        term: '2025-1C',
        status: 'archived',
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '14:10',
            endTime: '16:00',
            location: 'Aula 105',
          },
        ],
      });

      // Task due today (pending) vs done vs archived
      const taskToday = createTask(ctx.db, {
        courseId: activeCourse.id,
        title: 'Entregar TP Grafos',
        dueDate: '2026-11-16',
        priority: 'high',
      });
      const doneTask = createTask(ctx.db, {
        courseId: activeCourse.id,
        title: 'Tarea ya completada',
        dueDate: '2026-11-16',
      });
      toggleTaskStatus(ctx.db, doneTask.id);
      createTask(ctx.db, {
        courseId: archivedCourse.id,
        title: 'Tarea de materia archivada',
        dueDate: '2026-11-16',
      });

      // Exam in 1 day (ungraded) vs graded vs out-of-window
      const examTomorrow = createExam(ctx.db, {
        courseId: activeCourse.id,
        title: '2° Parcial',
        category: 'parcial',
        examDate: '2026-11-17',
      });
      createExam(ctx.db, {
        courseId: activeCourse.id,
        title: 'Examen ya calificado',
        category: 'parcial',
        examDate: '2026-11-17',
        grade: 9,
      });
      createExam(ctx.db, {
        courseId: activeCourse.id,
        title: 'Final lejano',
        category: 'final',
        examDate: '2026-11-25',
      });

      const candidates = evaluateDueReminders(ctx.db, referenceDate);
      expect(candidates).toHaveLength(3);

      const targetSchedule = activeCourse.schedules.find(
        (s) => s.startTime === '14:15'
      )!;
      expect(candidates[0]).toEqual({
        id: `class:${targetSchedule.id}:2026-11-16`,
        kind: 'upcoming_class',
        title: 'Próxima clase: Algoritmos II',
        body: '14:15 a 16:15 · Aula 402',
        courseId: activeCourse.id,
        courseName: 'Algoritmos II',
        referenceIso: '2026-11-16',
      });

      expect(candidates[1]).toEqual({
        id: `task:${taskToday.id}:2026-11-16`,
        kind: 'task_due_today',
        title: 'Entrega de hoy: Entregar TP Grafos',
        body: 'Materia: Algoritmos II',
        courseId: activeCourse.id,
        courseName: 'Algoritmos II',
        referenceIso: '2026-11-16',
      });

      expect(candidates[2]).toEqual({
        id: `exam:${examTomorrow.id}:2026-11-16`,
        kind: 'upcoming_exam',
        title: 'Próximo examen: 2° Parcial',
        body: 'Algoritmos II · Mañana (2026-11-17)',
        courseId: activeCourse.id,
        courseName: 'Algoritmos II',
        referenceIso: '2026-11-17',
      });

      // Dispatch with deduplication
      const dispatchedCalls: Array<{ title: string; body: string }> = [];
      const customDispatcher = (title: string, body: string) => {
        dispatchedCalls.push({ title, body });
        return {
          supported: true,
          dispatched: true,
          title,
          body,
          dispatchedAt: '2026-11-16T17:00:00.000Z',
          mode: 'simulated' as const,
        };
      };

      const firstRun = checkAndDispatchDueReminders(ctx.db, {
        referenceDate,
        dispatch: true,
        dispatcher: customDispatcher,
        resetDedup: true,
      });
      expect(firstRun.candidates).toHaveLength(3);
      expect(firstRun.dispatchedCount).toBe(3);
      expect(firstRun.results).toHaveLength(3);
      expect(dispatchedCalls).toHaveLength(3);

      // Second run in the same session deduplicates already sent reminders
      const secondRun = checkAndDispatchDueReminders(ctx.db, {
        referenceDate,
        dispatch: true,
        dispatcher: customDispatcher,
      });
      expect(secondRun.candidates).toHaveLength(3);
      expect(secondRun.dispatchedCount).toBe(0);
      expect(secondRun.results).toHaveLength(0);
      expect(dispatchedCalls).toHaveLength(3);

      // sendTestNotification works with default and custom dispatchers
      const defaultTest = sendTestNotification();
      expect(defaultTest).toMatchObject({
        supported: true,
        dispatched: true,
        title: 'Recordatorio de prueba · Cursada',
        body: 'Las notificaciones locales de Cursada están funcionando correctamente.',
        mode: 'simulated',
      });

      const customTest = sendTestNotification(customDispatcher);
      expect(customTest.dispatched).toBe(true);
      expect(dispatchedCalls).toHaveLength(4);

      // Disabling master toggle yields zero candidates
      updateNotificationSettings(ctx.db, { enabled: false });
      expect(evaluateDueReminders(ctx.db, referenceDate)).toEqual([]);
    } finally {
      ctx.close();
    }
  });

  it('registers notifications:* IPC handlers and evaluates mockNotifications consistently', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-notif-ipc-'));
    tempDirs.push(tempDir);
    process.env.CURSADA_DATA_DIR = tempDir;
    ipcHandleMap.clear();

    registerNotificationHandlers();

    const getHandler = ipcHandleMap.get('notifications:getSettings');
    const updateHandler = ipcHandleMap.get('notifications:updateSettings');
    const sendTestHandler = ipcHandleMap.get('notifications:sendTest');
    const checkHandler = ipcHandleMap.get('notifications:checkReminders');

    expect(getHandler).toBeDefined();
    expect(updateHandler).toBeDefined();
    expect(sendTestHandler).toBeDefined();
    expect(checkHandler).toBeDefined();

    try {
      expect(getHandler?.({})).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
      expect(
        updateHandler?.({}, { classLeadMinutes: 60, examLeadDays: 3 })
      ).toMatchObject({
        classLeadMinutes: 60,
        examLeadDays: 3,
      });

      const testRes = sendTestHandler?.({});
      expect(testRes).toMatchObject({
        supported: true,
        dispatched: true,
        title: 'Recordatorio de prueba · Cursada',
        mode: 'simulated',
      });

      expect(() =>
        checkHandler?.({}, { referenceIso: 'not-a-date', dispatch: false })
      ).toThrow(/inválida/i);
    } finally {
      getAppDatabase().close();
    }

    // Verify mockNotifications real-time evaluation matches backend logic
    resetAllMocks();
    const refDate = new Date(2026, 10, 16, 10, 0, 0, 0);
    const todayIso = toLocalIsoDate(refDate);
    const course = await mockCreateCourse({
      name: 'Redes de Datos',
      color: 'cyan',
      term: '2026-2C',
      schedules: [
        {
          dayOfWeek: 1,
          startTime: '10:15',
          endTime: '12:15',
          location: 'Lab 2',
        },
      ],
    });
    await mockCreateTask({
      courseId: course.id,
      title: 'Subir captura Wireshark',
      dueDate: todayIso,
    });
    await mockCreateExam({
      courseId: course.id,
      title: 'Parcial Redes',
      examDate: todayIso,
    });

    await mockUpdateNotificationSettings({ classLeadMinutes: 30 });
    expect((await mockGetNotificationSettings()).classLeadMinutes).toBe(30);

    const mockCheck = await mockCheckDueReminders({
      referenceIso: refDate.toISOString(),
      dispatch: true,
    });
    expect(mockCheck.candidates.map((c) => c.kind)).toEqual([
      'upcoming_class',
      'task_due_today',
      'upcoming_exam',
    ]);
    expect(mockCheck.dispatchedCount).toBe(3);

    const mockSecondCheck = await mockCheckDueReminders({
      referenceIso: refDate.toISOString(),
      dispatch: true,
    });
    expect(mockSecondCheck.dispatchedCount).toBe(0);

    const mockTest = await mockSendTestNotification();
    expect(mockTest.dispatched).toBe(true);
    expect(mockTest.title).toBe('Recordatorio de prueba · Cursada');
  });

  it('generates a valid PNG icon buffer with signature and IHDR dimensions', () => {
    const png = generateIconPngBuffer(64);
    expect(Buffer.isBuffer(png)).toBe(true);

    // PNG magic signature: \x89PNG\r\n\x1a\n
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );

    // IHDR chunk starts at offset 8: length(4), type(4), width(4), height(4), bitDepth(1), colorType(1)
    expect(png.readUInt32BE(8)).toBe(13);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(64);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // RGBA color type

    expect(() => generateIconPngBuffer(8)).toThrow(/inválido/i);
  });

  it('packages Cursada.app into outputDir against a temporary Electron.app fixture', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-pkg-test-'));
    tempDirs.push(tmpRoot);

    // Create build artifacts
    fs.mkdirSync(path.join(tmpRoot, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'dist', 'index.html'),
      '<!doctype html><html><body>Cursada</body></html>',
      'utf8'
    );
    fs.mkdirSync(path.join(tmpRoot, 'dist-electron'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'dist-electron', 'main.js'),
      'console.log("cursada main");',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({
        name: 'cursada',
        version: '0.1.0',
        description: 'Espacio de trabajo académico local para macOS',
        type: 'module',
        main: 'dist-electron/main.js',
        devDependencies: { vitest: '^2.1.8' },
      }),
      'utf8'
    );

    // Create simulated Electron.app fixture
    const fixtureElectronApp = path.join(tmpRoot, 'Electron.app');
    const fixtureContents = path.join(fixtureElectronApp, 'Contents');
    const fixtureResources = path.join(fixtureContents, 'Resources');
    fs.mkdirSync(fixtureResources, { recursive: true });
    fs.writeFileSync(
      path.join(fixtureResources, 'default_app.asar'),
      'dummy-asar',
      'utf8'
    );
    fs.writeFileSync(
      path.join(fixtureContents, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Electron</string>
  <key>CFBundleDisplayName</key>
  <string>Electron</string>
  <key>CFBundleIdentifier</key>
  <string>com.github.Electron</string>
  <key>ElectronAsarIntegrity</key>
  <dict>
    <key>Resources/default_app.asar</key>
    <string>hash</string>
  </dict>
</dict>
</plist>
`,
      'utf8'
    );

    const outputDir = path.join(tmpRoot, 'release');
    const result = packageMacOsApp({
      projectRoot: tmpRoot,
      outputDir,
      electronAppPath: fixtureElectronApp,
      skipIcons: true,
      skipCodesign: true,
    });

    expect(result.appPath).toBe(path.join(outputDir, 'Cursada.app'));
    expect(result.bundleIdentifier).toBe('com.cursada.app');

    const bundledAppDir = path.join(
      result.appPath,
      'Contents',
      'Resources',
      'app'
    );
    expect(fs.existsSync(path.join(bundledAppDir, 'dist', 'index.html'))).toBe(
      true
    );
    expect(
      fs.existsSync(path.join(bundledAppDir, 'dist-electron', 'main.js'))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(result.appPath, 'Contents', 'Resources', 'default_app.asar')
      )
    ).toBe(false);

    const bundledPkg = JSON.parse(
      fs.readFileSync(path.join(bundledAppDir, 'package.json'), 'utf8')
    );
    expect(bundledPkg).toEqual({
      name: 'cursada',
      version: '0.1.0',
      description: 'Espacio de trabajo académico local para macOS',
      type: 'module',
      main: 'dist-electron/main.js',
    });

    if (process.platform === 'darwin') {
      const plistJson = execFileSync(
        '/usr/bin/plutil',
        ['-convert', 'json', '-o', '-', path.join(result.appPath, 'Contents', 'Info.plist')],
        { encoding: 'utf8' }
      );
      const parsedPlist = JSON.parse(plistJson) as Record<string, unknown>;
      expect(parsedPlist.CFBundleName).toBe('Cursada');
      expect(parsedPlist.CFBundleDisplayName).toBe('Cursada');
      expect(parsedPlist.CFBundleIdentifier).toBe('com.cursada.app');
      expect(parsedPlist.CFBundleShortVersionString).toBe('0.1.0');
      expect(parsedPlist.CFBundleVersion).toBe('0.1.0');
      expect(parsedPlist.CFBundleIconFile).toBe('Cursada.icns');
      expect(parsedPlist.LSApplicationCategoryType).toBe(
        'public.app-category.education'
      );
      expect(parsedPlist.ElectronAsarIntegrity).toBeUndefined();
    }
  });
});
