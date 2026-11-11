import type {
  ClassSchedule,
  CourseDeleteImpact,
  CourseStatus,
  CourseWithSchedules,
  CreateCourseInput,
  UpdateCourseInput,
} from '../../types/domain';

interface CourseTaskHooks {
  countTasksByCourse: (courseId: string) => number;
  deleteTasksByCourse: (courseId: string) => void;
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
  const name = input.name.trim();
  const term = input.term.trim();
  if (!name) {
    throw new Error('El nombre de la materia es obligatorio');
  }
  if (!term) {
    throw new Error('El cuatrimestre es obligatorio');
  }

  const id = `course-${++nextCourseSeq}`;
  const now = new Date().toISOString();
  const schedules: ClassSchedule[] = (input.schedules ?? []).map((s, idx) => ({
    id: s.id ?? `sched-${nextCourseSeq}-${idx + 1}`,
    courseId: id,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    location: (s.location ?? '').trim(),
  }));

  const created: CourseWithSchedules = {
    id,
    name,
    color: input.color,
    professor: (input.professor ?? '').trim(),
    term,
    status: input.status ?? 'active',
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
  const schedules: ClassSchedule[] =
    input.schedules !== undefined
      ? input.schedules.map((s, idx) => ({
          id: s.id ?? `sched-${id}-${Date.now()}-${idx}`,
          courseId: id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          location: (s.location ?? '').trim(),
        }))
      : current.schedules;

  const updated: CourseWithSchedules = {
    ...current,
    name: input.name !== undefined ? input.name.trim() : current.name,
    color: input.color ?? current.color,
    professor:
      input.professor !== undefined ? input.professor.trim() : current.professor,
    term: input.term !== undefined ? input.term.trim() : current.term,
    status: input.status ?? current.status,
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
  return {
    courseId: found.id,
    courseName: found.name,
    tasksCount: taskHooks.countTasksByCourse(id),
  };
}

export async function mockDeleteCourse(id: string): Promise<void> {
  taskHooks.onBeforeDeleteCourse?.(id);
  taskHooks.deleteTasksByCourse(id);
  coursesStore = coursesStore.filter((c) => c.id !== id);
}
