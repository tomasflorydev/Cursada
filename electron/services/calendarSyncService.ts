import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  deleteCalendarFeed,
  getGoogleCalendarConfig,
  getGoogleCalendarTokens,
  listCalendarFeeds,
  listEnabledFeedCaches,
  listGoogleCalendarMappings,
  saveGoogleCalendarTokens,
  updateCalendarFeedSyncResult,
  updateGoogleCalendarConfig,
  upsertCalendarFeed,
  upsertGoogleCalendarMapping,
  type GoogleCalendarMapping,
  type GoogleCalendarMappingEntityType,
  type GoogleCalendarTokens,
} from '../db/calendarSyncRepo.js';
import { getCourseById, listCourses } from '../db/coursesRepo.js';
import { listExams } from '../db/examsRepo.js';
import { listTasks } from '../db/tasksRepo.js';
import type {
  CalendarFeed,
  CourseWithSchedules,
  CreateCalendarFeedInput,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  ExportIcsInput,
  ExportIcsResult,
  ExternalCalendarEvent,
  GoogleCalendarSyncConfig,
  GoogleCalendarSyncResult,
  TaskPriority,
  TaskWithCourse,
} from '../types.js';

const GOOGLE_OAUTH_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

const DAY_OF_WEEK_TO_BYDAY: Record<DayOfWeek, string> = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU',
};

const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'TP',
};

const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const utf8Encoder = new TextEncoder();

function isValidCalendarDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_REGEX.exec(value);
  if (!match) {
    return false;
  }
  return isValidCalendarDateParts(
    Number(match[1]),
    Number(match[2]),
    Number(match[3])
  );
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  const yyyy = String(utc.getUTCFullYear()).padStart(4, '0');
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isoDateToCompact(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

function toLocalIsoDate(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMondayOfWeekLocal(referenceDate: Date): Date {
  const copy = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const jsDay = copy.getDay();
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  copy.setDate(copy.getDate() + diffToMonday);
  return copy;
}

function formatUtcTimestamp(date: Date): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
}

function escapeIcsText(value: string): string {
  return (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function unescapeIcsText(value: string): string {
  return (value ?? '').replace(/\\([\\,;nN])/g, (_match, char: string) => {
    if (char === 'n' || char === 'N') {
      return '\n';
    }
    return char;
  });
}

function foldIcsLine(line: string): string {
  const maxBytesFirst = 75;
  if (utf8Encoder.encode(line).length <= maxBytesFirst) {
    return line;
  }

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const ch of line) {
    const chBytes = utf8Encoder.encode(ch).length;
    if (currentBytes + chBytes > maxBytesFirst && current.length > 0) {
      chunks.push(current);
      current = ` ${ch}`;
      currentBytes = 1 + chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.join('\r\n');
}

function parseTimeToMinutes(time: string): number | null {
  const match = TIME_HH_MM_REGEX.exec(time.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToCompactTime(totalMinutes: number): string {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}${mm}00`;
}

function minutesToIsoTime(totalMinutes: number): string {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

export function buildIcsFromEntities(params: {
  courses: CourseWithSchedules[];
  tasks: TaskWithCourse[];
  exams: ExamWithCourse[];
  calendarName?: string;
  includeSchedules?: boolean;
  includeTasks?: boolean;
  includeExams?: boolean;
  referenceDate?: Date;
}): { icsContent: string; eventsCount: number } {
  const includeSchedules = params.includeSchedules ?? true;
  const includeTasks = params.includeTasks ?? true;
  const includeExams = params.includeExams ?? true;
  const calendarName = params.calendarName?.trim() || 'Cursada';
  const referenceDate =
    params.referenceDate && !Number.isNaN(params.referenceDate.getTime())
      ? params.referenceDate
      : new Date();

  const dtStamp = formatUtcTimestamp(referenceDate);
  const mondayIso = toLocalIsoDate(getMondayOfWeekLocal(referenceDate));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cursada//Calendar//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  let eventsCount = 0;

  if (includeSchedules) {
    for (const course of params.courses) {
      for (const sched of course.schedules) {
        const startMin = parseTimeToMinutes(sched.startTime);
        const endMin = parseTimeToMinutes(sched.endTime);
        const byDay = DAY_OF_WEEK_TO_BYDAY[sched.dayOfWeek];
        if (startMin === null || endMin === null || startMin >= endMin || !byDay) {
          continue;
        }

        const eventDateIso = addDaysToIsoDate(mondayIso, sched.dayOfWeek - 1);
        const compactDate = isoDateToCompact(eventDateIso);
        const descParts = ['Cursada semanal'];
        if (course.professor.trim()) {
          descParts.push(`Docente: ${course.professor.trim()}`);
        }
        if (course.term.trim()) {
          descParts.push(`Período: ${course.term.trim()}`);
        }

        lines.push('BEGIN:VEVENT');
        lines.push(`UID:cursada-schedule-${sched.id}@cursada.app`);
        lines.push(`DTSTAMP:${dtStamp}`);
        lines.push(`DTSTART:${compactDate}T${minutesToCompactTime(startMin)}`);
        lines.push(`DTEND:${compactDate}T${minutesToCompactTime(endMin)}`);
        lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`);
        lines.push(`SUMMARY:${escapeIcsText(course.name)}`);
        if (sched.location.trim()) {
          lines.push(`LOCATION:${escapeIcsText(sched.location.trim())}`);
        }
        lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
        lines.push('CATEGORIES:CLASE');
        lines.push('END:VEVENT');
        eventsCount += 1;
      }
    }
  }

  if (includeTasks) {
    for (const task of params.tasks) {
      if (!task.dueDate || !isValidIsoDate(task.dueDate)) {
        continue;
      }

      const startCompact = isoDateToCompact(task.dueDate);
      const endCompact = isoDateToCompact(addDaysToIsoDate(task.dueDate, 1));
      const descParts = [
        `Materia: ${task.courseName}`,
        `Estado: ${task.status === 'done' ? 'Completada' : 'Pendiente'}`,
      ];
      if (task.priority) {
        descParts.push(`Prioridad: ${TASK_PRIORITY_LABELS[task.priority] ?? task.priority}`);
      }
      if (task.description.trim()) {
        descParts.push(task.description.trim());
      }

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:cursada-task-${task.id}@cursada.app`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART;VALUE=DATE:${startCompact}`);
      lines.push(`DTEND;VALUE=DATE:${endCompact}`);
      lines.push(`SUMMARY:${escapeIcsText(`Entrega: ${task.title}`)}`);
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
      lines.push('CATEGORIES:TAREA');
      lines.push('END:VEVENT');
      eventsCount += 1;
    }
  }

  if (includeExams) {
    for (const exam of params.exams) {
      if (!isValidIsoDate(exam.examDate)) {
        continue;
      }

      const categoryLabel = EXAM_CATEGORY_LABELS[exam.category] ?? exam.category;
      const startCompactDate = isoDateToCompact(exam.examDate);
      const startMin = exam.examTime ? parseTimeToMinutes(exam.examTime) : null;

      const descParts = [`Materia: ${exam.courseName}`];
      if (exam.topics.trim()) {
        descParts.push(`Temas: ${exam.topics.trim()}`);
      }
      if (exam.grade !== null && exam.grade !== undefined) {
        descParts.push(`Nota: ${exam.grade}`);
      }

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:cursada-exam-${exam.id}@cursada.app`);
      lines.push(`DTSTAMP:${dtStamp}`);

      if (startMin !== null) {
        const totalEndMin = startMin + 120;
        const extraDays = Math.floor(totalEndMin / 1440);
        const endMinOfDay = totalEndMin % 1440;
        const endDateIso = addDaysToIsoDate(exam.examDate, extraDays);
        lines.push(`DTSTART:${startCompactDate}T${minutesToCompactTime(startMin)}`);
        lines.push(
          `DTEND:${isoDateToCompact(endDateIso)}T${minutesToCompactTime(endMinOfDay)}`
        );
      } else {
        const endCompactDate = isoDateToCompact(addDaysToIsoDate(exam.examDate, 1));
        lines.push(`DTSTART;VALUE=DATE:${startCompactDate}`);
        lines.push(`DTEND;VALUE=DATE:${endCompactDate}`);
      }

      lines.push(`SUMMARY:${escapeIcsText(`${categoryLabel}: ${exam.title}`)}`);
      if (exam.location.trim()) {
        lines.push(`LOCATION:${escapeIcsText(exam.location.trim())}`);
      }
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
      lines.push('CATEGORIES:EXAMEN');
      lines.push('END:VEVENT');
      eventsCount += 1;
    }
  }

  lines.push('END:VCALENDAR');

  return {
    icsContent: `${lines.map(foldIcsLine).join('\r\n')}\r\n`,
    eventsCount,
  };
}

interface ParsedProperty {
  name: string;
  params: Map<string, string>;
  value: string;
}

function splitIcsPropertyLine(line: string): ParsedProperty | null {
  let inQuotes = false;
  let colonIdx = -1;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ':' && !inQuotes) {
      colonIdx = i;
      break;
    }
  }

  if (colonIdx <= 0) {
    return null;
  }

  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const headParts = head.split(';');
  const name = headParts[0].trim().toUpperCase();
  const params = new Map<string, string>();

  for (let i = 1; i < headParts.length; i++) {
    const segment = headParts[i];
    const eqIdx = segment.indexOf('=');
    if (eqIdx <= 0) {
      continue;
    }
    const pKey = segment.slice(0, eqIdx).trim().toUpperCase();
    let pVal = segment.slice(eqIdx + 1).trim();
    if (pVal.startsWith('"') && pVal.endsWith('"') && pVal.length >= 2) {
      pVal = pVal.slice(1, -1);
    }
    params.set(pKey, pVal);
  }

  return { name, params, value };
}

function parseIcsDateTime(
  rawValue: string,
  params: Map<string, string>
): { dateIso: string; time: string | null; isAllDay: boolean } | null {
  const trimmed = rawValue.trim();
  const valueType = params.get('VALUE')?.toUpperCase();

  const dateOnlyMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch || valueType === 'DATE') {
    const match = /^(\d{4})(\d{2})(\d{2})/.exec(trimmed);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDateParts(year, month, day)) {
      return null;
    }
    return {
      dateIso: `${match[1]}-${match[2]}-${match[3]}`,
      time: null,
      isAllDay: true,
    };
  }

  const utcMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?Z$/i.exec(trimmed);
  if (utcMatch) {
    const year = Number(utcMatch[1]);
    const month = Number(utcMatch[2]);
    const day = Number(utcMatch[3]);
    const hour = Number(utcMatch[4]);
    const minute = Number(utcMatch[5]);
    const second = Number(utcMatch[6] ?? '0');

    if (
      !isValidCalendarDateParts(year, month, day) ||
      hour > 23 ||
      minute > 59 ||
      second > 59
    ) {
      return null;
    }

    const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return {
      dateIso: toLocalIsoDate(utcDate),
      time: `${String(utcDate.getHours()).padStart(2, '0')}:${String(
        utcDate.getMinutes()
      ).padStart(2, '0')}`,
      isAllDay: false,
    };
  }

  const localMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(trimmed);
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4]);
    const minute = Number(localMatch[5]);
    const second = Number(localMatch[6] ?? '0');

    if (
      !isValidCalendarDateParts(year, month, day) ||
      hour > 23 ||
      minute > 59 ||
      second > 59
    ) {
      return null;
    }

    return {
      dateIso: `${localMatch[1]}-${localMatch[2]}-${localMatch[3]}`,
      time: `${localMatch[4]}:${localMatch[5]}`,
      isAllDay: false,
    };
  }

  return null;
}

export function parseIcsText(
  rawIcs: string,
  feedInfo: { feedId: string; feedName: string },
  range?: { dateFrom?: string; dateTo?: string }
): ExternalCalendarEvent[] {
  if (!rawIcs || typeof rawIcs !== 'string') {
    return [];
  }

  const unfolded = rawIcs
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');

  const lines = unfolded.split('\n');
  const events: ExternalCalendarEvent[] = [];
  const seenIds = new Set<string>();

  let inEvent = false;
  let alarmDepth = 0;
  let currentProps = new Map<string, ParsedProperty>();
  let eventIndex = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      alarmDepth = 0;
      currentProps = new Map();
      continue;
    }

    if (upper === 'END:VEVENT') {
      if (inEvent) {
        eventIndex += 1;
        const status = currentProps.get('STATUS')?.value.trim().toUpperCase();
        const dtStartProp = currentProps.get('DTSTART');

        if (status !== 'CANCELLED' && dtStartProp) {
          const parsedStart = parseIcsDateTime(dtStartProp.value, dtStartProp.params);
          if (parsedStart) {
            const dtEndProp = currentProps.get('DTEND');
            const parsedEnd = dtEndProp
              ? parseIcsDateTime(dtEndProp.value, dtEndProp.params)
              : null;

            const rawUid = currentProps.get('UID')?.value ?? '';
            const uid =
              unescapeIcsText(rawUid).trim() ||
              `event-${eventIndex}-${parsedStart.dateIso}`;
            const rawSummary = currentProps.get('SUMMARY')?.value ?? '';
            const title = unescapeIcsText(rawSummary).trim() || 'Sin título';
            const location = unescapeIcsText(
              currentProps.get('LOCATION')?.value ?? ''
            ).trim();
            const description = unescapeIcsText(
              currentProps.get('DESCRIPTION')?.value ?? ''
            ).trim();

            const startTime = parsedStart.isAllDay ? null : parsedStart.time;
            const endTime =
              parsedStart.isAllDay || !parsedEnd || parsedEnd.isAllDay
                ? null
                : parsedEnd.time;

            const inFrom = !range?.dateFrom || parsedStart.dateIso >= range.dateFrom;
            const inTo = !range?.dateTo || parsedStart.dateIso <= range.dateTo;

            if (inFrom && inTo) {
              let eventId = `${feedInfo.feedId}::${uid}`;
              if (seenIds.has(eventId)) {
                eventId = `${eventId}::${eventIndex}`;
              }
              seenIds.add(eventId);

              events.push({
                id: eventId,
                feedId: feedInfo.feedId,
                feedName: feedInfo.feedName,
                uid,
                title,
                dateIso: parsedStart.dateIso,
                startTime,
                endTime,
                location,
                description,
              });
            }
          }
        }
      }
      inEvent = false;
      alarmDepth = 0;
      currentProps = new Map();
      continue;
    }

    if (!inEvent) {
      continue;
    }

    if (upper === 'BEGIN:VALARM') {
      alarmDepth += 1;
      continue;
    }
    if (upper === 'END:VALARM') {
      if (alarmDepth > 0) {
        alarmDepth -= 1;
      }
      continue;
    }
    if (alarmDepth > 0) {
      continue;
    }

    const parsed = splitIcsPropertyLine(line);
    if (parsed) {
      currentProps.set(parsed.name, parsed);
    }
  }

  events.sort((a, b) => {
    const dateCmp = a.dateIso.localeCompare(b.dateIso);
    if (dateCmp !== 0) {
      return dateCmp;
    }
    const timeA = a.startTime ?? '';
    const timeB = b.startTime ?? '';
    const timeCmp = timeA.localeCompare(timeB);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return a.id.localeCompare(b.id);
  });

  return events;
}

export async function exportCalendarIcsService(
  db: DatabaseSync,
  input?: ExportIcsInput
): Promise<ExportIcsResult> {
  const courseId = input?.courseId?.trim();

  let courses: CourseWithSchedules[];
  let tasks: TaskWithCourse[];
  let exams: ExamWithCourse[];
  let calendarName = 'Cursada';

  if (courseId) {
    const course = getCourseById(db, courseId);
    if (!course) {
      throw new Error(`No se encontró la materia: ${courseId}`);
    }
    courses = [course];
    tasks = listTasks(db, { courseId });
    exams = listExams(db, { courseId });
    calendarName = `Cursada · ${course.name}`;
  } else {
    courses = listCourses(db, { status: 'active' });
    const activeIds = new Set(courses.map((c) => c.id));
    tasks = listTasks(db).filter((t) => activeIds.has(t.courseId));
    exams = listExams(db).filter((e) => activeIds.has(e.courseId));
  }

  const { icsContent, eventsCount } = buildIcsFromEntities({
    courses,
    tasks,
    exams,
    calendarName,
    includeSchedules: input?.includeSchedules ?? true,
    includeTasks: input?.includeTasks ?? true,
    includeExams: input?.includeExams ?? true,
  });

  const rawTargetPath = input?.targetPath?.trim();
  if (rawTargetPath) {
    const resolvedPath = path.resolve(rawTargetPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, icsContent, 'utf8');
    return {
      canceled: false,
      filePath: resolvedPath,
      icsContent,
      eventsCount,
      mode: 'filesystem',
    };
  }

  return {
    canceled: false,
    filePath: null,
    icsContent,
    eventsCount,
    mode: 'download',
  };
}

export function normalizeCalendarFeedUrl(rawUrl: string): string {
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

async function fetchIcsContent(
  url: string,
  fetchFn: typeof fetch
): Promise<string> {
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(15_000)
      : undefined;

  const response = await fetchFn(url, {
    method: 'GET',
    headers: {
      Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
    },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new Error(
      `Error HTTP ${response.status} al descargar el feed iCal (${response.statusText || 'sin detalle'}).`
    );
  }

  const rawText = await response.text();
  if (!rawText.toUpperCase().includes('BEGIN:VCALENDAR')) {
    throw new Error(
      'La respuesta no contiene un calendario iCalendar (.ics) válido.'
    );
  }

  return rawText;
}

export function listCalendarFeedsService(db: DatabaseSync): CalendarFeed[] {
  return listCalendarFeeds(db);
}

export async function addCalendarFeedService(
  db: DatabaseSync,
  input: CreateCalendarFeedInput,
  deps?: { fetchFn?: typeof fetch }
): Promise<CalendarFeed> {
  const name = (input.name ?? '').trim();
  if (!name) {
    throw new Error('Ingresá un nombre para la suscripción de calendario.');
  }

  const normalizedUrl = normalizeCalendarFeedUrl(input.url);
  const feedId = randomUUID();
  const fetchFn = deps?.fetchFn ?? globalThis.fetch;

  let rawIcs: string;
  if (input.rawIcsOverride !== undefined) {
    rawIcs = input.rawIcsOverride;
    if (!rawIcs.toUpperCase().includes('BEGIN:VCALENDAR')) {
      throw new Error('El contenido provisto no es un archivo iCalendar (.ics) válido.');
    }
  } else {
    if (typeof fetchFn !== 'function') {
      throw new Error('fetch no está disponible para descargar el feed .ics.');
    }
    rawIcs = await fetchIcsContent(normalizedUrl, fetchFn);
  }

  const events = parseIcsText(rawIcs, { feedId, feedName: name });
  const now = new Date().toISOString();

  return upsertCalendarFeed(db, {
    id: feedId,
    name,
    url: normalizedUrl,
    enabled: true,
    rawIcsCache: rawIcs,
    lastSyncedAt: now,
    lastError: null,
    eventsCount: events.length,
  });
}

export function removeCalendarFeedService(
  db: DatabaseSync,
  feedId: string
): void {
  deleteCalendarFeed(db, feedId);
}

export async function syncAllCalendarFeedsService(
  db: DatabaseSync,
  deps?: { fetchFn?: typeof fetch }
): Promise<CalendarFeed[]> {
  const feeds = listCalendarFeeds(db);
  const fetchFn = deps?.fetchFn ?? globalThis.fetch;

  for (const feed of feeds) {
    if (!feed.enabled) {
      continue;
    }

    try {
      if (typeof fetchFn !== 'function') {
        throw new Error('fetch no está disponible para sincronizar feeds.');
      }
      const rawIcs = await fetchIcsContent(feed.url, fetchFn);
      const events = parseIcsText(rawIcs, {
        feedId: feed.id,
        feedName: feed.name,
      });
      const now = new Date().toISOString();
      updateCalendarFeedSyncResult(db, feed.id, {
        rawIcsCache: rawIcs,
        lastSyncedAt: now,
        lastError: null,
        eventsCount: events.length,
      });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar la suscripción .ics.';
      updateCalendarFeedSyncResult(db, feed.id, {
        lastSyncedAt: feed.lastSyncedAt,
        lastError: errorMsg,
      });
    }
  }

  return listCalendarFeeds(db);
}

export function listExternalCalendarEventsService(
  db: DatabaseSync,
  opts?: { dateFrom?: string; dateTo?: string }
): ExternalCalendarEvent[] {
  const caches = listEnabledFeedCaches(db);
  const allEvents: ExternalCalendarEvent[] = [];

  for (const cache of caches) {
    if (!cache.rawIcsCache.trim()) {
      continue;
    }
    const parsed = parseIcsText(
      cache.rawIcsCache,
      { feedId: cache.id, feedName: cache.name },
      opts
    );
    allEvents.push(...parsed);
  }

  allEvents.sort((a, b) => {
    const dateCmp = a.dateIso.localeCompare(b.dateIso);
    if (dateCmp !== 0) {
      return dateCmp;
    }
    const timeA = a.startTime ?? '';
    const timeB = b.startTime ?? '';
    const timeCmp = timeA.localeCompare(timeB);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return a.id.localeCompare(b.id);
  });

  return allEvents;
}

export function buildPkceChallengePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function buildGoogleOAuthAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(GOOGLE_OAUTH_AUTH_ENDPOINT);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set(
    'scope',
    'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'
  );
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', params.state);
  return url.toString();
}

export interface LoopbackOAuthServerHandle {
  server: http.Server;
  redirectUri: string;
  waitForCode: Promise<{ code: string; state: string | null }>;
  close: () => Promise<void>;
}

export async function startGoogleOAuthLoopbackServer(opts?: {
  expectedState?: string;
  timeoutMs?: number;
}): Promise<LoopbackOAuthServerHandle> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  let settled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let resolveWait!: (val: { code: string; state: string | null }) => void;
  let rejectWait!: (err: Error) => void;

  const waitForCode = new Promise<{ code: string; state: string | null }>(
    (resolve, reject) => {
      resolveWait = resolve;
      rejectWait = reject;
    }
  );

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (reqUrl.pathname !== '/callback' && reqUrl.pathname !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Ruta no encontrada');
      return;
    }

    const errorParam = reqUrl.searchParams.get('error');
    const codeParam = reqUrl.searchParams.get('code');
    const stateParam = reqUrl.searchParams.get('state');

    if (errorParam) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="es"><body><h1>Autorización cancelada</h1><p>Podés cerrar esta ventana y volver a Cursada.</p></body></html>'
      );
      if (!settled) {
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        void closeServer().finally(() => {
          rejectWait(new Error(`Google OAuth rechazado: ${errorParam}`));
        });
      }
      return;
    }

    if (!codeParam) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="es"><body><h1>Falta el código de autorización</h1></body></html>'
      );
      return;
    }

    if (opts?.expectedState && stateParam !== opts.expectedState) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="es"><body><h1>Estado OAuth inválido</h1></body></html>'
      );
      if (!settled) {
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        void closeServer().finally(() => {
          rejectWait(new Error('El parámetro state de OAuth2 no coincide.'));
        });
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><html lang="es"><body><h1>Cuenta conectada a Cursada</h1><p>Ya podés cerrar esta pestaña y volver a la aplicación.</p></body></html>'
    );

    if (!settled) {
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      void closeServer().finally(() => {
        resolveWait({ code: codeParam, state: stateParam });
      });
    }
  });

  async function closeServer(): Promise<void> {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer();
    throw new Error('No se pudo obtener el puerto loopback para OAuth2.');
  }

  timeoutHandle = setTimeout(() => {
    if (!settled) {
      settled = true;
      void closeServer().finally(() => {
        rejectWait(
          new Error('Tiempo de espera agotado para completar la autenticación de Google.')
        );
      });
    }
  }, timeoutMs);
  timeoutHandle.unref();

  const redirectUri = `http://127.0.0.1:${address.port}/callback`;

  return {
    server,
    redirectUri,
    waitForCode,
    close: async () => {
      if (!settled) {
        settled = true;
        rejectWait(new Error('Servidor loopback OAuth2 cerrado antes de recibir código.'));
      }
      await closeServer();
    },
  };
}

export async function connectGoogleCalendarService(
  db: DatabaseSync,
  opts?: { email?: string; clientId?: string },
  deps?: {
    openExternalUrl?: (url: string) => Promise<void> | void;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
    startLoopbackServer?: typeof startGoogleOAuthLoopbackServer;
  }
): Promise<GoogleCalendarSyncConfig> {
  if (opts?.clientId !== undefined) {
    updateGoogleCalendarConfig(db, { clientId: opts.clientId });
  }

  const currentConfig = getGoogleCalendarConfig(db);
  const effectiveClientId = (opts?.clientId ?? currentConfig.clientId).trim();

  // Direct local/offline connection when an email is provided (tests & local setup without cloud creds)
  if (opts?.email !== undefined && opts.email.trim().length > 0) {
    return updateGoogleCalendarConfig(db, {
      clientId: effectiveClientId,
      connectedEmail: opts.email.trim(),
      isConnected: true,
    });
  }

  if (!effectiveClientId) {
    throw new Error(
      'Ingresá un Client ID OAuth2 Desktop de Google o un correo electrónico para vincular en modo local.'
    );
  }

  const fetchFn = deps?.fetchFn ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch no está disponible para completar el intercambio OAuth2.');
  }

  if (!deps?.openExternalUrl) {
    throw new Error(
      'No hay un navegador externo configurado para abrir la autorización OAuth2 de Google.'
    );
  }

  const { codeVerifier, codeChallenge } = buildPkceChallengePair();
  const state = randomBytes(16).toString('hex');
  const startLoopback = deps.startLoopbackServer ?? startGoogleOAuthLoopbackServer;
  const loopback = await startLoopback({
    expectedState: state,
    timeoutMs: deps.timeoutMs ?? 120_000,
  });

  try {
    const authUrl = buildGoogleOAuthAuthorizeUrl({
      clientId: effectiveClientId,
      redirectUri: loopback.redirectUri,
      codeChallenge,
      state,
    });

    await deps.openExternalUrl(authUrl);
    const { code } = await loopback.waitForCode;

    const tokenBody = new URLSearchParams({
      code,
      client_id: effectiveClientId,
      redirect_uri: loopback.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetchFn(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error(
        `No se pudo obtener el token OAuth2 de Google (HTTP ${tokenResponse.status}).`
      );
    }

    const tokenJson = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
    };

    if (!tokenJson.access_token) {
      throw new Error('Google OAuth2 no devolvió un access_token válido.');
    }

    const expiresAt =
      typeof tokenJson.expires_in === 'number'
        ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
        : null;

    saveGoogleCalendarTokens(db, {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      expiresAt,
      tokenType: tokenJson.token_type ?? 'Bearer',
      scope: tokenJson.scope ?? '',
    });

    let email = 'cuenta@google.oauth';
    try {
      const userRes = await fetchFn(GOOGLE_USERINFO_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
        },
      });
      if (userRes.ok) {
        const userJson = (await userRes.json()) as { email?: string };
        if (typeof userJson.email === 'string' && userJson.email.trim()) {
          email = userJson.email.trim();
        }
      }
    } catch {
      // Keep fallback email if userinfo lookup fails
    }

    return updateGoogleCalendarConfig(db, {
      clientId: effectiveClientId,
      connectedEmail: email,
      isConnected: true,
    });
  } finally {
    await loopback.close().catch(() => {});
  }
}

export function disconnectGoogleCalendarService(
  db: DatabaseSync
): GoogleCalendarSyncConfig {
  saveGoogleCalendarTokens(db, null);
  return updateGoogleCalendarConfig(db, {
    connectedEmail: null,
    isConnected: false,
    lastSyncSummary: null,
  });
}

interface SyncPayloadItem {
  entityType: GoogleCalendarMappingEntityType;
  entityId: string;
  body: Record<string, unknown>;
}

function buildGoogleEventPayloads(
  db: DatabaseSync,
  referenceDate: Date
): SyncPayloadItem[] {
  const courses = listCourses(db, { status: 'active' });
  const activeCourseIds = new Set(courses.map((c) => c.id));
  const tasks = listTasks(db).filter(
    (t) => activeCourseIds.has(t.courseId) && Boolean(t.dueDate)
  );
  const exams = listExams(db).filter((e) => activeCourseIds.has(e.courseId));

  const mondayIso = toLocalIsoDate(getMondayOfWeekLocal(referenceDate));
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'America/Argentina/Buenos_Aires';

  const payloads: SyncPayloadItem[] = [];

  for (const course of courses) {
    for (const sched of course.schedules) {
      const startMin = parseTimeToMinutes(sched.startTime);
      const endMin = parseTimeToMinutes(sched.endTime);
      const byDay = DAY_OF_WEEK_TO_BYDAY[sched.dayOfWeek];
      if (startMin === null || endMin === null || startMin >= endMin || !byDay) {
        continue;
      }

      const dateIso = addDaysToIsoDate(mondayIso, sched.dayOfWeek - 1);
      const descParts = ['Cursada semanal · Cursada'];
      if (course.professor.trim()) {
        descParts.push(`Docente: ${course.professor.trim()}`);
      }
      if (course.term.trim()) {
        descParts.push(`Período: ${course.term.trim()}`);
      }

      payloads.push({
        entityType: 'schedule',
        entityId: sched.id,
        body: {
          summary: course.name,
          location: sched.location.trim() || undefined,
          description: descParts.join('\n'),
          start: {
            dateTime: `${dateIso}T${minutesToIsoTime(startMin)}`,
            timeZone,
          },
          end: {
            dateTime: `${dateIso}T${minutesToIsoTime(endMin)}`,
            timeZone,
          },
          recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
        },
      });
    }
  }

  for (const task of tasks) {
    if (!task.dueDate || !isValidIsoDate(task.dueDate)) {
      continue;
    }
    const descParts = [
      `Materia: ${task.courseName}`,
      `Estado: ${task.status === 'done' ? 'Completada' : 'Pendiente'}`,
    ];
    if (task.description.trim()) {
      descParts.push(task.description.trim());
    }

    payloads.push({
      entityType: 'task',
      entityId: task.id,
      body: {
        summary: `Entrega: ${task.title}`,
        description: descParts.join('\n'),
        start: { date: task.dueDate },
        end: { date: addDaysToIsoDate(task.dueDate, 1) },
      },
    });
  }

  for (const exam of exams) {
    if (!isValidIsoDate(exam.examDate)) {
      continue;
    }
    const categoryLabel = EXAM_CATEGORY_LABELS[exam.category] ?? exam.category;
    const startMin = exam.examTime ? parseTimeToMinutes(exam.examTime) : null;
    const descParts = [`Materia: ${exam.courseName}`];
    if (exam.topics.trim()) {
      descParts.push(`Temas: ${exam.topics.trim()}`);
    }
    if (exam.grade !== null && exam.grade !== undefined) {
      descParts.push(`Nota: ${exam.grade}`);
    }

    let start: Record<string, string>;
    let end: Record<string, string>;
    if (startMin !== null) {
      const totalEndMin = startMin + 120;
      const extraDays = Math.floor(totalEndMin / 1440);
      const endMinOfDay = totalEndMin % 1440;
      const endDateIso = addDaysToIsoDate(exam.examDate, extraDays);
      start = {
        dateTime: `${exam.examDate}T${minutesToIsoTime(startMin)}`,
        timeZone,
      };
      end = {
        dateTime: `${endDateIso}T${minutesToIsoTime(endMinOfDay)}`,
        timeZone,
      };
    } else {
      start = { date: exam.examDate };
      end = { date: addDaysToIsoDate(exam.examDate, 1) };
    }

    payloads.push({
      entityType: 'exam',
      entityId: exam.id,
      body: {
        summary: `${categoryLabel}: ${exam.title}`,
        location: exam.location.trim() || undefined,
        description: descParts.join('\n'),
        start,
        end,
      },
    });
  }

  return payloads;
}

async function refreshAccessTokenIfNeeded(
  db: DatabaseSync,
  config: GoogleCalendarSyncConfig,
  tokens: GoogleCalendarTokens,
  fetchFn: typeof fetch
): Promise<GoogleCalendarTokens> {
  if (!tokens.expiresAt || !tokens.refreshToken || !config.clientId) {
    return tokens;
  }

  const expiresMs = Date.parse(tokens.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs - Date.now() > 60_000) {
    return tokens;
  }

  const refreshBody = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetchFn(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: refreshBody.toString(),
  });

  if (!res.ok) {
    return tokens;
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
  if (!json.access_token) {
    return tokens;
  }

  const refreshed: GoogleCalendarTokens = {
    accessToken: json.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt:
      typeof json.expires_in === 'number'
        ? new Date(Date.now() + json.expires_in * 1000).toISOString()
        : tokens.expiresAt,
    tokenType: json.token_type ?? tokens.tokenType,
    scope: json.scope ?? tokens.scope,
  };
  saveGoogleCalendarTokens(db, refreshed);
  return refreshed;
}

export async function syncGoogleCalendarNowService(
  db: DatabaseSync,
  deps?: { fetchFn?: typeof fetch; referenceDate?: Date }
): Promise<GoogleCalendarSyncResult> {
  const config = getGoogleCalendarConfig(db);
  if (!config.isConnected) {
    throw new Error('Conectá una cuenta de Google antes de sincronizar.');
  }

  const calendarId = config.targetCalendarId || 'primary';
  const referenceDate = deps?.referenceDate ?? new Date();
  const payloads = buildGoogleEventPayloads(db, referenceDate);

  const existingMappings = listGoogleCalendarMappings(db, calendarId);
  const mappingByKey = new Map<string, GoogleCalendarMapping>();
  for (const m of existingMappings) {
    mappingByKey.set(`${m.entityType}:${m.entityId}`, m);
  }

  const now = new Date().toISOString();
  let createdCount = 0;
  let updatedCount = 0;

  let tokens = getGoogleCalendarTokens(db);
  const fetchFn = deps?.fetchFn ?? globalThis.fetch;
  let mode: 'google-api' | 'local-loopback-simulated' =
    'local-loopback-simulated';

  if (tokens?.accessToken && typeof fetchFn === 'function') {
    mode = 'google-api';
    tokens = await refreshAccessTokenIfNeeded(db, config, tokens, fetchFn);
    const encodedCalId = encodeURIComponent(calendarId);

    for (const item of payloads) {
      const key = `${item.entityType}:${item.entityId}`;
      const existing = mappingByKey.get(key);

      let response: Response;
      let isUpdate = Boolean(existing);

      if (existing) {
        response = await fetchFn(
          `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodedCalId}/events/${encodeURIComponent(
            existing.googleEventId
          )}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(item.body),
          }
        );

        if (response.status === 404 || response.status === 410) {
          isUpdate = false;
          response = await fetchFn(
            `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodedCalId}/events`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(item.body),
            }
          );
        }
      } else {
        response = await fetchFn(
          `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodedCalId}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(item.body),
          }
        );
      }

      if (!response.ok) {
        throw new Error(
          `Error de Google Calendar API (${response.status}) al sincronizar ${item.entityType}:${item.entityId}.`
        );
      }

      const eventJson = (await response.json()) as {
        id?: string;
        etag?: string;
      };
      const googleEventId =
        eventJson.id ??
        existing?.googleEventId ??
        `cursada_${item.entityType}_${item.entityId}`;
      const etag = eventJson.etag ?? '';

      upsertGoogleCalendarMapping(db, {
        entityType: item.entityType,
        entityId: item.entityId,
        googleCalendarId: calendarId,
        googleEventId,
        etag,
        lastSyncedAt: now,
      });

      if (isUpdate) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }
  } else {
    for (const item of payloads) {
      const key = `${item.entityType}:${item.entityId}`;
      const existing = mappingByKey.get(key);
      const etag = createHash('sha256')
        .update(JSON.stringify(item.body))
        .digest('hex')
        .slice(0, 16);

      const googleEventId =
        existing?.googleEventId ??
        `cursada_${item.entityType}_${item.entityId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

      upsertGoogleCalendarMapping(db, {
        entityType: item.entityType,
        entityId: item.entityId,
        googleCalendarId: calendarId,
        googleEventId,
        etag,
        lastSyncedAt: now,
      });

      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }
  }

  const totalMappedCount = listGoogleCalendarMappings(db, calendarId).length;
  const summary = `${createdCount} creados · ${updatedCount} actualizados (${totalMappedCount} mapeados)`;

  updateGoogleCalendarConfig(db, {
    lastSyncedAt: now,
    lastSyncSummary: summary,
  });

  return {
    syncedAt: now,
    createdCount,
    updatedCount,
    totalMappedCount,
    calendarId,
    mode,
    summary,
  };
}
