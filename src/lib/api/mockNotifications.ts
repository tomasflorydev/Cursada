import type {
  CheckRemindersResult,
  NotificationDispatchResult,
  NotificationSettings,
  UpdateNotificationSettingsInput,
} from '../../types/domain';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  upcomingClassesEnabled: true,
  classLeadMinutes: 15,
  tasksDueTodayEnabled: true,
  upcomingExamsEnabled: true,
  examLeadDays: 2,
};

let notificationSettingsStore: NotificationSettings = structuredClone(
  DEFAULT_NOTIFICATION_SETTINGS
);

export function resetMockNotifications(): void {
  notificationSettingsStore = structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
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
  return {
    supported: true,
    dispatched: true,
    title: 'Recordatorio de prueba · Cursada',
    body: 'Las notificaciones locales de Cursada están funcionando correctamente.',
    dispatchedAt: new Date().toISOString(),
    mode: 'simulated',
  };
}

export async function mockCheckDueReminders(opts?: {
  referenceIso?: string;
  dispatch?: boolean;
}): Promise<CheckRemindersResult> {
  return {
    evaluatedAt: opts?.referenceIso ?? new Date().toISOString(),
    settings: structuredClone(notificationSettingsStore),
    candidates: [],
    dispatchedCount: 0,
    results: [],
  };
}
