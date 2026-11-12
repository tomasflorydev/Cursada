import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CourseColor,
  CourseStatus,
  DayOfWeek,
  ExamCategory,
  ExportMarkdownRequest,
  ExportMarkdownResult,
  NoteOrigin,
  TaskPriority,
  TaskStatus,
} from '../types.js';

interface CourseRow {
  id: string;
  name: string;
  color: CourseColor;
  professor: string;
  term: string;
  status: CourseStatus;
  created_at: string;
  updated_at: string;
}

interface ScheduleRow {
  id: string;
  course_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  location: string;
}

interface TaskRow {
  id: string;
  course_id: string;
  title: string;
  description: string;
  due_date: string | null;
  priority: TaskPriority | null;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ExamRow {
  id: string;
  course_id: string;
  title: string;
  category: ExamCategory;
  exam_date: string;
  exam_time: string | null;
  location: string;
  topics: string;
  grade: number | null;
  created_at: string;
  updated_at: string;
}

interface NoteWithCourseRow {
  id: string;
  course_id: string;
  title: string;
  content: string;
  origin: NoteOrigin;
  is_pinned: number;
  created_at: string;
  updated_at: string;
  course_name: string;
  course_term: string;
}

const DAY_NAMES_ES: Record<DayOfWeek, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'Parcial',
  recuperatorio: 'Recuperatorio',
  final: 'Final',
  tp: 'Trabajo Práctico',
};

const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const NOTE_ORIGIN_LABELS: Record<NoteOrigin, string> = {
  manual: 'Manual',
  ai_summary: 'Resumen IA',
  ai_study_guide: 'Guía de estudio IA',
  ai_practice_exam: 'Parcial de práctica IA',
};

/**
 * Converts an arbitrary title or course name into a safe filesystem slug.
 * Strips Spanish diacritics, prevents path traversal, and guarantees a non-empty name.
 */
export function sanitizeFilename(name: string): string {
  const normalized = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.\.+/g, '-')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 96)
    .replace(/-+$/g, '');

  if (!normalized || normalized === '.' || normalized === '..') {
    return 'sin-titulo';
  }
  return normalized;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function formatDateLabel(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [year, month, day] = isoOrDate.split('-');
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoOrDate;
  }
  return parsed.toISOString().slice(0, 10);
}

function claimUniqueSlug(baseSlug: string, usedSlugs: Set<string>): string {
  let candidate = baseSlug;
  let suffix = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  usedSlugs.add(candidate);
  return candidate;
}

function formatSingleNoteMarkdown(note: NoteWithCourseRow): string {
  const originLabel = NOTE_ORIGIN_LABELS[note.origin] ?? note.origin;
  const lines = [
    `# ${note.title}`,
    '',
    `- **Materia:** ${note.course_name}`,
    `- **Cuatrimestre:** ${note.course_term}`,
    `- **Última actualización:** ${formatDateLabel(note.updated_at)}`,
    `- **Origen:** ${originLabel}`,
    `- **Fijada:** ${note.is_pinned ? 'Sí' : 'No'}`,
    '',
    '---',
    '',
    note.content.trimEnd(),
    '',
  ];
  return lines.join('\n');
}

function formatCourseSummaryMarkdown(params: {
  course: CourseRow;
  schedules: ScheduleRow[];
  tasks: TaskRow[];
  exams: ExamRow[];
  noteEntries: Array<{ title: string; relativePath: string; isPinned: boolean }>;
}): string {
  const { course, schedules, tasks, exams, noteEntries } = params;
  const lines: string[] = [
    `# ${course.name}`,
    '',
    `- **Docente:** ${course.professor || 'Sin especificar'}`,
    `- **Cuatrimestre:** ${course.term}`,
    `- **Estado:** ${course.status === 'active' ? 'En curso' : 'Archivada'}`,
    '',
    '## Horarios de cursada',
    '',
  ];

  if (schedules.length === 0) {
    lines.push('Sin horarios registrados.');
  } else {
    for (const sched of schedules) {
      const dayName = DAY_NAMES_ES[sched.day_of_week] ?? `Día ${sched.day_of_week}`;
      const locationSuffix = sched.location ? ` (${sched.location})` : '';
      lines.push(`- **${dayName}:** ${sched.start_time} – ${sched.end_time}${locationSuffix}`);
    }
  }

  lines.push('', '## Tareas', '');

  if (tasks.length === 0) {
    lines.push('Sin tareas registradas.');
  } else {
    for (const task of tasks) {
      const check = task.status === 'done' ? 'x' : ' ';
      const metaParts: string[] = [];
      if (task.due_date) {
        metaParts.push(`Vence: ${formatDateLabel(task.due_date)}`);
      }
      if (task.priority) {
        metaParts.push(`Prioridad: ${TASK_PRIORITY_LABELS[task.priority] ?? task.priority}`);
      }
      const metaSuffix = metaParts.length > 0 ? ` _(${metaParts.join(' · ')})_` : '';
      lines.push(`- [${check}] ${task.title}${metaSuffix}`);
      if (task.description.trim()) {
        lines.push(`  - ${task.description.trim()}`);
      }
    }
  }

  lines.push('', '## Exámenes y calificaciones', '');

  const gradedExams = exams.filter((exam) => exam.grade !== null && exam.grade !== undefined);
  if (gradedExams.length > 0) {
    const sum = gradedExams.reduce((acc, exam) => acc + Number(exam.grade), 0);
    const average = Math.round((sum / gradedExams.length) * 100) / 100;
    lines.push(
      `**Promedio general:** ${average.toFixed(2)} (sobre ${gradedExams.length} ${
        gradedExams.length === 1 ? 'examen calificado' : 'exámenes calificados'
      })`,
      ''
    );
  } else {
    lines.push('**Promedio general:** Sin calificaciones registradas aún.', '');
  }

  if (exams.length === 0) {
    lines.push('Sin exámenes registrados.');
  } else {
    lines.push('| Fecha | Instancia | Título | Lugar | Nota |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const exam of exams) {
      const dateText = exam.exam_time
        ? `${formatDateLabel(exam.exam_date)} ${exam.exam_time}`
        : formatDateLabel(exam.exam_date);
      const categoryText = EXAM_CATEGORY_LABELS[exam.category] ?? exam.category;
      const locationText = exam.location || '—';
      const gradeText = exam.grade !== null ? String(exam.grade) : 'Pendiente';
      lines.push(
        `| ${escapeMarkdownTableCell(dateText)} | ${escapeMarkdownTableCell(
          categoryText
        )} | ${escapeMarkdownTableCell(exam.title)} | ${escapeMarkdownTableCell(
          locationText
        )} | ${escapeMarkdownTableCell(gradeText)} |`
      );
    }
  }

  lines.push('', '## Apuntes', '');

  if (noteEntries.length === 0) {
    lines.push('Sin apuntes registrados.');
  } else {
    for (const entry of noteEntries) {
      const pinPrefix = entry.isPinned ? '[Fijada] ' : '';
      lines.push(`- ${pinPrefix}[${entry.title}](${entry.relativePath})`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function loadCourseData(db: DatabaseSync, courseId: string): {
  course: CourseRow;
  schedules: ScheduleRow[];
  tasks: TaskRow[];
  exams: ExamRow[];
  notes: NoteWithCourseRow[];
} {
  const course = db
    .prepare('SELECT * FROM courses WHERE id = ?')
    .get(courseId) as CourseRow | undefined;

  if (!course) {
    throw new Error(`No se encontró la materia: ${courseId}`);
  }

  const schedules = db
    .prepare(
      `SELECT * FROM class_schedules
       WHERE course_id = ?
       ORDER BY day_of_week ASC, start_time ASC`
    )
    .all(courseId) as unknown as ScheduleRow[];

  const tasks = db
    .prepare(
      `SELECT * FROM tasks
       WHERE course_id = ?
       ORDER BY
         CASE WHEN status = 'pending' THEN 0 ELSE 1 END ASC,
         CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
         due_date ASC,
         created_at ASC`
    )
    .all(courseId) as unknown as TaskRow[];

  const exams = db
    .prepare(
      `SELECT * FROM exams
       WHERE course_id = ?
       ORDER BY
         exam_date ASC,
         CASE WHEN exam_time IS NULL THEN 1 ELSE 0 END ASC,
         exam_time ASC,
         created_at ASC`
    )
    .all(courseId) as unknown as ExamRow[];

  const notes = db
    .prepare(
      `SELECT n.*, c.name AS course_name, c.term AS course_term
       FROM notes n
       INNER JOIN courses c ON c.id = n.course_id
       WHERE n.course_id = ?
       ORDER BY n.is_pinned DESC, n.updated_at DESC, n.created_at ASC`
    )
    .all(courseId) as unknown as NoteWithCourseRow[];

  return { course, schedules, tasks, exams, notes };
}

function writeCourseExport(
  db: DatabaseSync,
  courseId: string,
  baseDir: string,
  usedCourseSlugs: Set<string>
): {
  course: CourseRow;
  courseDirSlug: string;
  filesCreated: string[];
  taskCount: number;
  examCount: number;
  noteCount: number;
} {
  const { course, schedules, tasks, exams, notes } = loadCourseData(db, courseId);
  const courseDirSlug = claimUniqueSlug(sanitizeFilename(course.name), usedCourseSlugs);
  const courseDir = path.join(baseDir, courseDirSlug);
  const notesDir = path.join(courseDir, 'notas');

  fs.mkdirSync(courseDir, { recursive: true });
  if (notes.length > 0) {
    fs.mkdirSync(notesDir, { recursive: true });
  }

  const filesCreated: string[] = [];
  const usedNoteSlugs = new Set<string>();
  const noteEntries: Array<{ title: string; relativePath: string; isPinned: boolean }> = [];

  for (const note of notes) {
    const noteSlug = claimUniqueSlug(sanitizeFilename(note.title), usedNoteSlugs);
    const noteFilename = `${noteSlug}.md`;
    const noteFilePath = path.join(notesDir, noteFilename);
    fs.writeFileSync(noteFilePath, formatSingleNoteMarkdown(note), 'utf8');
    filesCreated.push(noteFilePath);
    noteEntries.push({
      title: note.title,
      relativePath: `./notas/${noteFilename}`,
      isPinned: Boolean(note.is_pinned),
    });
  }

  const summaryPath = path.join(courseDir, '00-Resumen-Materia.md');
  const summaryMarkdown = formatCourseSummaryMarkdown({
    course,
    schedules,
    tasks,
    exams,
    noteEntries,
  });
  fs.writeFileSync(summaryPath, summaryMarkdown, 'utf8');
  filesCreated.unshift(summaryPath);

  return {
    course,
    courseDirSlug,
    filesCreated,
    taskCount: tasks.length,
    examCount: exams.length,
    noteCount: notes.length,
  };
}

export function exportMarkdownFromDb(
  db: DatabaseSync,
  request: ExportMarkdownRequest
): ExportMarkdownResult {
  const rawTargetDir = request.targetDir?.trim();
  if (!rawTargetDir) {
    throw new Error('La carpeta de destino (targetDir) es obligatoria para exportar.');
  }

  const resolvedTargetDir = path.resolve(rawTargetDir);
  fs.mkdirSync(resolvedTargetDir, { recursive: true });

  if (request.scope === 'note') {
    const noteId = request.noteId?.trim();
    if (!noteId) {
      throw new Error('Se requiere noteId para exportar una nota.');
    }

    const note = db
      .prepare(
        `SELECT n.*, c.name AS course_name, c.term AS course_term
         FROM notes n
         INNER JOIN courses c ON c.id = n.course_id
         WHERE n.id = ?`
      )
      .get(noteId) as NoteWithCourseRow | undefined;

    if (!note) {
      throw new Error(`No se encontró la nota: ${noteId}`);
    }

    const filePath = path.join(resolvedTargetDir, `${sanitizeFilename(note.title)}.md`);
    fs.writeFileSync(filePath, formatSingleNoteMarkdown(note), 'utf8');

    return {
      canceled: false,
      targetDir: resolvedTargetDir,
      filesCreated: [filePath],
      fileCount: 1,
      mode: 'filesystem',
    };
  }

  if (request.scope === 'course') {
    const courseId = request.courseId?.trim();
    if (!courseId) {
      throw new Error('Se requiere courseId para exportar una materia.');
    }

    const exported = writeCourseExport(db, courseId, resolvedTargetDir, new Set<string>());
    return {
      canceled: false,
      targetDir: resolvedTargetDir,
      filesCreated: exported.filesCreated,
      fileCount: exported.filesCreated.length,
      mode: 'filesystem',
    };
  }

  if (request.scope === 'all') {
    const exportRoot = path.join(resolvedTargetDir, 'cursada-export');
    fs.mkdirSync(exportRoot, { recursive: true });

    const courses = db
      .prepare(
        `SELECT * FROM courses
         ORDER BY
           CASE WHEN status = 'active' THEN 0 ELSE 1 END ASC,
           created_at ASC`
      )
      .all() as unknown as CourseRow[];

    const filesCreated: string[] = [];
    const usedCourseSlugs = new Set<string>();
    const activeEntries: Array<{
      name: string;
      term: string;
      professor: string;
      slug: string;
      taskCount: number;
      examCount: number;
      noteCount: number;
    }> = [];
    const archivedEntries: typeof activeEntries = [];

    for (const course of courses) {
      const exported = writeCourseExport(db, course.id, exportRoot, usedCourseSlugs);
      filesCreated.push(...exported.filesCreated);
      const entry = {
        name: course.name,
        term: course.term,
        professor: course.professor,
        slug: exported.courseDirSlug,
        taskCount: exported.taskCount,
        examCount: exported.examCount,
        noteCount: exported.noteCount,
      };
      if (course.status === 'active') {
        activeEntries.push(entry);
      } else {
        archivedEntries.push(entry);
      }
    }

    const readmeLines: string[] = [
      '# Exportación completa de Cursada',
      '',
      `- **Fecha de exportación:** ${new Date().toISOString().slice(0, 10)}`,
      `- **Total de materias:** ${courses.length} (${activeEntries.length} en curso, ${archivedEntries.length} archivadas)`,
      '',
      '## Estructura de carpetas',
      '',
      '- Cada materia tiene su propia carpeta con `00-Resumen-Materia.md` (datos, horarios, tareas, exámenes y promedio).',
      '- Los apuntes de cada materia se guardan en `<materia>/notas/<apunte>.md`.',
      '',
      '## Materias en curso',
      '',
    ];

    if (activeEntries.length === 0) {
      readmeLines.push('No hay materias en curso.');
    } else {
      for (const entry of activeEntries) {
        const prof = entry.professor ? ` · ${entry.professor}` : '';
        readmeLines.push(
          `- [${entry.name}](./${entry.slug}/00-Resumen-Materia.md) — ${entry.term}${prof} (${entry.noteCount} apuntes, ${entry.taskCount} tareas, ${entry.examCount} exámenes)`
        );
      }
    }

    if (archivedEntries.length > 0) {
      readmeLines.push('', '## Materias archivadas', '');
      for (const entry of archivedEntries) {
        const prof = entry.professor ? ` · ${entry.professor}` : '';
        readmeLines.push(
          `- [${entry.name}](./${entry.slug}/00-Resumen-Materia.md) — ${entry.term}${prof} (${entry.noteCount} apuntes, ${entry.taskCount} tareas, ${entry.examCount} exámenes)`
        );
      }
    }

    readmeLines.push('');
    const readmePath = path.join(exportRoot, 'README.md');
    fs.writeFileSync(readmePath, readmeLines.join('\n'), 'utf8');
    filesCreated.unshift(readmePath);

    return {
      canceled: false,
      targetDir: exportRoot,
      filesCreated,
      fileCount: filesCreated.length,
      mode: 'filesystem',
    };
  }

  throw new Error(`Alcance de exportación no soportado: ${String(request.scope)}`);
}
