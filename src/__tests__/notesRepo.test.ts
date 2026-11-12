import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCourse,
  deleteCourse,
  getCourseDeleteImpact,
} from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import {
  createNote,
  deleteNote,
  getNoteById,
  listNotes,
  toggleNotePin,
  updateNote,
} from '../../electron/db/notesRepo';

describe('Phase 4 Task 4.1 Backend: SQLite notesRepo CRUD, pinning, FTS5 accent-insensitive search, and cascade cleanup', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates, reads, updates, pins, filters, and deletes notes with proper validation', async () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const courseA = createCourse(ctx.db, {
      name: 'Base de Datos II',
      color: 'emerald',
      professor: 'Alejandro Vera',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });
    const courseB = createCourse(ctx.db, {
      name: 'Paradigmas de Programación',
      color: 'rose',
      professor: 'Diego Santoro',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });

    const note1 = createNote(ctx.db, {
      courseId: courseA.id,
      title: 'Normalización y Dependencias',
      content: '## 1FN a FNBC\n\n- [x] Revisar descomposición sin pérdida',
      origin: 'manual',
      isPinned: false,
    });

    // Small delay to ensure distinct updated_at ordering
    await new Promise((resolve) => setTimeout(resolve, 10));

    const note2 = createNote(ctx.db, {
      courseId: courseB.id,
      title: 'Evaluación Diferida en Haskell',
      content: 'Uso de listas infinitas y foldr.',
      origin: 'ai_summary',
      isPinned: false,
    });

    expect(note1.courseName).toBe('Base de Datos II');
    expect(note1.isPinned).toBe(false);
    expect(getNoteById(ctx.db, note1.id)?.title).toBe('Normalización y Dependencias');
    expect(getNoteById(ctx.db, 'non-existent')).toBeNull();

    // Default order: updated_at DESC when neither is pinned
    const initialList = listNotes(ctx.db);
    expect(initialList.map((n) => n.id)).toEqual([note2.id, note1.id]);

    // Pin note1 -> moves to top
    const pinnedNote1 = toggleNotePin(ctx.db, note1.id);
    expect(pinnedNote1.isPinned).toBe(true);
    const afterPinList = listNotes(ctx.db);
    expect(afterPinList.map((n) => n.id)).toEqual([note1.id, note2.id]);

    // Filter by pinnedOnly and by courseId
    expect(listNotes(ctx.db, { pinnedOnly: true }).map((n) => n.id)).toEqual([
      note1.id,
    ]);
    expect(listNotes(ctx.db, { courseId: courseB.id }).map((n) => n.id)).toEqual([
      note2.id,
    ]);

    // Update note2 title and content
    const updatedNote2 = updateNote(ctx.db, note2.id, {
      title: 'Haskell: Evaluación Perezosa',
      content: 'Thunks, memoización y composición.',
    });
    expect(updatedNote2.title).toBe('Haskell: Evaluación Perezosa');

    // Validation errors
    expect(() =>
      createNote(ctx.db, { courseId: courseA.id, title: '   ' })
    ).toThrow(/empty/i);
    expect(() =>
      createNote(ctx.db, { courseId: 'missing-course', title: 'Válido' })
    ).toThrow(/Course not found/i);
    expect(() => updateNote(ctx.db, note1.id, { title: '  ' })).toThrow(
      /empty/i
    );
    expect(() => toggleNotePin(ctx.db, 'missing-note')).toThrow(
      /Note not found/i
    );

    // Delete note2
    deleteNote(ctx.db, note2.id);
    expect(listNotes(ctx.db).map((n) => n.id)).toEqual([note1.id]);

    ctx.close();
  });

  it('performs accent-insensitive FTS5 search, handles special punctuation safely, and syncs updates', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const course = createCourse(ctx.db, {
      name: 'Base de Datos II',
      color: 'emerald',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });

    const algebraNote = createNote(ctx.db, {
      courseId: course.id,
      title: 'Álgebra Relacional y Cálculo',
      content: 'Operadores de selección, proyección y reunión natural.',
    });

    const progNote = createNote(ctx.db, {
      courseId: course.id,
      title: 'Programación de Procedimientos Almacenados',
      content: 'Índices B-Tree y optimización de consultas.',
    });

    // Accent-insensitive search (without diacritics finds diacritic titles/content)
    expect(listNotes(ctx.db, { query: 'algebra' }).map((n) => n.id)).toEqual([
      algebraNote.id,
    ]);
    expect(listNotes(ctx.db, { query: 'Álgebra' }).map((n) => n.id)).toEqual([
      algebraNote.id,
    ]);
    expect(
      listNotes(ctx.db, { query: 'programacion' }).map((n) => n.id)
    ).toEqual([progNote.id]);
    expect(listNotes(ctx.db, { query: 'indices' }).map((n) => n.id)).toEqual([
      progNote.id,
    ]);
    expect(listNotes(ctx.db, { query: 'calculo' }).map((n) => n.id)).toEqual([
      algebraNote.id,
    ]);

    // Prefix search works
    expect(listNotes(ctx.db, { query: 'optimiz' }).map((n) => n.id)).toEqual([
      progNote.id,
    ]);

    // Updating a note syncs notes_fts triggers
    updateNote(ctx.db, progNote.id, {
      title: 'Triggers y Concurrencia',
      content: 'Niveles de aislamiento Serializable.',
    });
    expect(listNotes(ctx.db, { query: 'programacion' })).toHaveLength(0);
    expect(listNotes(ctx.db, { query: 'aislamiento' }).map((n) => n.id)).toEqual([
      progNote.id,
    ]);

    // Special FTS5 operators & punctuation never crash
    expect(() =>
      listNotes(ctx.db, { query: '"" * () : ^ - + AND OR NOT NEAR' })
    ).not.toThrow();
    expect(() => listNotes(ctx.db, { query: '??? *** ---' })).not.toThrow();
    expect(() => listNotes(ctx.db, { query: '   ' })).not.toThrow();
    expect(listNotes(ctx.db, { query: '   ' })).toHaveLength(2);
    expect(() =>
      listNotes(ctx.db, { query: '¿Álgebra? (relacional)!' })
    ).not.toThrow();
    expect(
      listNotes(ctx.db, { query: '¿Álgebra? (relacional)!' }).map((n) => n.id)
    ).toEqual([algebraNote.id]);

    ctx.close();
  });

  it('cleans up notes and notes_fts when a course is deleted via ON DELETE CASCADE', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);

    const course = createCourse(ctx.db, {
      name: 'Ingeniería de Software I',
      color: 'blue',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });

    createNote(ctx.db, {
      courseId: course.id,
      title: 'Métricas Ágiles',
      content: 'Velocidad y deuda técnica.',
    });

    expect(getCourseDeleteImpact(ctx.db, course.id).notesCount).toBe(1);

    const beforeCount = ctx.db
      .prepare('SELECT COUNT(*) AS count FROM notes_fts')
      .get() as { count: number };
    expect(Number(beforeCount.count)).toBe(1);

    deleteCourse(ctx.db, course.id);

    expect(listNotes(ctx.db)).toHaveLength(0);
    const afterCount = ctx.db
      .prepare('SELECT COUNT(*) AS count FROM notes_fts')
      .get() as { count: number };
    expect(Number(afterCount.count)).toBe(0);

    ctx.close();
  });
});
