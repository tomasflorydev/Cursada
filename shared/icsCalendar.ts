import type {
  CourseWithSchedules,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  ExternalCalendarEvent,
  TaskPriority,
  TaskWithCourse,
} from './types.js';

export interface BuildIcsCalendarParams {
  courses: CourseWithSchedules[];
  tasks: TaskWithCourse[];
  exams: ExamWithCourse[];
  calendarName?: string;
  includeSchedules?: boolean;
  includeTasks?: boolean;
  includeExams?: boolean;
  referenceDate?: Date;
}

export interface BuildIcsCalendarResult {
  icsContent: string;
  eventsCount: number;
}

export const DAY_OF_WEEK_TO_BYDAY: Record<DayOfWeek, string> = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU',
};

export const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'TP',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
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

export function isValidIsoDate(value: string): boolean {
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

export function addDaysToIsoDate(isoDate: string, days: number): string {
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

export function toLocalIsoDate(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getMondayOfWeekLocal(referenceDate: Date): Date {
  const copy = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const jsDay = copy.getDay(); // 0 = Sun .. 6 = Sat
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
  let limit = maxBytesFirst;

  for (const ch of line) {
    const chBytes = utf8Encoder.encode(ch).length;
    if (currentBytes + chBytes > limit && current.length > 0) {
      chunks.push(current);
      current = ` ${ch}`;
      currentBytes = 1 + chBytes;
      limit = 75;
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

export function parseTimeToMinutes(time: string): number | null {
  const match = TIME_HH_MM_REGEX.exec(time.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToIsoTime(totalMinutes: number): string {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

function minutesToCompactTime(totalMinutes: number): string {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}${mm}00`;
}

export function buildIcsCalendar(
  params: BuildIcsCalendarParams
): BuildIcsCalendarResult {
  const includeSchedules = params.includeSchedules ?? true;
  const includeTasks = params.includeTasks ?? true;
  const includeExams = params.includeExams ?? true;
  const calendarName = params.calendarName?.trim() || 'Cursada';
  const referenceDate =
    params.referenceDate && !Number.isNaN(params.referenceDate.getTime())
      ? params.referenceDate
      : new Date();

  const dtStamp = formatUtcTimestamp(referenceDate);
  const mondayLocal = getMondayOfWeekLocal(referenceDate);
  const mondayIso = toLocalIsoDate(mondayLocal);

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

  const icsContent = `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
  return {
    icsContent,
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

interface ParsedDateTimeValue {
  dateIso: string;
  time: string | null;
  isAllDay: boolean;
}

function parseIcsDateTime(
  rawValue: string,
  params: Map<string, string>
): ParsedDateTimeValue | null {
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
    const localIso = toLocalIsoDate(utcDate);
    const localTime = `${String(utcDate.getHours()).padStart(2, '0')}:${String(
      utcDate.getMinutes()
    ).padStart(2, '0')}`;
    return {
      dateIso: localIso,
      time: localTime,
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

export function parseIcsCalendar(
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
  let currentProps: Map<string, ParsedProperty> = new Map();
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
