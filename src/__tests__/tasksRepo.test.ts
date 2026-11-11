import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase, type DatabaseContext } from '../../electron/db/database';
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  toggleTaskStatus,
  updateTask,
} from '../../electron/db/tasksRepo';
import type { TaskPriority } from '../types/domain';

describe('tasksRepo SQLite persistence, validations, and filters', () => {
  const contexts: DatabaseContext[] = [];

  function setupDb() {
    const ctx = createTestDatabase();
    contexts.push(ctx);

    const courseA = createCourse(ctx.db, {
      name: 'Ingeniería de Software I',
      color: 'blue',
      professor: 'Martín Echeverría',
      term: '2026 - 2° Cuatrimestre',
    });

    const courseB = createCourse(ctx.db, {
      name: 'Base de Datos II',
      color: 'emerald',
      professor: 'Alejandro Vera',
      term: '2026 - 2° Cuatrimestre',
    });

    return { ctx, db: ctx.db, courseA, courseB };
  }

  afterEach(() => {
    for (const ctx of contexts.splice(0, contexts.length)) {
      ctx.close();
      fs.rmSync(ctx.dataDir, { recursive: true, force: true });
    }
  });

  it('creates tasks with and without dueDate and priority', () => {
    const { db, courseA, courseB } = setupDb();

    const fullTask = createTask(db, {
      courseId: courseA.id,
      title: '  Entregar informe de arquitectura  ',
      description: '  Incluir vistas C4  ',
      dueDate: '2026-11-15',
      priority: 'high',
    });

    expect(fullTask.title).toBe('Entregar informe de arquitectura');
    expect(fullTask.description).toBe('Incluir vistas C4');
    expect(fullTask.courseId).toBe(courseA.id);
    expect(fullTask.courseName).toBe('Ingeniería de Software I');
    expect(fullTask.courseColor).toBe('blue');
    expect(fullTask.dueDate).toBe('2026-11-15');
    expect(fullTask.priority).toBe('high');
    expect(fullTask.status).toBe('pending');
    expect(fullTask.completedAt).toBeNull();

    const minimalTask = createTask(db, {
      courseId: courseB.id,
      title: 'Repasar índices B-Tree',
    });

    expect(minimalTask.title).toBe('Repasar índices B-Tree');
    expect(minimalTask.description).toBe('');
    expect(minimalTask.dueDate).toBeNull();
    expect(minimalTask.priority).toBeNull();
    expect(minimalTask.status).toBe('pending');
    expect(minimalTask.completedAt).toBeNull();
    expect(minimalTask.courseName).toBe('Base de Datos II');
  });

  it('validates input strictly on create and update (empty title, non-existent courseId, invalid dueDate, invalid priority)', () => {
    const { db, courseA } = setupDb();

    // Empty title
    expect(() =>
      createTask(db, {
        courseId: courseA.id,
        title: '   ',
      })
    ).toThrow(/title/i);

    // Non-existent courseId
    expect(() =>
      createTask(db, {
        courseId: 'non-existent-course',
        title: 'Tarea huérfana',
      })
    ).toThrow(/Course not found/i);

    // Invalid dueDate format or impossible calendar date
    expect(() =>
      createTask(db, {
        courseId: courseA.id,
        title: 'Fecha mal formateada',
        dueDate: '15/11/2026',
      })
    ).toThrow(/dueDate/i);

    expect(() =>
      createTask(db, {
        courseId: courseA.id,
        title: 'Fecha calendario inexistente',
        dueDate: '2026-02-30',
      })
    ).toThrow(/dueDate/i);

    // Invalid priority
    expect(() =>
      createTask(db, {
        courseId: courseA.id,
        title: 'Prioridad inválida',
        priority: 'urgent' as unknown as TaskPriority,
      })
    ).toThrow(/priority/i);

    // Create a valid task and test update validations
    const created = createTask(db, {
      courseId: courseA.id,
      title: 'Tarea válida',
    });

    expect(() => updateTask(db, created.id, { title: '  ' })).toThrow(/title/i);
    expect(() => updateTask(db, created.id, { courseId: 'missing' })).toThrow(
      /Course not found/i
    );
    expect(() => updateTask(db, created.id, { dueDate: '2026-13-01' })).toThrow(
      /dueDate/i
    );
    expect(() =>
      updateTask(db, created.id, { priority: 'critical' as unknown as TaskPriority })
    ).toThrow(/priority/i);
  });

  it('toggles task status between pending and done, managing completedAt accurately', () => {
    const { db, courseA } = setupDb();

    const task = createTask(db, {
      courseId: courseA.id,
      title: 'Preparar demo del Sprint',
      dueDate: '2026-11-12',
    });
    expect(task.status).toBe('pending');
    expect(task.completedAt).toBeNull();

    const completed = toggleTaskStatus(db, task.id);
    expect(completed.status).toBe('done');
    expect(completed.completedAt).toEqual(expect.any(String));
    expect(new Date(completed.completedAt!).toString()).not.toBe('Invalid Date');

    const reopened = toggleTaskStatus(db, task.id);
    expect(reopened.status).toBe('pending');
    expect(reopened.completedAt).toBeNull();
  });

  it('filters tasks by courseId, status, and dueFrom/dueTo range with consistent ordering', () => {
    const { db, courseA, courseB } = setupDb();

    const tNoDate = createTask(db, {
      courseId: courseA.id,
      title: 'Tarea sin fecha',
      priority: 'high',
    });
    const tLate = createTask(db, {
      courseId: courseA.id,
      title: 'Entrega vencida',
      dueDate: '2026-11-08',
      priority: 'low',
    });
    const tSameDayLow = createTask(db, {
      courseId: courseB.id,
      title: 'Entrega día 12 prioridad baja',
      dueDate: '2026-11-12',
      priority: 'low',
    });
    const tSameDayHigh = createTask(db, {
      courseId: courseA.id,
      title: 'Entrega día 12 prioridad alta',
      dueDate: '2026-11-12',
      priority: 'high',
    });
    const tFuture = createTask(db, {
      courseId: courseB.id,
      title: 'Entrega futura',
      dueDate: '2026-11-20',
      priority: 'medium',
    });

    // Mark tLate as done so we test pending-first ordering
    toggleTaskStatus(db, tLate.id);

    const all = listTasks(db);
    expect(all.map((t) => t.id)).toEqual([
      tSameDayHigh.id,
      tSameDayLow.id,
      tFuture.id,
      tNoDate.id,
      tLate.id,
    ]);

    // Filter by courseId
    const onlyCourseA = listTasks(db, { courseId: courseA.id });
    expect(onlyCourseA.map((t) => t.id)).toEqual([
      tSameDayHigh.id,
      tNoDate.id,
      tLate.id,
    ]);

    // Filter by status
    const onlyPending = listTasks(db, { status: 'pending' });
    expect(onlyPending.every((t) => t.status === 'pending')).toBe(true);
    expect(onlyPending).toHaveLength(4);

    const onlyDone = listTasks(db, { status: 'done' });
    expect(onlyDone.map((t) => t.id)).toEqual([tLate.id]);

    // Filter by date range dueFrom / dueTo
    const inRange = listTasks(db, {
      dueFrom: '2026-11-10',
      dueTo: '2026-11-15',
    });
    expect(inRange.map((t) => t.id)).toEqual([tSameDayHigh.id, tSameDayLow.id]);
  });

  it('updates and deletes a task', () => {
    const { db, courseA, courseB } = setupDb();

    const task = createTask(db, {
      courseId: courseA.id,
      title: 'Borrador inicial',
      dueDate: '2026-11-14',
      priority: 'low',
    });

    const updated = updateTask(db, task.id, {
      courseId: courseB.id,
      title: 'Versión final entregable',
      description: 'Revisado con el equipo',
      dueDate: '2026-11-16',
      priority: 'high',
    });

    expect(updated.courseId).toBe(courseB.id);
    expect(updated.courseName).toBe('Base de Datos II');
    expect(updated.title).toBe('Versión final entregable');
    expect(updated.description).toBe('Revisado con el equipo');
    expect(updated.dueDate).toBe('2026-11-16');
    expect(updated.priority).toBe('high');

    deleteTask(db, task.id);
    expect(getTaskById(db, task.id)).toBeNull();
    expect(listTasks(db)).toHaveLength(0);
  });
});
