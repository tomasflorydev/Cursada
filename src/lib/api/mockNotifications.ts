import type {
  CheckRemindersResult,
  DayOfWeek,
  NotificationDispatchResult,
  NotificationSettings,
  ReminderCandidate,
  UpdateNotificationSettingsInput,
} from '../../types/domain';
import { mockListCourses } from './mockCourses';
import { mockListExams } from './mockExams';
import { mockListTasks } from './mockTasks';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  upcomingClassesEnabled: true,
  classLeadMinutes: 15,
  tasksDueTodayEnabled: true,
  upcomingExamsEnabled: true,
  examLeadDays: 2,
};

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

let notificationSettingsStore: NotificationSettings = structuredClone(
  DEFAULT_NOTIFICATION_SETTINGS
);
const dispatchedMockReminderIds = new Set<string>();

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

function getIsoDayOfWeek(date: Date): DayOfWeek {
  const jsDay = date.getDay();
  return (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
}

function dispatchMockNotification(
  title: string,
  body: string
): NotificationDispatchResult {
  const dispatchedAt = new Date().toISOString();

  if (
    typeof window !== 'undefined' &&
    typeof window.Notification === 'function' &&
    window.Notification.permission === 'granted'
  ) {
    try {
      new window.Notification(title, { body });
      return {
        supported: true,
        dispatched: true,
        title,
        body,
        dispatchedAt,
        mode: 'web-notification',
      };
    } catch {
      // Fall back to simulated mode if browser rejects constructing Notification
    }
  }

  return {
    supported: true,
    dispatched: true,
    title,
    body,
    dispatchedAt,
    mode: 'simulated',
  };
}

export function resetMockNotifications(): void {
  notificationSettingsStore = structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
  dispatchedMockReminderIds.clear();
}

export async function mockGetNotificationSettings(): Promise<NotificationSettings> {
  return structuredClone(notificationSettingsStore);
}

export async function mockUpdateNotificationSettings(
  input: UpdateNotificationSettingsInput
): Promise<NotificationSettings> {
  if (
    input.classLeadMinutes !== undefined &&
    (!Number.isInteger(input.classLeadMinutes) ||
      input.classLeadMinutes < 5 ||
      input.classLeadMinutes > 180)
  ) {
    throw new Error(
      'La anticipación para clases debe ser un número entero entre 5 y 180 minutos.'
    );
  }
  if (
    input.examLeadDays !== undefined &&
    (!Number.isInteger(input.examLeadDays) ||
      input.examLeadDays < 1 ||
      input.examLeadDays > 30)
  ) {
    throw new Error(
      'La anticipación para exámenes debe ser un número entero entre 1 y 30 días.'
    );
  }

  notificationSettingsStore = {
    enabled: input.enabled ?? notificationSettingsStore.enabled,
    upcomingClassesEnabled:
      input.upcomingClassesEnabled ??
      notificationSettingsStore.upcomingClassesEnabled,
    classLeadMinutes:
      input.classLeadMinutes ?? notificationSettingsStore.classLeadMinutes,
    tasksDueTodayEnabled:
      input.tasksDueTodayEnabled ??
      notificationSettingsStore.tasksDueTodayEnabled,
    upcomingExamsEnabled:
      input.upcomingExamsEnabled ??
      notificationSettingsStore.upcomingExamsEnabled,
    examLeadDays: input.examLeadDays ?? notificationSettingsStore.examLeadDays,
  };

  return structuredClone(notificationSettingsStore);
}

export async function mockSendTestNotification(): Promise<NotificationDispatchResult> {
  return dispatchMockNotification(
    'Recordatorio de prueba · Cursada',
    'Las notificaciones locales de Cursada están funcionando correctamente.'
  );
}

export async function mockCheckDueReminders(opts?: {
  referenceIso?: string;
  dispatch?: boolean;
}): Promise<CheckRemindersResult> {
  const referenceDate =
    opts?.referenceIso !== undefined ? new Date(opts.referenceIso) : new Date();
  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error(
      `Fecha de referencia inválida "${String(opts?.referenceIso)}".`
    );
  }

  const settings = structuredClone(notificationSettingsStore);
  const candidates: ReminderCandidate[] = [];

  if (settings.enabled) {
    const todayIso = toLocalIsoDate(referenceDate);
    const dayOfWeek = getIsoDayOfWeek(referenceDate);
    const nowMinutes =
      referenceDate.getHours() * 60 + referenceDate.getMinutes();

    const activeCourses = await mockListCourses({ status: 'active' });
    const activeCourseIds = new Set(activeCourses.map((course) => course.id));

    if (settings.upcomingClassesEnabled) {
      const classSchedules: Array<{
        scheduleId: string;
        courseId: string;
        courseName: string;
        startTime: string;
        endTime: string;
        location: string;
      }> = [];

      for (const course of activeCourses) {
        for (const schedule of course.schedules) {
          if (schedule.dayOfWeek !== dayOfWeek) {
            continue;
          }
          const startMinutes = parseTimeToMinutes(schedule.startTime);
          if (startMinutes === null) {
            continue;
          }
          if (
            startMinutes >= nowMinutes &&
            startMinutes <= nowMinutes + settings.classLeadMinutes
          ) {
            classSchedules.push({
              scheduleId: schedule.id,
              courseId: course.id,
              courseName: course.name,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location.trim(),
            });
          }
        }
      }

      classSchedules.sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          a.courseName.localeCompare(b.courseName) ||
          a.scheduleId.localeCompare(b.scheduleId)
      );

      for (const item of classSchedules) {
        candidates.push({
          id: `class:${item.scheduleId}:${todayIso}`,
          kind: 'upcoming_class',
          title: `Próxima clase: ${item.courseName}`,
          body: `${item.startTime} a ${item.endTime}${item.location ? ` · ${item.location}` : ''}`,
          courseId: item.courseId,
          courseName: item.courseName,
          referenceIso: todayIso,
        });
      }
    }

    if (settings.tasksDueTodayEnabled) {
      const dueTasks = await mockListTasks({
        status: 'pending',
        dueFrom: todayIso,
        dueTo: todayIso,
      });

      for (const task of dueTasks) {
        if (!activeCourseIds.has(task.courseId)) {
          continue;
        }
        candidates.push({
          id: `task:${task.id}:${todayIso}`,
          kind: 'task_due_today',
          title: `Entrega de hoy: ${task.title}`,
          body: `Materia: ${task.courseName}`,
          courseId: task.courseId,
          courseName: task.courseName,
          referenceIso: todayIso,
        });
      }
    }

    if (settings.upcomingExamsEnabled) {
      const maxExamIso = addLocalDaysToIso(referenceDate, settings.examLeadDays);
      const upcomingExams = await mockListExams({
        graded: 'ungraded',
        dateFrom: todayIso,
        dateTo: maxExamIso,
      });

      for (const exam of upcomingExams) {
        if (!activeCourseIds.has(exam.courseId)) {
          continue;
        }
        const daysDiff = diffIsoDays(todayIso, exam.examDate);
        const whenLabel =
          daysDiff === 0
            ? 'Hoy'
            : daysDiff === 1
              ? 'Mañana'
              : `En ${daysDiff} días`;
        candidates.push({
          id: `exam:${exam.id}:${todayIso}`,
          kind: 'upcoming_exam',
          title: `Próximo examen: ${exam.title}`,
          body: `${exam.courseName} · ${whenLabel} (${exam.examDate})`,
          courseId: exam.courseId,
          courseName: exam.courseName,
          referenceIso: exam.examDate,
        });
      }
    }
  }

  const results: NotificationDispatchResult[] = [];
  let dispatchedCount = 0;

  if (opts?.dispatch) {
    for (const candidate of candidates) {
      if (dispatchedMockReminderIds.has(candidate.id)) {
        continue;
      }
      const dispatchResult = dispatchMockNotification(
        candidate.title,
        candidate.body
      );
      results.push(dispatchResult);
      if (dispatchResult.dispatched) {
        dispatchedMockReminderIds.add(candidate.id);
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
