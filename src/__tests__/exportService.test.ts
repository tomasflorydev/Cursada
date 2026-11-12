import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import { createExam } from '../../electron/db/examsRepo';
import { createTask, updateTask } from '../../electron/db/tasksRepo';
import {
  exportMarkdownFromDb,
  sanitizeFilename,
} from '../../electron/services/exportService';

function insertNoteSql(
  db: ReturnType<typeof createTestDatabase>['db'],
  params: {
    id: string;
    courseId: string;
    title: string;
    content: string;
    origin?: 'manual' | 'ai_summary' | 'ai_study_guide' | 'ai_practice_exam';
    isPinned?: boolean;
    updatedAt?: string;
  }
): void {
  const now = params.updatedAt ?? '2026-11-10T15:00:00.000Z';
  db.prepare(
    `INSERT INTO notes (id, course_id, title, content, origin, is_pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.courseId,
    params.title,
    params.content,
    params.origin ?? 'manual',
    params.isPinned ? 1 : 0,
    now,
    now
  );
}

describe('Phase 4 Task 4.2 Backend: exportService Markdown export', () => {
  const tempDirs: string[] = [];

  function makeTempExportDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-export-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sanitizes filenames safely: strips Spanish accents, blocks path traversal, and provides fallback', () => {
    expect(sanitizeFilename('Ingeniería de Software I')).toBe(
      'ingenieria-de-software-i'
    );
    expect(sanitizeFilename('Diseño & Arquitectura (1/2) — Ñandú')).toBe(
      'diseno-arquitectura-1-2-nandu'
    );

    const traversal = sanitizeFilename('../../../etc/passwd');
    expect(traversal).not.toContain('..');
    expect(traversal).not.toContain('/');
    expect(traversal).not.toContain('\\');
    expect(traversal).toBe('etc-passwd');

    expect(sanitizeFilename('..')).toBe('sin-titulo');
    expect(sanitizeFilename('///...///')).toBe('sin-titulo');
    expect(sanitizeFilename('   ')).toBe('sin-titulo');
  });

  it('exports a single note (scope: note) with metadata header and full Markdown content', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);
    const outDir = makeTempExportDir();

    const course = createCourse(ctx.db, {
      name: 'Ingeniería de Software I',
      color: 'blue',
      professor: 'Martín Echeverría',
      term: '2026 - 2° Cuatrimestre',
      schedules: [],
    });

    insertNoteSql(ctx.db, {
      id: 'note-1',
      courseId: course.id,
      title: 'Resumen: Historias de Usuario & INVEST',
      content: '## Criterios INVEST\n\n- Independiente\n- Negociable\n- Valiosa',
      origin: 'ai_summary',
      isPinned: true,
    });

    const result = exportMarkdownFromDb(ctx.db, {
      scope: 'note',
      noteId: 'note-1',
      targetDir: outDir,
    });

    expect(result.canceled).toBe(false);
    expect(result.mode).toBe('filesystem');
    expect(result.fileCount).toBe(1);
    expect(result.targetDir).toBe(outDir);

    const expectedPath = path.join(outDir, 'resumen-historias-de-usuario-invest.md');
    expect(result.filesCreated).toEqual([expectedPath]);
    expect(fs.existsSync(expectedPath)).toBe(true);

    const content = fs.readFileSync(expectedPath, 'utf8');
    expect(content).toContain('# Resumen: Historias de Usuario & INVEST');
    expect(content).toContain('**Materia:** Ingeniería de Software I');
    expect(content).toContain('**Cuatrimestre:** 2026 - 2° Cuatrimestre');
    expect(content).toContain('**Origen:** Resumen IA');
    expect(content).toContain('## Criterios INVEST');
    expect(content).toContain('- Valiosa');

    ctx.close();
  });

  it('exports a full course (scope: course) with summary, schedules, task checkboxes, exams table + average, and deduplicated notes', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);
    const outDir = makeTempExportDir();

    const course = createCourse(ctx.db, {
      name: 'Base de Datos II',
      color: 'emerald',
      professor: 'Alejandro Vera',
      term: '2026 - 2° Cuatrimestre',
      schedules: [
        {
          dayOfWeek: 3,
          startTime: '18:30',
          endTime: '22:30',
          location: 'Lab 504 · Lima',
        },
      ],
    });

    createTask(ctx.db, {
      courseId: course.id,
      title: 'Analizar plan de ejecución con índices compuestos',
      dueDate: '2026-11-18',
      priority: 'high',
    });

    const doneTask = createTask(ctx.db, {
      courseId: course.id,
      title: 'Normalizar esquema de facturación a FNBC',
      dueDate: '2026-11-05',
      priority: 'medium',
    });
    updateTask(ctx.db, doneTask.id, { status: 'done' });

    createExam(ctx.db, {
      courseId: course.id,
      title: '1° Parcial Modelado',
      category: 'parcial',
      examDate: '2026-09-30',
      examTime: '18:30',
      location: 'Lab 504',
      grade: 8,
    });
    createExam(ctx.db, {
      courseId: course.id,
      title: 'TP Índices B+Tree',
      category: 'tp',
      examDate: '2026-10-20',
      grade: 9,
    });
    createExam(ctx.db, {
      courseId: course.id,
      title: '2° Parcial Concurrencia',
      category: 'parcial',
      examDate: '2026-11-25',
      grade: null,
    });

    // Insert 3 notes with identical title to verify -2, -3 filename disambiguation
    insertNoteSql(ctx.db, {
      id: 'n-dup-1',
      courseId: course.id,
      title: 'Clase Práctica',
      content: 'Contenido primera nota',
      isPinned: true,
      updatedAt: '2026-11-10T16:00:00.000Z',
    });
    insertNoteSql(ctx.db, {
      id: 'n-dup-2',
      courseId: course.id,
      title: 'Clase Práctica',
      content: 'Contenido segunda nota',
      updatedAt: '2026-11-10T15:00:00.000Z',
    });
    insertNoteSql(ctx.db, {
      id: 'n-dup-3',
      courseId: course.id,
      title: 'Clase Práctica',
      content: 'Contenido tercera nota',
      updatedAt: '2026-11-10T14:00:00.000Z',
    });

    const result = exportMarkdownFromDb(ctx.db, {
      scope: 'course',
      courseId: course.id,
      targetDir: outDir,
    });

    expect(result.canceled).toBe(false);
    expect(result.fileCount).toBe(4); // 00-Resumen-Materia.md + 3 notes

    const courseDir = path.join(outDir, 'base-de-datos-ii');
    const summaryPath = path.join(courseDir, '00-Resumen-Materia.md');
    const note1Path = path.join(courseDir, 'notas', 'clase-practica.md');
    const note2Path = path.join(courseDir, 'notas', 'clase-practica-2.md');
    const note3Path = path.join(courseDir, 'notas', 'clase-practica-3.md');

    expect(fs.existsSync(summaryPath)).toBe(true);
    expect(fs.existsSync(note1Path)).toBe(true);
    expect(fs.existsSync(note2Path)).toBe(true);
    expect(fs.existsSync(note3Path)).toBe(true);

    const summary = fs.readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('# Base de Datos II');
    expect(summary).toContain('**Miércoles:** 18:30 – 22:30 (Lab 504 · Lima)');
    expect(summary).toContain('- [ ] Analizar plan de ejecución con índices compuestos');
    expect(summary).toContain('- [x] Normalizar esquema de facturación a FNBC');
    expect(summary).toContain('**Promedio general:** 8.50 (sobre 2 exámenes calificados)');
    expect(summary).toContain('| Fecha | Instancia | Título | Lugar | Nota |');
    expect(summary).toContain('| 30/09/2026 18:30 | Parcial | 1° Parcial Modelado | Lab 504 | 8 |');
    expect(summary).toContain('| 25/11/2026 | Parcial | 2° Parcial Concurrencia | — | Pendiente |');
    expect(summary).toContain('./notas/clase-practica.md');
    expect(summary).toContain('./notas/clase-practica-2.md');
    expect(summary).toContain('./notas/clase-practica-3.md');

    expect(fs.readFileSync(note1Path, 'utf8')).toContain('Contenido primera nota');
    expect(fs.readFileSync(note2Path, 'utf8')).toContain('Contenido segunda nota');
    expect(fs.readFileSync(note3Path, 'utf8')).toContain('Contenido tercera nota');

    ctx.close();
  });

  it('exports all active and archived courses (scope: all) with README.md index', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);
    const outDir = makeTempExportDir();

    const activeCourse = createCourse(ctx.db, {
      name: 'Diseño de Sistemas',
      color: 'violet',
      professor: 'Carolina Méndez',
      term: '2026 - 2° Cuatrimestre',
      status: 'active',
      schedules: [],
    });

    const archivedCourse = createCourse(ctx.db, {
      name: 'Algoritmos y Estructuras',
      color: 'slate',
      professor: 'Luis Gómez',
      term: '2026 - 1° Cuatrimestre',
      status: 'archived',
      schedules: [],
    });

    insertNoteSql(ctx.db, {
      id: 'note-dds',
      courseId: activeCourse.id,
      title: 'Patrones GoF',
      content: 'Adapter, Decorator, Strategy.',
    });

    insertNoteSql(ctx.db, {
      id: 'note-algo',
      courseId: archivedCourse.id,
      title: 'Árboles AVL',
      content: 'Rotaciones simples y dobles.',
    });

    const result = exportMarkdownFromDb(ctx.db, {
      scope: 'all',
      targetDir: outDir,
    });

    expect(result.canceled).toBe(false);
    expect(result.mode).toBe('filesystem');
    // README.md + 2x (00-Resumen-Materia.md + 1 note) = 5 files
    expect(result.fileCount).toBe(5);

    const exportRoot = path.join(outDir, 'cursada-export');
    expect(result.targetDir).toBe(exportRoot);

    const readmePath = path.join(exportRoot, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toContain('# Exportación completa de Cursada');
    expect(readme).toContain('## Materias en curso');
    expect(readme).toContain(
      '[Diseño de Sistemas](./diseno-de-sistemas/00-Resumen-Materia.md)'
    );
    expect(readme).toContain('## Materias archivadas');
    expect(readme).toContain(
      '[Algoritmos y Estructuras](./algoritmos-y-estructuras/00-Resumen-Materia.md)'
    );

    expect(
      fs.existsSync(
        path.join(exportRoot, 'diseno-de-sistemas', 'notas', 'patrones-gof.md')
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(exportRoot, 'algoritmos-y-estructuras', 'notas', 'arboles-avl.md')
      )
    ).toBe(true);

    ctx.close();
  });

  it('throws clear errors when targetDir is missing or noteId/courseId does not exist', () => {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);
    const outDir = makeTempExportDir();

    expect(() =>
      exportMarkdownFromDb(ctx.db, { scope: 'all', targetDir: '   ' })
    ).toThrow(/targetDir/i);

    expect(() =>
      exportMarkdownFromDb(ctx.db, {
        scope: 'note',
        noteId: 'missing-note',
        targetDir: outDir,
      })
    ).toThrow(/No se encontró la nota/i);

    expect(() =>
      exportMarkdownFromDb(ctx.db, {
        scope: 'course',
        courseId: 'missing-course',
        targetDir: outDir,
      })
    ).toThrow(/No se encontró la materia/i);

    ctx.close();
  });
});
