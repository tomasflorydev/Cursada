export type CourseColor =
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'orange'
  | 'slate';

export type CourseStatus = 'active' | 'archived';

/** 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado, 7 = Domingo */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ClassSchedule {
  id: string;
  courseId: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // 'HH:MM' (24h)
  endTime: string;   // 'HH:MM' (24h)
  location: string;
}

export interface Course {
  id: string;
  name: string;
  color: CourseColor;
  professor: string;
  term: string;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CourseWithSchedules extends Course {
  schedules: ClassSchedule[];
}

export interface ClassScheduleInput {
  id?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface CreateCourseInput {
  name: string;
  color: CourseColor;
  professor?: string;
  term: string;
  status?: CourseStatus;
  schedules?: ClassScheduleInput[];
}

export interface UpdateCourseInput {
  name?: string;
  color?: CourseColor;
  professor?: string;
  term?: string;
  status?: CourseStatus;
  schedules?: ClassScheduleInput[];
}

export interface CourseDeleteImpact {
  courseId: string;
  courseName: string;
  tasksCount: number;
}

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'done';

export interface Task {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string | null; // ISO 'YYYY-MM-DD'
  priority: TaskPriority | null;
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithCourse extends Task {
  courseName: string;
  courseColor: CourseColor;
}

export interface CreateTaskInput {
  courseId: string;
  title: string;
  description?: string;
  dueDate?: string | null;
  priority?: TaskPriority | null;
}

export interface UpdateTaskInput {
  courseId?: string;
  title?: string;
  description?: string;
  dueDate?: string | null;
  priority?: TaskPriority | null;
  status?: TaskStatus;
}

export interface TaskFilters {
  courseId?: string;
  status?: TaskStatus | 'all';
  dueFrom?: string; // ISO 'YYYY-MM-DD'
  dueTo?: string;   // ISO 'YYYY-MM-DD'
}

export interface BackupInfo {
  filename: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
}

/**
 * Shared navigation contract injected by App.tsx into domain views.
 * - `onSelectCourse(courseId)`: Navigates to the 'materias' section with `courseId` selected
 *   (or returns to the full courses list when `courseId` is `null`).
 * - `onNavigateSection(section)`: Switches the active top-level section in the app shell.
 */
export interface AppNavigationHandlers {
  onSelectCourse: (courseId: string | null) => void;
  onNavigateSection?: (
    section: 'inicio' | 'calendario' | 'tareas' | 'examenes' | 'notas' | 'materias' | 'ajustes'
  ) => void;
}

export interface CursadaIpcApi {
  platform: string;
  // System & Backups
  createBackup: () => Promise<BackupInfo>;
  listBackups: () => Promise<BackupInfo[]>;
  getDataDir: () => Promise<string>;
  // Courses & Schedules (Agent A)
  listCourses: (opts?: { status?: CourseStatus | 'all' }) => Promise<CourseWithSchedules[]>;
  getCourse: (id: string) => Promise<CourseWithSchedules | null>;
  createCourse: (input: CreateCourseInput) => Promise<CourseWithSchedules>;
  updateCourse: (id: string, input: UpdateCourseInput) => Promise<CourseWithSchedules>;
  getCourseDeleteImpact: (id: string) => Promise<CourseDeleteImpact>;
  deleteCourse: (id: string) => Promise<void>;
  // Tasks (Agent B)
  listTasks: (filters?: TaskFilters) => Promise<TaskWithCourse[]>;
  createTask: (input: CreateTaskInput) => Promise<TaskWithCourse>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<TaskWithCourse>;
  toggleTaskStatus: (id: string) => Promise<TaskWithCourse>;
  deleteTask: (id: string) => Promise<void>;
}

declare global {
  interface Window {
    cursadaApi?: Partial<CursadaIpcApi>;
  }
}
