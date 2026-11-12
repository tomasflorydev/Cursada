import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCourse,
  deleteCourse,
  getCourseDeleteImpact,
} from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import {
  calculateCourseAverageGrade,
  createExam,
  deleteExam,
  listExams,
  updateExam,
} from '../../electron/db/examsRepo';

describe('Task 3.1 Backend: SQLite examsRepo CRUD, validation, and average grade calculation', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates, filters, updates, grades, and deletes exams in SQLite and computes course average', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const course = createCourse(ctx.db, {
      name: 'Ingeniería de Software I',
      color: 'blue',
      professor: 'Martín Echeverría',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });

    const exam1 = createExam(ctx.db, {
      courseId: course.id,
      title: '1° Parcial — Requisitos y Diseño',
      category: 'parcial',
      examDate: '2026-09-25',
      examTime: '18:30',
      location: 'Aula 402 · Lima',
      topics: 'Unidades 1 a 3',
      grade: 8,
    });

    const exam2 = createExam(ctx.db, {
      courseId: course.id,
      title: '2° Parcial — Arquitectura y Testing',
      category: 'parcial',
      examDate: '2026-11-13',
      examTime: '18:30',
      location: 'Aula 402 · Lima',
      topics: 'Unidades 4 a 7',
      grade: null,
    });

    expect(exam1.courseName).toBe('Ingeniería de Software I');
    expect(exam1.grade).toBe(8);
    expect(exam2.grade).toBeNull();

    // Verify filters: all, graded, ungraded
    expect(listExams(ctx.db, { courseId: course.id, graded: 'all' })).toHaveLength(2);
    expect(listExams(ctx.db, { courseId: course.id, graded: 'graded' })).toHaveLength(1);
    expect(listExams(ctx.db, { courseId: course.id, graded: 'ungraded' })).toHaveLength(1);

    // Average with one graded exam (8)
    expect(calculateCourseAverageGrade(ctx.db, course.id)).toBe(8);

    // Load grade 9 on second exam -> average becomes 8.5
    const updatedExam2 = updateExam(ctx.db, exam2.id, {
      grade: 9,
      topics: 'Unidades 4 a 7: Arquitectura limpia y TDD',
    });
    expect(updatedExam2.grade).toBe(9);
    expect(calculateCourseAverageGrade(ctx.db, course.id)).toBe(8.5);

    // Delete impact includes examsCount
    const impact = getCourseDeleteImpact(ctx.db, course.id);
    expect(impact.examsCount).toBe(2);

    // Delete one exam
    deleteExam(ctx.db, exam1.id);
    expect(listExams(ctx.db, { courseId: course.id })).toHaveLength(1);
    expect(calculateCourseAverageGrade(ctx.db, course.id)).toBe(9);

    // Deleting the course cascades to remaining exams
    deleteCourse(ctx.db, course.id);
    expect(listExams(ctx.db)).toHaveLength(0);

    ctx.close();
  });

  it('rejects invalid grade outside scale 1..10, empty titles, and invalid dates/times', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const course = createCourse(ctx.db, {
      name: 'Base de Datos II',
      color: 'emerald',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });

    expect(() =>
      createExam(ctx.db, {
        courseId: course.id,
        title: '   ',
        category: 'parcial',
        examDate: '2026-11-19',
      })
    ).toThrow(/Exam title cannot be empty/i);

    expect(() =>
      createExam(ctx.db, {
        courseId: course.id,
        title: 'Parcial con fecha inválida',
        category: 'parcial',
        examDate: '19/11/2026',
      })
    ).toThrow(/Invalid examDate/i);

    expect(() =>
      createExam(ctx.db, {
        courseId: course.id,
        title: 'Parcial con hora inválida',
        category: 'parcial',
        examDate: '2026-11-19',
        examTime: '25:99',
      })
    ).toThrow(/Invalid examTime/i);

    expect(() =>
      createExam(ctx.db, {
        courseId: course.id,
        title: 'Parcial con nota fuera de rango',
        category: 'parcial',
        examDate: '2026-11-19',
        grade: 11,
      })
    ).toThrow(/Grade must be between 1 and 10/i);

    expect(() =>
      createExam(ctx.db, {
        courseId: course.id,
        title: 'Parcial con nota cero',
        category: 'parcial',
        examDate: '2026-11-19',
        grade: 0,
      })
    ).toThrow(/Grade must be between 1 and 10/i);

    ctx.close();
  });
});
