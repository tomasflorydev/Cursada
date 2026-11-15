import type {
  CommandPaletteItem,
  CommandPaletteItemKind,
  CourseWithSchedules,
  ExamWithCourse,
  NoteWithCourse,
  TaskWithCourse,
} from '../../types/domain';

export type GlobalShortcutAction =
  | { type: 'toggle_palette' }
  | {
      type: 'navigate_section';
      section:
        | 'inicio'
        | 'calendario'
        | 'tareas'
        | 'examenes'
        | 'materias'
        | 'ajustes';
    }
  | { type: 'contextual_new' };

const EMPTY_QUERY_KIND_PRIORITY: Record<CommandPaletteItemKind, number> = {
  course: 0,
  note: 1,
  task: 2,
  exam: 3,
  action: 4,
};

const ACADEMIC_ENTITY_BONUS: Record<CommandPaletteItemKind, number> = {
  course: 8,
  note: 6,
  task: 5,
  exam: 5,
  action: 0,
};

const SECTION_SHORTCUTS: Record<
  string,
  'inicio' | 'calendario' | 'tareas' | 'examenes' | 'materias' | 'ajustes'
> = {
  '1': 'inicio',
  '2': 'calendario',
  '3': 'tareas',
  '4': 'examenes',
  '5': 'materias',
  ',': 'ajustes',
};

/** Normalizes text for accent-insensitive search: lowercase, NFD-stripped diacritics, trimmed, single spaces. */
export function normalizeSearchText(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function buildQuickActions(): CommandPaletteItem[] {
  return [
    {
      id: 'action:new-task',
      kind: 'action',
      title: 'Nueva tarea',
      subtitle: 'Crear una entrega o tarea pendiente',
      badge: 'Acción',
      shortcutHint: '⌘N',
      keywords: 'crear agregar tarea entrega pendiente',
      target: { type: 'section', section: 'tareas', triggerCreate: true },
    },
    {
      id: 'action:new-exam',
      kind: 'action',
      title: 'Agendar examen',
      subtitle: 'Registrar parcial, final o TP evaluativo',
      badge: 'Acción',
      keywords: 'crear nuevo examen parcial final tp',
      target: { type: 'section', section: 'examenes', triggerCreate: true },
    },
    {
      id: 'action:new-course',
      kind: 'action',
      title: 'Nueva materia',
      subtitle: 'Agregar una materia y sus horarios semanales',
      badge: 'Acción',
      keywords: 'crear agregar materia cursada horario',
      target: { type: 'section', section: 'materias', triggerCreate: true },
    },
    {
      id: 'action:nav-inicio',
      kind: 'action',
      title: 'Ir a Inicio',
      subtitle: 'Resumen del día, próximos vencimientos y pulso semanal',
      badge: 'Acción',
      shortcutHint: '⌘1',
      keywords: 'navegar seccion home inicio',
      target: { type: 'section', section: 'inicio' },
    },
    {
      id: 'action:nav-calendario',
      kind: 'action',
      title: 'Ir a Calendario',
      subtitle: 'Ver grilla mensual y semanal de cursada',
      badge: 'Acción',
      shortcutHint: '⌘2',
      keywords: 'navegar seccion calendario horarios',
      target: { type: 'section', section: 'calendario' },
    },
    {
      id: 'action:nav-tareas',
      kind: 'action',
      title: 'Ir a Tareas',
      subtitle: 'Ver entregas y pendientes de todas las materias',
      badge: 'Acción',
      shortcutHint: '⌘3',
      keywords: 'navegar seccion tareas entregas',
      target: { type: 'section', section: 'tareas' },
    },
    {
      id: 'action:nav-examenes',
      kind: 'action',
      title: 'Ir a Exámenes',
      subtitle: 'Ver próximos parciales, finales y promedio',
      badge: 'Acción',
      shortcutHint: '⌘4',
      keywords: 'navegar seccion examenes parciales finales',
      target: { type: 'section', section: 'examenes' },
    },
    {
      id: 'action:nav-materias',
      kind: 'action',
      title: 'Ir a Materias',
      subtitle: 'Ver materias activas y cuatrimestres anteriores',
      badge: 'Acción',
      shortcutHint: '⌘5',
      keywords: 'navegar seccion materias cursada',
      target: { type: 'section', section: 'materias' },
    },
    {
      id: 'action:nav-ajustes',
      kind: 'action',
      title: 'Ir a Ajustes',
      subtitle: 'Backups locales, apariencia e inteligencia artificial',
      badge: 'Acción',
      shortcutHint: '⌘,',
      keywords: 'navegar seccion ajustes configuracion preferencias',
      target: { type: 'section', section: 'ajustes' },
    },
  ];
}

/** Builds searchable command palette entries from courses, notes, tasks, exams, and quick actions. */
export function buildCommandPaletteItems(data: {
  courses: CourseWithSchedules[];
  notes: NoteWithCourse[];
  tasks: TaskWithCourse[];
  exams: ExamWithCourse[];
}): CommandPaletteItem[] {
  const courseItems: CommandPaletteItem[] = data.courses.map((course) => ({
    id: `course:${course.id}`,
    kind: 'course',
    title: course.name,
    subtitle: `${course.professor ? `Prof. ${course.professor} · ` : ''}${course.term}`,
    badge: course.status === 'archived' ? 'Archivada' : 'Materia',
    courseId: course.id,
    courseName: course.name,
    courseColor: course.color,
    target: { type: 'course', courseId: course.id, tab: 'resumen' },
  }));

  const noteItems: CommandPaletteItem[] = data.notes.map((note) => {
    const excerpt = note.content
      ? note.content.replace(/[#*_`>\-\n]+/g, ' ').trim().slice(0, 70)
      : '';
    return {
      id: `note:${note.id}`,
      kind: 'note',
      title: note.title,
      subtitle: note.courseName + (excerpt ? ` · ${excerpt}` : ''),
      badge: 'Nota',
      courseId: note.courseId,
      courseName: note.courseName,
      courseColor: note.courseColor,
      keywords: note.content.slice(0, 300),
      target: {
        type: 'course',
        courseId: note.courseId,
        tab: 'notas',
        noteId: note.id,
      },
    };
  });

  const taskItems: CommandPaletteItem[] = data.tasks.map((task) => ({
    id: `task:${task.id}`,
    kind: 'task',
    title: task.title,
    subtitle:
      task.courseName +
      (task.dueDate ? ` · Entrega ${task.dueDate}` : ' · Sin fecha'),
    badge: task.status === 'done' ? 'Tarea completada' : 'Tarea pendiente',
    courseId: task.courseId,
    courseName: task.courseName,
    courseColor: task.courseColor,
    keywords: task.description,
    target: { type: 'course', courseId: task.courseId, tab: 'tareas' },
  }));

  const examItems: CommandPaletteItem[] = data.exams.map((exam) => ({
    id: `exam:${exam.id}`,
    kind: 'exam',
    title: exam.title,
    subtitle:
      `${exam.courseName} · ${exam.examDate}` +
      (exam.grade !== null ? ` · Nota ${exam.grade}` : ''),
    badge: 'Examen',
    courseId: exam.courseId,
    courseName: exam.courseName,
    courseColor: exam.courseColor,
    keywords: `${exam.topics} ${exam.category}`,
    target: { type: 'course', courseId: exam.courseId, tab: 'examenes' },
  }));

  return [
    ...courseItems,
    ...noteItems,
    ...taskItems,
    ...examItems,
    ...buildQuickActions(),
  ];
}

function scoreItemMatch(
  item: CommandPaletteItem,
  normalizedQuery: string,
  tokens: string[]
): number {
  const normTitle = normalizeSearchText(item.title);
  const normSubtitle = normalizeSearchText(item.subtitle);
  const normCourseName = normalizeSearchText(item.courseName ?? '');
  const normBadge = normalizeSearchText(item.badge ?? '');
  const normKeywords = normalizeSearchText(item.keywords ?? '');

  const combined = `${normTitle} ${normSubtitle} ${normCourseName} ${normBadge} ${normKeywords}`;
  if (!tokens.every((token) => combined.includes(token))) {
    return -1;
  }

  let score = 0;

  if (normTitle === normalizedQuery || normTitle.startsWith(normalizedQuery)) {
    score += 100;
  } else if (normTitle.includes(normalizedQuery)) {
    score += 70;
  } else if (
    normCourseName.includes(normalizedQuery) ||
    normSubtitle.includes(normalizedQuery)
  ) {
    score += 40;
  } else if (normKeywords.includes(normalizedQuery)) {
    score += 20;
  }

  if (tokens.length > 1) {
    let tokenScore = 0;
    for (const token of tokens) {
      if (normTitle === token || normTitle.startsWith(token)) {
        tokenScore += 100;
      } else if (normTitle.includes(token)) {
        tokenScore += 70;
      } else if (
        normCourseName.includes(token) ||
        normSubtitle.includes(token)
      ) {
        tokenScore += 40;
      } else if (normKeywords.includes(token)) {
        tokenScore += 20;
      } else {
        tokenScore += 10;
      }
    }
    score += Math.round(tokenScore / tokens.length);
  } else if (score === 0) {
    score += 10;
  }

  score += ACADEMIC_ENTITY_BONUS[item.kind];
  return score;
}

/** Filters and ranks command palette items by kind and normalized multi-token query. */
export function filterCommandPaletteItems(
  items: CommandPaletteItem[],
  query: string,
  kindFilter: CommandPaletteItemKind | 'all' = 'all'
): CommandPaletteItem[] {
  const scoped =
    kindFilter === 'all'
      ? items
      : items.filter((item) => item.kind === kindFilter);

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return scoped
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const kindCmp =
          EMPTY_QUERY_KIND_PRIORITY[a.item.kind] -
          EMPTY_QUERY_KIND_PRIORITY[b.item.kind];
        return kindCmp !== 0 ? kindCmp : a.index - b.index;
      })
      .map((entry) => entry.item);
  }

  const tokens = normalizedQuery.split(' ').filter((t) => t.length > 0);
  const scored: Array<{
    item: CommandPaletteItem;
    score: number;
    index: number;
  }> = [];

  for (let index = 0; index < scoped.length; index++) {
    const item = scoped[index];
    const score = scoreItemMatch(item, normalizedQuery, tokens);
    if (score >= 0) {
      scored.push({ item, score, index });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const kindCmp =
      EMPTY_QUERY_KIND_PRIORITY[a.item.kind] -
      EMPTY_QUERY_KIND_PRIORITY[b.item.kind];
    return kindCmp !== 0 ? kindCmp : a.index - b.index;
  });

  return scored.map((entry) => entry.item);
}

/** Maps a keyboard event to a global macOS/desktop shortcut action, or null if unrelated. */
export function resolveGlobalShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'defaultPrevented'
  >
): GlobalShortcutAction | null {
  if (
    event.defaultPrevented ||
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey
  ) {
    return null;
  }

  const lowerKey = event.key.toLowerCase();
  if (lowerKey === 'k') {
    return { type: 'toggle_palette' };
  }
  if (lowerKey === 'n') {
    return { type: 'contextual_new' };
  }

  const section = SECTION_SHORTCUTS[event.key];
  if (section) {
    return { type: 'navigate_section', section };
  }

  return null;
}
