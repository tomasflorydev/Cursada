import type { DatabaseSync } from 'node:sqlite';
import { createBackup } from '../services/backupService.js';

export const LATEST_SCHEMA_VERSION = 3;

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

const MIGRATION_V2_SQL = `
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'parcial' CHECK (category IN ('parcial', 'recuperatorio', 'final', 'tp')),
    exam_date TEXT NOT NULL,
    exam_time TEXT,
    location TEXT NOT NULL DEFAULT '',
    topics TEXT NOT NULL DEFAULT '',
    grade REAL CHECK (grade IS NULL OR (grade >= 1 AND grade <= 10)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);
CREATE INDEX IF NOT EXISTS idx_exams_date ON exams(exam_date);
`;

const MIGRATION_V3_SQL = `
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'ai_summary', 'ai_study_guide', 'ai_practice_exam')),
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_course ON notes(course_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    note_id UNINDEXED,
    course_id UNINDEXED,
    title,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts (note_id, course_id, title, content)
    VALUES (new.id, new.course_id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_au AFTER UPDATE OF course_id, title, content ON notes BEGIN
    DELETE FROM notes_fts WHERE note_id = old.id;
    INSERT INTO notes_fts (note_id, course_id, title, content)
    VALUES (new.id, new.course_id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_notes_ad AFTER DELETE ON notes BEGIN
    DELETE FROM notes_fts WHERE note_id = old.id;
END;
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

  if (currentVersion < 2) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V2_SQL);
      db.exec('PRAGMA user_version = 2;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  if (currentVersion < 3) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V3_SQL);
      db.exec('PRAGMA user_version = 3;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}
