import type {
  ClassSchedule,
  ClassScheduleInput,
  CourseColor,
  CourseDeleteImpact,
  CourseStatus,
  CourseWithSchedules,
  CreateCourseInput,
  UpdateCourseInput,
} from '../../types/domain';

const VALID_COURSE_COLORS: readonly CourseColor[] = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'rose',
  'cyan',
  'orange',
  'slate',
];

const VALID_COURSE_STATUSES: readonly CourseStatus[] = ['active', 'archived'];

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(time: string): number {
  const match = TIME_HH_MM_REGEX.exec(time);
  if (!match) {
    throw new Error(`Formato de horario inválido "${time}". Usá HH:MM (00:00 a 23:59)`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function validateMockScheduleInput(sched: ClassScheduleInput): void {
  if (
    typeof sched.dayOfWeek !== 'number' ||
    !Number.isInteger(sched.dayOfWeek) ||
    sched.dayOfWeek < 1 ||
    sched.dayOfWeek > 7
  ) {
    throw new Error(
      `Día de semana inválido "${String(sched.dayOfWeek)}". Debe estar entre 1 (Lunes) y 7 (Domingo)`
    );
  }

  const startMinutes = parseTimeToMinutes(sched.startTime);
  const endMinutes = parseTimeToMinutes(sched.endTime);

  if (startMinutes >= endMinutes) {
    throw new Error(
      `La hora de inicio (${sched.startTime}) debe ser anterior a la hora de fin (${sched.endTime})`
    );
  }
}

function sortSchedules(schedules: ClassSchedule[]): ClassSchedule[] {
  return [...schedules].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) {
      return a.dayOfWeek - b.dayOfWeek;
    }
    return a.startTime.localeCompare(b.startTime);
  });
}

interface CourseTaskHooks {
  countTasksByCourse: (courseId: string) => number;
  deleteTasksByCourse: (courseId: string) => void;
  countExamsByCourse?: (courseId: string) => number;
  deleteExamsByCourse?: (courseId: string) => void;
  countNotesByCourse?: (courseId: string) => number;
  deleteNotesByCourse?: (courseId: string) => void;
  onBeforeDeleteCourse?: (courseId: string) => void;
}

let taskHooks: CourseTaskHooks = {
  countTasksByCourse: () => 0,
  deleteTasksByCourse: () => {},
};

export function registerCourseTaskHooks(hooks: CourseTaskHooks): void {
  taskHooks = hooks;
}

const INITIAL_MOCK_COURSES: CourseWithSchedules[] = [
  {
    id: 'ing-soft-1',
    name: 'Ingeniería de Software I',
    color: 'blue',
    professor: 'Martín Echeverría',
    term: '2026 - 2° Cuatrimestre',
    status: 'active',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    schedules: [
      {
        id: 'sched-is1-1',
        courseId: 'ing-soft-1',
        dayOfWeek: 2,
        startTime: '18:30',
        endTime: '22:30',
        location: 'Aula 402 · Lima',
      },
    ],
  },
  {
    id: 'diseno-sistemas',
    name: 'Diseño de Sistemas',
    color: 'violet',
    professor: 'Carolina Méndez',
    term: '2026 - 2° Cuatrimestre',
    status: 'active',
    createdAt: '2026-08-01T10:05:00.000Z',
    updatedAt: '2026-08-01T10:05:00.000Z',
    schedules: [
      {
        id: 'sched-dds-1',
        courseId: 'diseno-sistemas',
        dayOfWeek: 2,
        startTime: '14:00',
        endTime: '18:00',
        location: 'Aula 308 · Lima',
      },
      {
        id: 'sched-dds-2',
        courseId: 'diseno-sistemas',
        dayOfWeek: 4,
        startTime: '18:30',
        endTime: '22:30',
        location: 'Aula 308 · Lima',
      },
    ],
  },
  {
    id: 'bd-2',
    name: 'Base de Datos II',
    color: 'emerald',
    professor: 'Alejandro Vera',
    term: '2026 - 2° Cuatrimestre',
    status: 'active',
    createdAt: '2026-08-01T10:10:00.000Z',
    updatedAt: '2026-08-01T10:10:00.000Z',
    schedules: [
      {
        id: 'sched-bd2-1',
        courseId: 'bd-2',
        dayOfWeek: 3,
        startTime: '18:30',
        endTime: '22:30',
        location: 'Lab 504 · Lima',
      },
    ],
  },
  {
    id: 'proba-estadistica',
    name: 'Probabilidad y Estadística',
    color: 'amber',
    professor: 'Lucía Campos',
    term: '2026 - 2° Cuatrimestre',
    status: 'active',
    createdAt: '2026-08-01T10:15:00.000Z',
    updatedAt: '2026-08-01T10:15:00.000Z',
    schedules: [
      {
        id: 'sched-pye-1',
        courseId: 'proba-estadistica',
        dayOfWeek: 4,
        startTime: '14:00',
        endTime: '18:00',
        location: 'Aula 215 · Monserrat',
      },
    ],
  },
  {
    id: 'paradigmas',
    name: 'Paradigmas de Programación',
    color: 'rose',
    professor: 'Diego Santoro',
    term: '2026 - 2° Cuatrimestre',
    status: 'active',
    createdAt: '2026-08-01T10:20:00.000Z',
    updatedAt: '2026-08-01T10:20:00.000Z',
    schedules: [
      {
        id: 'sched-pdep-1',
        courseId: 'paradigmas',
        dayOfWeek: 5,
        startTime: '18:30',
        endTime: '22:30',
        location: 'Virtual · Sincrónica',
      },
    ],
  },
];

let coursesStore: CourseWithSchedules[] = structuredClone(INITIAL_MOCK_COURSES);
let nextCourseSeq = 100;

export function resetMockCourses(): void {
  coursesStore = structuredClone(INITIAL_MOCK_COURSES);
  nextCourseSeq = 100;
}

export function getMockCourseByIdSync(id: string): CourseWithSchedules | undefined {
  return coursesStore.find((c) => c.id === id);
}

export async function mockListCourses(opts?: {
  status?: CourseStatus | 'all';
}): Promise<CourseWithSchedules[]> {
  const statusFilter = opts?.status ?? 'all';
  if (statusFilter !== 'all' && !VALID_COURSE_STATUSES.includes(statusFilter)) {
    throw new Error(`Invalid course status: ${String(statusFilter)}`);
  }
  const filtered =
    statusFilter === 'all'
      ? coursesStore
      : coursesStore.filter((c) => c.status === statusFilter);
  return structuredClone(filtered);
}

export async function mockGetCourse(id: string): Promise<CourseWithSchedules | null> {
  const found = coursesStore.find((c) => c.id === id);
  return found ? structuredClone(found) : null;
}

export async function mockCreateCourse(
  input: CreateCourseInput
): Promise<CourseWithSchedules> {
  const name = (input.name ?? '').trim();
  const term = (input.term ?? '').trim();
  const status = input.status ?? 'active';

  if (!name) {
    throw new Error('El nombre de la materia es obligatorio');
  }
  if (!term) {
    throw new Error('El cuatrimestre es obligatorio');
  }
  if (!VALID_COURSE_COLORS.includes(input.color)) {
    throw new Error(`Color de materia inválido: ${String(input.color)}`);
  }
  if (!VALID_COURSE_STATUSES.includes(status)) {
    throw new Error(`Estado de materia inválido: ${String(status)}`);
  }

  for (const sched of input.schedules ?? []) {
    validateMockScheduleInput(sched);
  }

  const id = `course-${++nextCourseSeq}`;
  const now = new Date().toISOString();
  const schedules = sortSchedules(
    (input.schedules ?? []).map((s, idx) => ({
      id: s.id ?? `sched-${nextCourseSeq}-${idx + 1}`,
      courseId: id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      location: (s.location ?? '').trim(),
    }))
  );

  const created: CourseWithSchedules = {
    id,
    name,
    color: input.color,
    professor: (input.professor ?? '').trim(),
    term,
    status,
    createdAt: now,
    updatedAt: now,
    schedules,
  };

  coursesStore.push(created);
  return structuredClone(created);
}

export async function mockUpdateCourse(
  id: string,
  input: UpdateCourseInput
): Promise<CourseWithSchedules> {
  const index = coursesStore.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new Error(`Course not found: ${id}`);
  }

  const current = coursesStore[index];
  const now = new Date().toISOString();
  const name = input.name !== undefined ? input.name.trim() : current.name;
  const term = input.term !== undefined ? input.term.trim() : current.term;
  const color = input.color ?? current.color;
  const status = input.status ?? current.status;

  if (!name) {
    throw new Error('El nombre de la materia es obligatorio');
  }
  if (!term) {
    throw new Error('El cuatrimestre es obligatorio');
  }
  if (!VALID_COURSE_COLORS.includes(color)) {
    throw new Error(`Color de materia inválido: ${String(color)}`);
  }
  if (!VALID_COURSE_STATUSES.includes(status)) {
    throw new Error(`Estado de materia inválido: ${String(status)}`);
  }

  if (input.schedules !== undefined) {
    for (const sched of input.schedules) {
      validateMockScheduleInput(sched);
    }
  }

  const schedules: ClassSchedule[] =
    input.schedules !== undefined
      ? sortSchedules(
          input.schedules.map((s, idx) => ({
            id: s.id ?? `sched-${id}-${Date.now()}-${idx}`,
            courseId: id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            location: (s.location ?? '').trim(),
          }))
        )
      : current.schedules;

  const updated: CourseWithSchedules = {
    ...current,
    name,
    color,
    professor:
      input.professor !== undefined ? input.professor.trim() : current.professor,
    term,
    status,
    updatedAt: now,
    schedules,
  };

  coursesStore[index] = updated;
  return structuredClone(updated);
}

export async function mockGetCourseDeleteImpact(
  id: string
): Promise<CourseDeleteImpact> {
  const found = coursesStore.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Course not found: ${id}`);
  }
  const notesCount = taskHooks.countNotesByCourse?.(id) ?? 0;
  return {
    courseId: found.id,
    courseName: found.name,
    tasksCount: taskHooks.countTasksByCourse(id),
    examsCount: taskHooks.countExamsByCourse?.(id) ?? 0,
    ...(notesCount > 0 ? { notesCount } : {}),
  };
}

export async function mockDeleteCourse(id: string): Promise<void> {
  taskHooks.onBeforeDeleteCourse?.(id);
  taskHooks.deleteTasksByCourse(id);
  taskHooks.deleteExamsByCourse?.(id);
  taskHooks.deleteNotesByCourse?.(id);
  coursesStore = coursesStore.filter((c) => c.id !== id);
}
