import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type {
  DatabaseSync as DatabaseSyncType,
  SQLInputValue,
} from 'node:sqlite';
import type { BackupInfo, RestoreBackupResult } from '../types.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};

const MAX_BACKUPS = 15;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const RESTORE_TABLES_ORDER = [
  'courses',
  'class_schedules',
  'tasks',
  'exams',
  'notes',
  'note_links',
  'sources',
  'source_chunks',
  'chat_threads',
  'chat_messages',
  'attendance_records',
  'calendar_feeds',
  'google_calendar_mappings',
  'app_settings',
] as const;

type RestoreTableName = (typeof RESTORE_TABLES_ORDER)[number];
const ALLOWED_RESTORE_TABLES = new Set<string>(RESTORE_TABLES_ORDER);

export function getBackupsDir(dataDir: string): string {
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  return backupsDir;
}

function formatBackupTimestamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  const mmm = pad(date.getUTCMilliseconds(), 3);
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}-${mmm}`;
}

export function rotateBackups(dataDir: string, maxBackups = MAX_BACKUPS): void {
  const backupsDir = getBackupsDir(dataDir);
  const entries = fs
    .readdirSync(backupsDir)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => {
      const fullPath = path.join(backupsDir, name);
      const stat = fs.statSync(fullPath);
      return { name, fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => {
      if (b.mtimeMs !== a.mtimeMs) {
        return b.mtimeMs - a.mtimeMs;
      }
      return b.name.localeCompare(a.name);
    });

  if (entries.length <= maxBackups) {
    return;
  }

  for (const stale of entries.slice(maxBackups)) {
    fs.unlinkSync(stale.fullPath);
  }
}

export function createBackup(
  db: DatabaseSyncType,
  dataDir: string,
  reason = 'manual'
): BackupInfo {
  const backupsDir = getBackupsDir(dataDir);
  const now = new Date();
  const safeReason = reason.replace(/[^a-z0-9-_]/gi, '').toLowerCase() || 'backup';
  const filename = `cursada-${formatBackupTimestamp(now)}-${safeReason}.sqlite`;
  const filePath = path.join(backupsDir, filename);

  const stmt = db.prepare('VACUUM INTO ?');
  stmt.run(filePath);

  const stat = fs.statSync(filePath);
  const createdAt = now.toISOString();

  try {
    const upsertSetting = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    upsertSetting.run('last_backup_at', createdAt, createdAt);
  } catch {
    // Table app_settings might not exist yet if called prior to initial migration
  }

  rotateBackups(dataDir, MAX_BACKUPS);

  return {
    filename,
    filePath,
    createdAt,
    sizeBytes: stat.size,
  };
}

export function listBackups(dataDir: string): BackupInfo[] {
  const backupsDir = getBackupsDir(dataDir);
  return fs
    .readdirSync(backupsDir)
    .filter((name) => name.endsWith('.sqlite'))
    .map((filename) => {
      const filePath = path.join(backupsDir, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        filePath,
        createdAt: new Date(stat.mtimeMs).toISOString(),
        sizeBytes: stat.size,
      };
    })
    .sort((a, b) => {
      if (b.createdAt !== a.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.filename.localeCompare(a.filename);
    });
}

export function ensureStartupBackup(
  db: DatabaseSyncType,
  dataDir: string,
  nowMs = Date.now()
): BackupInfo | null {
  const existing = listBackups(dataDir);
  if (existing.length === 0) {
    return createBackup(db, dataDir, 'startup');
  }

  const latestTime = new Date(existing[0].createdAt).getTime();
  if (Number.isNaN(latestTime) || nowMs - latestTime >= TWENTY_FOUR_HOURS_MS) {
    return createBackup(db, dataDir, 'startup');
  }

  return null;
}

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getTableNames(database: DatabaseSyncType): Set<string> {
  const rows = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function getTableColumns(
  database: DatabaseSyncType,
  tableName: RestoreTableName
): string[] {
  if (!ALLOWED_RESTORE_TABLES.has(tableName)) {
    throw new Error(`Tabla no permitida para restauración: "${tableName}".`);
  }
  const rows = database
    .prepare(`PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`)
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

/**
 * Restores all application tables from a backup file into the active database
 * after creating a preventive backup of the current state.
 */
export function restoreBackup(
  db: DatabaseSyncType,
  dataDir: string,
  filename: string
): RestoreBackupResult {
  const trimmed = (filename ?? '').trim();
  if (
    !trimmed ||
    !trimmed.endsWith('.sqlite') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    trimmed.includes('\0') ||
    path.basename(trimmed) !== trimmed
  ) {
    throw new Error('Nombre de archivo de backup inválido.');
  }

  const targetBackup = listBackups(dataDir).find((b) => b.filename === trimmed);
  if (!targetBackup) {
    throw new Error(`No se encontró el backup "${trimmed}".`);
  }

  let backupDb: DatabaseSyncType;
  try {
    backupDb = new DatabaseSync(targetBackup.filePath);
  } catch {
    throw new Error(
      `El archivo de backup "${trimmed}" no es una base de datos SQLite válida.`
    );
  }

  try {
    let backupTables: Set<string>;
    try {
      backupTables = getTableNames(backupDb);
    } catch {
      throw new Error(
        `El archivo de backup "${trimmed}" está dañado o no es una base de datos SQLite válida.`
      );
    }

    if (!backupTables.has('courses')) {
      throw new Error(
        `El archivo de backup "${trimmed}" no es un backup válido de Cursada.`
      );
    }

    const targetTables = getTableNames(db);
    const tablePayloads: Array<{
      table: RestoreTableName;
      columns: string[];
      rows: Array<Record<string, SQLInputValue>>;
    }> = [];

    for (const table of RESTORE_TABLES_ORDER) {
      if (!backupTables.has(table) || !targetTables.has(table)) {
        continue;
      }

      const targetColumns = new Set(getTableColumns(db, table));
      const backupColumns = getTableColumns(backupDb, table);
      const commonColumns = backupColumns.filter((col) => targetColumns.has(col));
      if (commonColumns.length === 0) {
        continue;
      }

      const selectColsSql = commonColumns.map(quoteSqliteIdentifier).join(', ');
      const rows = backupDb
        .prepare(`SELECT ${selectColsSql} FROM ${quoteSqliteIdentifier(table)}`)
        .all() as Array<Record<string, SQLInputValue>>;

      tablePayloads.push({
        table,
        columns: commonColumns,
        rows,
      });
    }

    const preRestoreBackup = createBackup(db, dataDir, 'pre-restore');

    db.exec('PRAGMA foreign_keys = OFF;');
    try {
      db.exec('BEGIN IMMEDIATE;');
      try {
        for (const table of [...RESTORE_TABLES_ORDER].reverse()) {
          if (targetTables.has(table)) {
            db.exec(`DELETE FROM ${quoteSqliteIdentifier(table)};`);
          }
        }

        for (const payload of tablePayloads) {
          if (payload.rows.length === 0) {
            continue;
          }
          const insertColsSql = payload.columns.map(quoteSqliteIdentifier).join(', ');
          const placeholdersSql = payload.columns.map(() => '?').join(', ');
          const insertStmt = db.prepare(
            `INSERT INTO ${quoteSqliteIdentifier(payload.table)} (${insertColsSql}) VALUES (${placeholdersSql})`
          );

          for (const row of payload.rows) {
            const values = payload.columns.map((col) => row[col] ?? null);
            insertStmt.run(...values);
          }
        }

        db.exec('COMMIT;');
      } catch (err) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Ignore rollback error if SQLite already aborted the transaction
        }
        throw err;
      }
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }

    return {
      restoredFrom: targetBackup,
      preRestoreBackup,
    };
  } finally {
    backupDb.close();
  }
}
