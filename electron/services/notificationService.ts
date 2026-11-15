import type { DatabaseSync } from 'node:sqlite';
import { getNotificationSettings } from '../db/notificationSettingsRepo.js';
import type {
  CheckRemindersResult,
  NotificationDispatchResult,
  NotificationSettings,
  ReminderCandidate,
} from '../types.js';

export type NotificationDispatcher = (
  title: string,
  body: string
) => NotificationDispatchResult;

interface UpcomingClassRow {
  id: string;
  course_id: string;
  start_time: string;
  end_time: string;
  location: string;
  course_name: string;
}

interface DueTodayTaskRow {
  id: string;
  course_id: string;
  title: string;
  course_name: string;
}

interface UpcomingExamRow {
  id: string;
  course_id: string;
  title: string;
  exam_date: string;
  course_name: string;
}

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dispatchedReminderIds = new Set<string>();

function toLocalIsoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addLocalDaysToIso(baseDate: Date, days: number): string {
  const localMidnight = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate()
  );
  localMidnight.setDate(localMidnight.getDate() + days);
  return toLocalIsoDate(localMidnight);
}

function diffIsoDays(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const fromUtc = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const toUtc = Date.UTC(ty, (tm || 1) - 1, td || 1);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function parseTimeToMinutes(time: string): number | null {
  const match = TIME_HH_MM_REGEX.exec(time.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function getIsoDayOfWeek(date: Date): number {
  const jsDay = date.getDay(); // 0 = Sun, 1 = Mon .. 6 = Sat
  return jsDay === 0 ? 7 : jsDay;
}

function evaluateWithSettings(
  db: DatabaseSync,
  settings: NotificationSettings,
  referenceDate: Date
): ReminderCandidate[] {
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error('La fecha de referencia para evaluar recordatorios es inválida.');
  }

  if (!settings.enabled) {
    return [];
  }

  const todayIso = toLocalIsoDate(referenceDate);
  const dayOfWeek = getIsoDayOfWeek(referenceDate);
  const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const candidates: ReminderCandidate[] = [];

  if (settings.upcomingClassesEnabled) {
    const classRows = db
      .prepare(
        `SELECT
           cs.id,
           cs.course_id,
           cs.start_time,
           cs.end_time,
           cs.location,
           c.name AS course_name
         FROM class_schedules cs
         INNER JOIN courses c ON c.id = cs.course_id
         WHERE c.status = 'active' AND cs.day_of_week = ?
         ORDER BY cs.start_time ASC, c.name ASC, cs.id ASC`
      )
      .all(dayOfWeek) as unknown as UpcomingClassRow[];

    for (const row of classRows) {
      const startMinutes = parseTimeToMinutes(row.start_time);
      if (startMinutes === null) {
        continue;
      }
      if (
        startMinutes >= nowMinutes &&
        startMinutes <= nowMinutes + settings.classLeadMinutes
      ) {
        const location = row.location.trim();
        candidates.push({
          id: `class:${row.id}:${todayIso}`,
          kind: 'upcoming_class',
          title: `Próxima clase: ${row.course_name}`,
          body: `${row.start_time} a ${row.end_time}${location ? ` · ${location}` : ''}`,
          courseId: row.course_id,
          courseName: row.course_name,
          referenceIso: todayIso,
        });
      }
    }
  }

  if (settings.tasksDueTodayEnabled) {
    const taskRows = db
      .prepare(
        `SELECT
           t.id,
           t.course_id,
           t.title,
           c.name AS course_name
         FROM tasks t
         INNER JOIN courses c ON c.id = t.course_id
         WHERE c.status = 'active'
           AND t.status = 'pending'
           AND t.due_date = ?
         ORDER BY
           CASE t.priority
             WHEN 'high' THEN 0
             WHEN 'medium' THEN 1
             WHEN 'low' THEN 2
             ELSE 3
           END ASC,
           t.created_at ASC,
           t.id ASC`
      )
      .all(todayIso) as unknown as DueTodayTaskRow[];

    for (const row of taskRows) {
      candidates.push({
        id: `task:${row.id}:${todayIso}`,
        kind: 'task_due_today',
        title: `Entrega de hoy: ${row.title}`,
        body: `Materia: ${row.course_name}`,
        courseId: row.course_id,
        courseName: row.course_name,
        referenceIso: todayIso,
      });
    }
  }

  if (settings.upcomingExamsEnabled) {
    const maxExamIso = addLocalDaysToIso(referenceDate, settings.examLeadDays);
    const examRows = db
      .prepare(
        `SELECT
           e.id,
           e.course_id,
           e.title,
           e.exam_date,
           c.name AS course_name
         FROM exams e
         INNER JOIN courses c ON c.id = e.course_id
         WHERE c.status = 'active'
           AND e.grade IS NULL
           AND e.exam_date >= ?
           AND e.exam_date <= ?
         ORDER BY e.exam_date ASC, COALESCE(e.exam_time, '99:99') ASC, e.id ASC`
      )
      .all(todayIso, maxExamIso) as unknown as UpcomingExamRow[];

    for (const row of examRows) {
      const daysDiff = diffIsoDays(todayIso, row.exam_date);
      const whenLabel =
        daysDiff === 0
          ? 'Hoy'
          : daysDiff === 1
            ? 'Mañana'
            : `En ${daysDiff} días`;
      candidates.push({
        id: `exam:${row.id}:${todayIso}`,
        kind: 'upcoming_exam',
        title: `Próximo examen: ${row.title}`,
        body: `${row.course_name} · ${whenLabel} (${row.exam_date})`,
        courseId: row.course_id,
        courseName: row.course_name,
        referenceIso: row.exam_date,
      });
    }
  }

  return candidates;
}

export function evaluateDueReminders(
  db: DatabaseSync,
  referenceDate: Date = new Date()
): ReminderCandidate[] {
  const settings = getNotificationSettings(db);
  return evaluateWithSettings(db, settings, referenceDate);
}

export function dispatchNotification(
  title: string,
  body: string,
  dispatcher?: NotificationDispatcher
): NotificationDispatchResult {
  if (dispatcher) {
    return dispatcher(title, body);
  }
  return {
    supported: true,
    dispatched: true,
    title,
    body,
    dispatchedAt: new Date().toISOString(),
    mode: 'simulated',
  };
}

export function sendTestNotification(
  dispatcher?: NotificationDispatcher
): NotificationDispatchResult {
  return dispatchNotification(
    'Recordatorio de prueba · Cursada',
    'Las notificaciones locales de Cursada están funcionando correctamente.',
    dispatcher
  );
}

export function clearDispatchedRemindersCache(): void {
  dispatchedReminderIds.clear();
}

export function checkAndDispatchDueReminders(
  db: DatabaseSync,
  opts?: {
    referenceDate?: Date;
    dispatch?: boolean;
    dispatcher?: NotificationDispatcher;
    resetDedup?: boolean;
  }
): CheckRemindersResult {
  if (opts?.resetDedup) {
    clearDispatchedRemindersCache();
  }

  const referenceDate = opts?.referenceDate ?? new Date();
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error('La fecha de referencia para verificar recordatorios es inválida.');
  }

  const settings = getNotificationSettings(db);
  const candidates = evaluateWithSettings(db, settings, referenceDate);
  const results: NotificationDispatchResult[] = [];
  let dispatchedCount = 0;

  if (opts?.dispatch) {
    for (const candidate of candidates) {
      if (dispatchedReminderIds.has(candidate.id)) {
        continue;
      }
      const dispatchResult = dispatchNotification(
        candidate.title,
        candidate.body,
        opts.dispatcher
      );
      results.push(dispatchResult);
      if (dispatchResult.dispatched) {
        dispatchedReminderIds.add(candidate.id);
        dispatchedCount += 1;
      }
    }
  }

  return {
    evaluatedAt: referenceDate.toISOString(),
    settings,
    candidates,
    dispatchedCount,
    results,
  };
}
