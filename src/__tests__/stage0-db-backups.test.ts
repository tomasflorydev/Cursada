import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCourse,
  deleteCourse,
  getCourseDeleteImpact,
  listCourses,
} from '../../electron/db/coursesRepo';
import { createTestDatabase, openDatabase, resolveDataDir } from '../../electron/db/database';
import { getSchemaVersion, LATEST_SCHEMA_VERSION } from '../../electron/db/migrations';
import { createTask, listTasks } from '../../electron/db/tasksRepo';
import {
  createBackup,
  ensureStartupBackup,
  listBackups,
} from '../../electron/services/backupService';

describe('Stage 0: SQLite migrations, CURSADA_DATA_DIR isolation, and automatic backups', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    delete process.env.CURSADA_DATA_DIR;
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects CURSADA_DATA_DIR and never touches ~/Library/Application Support/com.cursada.app', () => {
    const customDir = makeTempDir();
    process.env.CURSADA_DATA_DIR = customDir;

    expect(resolveDataDir()).toBe(path.resolve(customDir));
    const ctx = openDatabase();
    expect(ctx.dataDir).toBe(path.resolve(customDir));
    expect(ctx.dbPath).toBe(path.join(customDir, 'cursada.sqlite'));
    expect(getSchemaVersion(ctx.db)).toBe(LATEST_SCHEMA_VERSION);
    expect(getSchemaVersion(ctx.db)).toBe(2);
    ctx.close();
  });

  it('rotates automatic backups keeping at most 15 files in backups/', () => {
    const customDir = makeTempDir();
    const ctx = openDatabase({ dataDir: customDir, runStartupBackup: false });

    const startupBackup = ensureStartupBackup(ctx.db, ctx.dataDir);
    expect(startupBackup).not.toBeNull();
    // Second call within 24h should not create another startup backup
    expect(ensureStartupBackup(ctx.db, ctx.dataDir)).toBeNull();

    for (let i = 0; i < 18; i++) {
      createBackup(ctx.db, ctx.dataDir, `manual-${i}`);
    }

    const backups = listBackups(ctx.dataDir);
    expect(backups).toHaveLength(15);
    expect(fs.existsSync(backups[0].filePath)).toBe(true);
    ctx.close();
  });

  it('persists courses, schedules, and tasks, and reports delete impact before cascading', () => {
    const ctx = createTestDatabase();

    const course = createCourse(ctx.db, {
      name: 'Ingeniería de Software I',
      color: 'blue',
      professor: 'Martín Echeverría',
      term: '2026 - 2° Cuatrimestre',
      schedules: [
        {
          dayOfWeek: 2,
          startTime: '18:30',
          endTime: '22:30',
          location: 'Aula 402',
        },
      ],
    });

    expect(listCourses(ctx.db)).toHaveLength(1);
    expect(course.schedules).toHaveLength(1);

    createTask(ctx.db, {
      courseId: course.id,
      title: 'TP 1',
      dueDate: '2026-11-12',
      priority: 'high',
    });
    createTask(ctx.db, {
      courseId: course.id,
      title: 'TP 2',
      dueDate: '2026-11-15',
      priority: 'medium',
    });

    const impact = getCourseDeleteImpact(ctx.db, course.id);
    expect(impact.courseName).toBe('Ingeniería de Software I');
    expect(impact.tasksCount).toBe(2);

    createBackup(ctx.db, ctx.dataDir, 'pre-course-delete');
    deleteCourse(ctx.db, course.id);

    expect(listCourses(ctx.db)).toHaveLength(0);
    expect(listTasks(ctx.db)).toHaveLength(0);
    expect(listBackups(ctx.dataDir).length).toBeGreaterThanOrEqual(1);

    ctx.close();
    tempDirs.push(ctx.dataDir);
  });
});
