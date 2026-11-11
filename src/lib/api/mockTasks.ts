import type {
  CreateTaskInput,
  Task,
  TaskFilters,
  TaskPriority,
  TaskStatus,
  TaskWithCourse,
  UpdateTaskInput,
} from '../../types/domain';
import { getMockCourseByIdSync } from './mockCourses';

const INITIAL_MOCK_TASKS: Task[] = [
  {
    id: 'task-1',
    courseId: 'bd-2',
    title: 'Entregar script de índices compuestos y análisis de plan de ejecución',
    description: 'Incluir captura de EXPLAIN QUERY PLAN sobre la tabla de movimientos.',
    dueDate: '2026-11-10',
    priority: 'high',
    status: 'pending',
    completedAt: null,
    createdAt: '2026-11-05T14:00:00.000Z',
    updatedAt: '2026-11-05T14:00:00.000Z',
  },
  {
    id: 'task-2',
    courseId: 'ing-soft-1',
    title: 'Completar matriz de trazabilidad de requerimientos y criterios de aceptación',
    description: 'Vincular cada historia de usuario del Sprint 3 con sus casos de prueba.',
    dueDate: '2026-11-11',
    priority: 'high',
    status: 'pending',
    completedAt: null,
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
  },
  {
    id: 'task-3',
    courseId: 'proba-estadistica',
    title: 'Resolver ejercicios 12 al 18 de la Guía 6 (Distribución Normal y Teorema Central)',
    description: '',
    dueDate: '2026-11-12',
    priority: 'medium',
    status: 'pending',
    completedAt: null,
    createdAt: '2026-11-07T09:00:00.000Z',
    updatedAt: '2026-11-07T09:00:00.000Z',
  },
  {
    id: 'task-4',
    courseId: 'paradigmas',
    title: 'Subir resolución funcional de composición de consultas al repositorio',
    description: '',
    dueDate: '2026-11-13',
    priority: 'low',
    status: 'pending',
    completedAt: null,
    createdAt: '2026-11-08T16:00:00.000Z',
    updatedAt: '2026-11-08T16:00:00.000Z',
  },
  {
    id: 'task-5',
    courseId: 'diseno-sistemas',
    title: 'Actualizar diagrama de clases con las interfaces de notificación',
    description: '',
    dueDate: '2026-11-10',
    priority: 'medium',
    status: 'done',
    completedAt: '2026-11-10T18:00:00.000Z',
    createdAt: '2026-11-04T11:00:00.000Z',
    updatedAt: '2026-11-10T18:00:00.000Z',
  },
];

const VALID_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high']);
const VALID_STATUSES = new Set<TaskStatus>(['pending', 'done']);
const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateTitle(rawTitle: string): string {
  const title = (rawTitle ?? '').trim();
  if (!title) {
    throw new Error('Task title cannot be empty');
  }
  return title;
}

function assertMockCourseExists(rawCourseId: string): string {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Course ID is required');
  }
  const course = getMockCourseByIdSync(courseId);
  if (!course) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function validateDueDate(dueDate: string | null | undefined): string | null {
  if (dueDate === undefined || dueDate === null) {
    return null;
  }
  if (typeof dueDate !== 'string' || !isValidIsoDate(dueDate)) {
    throw new Error(`Invalid dueDate "${String(dueDate)}". Expected YYYY-MM-DD.`);
  }
  return dueDate;
}

function validatePriority(
  priority: TaskPriority | null | undefined
): TaskPriority | null {
  if (priority === undefined || priority === null) {
    return null;
  }
  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error(
      `Invalid task priority "${String(priority)}". Expected 'low', 'medium', 'high', or null.`
    );
  }
  return priority;
}

function validateStatus(status: TaskStatus): TaskStatus {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      `Invalid task status "${String(status)}". Expected 'pending' or 'done'.`
    );
  }
  return status;
}

let tasksStore: Task[] = structuredClone(INITIAL_MOCK_TASKS);
let nextTaskSeq = 100;

export function resetMockTasks(): void {
  tasksStore = structuredClone(INITIAL_MOCK_TASKS);
  nextTaskSeq = 100;
}

function enrichTask(task: Task): TaskWithCourse {
  const course = getMockCourseByIdSync(task.courseId);
  return {
    ...task,
    courseName: course?.name ?? 'Materia',
    courseColor: course?.color ?? 'slate',
  };
}

export function mockCountTasksByCourse(courseId: string): number {
  return tasksStore.filter((t) => t.courseId === courseId).length;
}

export function mockDeleteTasksByCourse(courseId: string): void {
  tasksStore = tasksStore.filter((t) => t.courseId !== courseId);
}

export async function mockListTasks(filters?: TaskFilters): Promise<TaskWithCourse[]> {
  let result = tasksStore.slice();

  if (filters?.courseId) {
    result = result.filter((t) => t.courseId === filters.courseId);
  }
  if (filters?.status && filters.status !== 'all') {
    validateStatus(filters.status);
    result = result.filter((t) => t.status === filters.status);
  }
  if (filters?.dueFrom) {
    if (!isValidIsoDate(filters.dueFrom)) {
      throw new Error(`Invalid dueFrom "${filters.dueFrom}". Expected YYYY-MM-DD.`);
    }
    result = result.filter((t) => t.dueDate !== null && t.dueDate >= filters.dueFrom!);
  }
  if (filters?.dueTo) {
    if (!isValidIsoDate(filters.dueTo)) {
      throw new Error(`Invalid dueTo "${filters.dueTo}". Expected YYYY-MM-DD.`);
    }
    result = result.filter((t) => t.dueDate !== null && t.dueDate <= filters.dueTo!);
  }

  result.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'pending' ? -1 : 1;
    }
    if (a.dueDate && b.dueDate) {
      const dateCmp = a.dueDate.localeCompare(b.dueDate);
      if (dateCmp !== 0) {
        return dateCmp;
      }
    } else if (a.dueDate) {
      return -1;
    } else if (b.dueDate) {
      return 1;
    }

    const rankA = a.priority ? PRIORITY_RANK[a.priority] : 3;
    const rankB = b.priority ? PRIORITY_RANK[b.priority] : 3;
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    const createdCmp = b.createdAt.localeCompare(a.createdAt);
    if (createdCmp !== 0) {
      return createdCmp;
    }
    return a.id.localeCompare(b.id);
  });

  return structuredClone(result.map(enrichTask));
}

export async function mockCreateTask(input: CreateTaskInput): Promise<TaskWithCourse> {
  const title = validateTitle(input.title);
  const courseId = assertMockCourseExists(input.courseId);
  const description = (input.description ?? '').trim();
  const dueDate = validateDueDate(input.dueDate);
  const priority = validatePriority(input.priority);

  const now = new Date().toISOString();
  const created: Task = {
    id: `task-${++nextTaskSeq}`,
    courseId,
    title,
    description,
    dueDate,
    priority,
    status: 'pending',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  tasksStore.push(created);
  return structuredClone(enrichTask(created));
}

export async function mockUpdateTask(
  id: string,
  input: UpdateTaskInput
): Promise<TaskWithCourse> {
  const index = tasksStore.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error(`Task not found: ${id}`);
  }

  const current = tasksStore[index];
  const now = new Date().toISOString();
  const courseId =
    input.courseId !== undefined
      ? assertMockCourseExists(input.courseId)
      : current.courseId;
  const title =
    input.title !== undefined ? validateTitle(input.title) : current.title;
  const description =
    input.description !== undefined ? input.description.trim() : current.description;
  const dueDate =
    input.dueDate !== undefined ? validateDueDate(input.dueDate) : current.dueDate;
  const priority =
    input.priority !== undefined ? validatePriority(input.priority) : current.priority;
  const status: TaskStatus =
    input.status !== undefined ? validateStatus(input.status) : current.status;
  const completedAt =
    status === 'done'
      ? current.status === 'done' && current.completedAt
        ? current.completedAt
        : now
      : null;

  const updated: Task = {
    ...current,
    courseId,
    title,
    description,
    dueDate,
    priority,
    status,
    completedAt,
    updatedAt: now,
  };

  tasksStore[index] = updated;
  return structuredClone(enrichTask(updated));
}

export async function mockToggleTaskStatus(id: string): Promise<TaskWithCourse> {
  const found = tasksStore.find((t) => t.id === id);
  if (!found) {
    throw new Error(`Task not found: ${id}`);
  }
  const nextStatus: TaskStatus = found.status === 'pending' ? 'done' : 'pending';
  return mockUpdateTask(id, { status: nextStatus });
}

export async function mockDeleteTask(id: string): Promise<void> {
  tasksStore = tasksStore.filter((t) => t.id !== id);
}
