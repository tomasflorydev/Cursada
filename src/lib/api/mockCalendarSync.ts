import type {
  CalendarFeed,
  CourseWithSchedules,
  CreateCalendarFeedInput,
  ExamWithCourse,
  ExportIcsInput,
  ExportIcsResult,
  ExternalCalendarEvent,
  GoogleCalendarSyncConfig,
  GoogleCalendarSyncResult,
  TaskWithCourse,
  UpdateGoogleCalendarConfigInput,
} from '../../types/domain';
import { buildIcsCalendar, parseIcsCalendar } from '../calendar/icsParserAndBuilder';
import { mockGetCourse, mockListCourses } from './mockCourses';
import { mockListExams } from './mockExams';
import { mockListTasks } from './mockTasks';

interface MockFeedEntry {
  feed: CalendarFeed;
  rawIcs: string;
  isOverride: boolean;
}

interface MockGoogleMapping {
  entityType: 'schedule' | 'task' | 'exam';
  entityId: string;
  googleCalendarId: string;
  googleEventId: string;
  lastSyncedAt: string;
}

const DEFAULT_MOCK_GOOGLE_CONFIG: GoogleCalendarSyncConfig = {
  clientId: '',
  connectedEmail: null,
  isConnected: false,
  targetCalendarId: 'primary',
  autoSyncEnabled: false,
  lastSyncedAt: null,
  lastSyncSummary: null,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let feedsStore: MockFeedEntry[] = [];
let nextFeedSeq = 1;
let googleConfigStore: GoogleCalendarSyncConfig = structuredClone(
  DEFAULT_MOCK_GOOGLE_CONFIG
);
let googleMappingsStore = new Map<string, MockGoogleMapping>();

export function resetMockCalendarSync(): void {
  feedsStore = [];
  nextFeedSeq = 1;
  googleConfigStore = structuredClone(DEFAULT_MOCK_GOOGLE_CONFIG);
  googleMappingsStore = new Map<string, MockGoogleMapping>();
}

function triggerBrowserIcsDownload(filename: string, content: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

function normalizeFeedUrl(rawUrl: string): string {
  if (typeof rawUrl !== 'string') {
    throw new Error('La URL del calendario debe ser un texto válido.');
  }
  let trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('La URL del calendario .ics no puede estar vacía.');
  }
  if (/^webcal:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed.slice('webcal://'.length)}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `La URL "${trimmed}" no es válida. Usá una dirección https:// o webcal://.`
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Protocolo no soportado ("${parsed.protocol}"). Usá https://, http:// o webcal://.`
    );
  }
  if (!parsed.hostname) {
    throw new Error('La URL del calendario debe incluir un dominio válido.');
  }
  return parsed.toString();
}

export async function mockExportCalendarIcs(
  input?: ExportIcsInput
): Promise<ExportIcsResult> {
  const courseId = input?.courseId?.trim();

  let courses: CourseWithSchedules[];
  let tasks: TaskWithCourse[];
  let exams: ExamWithCourse[];
  let calendarName = 'Cursada';

  if (courseId) {
    const course = await mockGetCourse(courseId);
    if (!course) {
      throw new Error(`No se encontró la materia: ${courseId}`);
    }
    courses = [course];
    [tasks, exams] = await Promise.all([
      mockListTasks({ courseId }),
      mockListExams({ courseId }),
    ]);
    calendarName = `Cursada · ${course.name}`;
  } else {
    courses = await mockListCourses({ status: 'active' });
    const activeIds = new Set(courses.map((c) => c.id));
    const [allTasks, allExams] = await Promise.all([
      mockListTasks(),
      mockListExams(),
    ]);
    tasks = allTasks.filter((t) => activeIds.has(t.courseId));
    exams = allExams.filter((e) => activeIds.has(e.courseId));
  }

  const { icsContent, eventsCount } = buildIcsCalendar({
    courses,
    tasks,
    exams,
    calendarName,
    includeSchedules: input?.includeSchedules ?? true,
    includeTasks: input?.includeTasks ?? true,
    includeExams: input?.includeExams ?? true,
  });

  const filename = 'cursada-calendario.ics';
  triggerBrowserIcsDownload(filename, icsContent);

  return {
    canceled: false,
    filePath: input?.targetPath ?? filename,
    icsContent,
    eventsCount,
    mode: 'download',
  };
}

export async function mockListCalendarFeeds(): Promise<CalendarFeed[]> {
  return structuredClone(feedsStore.map((entry) => entry.feed));
}

export async function mockAddCalendarFeed(
  input: CreateCalendarFeedInput
): Promise<CalendarFeed> {
  const name = (input.name ?? '').trim();
  if (!name) {
    throw new Error('Ingresá un nombre para la suscripción de calendario.');
  }

  const normalizedUrl = normalizeFeedUrl(input.url);
  const feedId = `feed-${nextFeedSeq++}`;
  const isOverride = input.rawIcsOverride !== undefined;
  let rawIcs: string;

  if (isOverride) {
    rawIcs = input.rawIcsOverride ?? '';
  } else {
    if (typeof globalThis.fetch !== 'function') {
      throw new Error('fetch no está disponible para descargar el feed .ics.');
    }
    const response = await globalThis.fetch(normalizedUrl, {
      method: 'GET',
      headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8' },
    });
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al descargar el feed iCal.`);
    }
    rawIcs = await response.text();
  }

  if (!rawIcs.toUpperCase().includes('BEGIN:VCALENDAR')) {
    throw new Error('El contenido no es un calendario iCalendar (.ics) válido.');
  }

  const events = parseIcsCalendar(rawIcs, { feedId, feedName: name });
  const now = new Date().toISOString();
  const feed: CalendarFeed = {
    id: feedId,
    name,
    url: normalizedUrl,
    enabled: true,
    lastSyncedAt: now,
    lastError: null,
    eventsCount: events.length,
    createdAt: now,
    updatedAt: now,
  };

  feedsStore.push({ feed, rawIcs, isOverride });
  return structuredClone(feed);
}

export async function mockRemoveCalendarFeed(feedId: string): Promise<void> {
  feedsStore = feedsStore.filter((entry) => entry.feed.id !== feedId);
}

export async function mockSyncCalendarFeeds(): Promise<CalendarFeed[]> {
  for (const entry of feedsStore) {
    if (!entry.feed.enabled) {
      continue;
    }

    try {
      let rawIcs = entry.rawIcs;
      if (!entry.isOverride) {
        if (typeof globalThis.fetch !== 'function') {
          throw new Error('fetch no está disponible para actualizar el feed .ics.');
        }
        const response = await globalThis.fetch(entry.feed.url, {
          method: 'GET',
          headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8' },
        });
        if (!response.ok) {
          throw new Error(
            `Error HTTP ${response.status} al actualizar el feed iCal.`
          );
        }
        rawIcs = await response.text();
      }

      if (!rawIcs.toUpperCase().includes('BEGIN:VCALENDAR')) {
        throw new Error('El contenido no es un archivo iCalendar (.ics) válido.');
      }

      const events = parseIcsCalendar(rawIcs, {
        feedId: entry.feed.id,
        feedName: entry.feed.name,
      });
      const now = new Date().toISOString();
      entry.rawIcs = rawIcs;
      entry.feed = {
        ...entry.feed,
        lastSyncedAt: now,
        lastError: null,
        eventsCount: events.length,
        updatedAt: now,
      };
    } catch (err: unknown) {
      const now = new Date().toISOString();
      entry.feed = {
        ...entry.feed,
        lastError:
          err instanceof Error
            ? err.message
            : 'No se pudo actualizar la suscripción .ics.',
        updatedAt: now,
      };
    }
  }

  return structuredClone(feedsStore.map((entry) => entry.feed));
}

export async function mockListExternalCalendarEvents(opts?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<ExternalCalendarEvent[]> {
  const events: ExternalCalendarEvent[] = [];

  for (const entry of feedsStore) {
    if (!entry.feed.enabled || !entry.rawIcs.trim()) {
      continue;
    }
    events.push(
      ...parseIcsCalendar(
        entry.rawIcs,
        { feedId: entry.feed.id, feedName: entry.feed.name },
        opts
      )
    );
  }

  events.sort((a, b) => {
    const dateCmp = a.dateIso.localeCompare(b.dateIso);
    if (dateCmp !== 0) return dateCmp;
    const timeCmp = (a.startTime ?? '').localeCompare(b.startTime ?? '');
    if (timeCmp !== 0) return timeCmp;
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) return titleCmp;
    return a.id.localeCompare(b.id);
  });

  return structuredClone(events);
}

export async function mockGetGoogleCalendarConfig(): Promise<GoogleCalendarSyncConfig> {
  return structuredClone(googleConfigStore);
}

export async function mockUpdateGoogleCalendarConfig(
  input: UpdateGoogleCalendarConfigInput
): Promise<GoogleCalendarSyncConfig> {
  if (input.clientId !== undefined) {
    const trimmed = input.clientId.trim();
    if (trimmed && /\s/.test(trimmed)) {
      throw new Error('El Client ID no puede contener espacios.');
    }
    googleConfigStore.clientId = trimmed;
  }

  if (input.targetCalendarId !== undefined) {
    const trimmed = input.targetCalendarId.trim();
    if (!trimmed) {
      throw new Error('El ID de calendario de Google no puede estar vacío.');
    }
    if (/\s/.test(trimmed)) {
      throw new Error('El ID de calendario no puede contener espacios.');
    }
    googleConfigStore.targetCalendarId = trimmed;
  }

  if (input.autoSyncEnabled !== undefined) {
    googleConfigStore.autoSyncEnabled = Boolean(input.autoSyncEnabled);
  }

  if (input.connectedEmail !== undefined) {
    if (input.connectedEmail === null || input.connectedEmail.trim() === '') {
      googleConfigStore.connectedEmail = null;
      googleConfigStore.isConnected = false;
    } else {
      const trimmedEmail = input.connectedEmail.trim();
      if (!EMAIL_REGEX.test(trimmedEmail)) {
        throw new Error(`El correo "${trimmedEmail}" no es válido.`);
      }
      googleConfigStore.connectedEmail = trimmedEmail;
      googleConfigStore.isConnected = true;
    }
  }

  return structuredClone(googleConfigStore);
}

export async function mockConnectGoogleCalendar(opts?: {
  email?: string;
  clientId?: string;
}): Promise<GoogleCalendarSyncConfig> {
  if (opts?.clientId !== undefined) {
    const trimmedClient = opts.clientId.trim();
    if (trimmedClient && /\s/.test(trimmedClient)) {
      throw new Error('El Client ID no puede contener espacios.');
    }
    googleConfigStore.clientId = trimmedClient;
  }

  const email = opts?.email?.trim() || 'estudiante@uade.edu.ar';
  if (!EMAIL_REGEX.test(email)) {
    throw new Error(`El correo "${email}" no es válido.`);
  }

  googleConfigStore.connectedEmail = email;
  googleConfigStore.isConnected = true;
  return structuredClone(googleConfigStore);
}

export async function mockDisconnectGoogleCalendar(): Promise<GoogleCalendarSyncConfig> {
  googleConfigStore.connectedEmail = null;
  googleConfigStore.isConnected = false;
  googleConfigStore.lastSyncSummary = null;
  return structuredClone(googleConfigStore);
}

export async function mockSyncGoogleCalendarNow(): Promise<GoogleCalendarSyncResult> {
  if (!googleConfigStore.isConnected) {
    throw new Error('Conectá una cuenta de Google antes de sincronizar.');
  }

  const calendarId = googleConfigStore.targetCalendarId || 'primary';
  const courses = await mockListCourses({ status: 'active' });
  const activeIds = new Set(courses.map((c) => c.id));
  const [allTasks, allExams] = await Promise.all([
    mockListTasks(),
    mockListExams(),
  ]);
  const tasks = allTasks.filter((t) => activeIds.has(t.courseId) && Boolean(t.dueDate));
  const exams = allExams.filter((e) => activeIds.has(e.courseId));

  const entities: Array<{
    entityType: 'schedule' | 'task' | 'exam';
    entityId: string;
  }> = [];

  for (const course of courses) {
    for (const sched of course.schedules) {
      entities.push({ entityType: 'schedule', entityId: sched.id });
    }
  }
  for (const task of tasks) {
    entities.push({ entityType: 'task', entityId: task.id });
  }
  for (const exam of exams) {
    entities.push({ entityType: 'exam', entityId: exam.id });
  }

  const now = new Date().toISOString();
  let createdCount = 0;
  let updatedCount = 0;

  for (const entity of entities) {
    const key = `${calendarId}:${entity.entityType}:${entity.entityId}`;
    const existing = googleMappingsStore.get(key);
    if (existing) {
      googleMappingsStore.set(key, {
        ...existing,
        lastSyncedAt: now,
      });
      updatedCount += 1;
    } else {
      googleMappingsStore.set(key, {
        entityType: entity.entityType,
        entityId: entity.entityId,
        googleCalendarId: calendarId,
        googleEventId: `cursada_${entity.entityType}_${entity.entityId}`,
        lastSyncedAt: now,
      });
      createdCount += 1;
    }
  }

  const totalMappedCount = Array.from(googleMappingsStore.values()).filter(
    (m) => m.googleCalendarId === calendarId
  ).length;
  const summary = `${createdCount} creados · ${updatedCount} actualizados (${totalMappedCount} mapeados)`;

  googleConfigStore.lastSyncedAt = now;
  googleConfigStore.lastSyncSummary = summary;

  return {
    syncedAt: now,
    createdCount,
    updatedCount,
    totalMappedCount,
    calendarId,
    mode: 'local-loopback-simulated',
    summary,
  };
}
