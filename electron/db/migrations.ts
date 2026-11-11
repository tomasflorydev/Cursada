import type { DatabaseSync } from 'node:sqlite';
import { createBackup } from '../services/backupService.js';

export const LATEST_SCHEMA_VERSION = 1;

const MIGRATION_V1_SQL = `
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    professor TEXT NOT NULL DEFAULT '',
    term TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS class_schedules (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_schedules_course ON class_schedules(course_id);
CREATE INDEX IF NOT EXISTS idx_schedules_day ON class_schedules(day_of_week);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high') OR priority IS NULL),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_course ON tasks(course_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`;

export function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

function hasExistingTables(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    .get() as { count: number } | undefined;
  return (row?.count ?? 0) > 0;
}

export function runMigrations(
  db: DatabaseSync,
  options?: { dataDir?: string; isInMemory?: boolean }
): void {
  const currentVersion = getSchemaVersion(db);
  if (currentVersion >= LATEST_SCHEMA_VERSION) {
    return;
  }

  // Always take a backup before migrating an existing database with tables
  if (!options?.isInMemory && options?.dataDir && hasExistingTables(db)) {
    createBackup(db, options.dataDir, `pre-migration-v${LATEST_SCHEMA_VERSION}`);
  }

  if (currentVersion < 1) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V1_SQL);
      db.exec('PRAGMA user_version = 1;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}
