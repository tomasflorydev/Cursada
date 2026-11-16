import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGoogleCalendarConfig,
  listCalendarFeeds,
  listGoogleCalendarMappings,
  saveGoogleCalendarTokens,
  updateGoogleCalendarConfig,
} from '../../electron/db/calendarSyncRepo';
import { createCourse } from '../../electron/db/coursesRepo';
import { getAppDatabase, openDatabase } from '../../electron/db/database';
import { createExam } from '../../electron/db/examsRepo';
import { createTask } from '../../electron/db/tasksRepo';
import { registerCalendarSyncHandlers } from '../../electron/ipc/calendarSyncHandlers';
import {
  addCalendarFeedService,
  buildPkceChallengePair,
  connectGoogleCalendarService,
  disconnectGoogleCalendarService,
  exportCalendarIcsService,
  listExternalCalendarEventsService,
  normalizeCalendarFeedUrl,
  removeCalendarFeedService,
  startGoogleOAuthLoopbackServer,
  syncAllCalendarFeedsService,
  syncGoogleCalendarNowService,
} from '../../electron/services/calendarSyncService';
import { CalendarSyncSettingsSection } from '../components/settings/CalendarSyncSettingsSection';
import {
  mockAddCalendarFeed,
  mockConnectGoogleCalendar,
  mockDisconnectGoogleCalendar,
  mockExportCalendarIcs,
  mockGetGoogleCalendarConfig,
  mockListCalendarFeeds,
  mockListExternalCalendarEvents,
  mockRemoveCalendarFeed,
  mockSyncCalendarFeeds,
  mockSyncGoogleCalendarNow,
  mockUpdateGoogleCalendarConfig,
  resetMockCalendarSync,
} from '../lib/api/mockCalendarSync';
import { resetAllMocks } from '../lib/api/mockClient';
import {
  buildIcsCalendar,
  parseIcsCalendar,
} from '../lib/calendar/icsParserAndBuilder';
import type {
  CourseWithSchedules,
  ExamWithCourse,
  TaskWithCourse,
} from '../types/domain';

const ipcHandleMap = new Map<string, (...args: unknown[]) => unknown>();
const openExternalMock = vi.fn(async (_url: string) => {});
let saveDialogMockResult: { canceled: boolean; filePath?: string } = {
  canceled: true,
};

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      ipcHandleMap.set(channel, listener);
    },
  },
  BrowserWindow: {
    getFocusedWindow: () => null,
  },
  dialog: {
    showSaveDialog: async () => saveDialogMockResult,
  },
  shell: {
    openExternal: (url: string) => openExternalMock(url),
  },
}));

const SAMPLE_GOOGLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'BEGIN:VEVENT',
  'UID:gcal-allday-1@google.com',
  'DTSTART;VALUE=DATE:20261116',
  'DTEND;VALUE=DATE:20261117',
  'SUMMARY:Feriado Nacional\\, Día de la Soberanía',
  'LOCATION:Argentina',
  'DESCRIPTION:Día no laborable\\; sin clases.',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:gcal-timed-2@google.com',
  'DTSTART;TZID=America/Argentina/Buenos_Aires:20261118T190000',
  'DTEND;TZID=America/Argentina/Buenos_Aires:20261118T203000',
  'SUMMARY:Reunión de grupo TP integrador',
  '  en biblioteca',
  'LOCATION:Sala 2\\, Piso 3',
  'DESCRIPTION:Revisar diagramas\\nPreparar demo',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:This is an event reminder',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:gcal-utc-3@google.com',
  'DTSTART:20261120T150000Z',
  'DTEND:20261120T163000Z',
  'SUMMARY:Charla de Arquitectura',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:gcal-cancelled-4@google.com',
  'DTSTART;VALUE=DATE:20261119',
  'SUMMARY:Evento cancelado',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('Phase 14: Google Calendar Sync & iCal (.ics Export, Feeds & OAuth2 PKCE)', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    resetAllMocks();
    resetMockCalendarSync();
    ipcHandleMap.clear();
    openExternalMock.mockClear();
    saveDialogMockResult = { canceled: true };
    delete window.cursadaApi;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.cursadaApi;
    delete process.env.CURSADA_DATA_DIR;
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds RFC 5545 compliant .ics with weekly RRULE schedules, all-day tasks, and timed/all-day exams', () => {
    const courses: CourseWithSchedules[] = [
      {
        id: 'course-1',
        name: 'Diseño, Arquitectura y Patrones',
        color: 'violet',
        professor: 'Carolina Méndez',
        term: '2026 - 2C',
        status: 'active',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        schedules: [
          {
            id: 'sched-1',
            courseId: 'course-1',
            dayOfWeek: 2,
            startTime: '18:30',
            endTime: '22:30',
            location: 'Aula 308, Lima',
          },
        ],
      },
    ];

    const tasks: TaskWithCourse[] = [
      {
        id: 'task-1',
        courseId: 'course-1',
        courseName: 'Diseño, Arquitectura y Patrones',
        courseColor: 'violet',
        title: 'Entregar TP1; Diagramas',
        description: 'Subir PDF\nCon correcciones',
        dueDate: '2026-11-18',
        priority: 'high',
        status: 'pending',
        completedAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
      {
        id: 'task-no-date',
        courseId: 'course-1',
        courseName: 'Diseño, Arquitectura y Patrones',
        courseColor: 'violet',
        title: 'Tarea sin fecha',
        description: '',
        dueDate: null,
        priority: null,
        status: 'pending',
        completedAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ];

    const exams: ExamWithCourse[] = [
      {
        id: 'exam-timed',
        courseId: 'course-1',
        courseName: 'Diseño, Arquitectura y Patrones',
        courseColor: 'violet',
        title: '2° Parcial',
        category: 'parcial',
        examDate: '2026-11-20',
        examTime: '19:00',
        location: 'Aula 402',
        topics: 'Strategy, State',
        grade: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
      {
        id: 'exam-allday',
        courseId: 'course-1',
        courseName: 'Diseño, Arquitectura y Patrones',
        courseColor: 'violet',
        title: 'Final Integrador',
        category: 'final',
        examDate: '2026-12-04',
        examTime: null,
        location: '',
        topics: '',
        grade: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      },
    ];

    const result = buildIcsCalendar({
      courses,
      tasks,
      exams,
      referenceDate: new Date(2026, 10, 16, 10, 0, 0),
    });

    expect(result.eventsCount).toBe(4);
    expect(result.icsContent).toContain('\r\n');
    expect(result.icsContent).toContain('BEGIN:VCALENDAR\r\n');
    expect(result.icsContent).toContain('VERSION:2.0\r\n');
    expect(result.icsContent).toContain('PRODID:-//Cursada//Calendar//ES\r\n');
    expect(result.icsContent).toContain('END:VCALENDAR\r\n');

    // Unfold to verify escaped content and properties cleanly
    const unfolded = result.icsContent.replace(/\r\n /g, '');
    expect(unfolded).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
    expect(unfolded).toContain('SUMMARY:Diseño\\, Arquitectura y Patrones');
    expect(unfolded).toContain('LOCATION:Aula 308\\, Lima');
    expect(unfolded).toContain('DTSTART:20261117T183000');
    expect(unfolded).toContain('DTEND:20261117T223000');
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261118');
    expect(unfolded).toContain('DTEND;VALUE=DATE:20261119');
    expect(unfolded).toContain('SUMMARY:Entrega: Entregar TP1\\; Diagramas');
    expect(unfolded).toContain('DTSTART:20261120T190000');
    expect(unfolded).toContain('DTEND:20261120T210000');
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20261204');
    expect(unfolded).not.toContain('Tarea sin fecha');

    // Selective filtering
    const examsOnly = buildIcsCalendar({
      courses,
      tasks,
      exams,
      includeSchedules: false,
      includeTasks: false,
      includeExams: true,
    });
    expect(examsOnly.eventsCount).toBe(2);
    expect(examsOnly.icsContent).not.toContain('RRULE:FREQ=WEEKLY');
  });

  it('parses folded lines, all-day dates, TZID, UTC Z timestamps, VALARM isolation, and date range filtering', () => {
    const allEvents = parseIcsCalendar(SAMPLE_GOOGLE_ICS, {
      feedId: 'feed-gcal',
      feedName: 'Personal',
    });

    expect(allEvents).toHaveLength(3);

    // 1. All-day event
    expect(allEvents[0]).toMatchObject({
      feedId: 'feed-gcal',
      feedName: 'Personal',
      uid: 'gcal-allday-1@google.com',
      title: 'Feriado Nacional, Día de la Soberanía',
      dateIso: '2026-11-16',
      startTime: null,
      endTime: null,
      location: 'Argentina',
      description: 'Día no laborable; sin clases.',
    });

    // 2. Timed event with folded summary & embedded VALARM that must NOT override DESCRIPTION
    expect(allEvents[1]).toMatchObject({
      uid: 'gcal-timed-2@google.com',
      title: 'Reunión de grupo TP integrador en biblioteca',
      dateIso: '2026-11-18',
      startTime: '19:00',
      endTime: '20:30',
      location: 'Sala 2, Piso 3',
      description: 'Revisar diagramas\nPreparar demo',
    });

    // 3. UTC Z timestamp converted cleanly to local wall-clock time
    const expectedUtc = new Date('2026-11-20T15:00:00Z');
    const expectedUtcEnd = new Date('2026-11-20T16:30:00Z');
    const expectedDateIso = `${expectedUtc.getFullYear()}-${String(
      expectedUtc.getMonth() + 1
    ).padStart(2, '0')}-${String(expectedUtc.getDate()).padStart(2, '0')}`;
    const expectedStart = `${String(expectedUtc.getHours()).padStart(2, '0')}:${String(
      expectedUtc.getMinutes()
    ).padStart(2, '0')}`;
    const expectedEnd = `${String(expectedUtcEnd.getHours()).padStart(2, '0')}:${String(
      expectedUtcEnd.getMinutes()
    ).padStart(2, '0')}`;

    expect(allEvents[2]).toMatchObject({
      uid: 'gcal-utc-3@google.com',
      title: 'Charla de Arquitectura',
      dateIso: expectedDateIso,
      startTime: expectedStart,
      endTime: expectedEnd,
    });

    // Date range filter
    const filtered = parseIcsCalendar(
      SAMPLE_GOOGLE_ICS,
      { feedId: 'feed-gcal', feedName: 'Personal' },
      { dateFrom: '2026-11-17', dateTo: '2026-11-19' }
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].uid).toBe('gcal-timed-2@google.com');
  });

  it('persists feeds, syncs iCal URLs, lists external events, and runs Google Calendar mappings in SQLite v8', async () => {
    const ctx = openDatabase({ inMemory: true, runStartupBackup: false });
    tempDirs.push(ctx.dataDir);

    try {
      const course = createCourse(ctx.db, {
        name: 'Algoritmos II',
        color: 'blue',
        term: '2026-2C',
        schedules: [
          {
            dayOfWeek: 1,
            startTime: '18:30',
            endTime: '22:30',
            location: 'Aula 101',
          },
        ],
      });
      createTask(ctx.db, {
        courseId: course.id,
        title: 'Entregar TP Grafos',
        dueDate: '2026-11-18',
        priority: 'high',
      });
      createTask(ctx.db, {
        courseId: course.id,
        title: 'Lectura sin fecha',
        dueDate: null,
      });
      createExam(ctx.db, {
        courseId: course.id,
        title: '2° Parcial',
        category: 'parcial',
        examDate: '2026-11-21',
        examTime: '14:00',
      });

      // 1. Export .ics to temp directory
      const targetIcs = path.join(ctx.dataDir, 'exports', 'cursada.ics');
      const exportRes = await exportCalendarIcsService(ctx.db, {
        targetPath: targetIcs,
      });
      expect(exportRes.canceled).toBe(false);
      expect(exportRes.mode).toBe('filesystem');
      expect(exportRes.eventsCount).toBe(3); // 1 schedule + 1 dated task + 1 exam
      expect(fs.existsSync(targetIcs)).toBe(true);
      expect(fs.readFileSync(targetIcs, 'utf8')).toContain('BEGIN:VCALENDAR');

      // 2. Normalize webcal:// and add feed with mocked fetchFn
      expect(
        normalizeCalendarFeedUrl('webcal://calendar.google.com/calendar/ical/test/basic.ics')
      ).toBe('https://calendar.google.com/calendar/ical/test/basic.ics');

      const fetchMock = vi.fn(async () => {
        return new Response(SAMPLE_GOOGLE_ICS, {
          status: 200,
          headers: { 'Content-Type': 'text/calendar' },
        });
      }) as unknown as typeof fetch;

      const addedFeed = await addCalendarFeedService(
        ctx.db,
        {
          name: 'Google Personal',
          url: 'webcal://calendar.google.com/calendar/ical/abc/basic.ics',
        },
        { fetchFn: fetchMock }
      );

      expect(addedFeed.name).toBe('Google Personal');
      expect(addedFeed.url).toBe('https://calendar.google.com/calendar/ical/abc/basic.ics');
      expect(addedFeed.eventsCount).toBe(3);
      expect(addedFeed.lastError).toBeNull();
      expect(listCalendarFeeds(ctx.db)).toHaveLength(1);

      // 3. List external events in date range
      const eventsInRange = listExternalCalendarEventsService(ctx.db, {
        dateFrom: '2026-11-16',
        dateTo: '2026-11-18',
      });
      expect(eventsInRange.map((e) => e.uid)).toEqual([
        'gcal-allday-1@google.com',
        'gcal-timed-2@google.com',
      ]);

      // 4. Sync feed error isolation + recovery
      const failingFetch = vi.fn(async () => {
        return new Response('Forbidden', { status: 403, statusText: 'Forbidden' });
      }) as unknown as typeof fetch;
      const syncedWithError = await syncAllCalendarFeedsService(ctx.db, {
        fetchFn: failingFetch,
      });
      expect(syncedWithError[0].lastError).toMatch(/403/);

      const syncedOk = await syncAllCalendarFeedsService(ctx.db, {
        fetchFn: fetchMock,
      });
      expect(syncedOk[0].lastError).toBeNull();
      expect(syncedOk[0].eventsCount).toBe(3);

      // Remove feed clears external events
      removeCalendarFeedService(ctx.db, addedFeed.id);
      expect(listCalendarFeeds(ctx.db)).toHaveLength(0);
      expect(listExternalCalendarEventsService(ctx.db)).toEqual([]);

      // 5. Google Calendar connection & mappings (1st sync creates, 2nd sync updates)
      await expect(syncGoogleCalendarNowService(ctx.db)).rejects.toThrow(
        /Conectá una cuenta/i
      );

      const connected = await connectGoogleCalendarService(ctx.db, {
        email: 'alumno@uade.edu.ar',
        clientId: '123456.apps.googleusercontent.com',
      });
      expect(connected.isConnected).toBe(true);
      expect(connected.connectedEmail).toBe('alumno@uade.edu.ar');

      const firstSync = await syncGoogleCalendarNowService(ctx.db);
      expect(firstSync.mode).toBe('local-loopback-simulated');
      expect(firstSync.createdCount).toBe(3);
      expect(firstSync.updatedCount).toBe(0);
      expect(firstSync.totalMappedCount).toBe(3);

      const mappingsAfterFirst = listGoogleCalendarMappings(ctx.db, 'primary');
      expect(mappingsAfterFirst).toHaveLength(3);
      expect(mappingsAfterFirst.map((m) => m.entityType).sort()).toEqual([
        'exam',
        'schedule',
        'task',
      ]);

      const secondSync = await syncGoogleCalendarNowService(ctx.db);
      expect(secondSync.createdCount).toBe(0);
      expect(secondSync.updatedCount).toBe(3);
      expect(secondSync.totalMappedCount).toBe(3);

      const mappingsAfterSecond = listGoogleCalendarMappings(ctx.db, 'primary');
      expect(mappingsAfterSecond.map((m) => m.googleEventId)).toEqual(
        mappingsAfterFirst.map((m) => m.googleEventId)
      );

      // 6. Real Google Calendar REST API mode when OAuth tokens are saved
      saveGoogleCalendarTokens(ctx.db, {
        accessToken: 'ya29.test-access-token',
        refreshToken: '1//test-refresh-token',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        tokenType: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar.events',
      });
      updateGoogleCalendarConfig(ctx.db, { targetCalendarId: 'cursada-cal' });

      let apiSeq = 1;
      const googleApiFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (method === 'POST') {
          return new Response(
            JSON.stringify({ id: `google-evt-${apiSeq++}`, etag: '"etag-1"' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ id: 'google-evt-1', etag: '"etag-2"' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as unknown as typeof fetch;

      const apiFirstSync = await syncGoogleCalendarNowService(ctx.db, {
        fetchFn: googleApiFetch,
      });
      expect(apiFirstSync.mode).toBe('google-api');
      expect(apiFirstSync.createdCount).toBe(3);
      expect(apiFirstSync.updatedCount).toBe(0);

      const apiSecondSync = await syncGoogleCalendarNowService(ctx.db, {
        fetchFn: googleApiFetch,
      });
      expect(apiSecondSync.mode).toBe('google-api');
      expect(apiSecondSync.createdCount).toBe(0);
      expect(apiSecondSync.updatedCount).toBe(3);

      const disconnected = disconnectGoogleCalendarService(ctx.db);
      expect(disconnected.isConnected).toBe(false);
      expect(disconnected.connectedEmail).toBeNull();
      expect(getGoogleCalendarConfig(ctx.db).isConnected).toBe(false);
    } finally {
      ctx.close();
    }
  });

  it('builds valid PKCE pair and completes OAuth2 loopback callback flow on 127.0.0.1', async () => {
    const pkce = buildPkceChallengePair();
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    const expectedChallenge = createHash('sha256')
      .update(pkce.codeVerifier)
      .digest('base64url');
    expect(pkce.codeChallenge).toBe(expectedChallenge);

    const dispatchLoopbackRequest = (
      server: http.Server,
      requestPath: string
    ): { statusCode: number; body: string } => {
      let statusCode = 0;
      let body = '';
      const fakeReq = { url: requestPath } as http.IncomingMessage;
      const fakeRes = {
        writeHead(code: number) {
          statusCode = code;
          return this;
        },
        end(chunk?: string) {
          body = chunk ?? '';
          return this;
        },
      } as unknown as http.ServerResponse;
      server.emit('request', fakeReq, fakeRes);
      return { statusCode, body };
    };

    // Direct loopback server test
    const loopback = await startGoogleOAuthLoopbackServer({
      expectedState: 'state-xyz',
      timeoutMs: 5000,
    });
    expect(loopback.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    const callbackResponse = dispatchLoopbackRequest(
      loopback.server,
      '/callback?code=auth-code-123&state=state-xyz'
    );
    expect(callbackResponse.statusCode).toBe(200);
    expect(callbackResponse.body).toContain('Cuenta conectada a Cursada');
    const received = await loopback.waitForCode;
    expect(received).toEqual({ code: 'auth-code-123', state: 'state-xyz' });
    await loopback.close();

    // State mismatch rejection test
    const loopbackMismatch = await startGoogleOAuthLoopbackServer({
      expectedState: 'expected-state',
      timeoutMs: 5000,
    });
    const mismatchRes = dispatchLoopbackRequest(
      loopbackMismatch.server,
      '/callback?code=abc&state=wrong-state'
    );
    expect(mismatchRes.statusCode).toBe(400);
    await expect(loopbackMismatch.waitForCode).rejects.toThrow(/state/i);
    await loopbackMismatch.close();

    // End-to-end connectGoogleCalendarService OAuth2 PKCE flow
    const ctx = openDatabase({ inMemory: true, runStartupBackup: false });
    tempDirs.push(ctx.dataDir);

    try {
      const oauthFetch = vi.fn(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes('oauth2.googleapis.com/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'ya29.pkce-token',
              refresh_token: '1//pkce-refresh',
              expires_in: 3600,
              token_type: 'Bearer',
              scope: 'https://www.googleapis.com/auth/calendar.events',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ email: 'pkce.user@gmail.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      let activeLoopback: Awaited<ReturnType<typeof startGoogleOAuthLoopbackServer>> | null =
        null;

      const config = await connectGoogleCalendarService(
        ctx.db,
        { clientId: 'desktop-client-id.apps.googleusercontent.com' },
        {
          fetchFn: oauthFetch,
          timeoutMs: 5000,
          startLoopbackServer: async (opts) => {
            activeLoopback = await startGoogleOAuthLoopbackServer(opts);
            return activeLoopback;
          },
          openExternalUrl: async (authUrl) => {
            const parsed = new URL(authUrl);
            const state = parsed.searchParams.get('state')!;
            expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
            expect(parsed.searchParams.get('redirect_uri')).toBe(
              activeLoopback?.redirectUri
            );
            const res = dispatchLoopbackRequest(
              activeLoopback!.server,
              `/callback?code=oauth-live-code&state=${state}`
            );
            expect(res.statusCode).toBe(200);
          },
        }
      );

      expect(config.isConnected).toBe(true);
      expect(config.connectedEmail).toBe('pkce.user@gmail.com');
    } finally {
      ctx.close();
    }
  });

  it('registers all 11 calendarSync:* IPC handlers', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-test-ipc-'));
    tempDirs.push(tempDir);
    process.env.CURSADA_DATA_DIR = tempDir;

    registerCalendarSyncHandlers();

    const expectedChannels = [
      'calendarSync:exportIcs',
      'calendarSync:listFeeds',
      'calendarSync:addFeed',
      'calendarSync:removeFeed',
      'calendarSync:syncFeeds',
      'calendarSync:listExternalEvents',
      'calendarSync:getGoogleConfig',
      'calendarSync:updateGoogleConfig',
      'calendarSync:connectGoogle',
      'calendarSync:disconnectGoogle',
      'calendarSync:syncGoogleNow',
    ];

    for (const channel of expectedChannels) {
      expect(ipcHandleMap.get(channel)).toBeTypeOf('function');
    }

    try {
      const exportHandler = ipcHandleMap.get('calendarSync:exportIcs')!;
      saveDialogMockResult = { canceled: true };
      const canceledRes = await exportHandler({});
      expect(canceledRes).toMatchObject({ canceled: true, eventsCount: 0 });

      const directIcsPath = path.join(tempDir, 'ipc-export.ics');
      const writtenRes = await exportHandler({}, { targetPath: directIcsPath });
      expect(writtenRes).toMatchObject({
        canceled: false,
        filePath: directIcsPath,
        mode: 'filesystem',
      });
      expect(fs.existsSync(directIcsPath)).toBe(true);

      const getConfigHandler = ipcHandleMap.get('calendarSync:getGoogleConfig')!;
      expect(getConfigHandler({})).toMatchObject({
        isConnected: false,
        targetCalendarId: 'primary',
      });
    } finally {
      getAppDatabase().close();
    }
  });

  it('renders <CalendarSyncSettingsSection /> and handles .ics export, feed management, and Google Calendar sync', async () => {
    window.cursadaApi = {
      exportCalendarIcs: mockExportCalendarIcs,
      listCalendarFeeds: mockListCalendarFeeds,
      addCalendarFeed: mockAddCalendarFeed,
      removeCalendarFeed: mockRemoveCalendarFeed,
      syncCalendarFeeds: mockSyncCalendarFeeds,
      listExternalCalendarEvents: mockListExternalCalendarEvents,
      getGoogleCalendarConfig: mockGetGoogleCalendarConfig,
      updateGoogleCalendarConfig: mockUpdateGoogleCalendarConfig,
      connectGoogleCalendar: mockConnectGoogleCalendar,
      disconnectGoogleCalendar: mockDisconnectGoogleCalendar,
      syncGoogleCalendarNow: mockSyncGoogleCalendarNow,
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        return new Response(SAMPLE_GOOGLE_ICS, {
          status: 200,
          headers: { 'Content-Type': 'text/calendar' },
        });
      });

    render(<CalendarSyncSettingsSection />);

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Sincronización de Calendario',
      })
    ).toBeInTheDocument();

    // 1. Export .ics
    fireEvent.click(screen.getByTestId('export-ics-btn'));
    const exportStatus = await screen.findByTestId('export-ics-status');
    expect(exportStatus).toHaveTextContent(/Archivo \.ics exportado/i);
    expect(exportStatus).toHaveTextContent(/\(\d+ eventos/i);

    // 2. Add .ics feed, refresh, and remove
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Feriados y eventos' },
    });
    fireEvent.change(screen.getByLabelText('URL privada (.ics)'), {
      target: { value: 'https://calendar.google.com/calendar/ical/demo/basic.ics' },
    });
    fireEvent.click(screen.getByTestId('add-feed-btn'));

    const feedsList = await screen.findByTestId('calendar-feeds-list');
    expect(within(feedsList).getByText('Feriados y eventos')).toBeInTheDocument();
    expect(within(feedsList).getByText(/3 eventos/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sync-feeds-btn'));
    expect(await screen.findByTestId('feed-sync-notice')).toHaveTextContent(
      /Feeds actualizados \(1\)/i
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fireEvent.click(
      within(feedsList).getByRole('button', { name: 'Quitar Feriados y eventos' })
    );
    await waitFor(() => {
      expect(screen.queryByTestId('calendar-feeds-list')).not.toBeInTheDocument();
    });

    // 3. Configure, connect, toggle auto-sync, sync twice, and disconnect Google Calendar
    fireEvent.change(screen.getByLabelText('Client ID OAuth2 Desktop'), {
      target: { value: '999888777.apps.googleusercontent.com' },
    });
    fireEvent.change(screen.getByLabelText('ID de calendario destino'), {
      target: { value: 'cursada-uade' },
    });
    fireEvent.click(screen.getByTestId('save-google-config-btn'));

    await waitFor(() => {
      expect(screen.getByLabelText('ID de calendario destino')).toHaveValue(
        'cursada-uade'
      );
    });

    fireEvent.click(screen.getByTestId('connect-google-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('google-connection-status')).toHaveTextContent(
        /Conectado · estudiante@uade\.edu\.ar/i
      );
    });

    const autoSyncSwitch = screen.getByRole('switch', {
      name: 'Sincronización automática con Google Calendar',
    });
    expect(autoSyncSwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(autoSyncSwitch);
    await waitFor(() => {
      expect(autoSyncSwitch).toHaveAttribute('aria-checked', 'true');
    });

    // First sync creates events
    fireEvent.click(screen.getByTestId('sync-google-now-btn'));
    const firstSummary = await screen.findByTestId('google-sync-summary');
    expect(firstSummary).toHaveTextContent(/\d+ creados · 0 actualizados/i);

    // Second sync updates existing mappings
    fireEvent.click(screen.getByTestId('sync-google-now-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('google-sync-summary')).toHaveTextContent(
        /0 creados · \d+ actualizados/i
      );
    });

    // Disconnect
    fireEvent.click(screen.getByTestId('disconnect-google-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('google-connection-status')).toHaveTextContent(
        'Desconectado'
      );
    });
  });
});
