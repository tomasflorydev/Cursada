import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCourse,
  deleteCourse,
  getCourseById,
  getCourseDeleteImpact,
  listCourses,
  updateCourse,
} from '../../electron/db/coursesRepo';
import { createTestDatabase, type DatabaseContext } from '../../electron/db/database';
import { createSourceRecord } from '../../electron/db/sourcesRepo';
import { createTask, listTasks } from '../../electron/db/tasksRepo';
import type { CourseColor, CourseStatus, DayOfWeek } from '../types/domain';

describe('Task 1.2: coursesRepo SQLite CRUD, schedule management, and input validations', () => {
  const contexts: DatabaseContext[] = [];

  function setupDb(): DatabaseContext {
    const ctx = createTestDatabase();
    contexts.push(ctx);
    return ctx;
  }

  afterEach(() => {
    for (const ctx of contexts.splice(0, contexts.length)) {
      const dir = ctx.dataDir;
      ctx.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a course with multiple weekly schedule blocks sorted by day and start time', () => {
    const { db } = setupDb();

    const created = createCourse(db, {
      name: '  Algoritmos y Estructuras de Datos  ',
      color: 'emerald',
      professor: '  Patricia Gómez ',
      term: ' 2026 - 2° Cuatrimestre ',
      schedules: [
        {
          dayOfWeek: 4,
          startTime: '18:30',
          endTime: '22:30',
          location: ' Lab 302 · Lima ',
        },
        {
          dayOfWeek: 1,
          startTime: '18:30',
          endTime: '22:30',
          location: 'Aula 104 · Lima',
        },
      ],
    });

    expect(created.name).toBe('Algoritmos y Estructuras de Datos');
    expect(created.professor).toBe('Patricia Gómez');
    expect(created.term).toBe('2026 - 2° Cuatrimestre');
    expect(created.color).toBe('emerald');
    expect(created.status).toBe('active');
    expect(created.schedules).toHaveLength(2);
    // Sorted by dayOfWeek ASC (Monday=1 first, Thursday=4 second)
    expect(created.schedules[0].dayOfWeek).toBe(1);
    expect(created.schedules[0].location).toBe('Aula 104 · Lima');
    expect(created.schedules[1].dayOfWeek).toBe(4);
    expect(created.schedules[1].location).toBe('Lab 302 · Lima');

    const fetched = getCourseById(db, created.id);
    expect(fetched).toEqual(created);
  });

  it('updates course fields, replaces weekly schedules, and filters by active/archived status', () => {
    const { db } = setupDb();

    const course = createCourse(db, {
      name: 'Sistemas Operativos',
      color: 'cyan',
      professor: 'Hernán Rossi',
      term: '2026 - 1° Cuatrimestre',
      schedules: [
        {
          dayOfWeek: 2,
          startTime: '08:00',
          endTime: '12:00',
          location: 'Aula 201',
        },
      ],
    });

    const updated = updateCourse(db, course.id, {
      name: 'Sistemas Operativos Avanzados',
      color: 'violet',
      status: 'archived',
      schedules: [
        {
          dayOfWeek: 3,
          startTime: '14:00',
          endTime: '18:00',
          location: 'Virtual',
        },
        {
          dayOfWeek: 5,
          startTime: '18:30',
          endTime: '21:30',
          location: 'Lab 401',
        },
      ],
    });

    expect(updated.name).toBe('Sistemas Operativos Avanzados');
    expect(updated.color).toBe('violet');
    expect(updated.status).toBe('archived');
    expect(updated.schedules).toHaveLength(2);
    expect(updated.schedules[0].dayOfWeek).toBe(3);
    expect(updated.schedules[1].dayOfWeek).toBe(5);

    expect(listCourses(db, { status: 'active' })).toHaveLength(0);
    expect(listCourses(db, { status: 'archived' })).toHaveLength(1);
    expect(listCourses(db, { status: 'all' })).toHaveLength(1);
  });

  it('rejects invalid course inputs and invalid schedule blocks', () => {
    const { db } = setupDb();

    expect(() =>
      createCourse(db, {
        name: '   ',
        color: 'blue',
        term: '2026 - 2° Cuatrimestre',
      })
    ).toThrow(/name/i);

    const generalNotebook = createCourse(db, {
      name: 'Proyecto Personal',
      color: 'slate',
      term: '   ',
    });
    expect(generalNotebook.term).toBe('');
    expect(generalNotebook.professor).toBe('');
    expect(generalNotebook.schedules).toEqual([]);

    expect(() =>
      createCourse(db, {
        name: 'Física I',
        color: 'magenta' as CourseColor,
        term: '2026 - 2° Cuatrimestre',
      })
    ).toThrow(/color/i);

    expect(() =>
      createCourse(db, {
        name: 'Física I',
        color: 'blue',
        term: '2026 - 2° Cuatrimestre',
        status: 'deleted' as CourseStatus,
      })
    ).toThrow(/status/i);

    expect(() =>
      createCourse(db, {
        name: 'Física I',
        color: 'blue',
        term: '2026 - 2° Cuatrimestre',
        schedules: [
          {
            dayOfWeek: 0 as DayOfWeek,
            startTime: '10:00',
            endTime: '12:00',
          },
        ],
      })
    ).toThrow(/dayOfWeek/i);

    expect(() =>
      createCourse(db, {
        name: 'Física I',
        color: 'blue',
        term: '2026 - 2° Cuatrimestre',
        schedules: [
          {
            dayOfWeek: 8 as DayOfWeek,
            startTime: '10:00',
            endTime: '12:00',
          },
        ],
      })
    ).toThrow(/dayOfWeek/i);

    expect(() =>
      createCourse(db, {
        name: 'Física I',
        color: 'blue',
        term: '2026 - 2° Cuatrimestre',
        schedules: [
          {
            dayOfWeek: 2,
            startTime: '18:00',
            endTime: '14:00',
          },
        ],
      })
    ).toThrow(/startTime/i);

    expect(() =>
      createCourse(db, {
        name: 'Física I',
        color: 'blue',
        term: '2026 - 2° Cuatrimestre',
        schedules: [
          {
            dayOfWeek: 2,
            startTime: '18:00',
            endTime: '18:00',
          },
        ],
      })
    ).toThrow(/startTime/i);
  });

  it('computes delete impact accurately and cascades deletion to schedules and tasks', () => {
    const { db } = setupDb();

    const course = createCourse(db, {
      name: 'Redes de Datos',
      color: 'orange',
      professor: 'Esteban Quito',
      term: '2026 - 2° Cuatrimestre',
      schedules: [
        {
          dayOfWeek: 1,
          startTime: '18:30',
          endTime: '22:30',
          location: 'Aula 501',
        },
      ],
    });

    createTask(db, {
      courseId: course.id,
      title: 'Configurar topología VLAN',
      dueDate: '2026-11-14',
      priority: 'high',
    });
    createTask(db, {
      courseId: course.id,
      title: 'Cuestionario Capa de Red',
      dueDate: '2026-11-18',
      priority: 'medium',
    });
    createTask(db, {
      courseId: course.id,
      title: 'Informe Wireshark',
      dueDate: '2026-11-20',
      priority: 'low',
    });

    const impact = getCourseDeleteImpact(db, course.id);
    expect(impact).toEqual({
      courseId: course.id,
      courseName: 'Redes de Datos',
      tasksCount: 3,
    });

    deleteCourse(db, course.id);

    expect(getCourseById(db, course.id)).toBeNull();
    expect(listTasks(db, { courseId: course.id })).toHaveLength(0);
    const remainingSchedules = db
      .prepare('SELECT COUNT(*) AS count FROM class_schedules WHERE course_id = ?')
      .get(course.id) as { count: number };
    expect(Number(remainingSchedules.count)).toBe(0);
  });

  it('persists attendanceEnabled/maxAbsences and deletes physical sources/ files when deleting a course', () => {
    const ctx = setupDb();
    const course = createCourse(ctx.db, {
      name: 'Arquitectura de Computadoras',
      color: 'amber',
      term: '2026 - 2° Cuatrimestre',
      attendanceEnabled: true,
      maxAbsences: 6,
      schedules: [],
    });

    expect(course.attendanceEnabled).toBe(true);
    expect(course.maxAbsences).toBe(6);

    const updated = updateCourse(ctx.db, course.id, {
      attendanceEnabled: false,
      maxAbsences: 3,
    });
    expect(updated.attendanceEnabled).toBe(false);
    expect(updated.maxAbsences).toBe(3);

    const sourcesDir = path.join(ctx.dataDir, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });
    const storedFilename = 'apuntes-arqui.pdf';
    const storedFilePath = path.join(sourcesDir, storedFilename);
    fs.writeFileSync(storedFilePath, Buffer.from('%PDF-1.4 fake content'));

    createSourceRecord(ctx.db, {
      courseId: course.id,
      title: 'Apuntes Arqui',
      sourceType: 'pdf',
      storedFilename,
      rawText: 'Registros y pipeline.',
      pageCount: 1,
    });

    expect(fs.existsSync(storedFilePath)).toBe(true);
    deleteCourse(ctx.db, course.id, ctx.dataDir);

    expect(getCourseById(ctx.db, course.id)).toBeNull();
    expect(fs.existsSync(storedFilePath)).toBe(false);
  });
});
