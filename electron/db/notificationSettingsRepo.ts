import type { DatabaseSync } from 'node:sqlite';
import type {
  NotificationSettings,
  UpdateNotificationSettingsInput,
} from '../types.js';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  upcomingClassesEnabled: true,
  classLeadMinutes: 15,
  tasksDueTodayEnabled: true,
  upcomingExamsEnabled: true,
  examLeadDays: 2,
};

export const NOTIFICATION_SETTINGS_KEYS = {
  enabled: 'notifications_enabled',
  upcomingClassesEnabled: 'notifications_upcoming_classes',
  classLeadMinutes: 'notifications_class_lead_minutes',
  tasksDueTodayEnabled: 'notifications_tasks_due_today',
  upcomingExamsEnabled: 'notifications_upcoming_exams',
  examLeadDays: 'notifications_exam_lead_days',
} as const;

export const MIN_CLASS_LEAD_MINUTES = 5;
export const MAX_CLASS_LEAD_MINUTES = 180;
export const MIN_EXAM_LEAD_DAYS = 1;
export const MAX_EXAM_LEAD_DAYS = 30;

interface AppSettingRow {
  key: string;
  value: string;
}

function parseBooleanSetting(raw: string | undefined, fallback: boolean): boolean {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return fallback;
}

function parseIntegerInRange(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function validateBooleanInput(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`El campo "${fieldName}" debe ser un valor booleano.`);
  }
  return value;
}

function validateClassLeadMinutes(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_CLASS_LEAD_MINUTES ||
    value > MAX_CLASS_LEAD_MINUTES
  ) {
    throw new Error(
      `La anticipación para clases debe ser un número entero entre ${MIN_CLASS_LEAD_MINUTES} y ${MAX_CLASS_LEAD_MINUTES} minutos.`
    );
  }
  return value;
}

function validateExamLeadDays(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_EXAM_LEAD_DAYS ||
    value > MAX_EXAM_LEAD_DAYS
  ) {
    throw new Error(
      `La anticipación para exámenes debe ser un número entero entre ${MIN_EXAM_LEAD_DAYS} y ${MAX_EXAM_LEAD_DAYS} días.`
    );
  }
  return value;
}

export function getNotificationSettings(db: DatabaseSync): NotificationSettings {
  const rows = db
    .prepare(
      'SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?, ?)'
    )
    .all(
      NOTIFICATION_SETTINGS_KEYS.enabled,
      NOTIFICATION_SETTINGS_KEYS.upcomingClassesEnabled,
      NOTIFICATION_SETTINGS_KEYS.classLeadMinutes,
      NOTIFICATION_SETTINGS_KEYS.tasksDueTodayEnabled,
      NOTIFICATION_SETTINGS_KEYS.upcomingExamsEnabled,
      NOTIFICATION_SETTINGS_KEYS.examLeadDays
    ) as unknown as AppSettingRow[];

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }

  return {
    enabled: parseBooleanSetting(
      map.get(NOTIFICATION_SETTINGS_KEYS.enabled),
      DEFAULT_NOTIFICATION_SETTINGS.enabled
    ),
    upcomingClassesEnabled: parseBooleanSetting(
      map.get(NOTIFICATION_SETTINGS_KEYS.upcomingClassesEnabled),
      DEFAULT_NOTIFICATION_SETTINGS.upcomingClassesEnabled
    ),
    classLeadMinutes: parseIntegerInRange(
      map.get(NOTIFICATION_SETTINGS_KEYS.classLeadMinutes),
      MIN_CLASS_LEAD_MINUTES,
      MAX_CLASS_LEAD_MINUTES,
      DEFAULT_NOTIFICATION_SETTINGS.classLeadMinutes
    ),
    tasksDueTodayEnabled: parseBooleanSetting(
      map.get(NOTIFICATION_SETTINGS_KEYS.tasksDueTodayEnabled),
      DEFAULT_NOTIFICATION_SETTINGS.tasksDueTodayEnabled
    ),
    upcomingExamsEnabled: parseBooleanSetting(
      map.get(NOTIFICATION_SETTINGS_KEYS.upcomingExamsEnabled),
      DEFAULT_NOTIFICATION_SETTINGS.upcomingExamsEnabled
    ),
    examLeadDays: parseIntegerInRange(
      map.get(NOTIFICATION_SETTINGS_KEYS.examLeadDays),
      MIN_EXAM_LEAD_DAYS,
      MAX_EXAM_LEAD_DAYS,
      DEFAULT_NOTIFICATION_SETTINGS.examLeadDays
    ),
  };
}

export function updateNotificationSettings(
  db: DatabaseSync,
  input: UpdateNotificationSettingsInput
): NotificationSettings {
  const updates: Array<[string, string]> = [];

  if (input.enabled !== undefined) {
    updates.push([
      NOTIFICATION_SETTINGS_KEYS.enabled,
      String(validateBooleanInput(input.enabled, 'enabled')),
    ]);
  }

  if (input.upcomingClassesEnabled !== undefined) {
    updates.push([
      NOTIFICATION_SETTINGS_KEYS.upcomingClassesEnabled,
      String(
        validateBooleanInput(
          input.upcomingClassesEnabled,
          'upcomingClassesEnabled'
        )
      ),
    ]);
  }

  if (input.classLeadMinutes !== undefined) {
    updates.push([
      NOTIFICATION_SETTINGS_KEYS.classLeadMinutes,
      String(validateClassLeadMinutes(input.classLeadMinutes)),
    ]);
  }

  if (input.tasksDueTodayEnabled !== undefined) {
    updates.push([
      NOTIFICATION_SETTINGS_KEYS.tasksDueTodayEnabled,
      String(
        validateBooleanInput(input.tasksDueTodayEnabled, 'tasksDueTodayEnabled')
      ),
    ]);
  }

  if (input.upcomingExamsEnabled !== undefined) {
    updates.push([
      NOTIFICATION_SETTINGS_KEYS.upcomingExamsEnabled,
      String(
        validateBooleanInput(input.upcomingExamsEnabled, 'upcomingExamsEnabled')
      ),
    ]);
  }

  if (input.examLeadDays !== undefined) {
    updates.push([
      NOTIFICATION_SETTINGS_KEYS.examLeadDays,
      String(validateExamLeadDays(input.examLeadDays)),
    ]);
  }

  if (updates.length === 0) {
    return getNotificationSettings(db);
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const upsertStmt = db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    );

    for (const [key, value] of updates) {
      upsertStmt.run(key, value, now);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return getNotificationSettings(db);
}
