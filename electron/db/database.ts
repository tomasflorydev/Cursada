import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { runMigrations } from './migrations.js';
import { ensureStartupBackup } from '../services/backupService.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};

export interface DatabaseContext {
  db: DatabaseSyncType;
  dbPath: string;
  dataDir: string;
  isInMemory: boolean;
  close: () => void;
}

let activeContext: DatabaseContext | null = null;

export function resolveDataDir(explicitDir?: string): string {
  if (explicitDir && explicitDir.trim().length > 0) {
    return path.resolve(explicitDir);
  }

  const envDataDir = process.env.CURSADA_DATA_DIR;
  if (envDataDir && envDataDir.trim().length > 0) {
    return path.resolve(envDataDir);
  }

  // Strict safety guard: automated tests must NEVER touch the real macOS Application Support directory
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-test-'));
  }

  return path.join(os.homedir(), 'Library', 'Application Support', 'com.cursada.app');
}

export function openDatabase(options?: {
  dataDir?: string;
  inMemory?: boolean;
  runStartupBackup?: boolean;
}): DatabaseContext {
  const isInMemory = options?.inMemory ?? false;
  const dataDir = resolveDataDir(options?.dataDir);
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = isInMemory ? ':memory:' : path.join(dataDir, 'cursada.sqlite');
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = ON;');
  if (!isInMemory) {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  runMigrations(db, { dataDir, isInMemory });

  if (!isInMemory && (options?.runStartupBackup ?? true)) {
    ensureStartupBackup(db, dataDir);
  }

  const context: DatabaseContext = {
    db,
    dbPath,
    dataDir,
    isInMemory,
    close: () => {
      if (activeContext === context) {
        activeContext = null;
      }
      db.close();
    },
  };

  return context;
}

export function initAppDatabase(options?: { dataDir?: string }): DatabaseContext {
  if (activeContext) {
    return activeContext;
  }
  activeContext = openDatabase({ dataDir: options?.dataDir, runStartupBackup: true });
  return activeContext;
}

export function getAppDatabase(): DatabaseContext {
  if (!activeContext) {
    activeContext = openDatabase({ runStartupBackup: true });
  }
  return activeContext;
}

export function createTestDatabase(options?: { inMemory?: boolean }): DatabaseContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-test-'));
  return openDatabase({
    dataDir: tempDir,
    inMemory: options?.inMemory ?? false,
    runStartupBackup: false,
  });
}
