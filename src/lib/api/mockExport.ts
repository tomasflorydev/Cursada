import type {
  CourseWithSchedules,
  DayOfWeek,
  ExamCategory,
  ExamWithCourse,
  ExportMarkdownRequest,
  ExportMarkdownResult,
  NoteOrigin,
  NoteWithCourse,
  TaskPriority,
  TaskWithCourse,
} from '../../types/domain';
import { mockGetCourse, mockListCourses } from './mockCourses';
import { mockListExams } from './mockExams';
import { mockGetNote, mockListNotes } from './mockNotes';
import { mockListTasks } from './mockTasks';

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

function sanitizeSlug(name: string): string {
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

function escapeTableCell(value: string): string {
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

function formatNoteMarkdown(note: NoteWithCourse, courseTerm?: string): string {
  const originLabel = NOTE_ORIGIN_LABELS[note.origin] ?? note.origin;
  const lines = [
    `# ${note.title}`,
    '',
    `- **Materia:** ${note.courseName}`,
    ...(courseTerm ? [`- **Cuatrimestre:** ${courseTerm}`] : []),
    `- **Última actualización:** ${formatDateLabel(note.updatedAt)}`,
    `- **Origen:** ${originLabel}`,
    `- **Fijada:** ${note.isPinned ? 'Sí' : 'No'}`,
    '',
    '---',
    '',
    note.content.trimEnd(),
    '',
  ];
  return lines.join('\n');
}

function formatCourseBundleMarkdown(params: {
  course: CourseWithSchedules;
  tasks: TaskWithCourse[];
  exams: ExamWithCourse[];
  notes: NoteWithCourse[];
}): string {
  const { course, tasks, exams, notes } = params;
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

  if (course.schedules.length === 0) {
    lines.push('Sin horarios registrados.');
  } else {
    for (const sched of course.schedules) {
      const dayName = DAY_NAMES_ES[sched.dayOfWeek] ?? `Día ${sched.dayOfWeek}`;
      const locationSuffix = sched.location ? ` (${sched.location})` : '';
      lines.push(`- **${dayName}:** ${sched.startTime} – ${sched.endTime}${locationSuffix}`);
    }
  }

  lines.push('', '## Tareas', '');

  if (tasks.length === 0) {
    lines.push('Sin tareas registradas.');
  } else {
    for (const task of tasks) {
      const check = task.status === 'done' ? 'x' : ' ';
      const metaParts: string[] = [];
      if (task.dueDate) {
        metaParts.push(`Vence: ${formatDateLabel(task.dueDate)}`);
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

  const gradedExams = exams.filter((e) => e.grade !== null && e.grade !== undefined);
  if (gradedExams.length > 0) {
    const sum = gradedExams.reduce((acc, exam) => acc + Number(exam.grade), 0);
    const avg = Math.round((sum / gradedExams.length) * 100) / 100;
    lines.push(
      `**Promedio general:** ${avg.toFixed(2)} (sobre ${gradedExams.length} ${
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
      const dateText = exam.examTime
        ? `${formatDateLabel(exam.examDate)} ${exam.examTime}`
        : formatDateLabel(exam.examDate);
      const categoryText = EXAM_CATEGORY_LABELS[exam.category] ?? exam.category;
      const locationText = exam.location || '—';
      const gradeText = exam.grade !== null ? String(exam.grade) : 'Pendiente';
      lines.push(
        `| ${escapeTableCell(dateText)} | ${escapeTableCell(
          categoryText
        )} | ${escapeTableCell(exam.title)} | ${escapeTableCell(
          locationText
        )} | ${escapeTableCell(gradeText)} |`
      );
    }
  }

  lines.push('', '## Apuntes', '');

  if (notes.length === 0) {
    lines.push('Sin apuntes registrados.');
  } else {
    for (const note of notes) {
      lines.push(`### ${note.title}`, '', formatNoteMarkdown(note, course.term));
    }
  }

  lines.push('');
  return lines.join('\n');
}

function triggerBrowserDownload(filename: string, content: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export async function mockExportMarkdown(
  request: ExportMarkdownRequest
): Promise<ExportMarkdownResult> {
  const targetDir = request.targetDir ?? 'Descargas del navegador';

  if (request.scope === 'note') {
    const noteId = request.noteId?.trim();
    if (!noteId) {
      throw new Error('Se requiere noteId para exportar una nota.');
    }

    let note = await mockGetNote(noteId);
    if (!note) {
      const allNotes = await mockListNotes();
      note = allNotes.find((n) => n.id === noteId) ?? null;
    }

    if (!note) {
      throw new Error(`No se encontró la nota: ${noteId}`);
    }

    const course = await mockGetCourse(note.courseId);
    const filename = `${sanitizeSlug(note.title)}.md`;
    const markdown = formatNoteMarkdown(note, course?.term);
    triggerBrowserDownload(filename, markdown);

    return {
      canceled: false,
      targetDir,
      filesCreated: [filename],
      fileCount: 1,
      mode: 'download',
    };
  }

  if (request.scope === 'course') {
    const courseId = request.courseId?.trim();
    if (!courseId) {
      throw new Error('Se requiere courseId para exportar una materia.');
    }

    const course = await mockGetCourse(courseId);
    if (!course) {
      throw new Error(`No se encontró la materia: ${courseId}`);
    }

    const [tasks, exams, notes] = await Promise.all([
      mockListTasks({ courseId }),
      mockListExams({ courseId }),
      mockListNotes({ courseId }),
    ]);

    const filename = `${sanitizeSlug(course.name)}-completo.md`;
    const markdown = formatCourseBundleMarkdown({ course, tasks, exams, notes });
    triggerBrowserDownload(filename, markdown);

    return {
      canceled: false,
      targetDir,
      filesCreated: [filename],
      fileCount: 1,
      mode: 'download',
    };
  }

  if (request.scope === 'all') {
    const [courses, tasks, exams, notes] = await Promise.all([
      mockListCourses({ status: 'all' }),
      mockListTasks(),
      mockListExams(),
      mockListNotes(),
    ]);

    const sections: string[] = [
      '# Exportación completa de Cursada',
      '',
      `- **Fecha de exportación:** ${new Date().toISOString().slice(0, 10)}`,
      `- **Total de materias:** ${courses.length}`,
      `- **Total de tareas:** ${tasks.length}`,
      `- **Total de exámenes:** ${exams.length}`,
      `- **Total de apuntes:** ${notes.length}`,
      '',
      '---',
      '',
    ];

    for (const course of courses) {
      const courseTasks = tasks.filter((t) => t.courseId === course.id);
      const courseExams = exams.filter((e) => e.courseId === course.id);
      const courseNotes = notes.filter((n) => n.courseId === course.id);
      sections.push(
        formatCourseBundleMarkdown({
          course,
          tasks: courseTasks,
          exams: courseExams,
          notes: courseNotes,
        }),
        '---',
        ''
      );
    }

    const filename = 'cursada-export-completo.md';
    triggerBrowserDownload(filename, sections.join('\n'));

    return {
      canceled: false,
      targetDir,
      filesCreated: [filename],
      fileCount: 1,
      mode: 'download',
    };
  }

  throw new Error(`Alcance de exportación no soportado: ${String(request.scope)}`);
}
