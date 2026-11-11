import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { BackupInfo } from '../types.js';

const MAX_BACKUPS = 15;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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
  db: DatabaseSync,
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
  db: DatabaseSync,
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
