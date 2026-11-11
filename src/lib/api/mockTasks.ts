import type {
  CreateTaskInput,
  Task,
  TaskFilters,
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
    result = result.filter((t) => t.status === filters.status);
  }
  if (filters?.dueFrom) {
    result = result.filter((t) => t.dueDate !== null && t.dueDate >= filters.dueFrom!);
  }
  if (filters?.dueTo) {
    result = result.filter((t) => t.dueDate !== null && t.dueDate <= filters.dueTo!);
  }

  result.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'pending' ? -1 : 1;
    }
    if (a.dueDate && b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return structuredClone(result.map(enrichTask));
}

export async function mockCreateTask(input: CreateTaskInput): Promise<TaskWithCourse> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('El título de la tarea es obligatorio');
  }
  if (!input.courseId) {
    throw new Error('La materia es obligatoria');
  }

  const now = new Date().toISOString();
  const created: Task = {
    id: `task-${++nextTaskSeq}`,
    courseId: input.courseId,
    title,
    description: (input.description ?? '').trim(),
    dueDate: input.dueDate ?? null,
    priority: input.priority ?? null,
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
  const status: TaskStatus = input.status ?? current.status;
  const completedAt =
    status === 'done' ? (current.completedAt ?? now) : null;

  const updated: Task = {
    ...current,
    courseId: input.courseId ?? current.courseId,
    title: input.title !== undefined ? input.title.trim() : current.title,
    description:
      input.description !== undefined ? input.description.trim() : current.description,
    dueDate: input.dueDate !== undefined ? input.dueDate : current.dueDate,
    priority: input.priority !== undefined ? input.priority : current.priority,
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
