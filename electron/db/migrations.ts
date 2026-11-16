import type { DatabaseSync } from 'node:sqlite';
import { createBackup } from '../services/backupService.js';

export const LATEST_SCHEMA_VERSION = 8;

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

const MIGRATION_V4_SQL = `
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('pdf', 'markdown', 'txt', 'pasted_text')),
    original_path TEXT,
    stored_filename TEXT,
    raw_text TEXT NOT NULL DEFAULT '',
    page_count INTEGER NOT NULL DEFAULT 1,
    char_count INTEGER NOT NULL DEFAULT 0,
    indexing_status TEXT NOT NULL DEFAULT 'pending' CHECK (indexing_status IN ('pending', 'indexing', 'ready', 'error')),
    indexing_error TEXT,
    embedding_model TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_course ON sources(course_id);

CREATE TABLE IF NOT EXISTS source_chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    page_number INTEGER,
    content TEXT NOT NULL,
    embedding BLOB,
    embedding_dim INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON source_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_course ON source_chunks(course_id);

CREATE VIRTUAL TABLE IF NOT EXISTS source_chunks_fts USING fts5(
    chunk_id UNINDEXED,
    source_id UNINDEXED,
    course_id UNINDEXED,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_source_chunks_ai AFTER INSERT ON source_chunks BEGIN
    INSERT INTO source_chunks_fts (chunk_id, source_id, course_id, content)
    VALUES (new.id, new.source_id, new.course_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_source_chunks_au AFTER UPDATE OF source_id, course_id, content ON source_chunks BEGIN
    DELETE FROM source_chunks_fts WHERE chunk_id = old.id;
    INSERT INTO source_chunks_fts (chunk_id, source_id, course_id, content)
    VALUES (new.id, new.source_id, new.course_id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS trg_source_chunks_ad AFTER DELETE ON source_chunks BEGIN
    DELETE FROM source_chunks_fts WHERE chunk_id = old.id;
END;
`;

const MIGRATION_V5_SQL = `
CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_course ON chat_threads(course_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations_json TEXT NOT NULL DEFAULT '[]',
    model_used TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
`;

const MIGRATION_V6_SQL = `
ALTER TABLE notes ADD COLUMN frontmatter_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS note_links (
    id TEXT PRIMARY KEY,
    source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
    target_title TEXT NOT NULL,
    display_text TEXT NOT NULL DEFAULT '',
    context_snippet TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_title ON note_links(target_title);
`;

const MIGRATION_V7_SQL = `
ALTER TABLE notes ADD COLUMN exam_stage TEXT NOT NULL DEFAULT 'general' CHECK (exam_stage IN ('parcial_1', 'parcial_2', 'final', 'general'));
ALTER TABLE sources ADD COLUMN exam_stage TEXT NOT NULL DEFAULT 'general' CHECK (exam_stage IN ('parcial_1', 'parcial_2', 'final', 'general'));
ALTER TABLE courses ADD COLUMN attendance_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE courses ADD COLUMN max_absences INTEGER NOT NULL DEFAULT 4;

CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_course ON attendance_records(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(session_date);
`;

const MIGRATION_V8_SQL = `
CREATE TABLE IF NOT EXISTS calendar_feeds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    raw_ics_cache TEXT NOT NULL DEFAULT '',
    last_synced_at TEXT,
    last_error TEXT,
    events_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_calendar_mappings (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('schedule', 'task', 'exam')),
    entity_id TEXT NOT NULL,
    google_calendar_id TEXT NOT NULL,
    google_event_id TEXT NOT NULL,
    etag TEXT NOT NULL DEFAULT '',
    last_synced_at TEXT NOT NULL,
    UNIQUE(entity_type, entity_id, google_calendar_id)
);
CREATE INDEX IF NOT EXISTS idx_gcal_mappings_entity ON google_calendar_mappings(entity_type, entity_id);
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

  if (currentVersion < 4) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V4_SQL);
      db.exec('PRAGMA user_version = 4;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  if (currentVersion < 5) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V5_SQL);
      db.exec('PRAGMA user_version = 5;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  if (currentVersion < 6) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V6_SQL);
      db.exec('PRAGMA user_version = 6;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  if (currentVersion < 7) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V7_SQL);
      db.exec('PRAGMA user_version = 7;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  if (currentVersion < 8) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      db.exec(MIGRATION_V8_SQL);
      db.exec('PRAGMA user_version = 8;');
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}
