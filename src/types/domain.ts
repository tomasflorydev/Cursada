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
  examsCount?: number;
  notesCount?: number;
}

export type ExamCategory = 'parcial' | 'recuperatorio' | 'final' | 'tp';

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  category: ExamCategory;
  examDate: string; // ISO 'YYYY-MM-DD'
  examTime: string | null; // Optional 'HH:MM'
  location: string;
  topics: string;
  grade: number | null; // Scale 1..10 or null
  createdAt: string;
  updatedAt: string;
}

export interface ExamWithCourse extends Exam {
  courseName: string;
  courseColor: CourseColor;
}

export interface CreateExamInput {
  courseId: string;
  title: string;
  category?: ExamCategory;
  examDate: string;
  examTime?: string | null;
  location?: string;
  topics?: string;
  grade?: number | null;
}

export interface UpdateExamInput {
  courseId?: string;
  title?: string;
  category?: ExamCategory;
  examDate?: string;
  examTime?: string | null;
  location?: string;
  topics?: string;
  grade?: number | null;
}

export interface ExamFilters {
  courseId?: string;
  dateFrom?: string; // ISO 'YYYY-MM-DD'
  dateTo?: string;   // ISO 'YYYY-MM-DD'
  graded?: 'all' | 'graded' | 'ungraded';
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

export type NoteOrigin = 'manual' | 'ai_summary' | 'ai_study_guide' | 'ai_practice_exam';

export interface Note {
  id: string;
  courseId: string;
  title: string;
  content: string;
  origin: NoteOrigin;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteWithCourse extends Note {
  courseName: string;
  courseColor: CourseColor;
}

export interface CreateNoteInput {
  courseId: string;
  title: string;
  content?: string;
  origin?: NoteOrigin;
  isPinned?: boolean;
}

export interface UpdateNoteInput {
  courseId?: string;
  title?: string;
  content?: string;
  isPinned?: boolean;
}

export interface NoteFilters {
  courseId?: string;
  query?: string;
  pinnedOnly?: boolean;
}

export type ExportScope = 'note' | 'course' | 'all';

export interface ExportMarkdownRequest {
  scope: ExportScope;
  noteId?: string;
  courseId?: string;
  targetDir?: string;
}

export interface ExportMarkdownResult {
  canceled: boolean;
  targetDir: string | null;
  filesCreated: string[];
  fileCount: number;
  mode: 'filesystem' | 'download';
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
  // Exams (Phase 3)
  listExams: (filters?: ExamFilters) => Promise<ExamWithCourse[]>;
  createExam: (input: CreateExamInput) => Promise<ExamWithCourse>;
  updateExam: (id: string, input: UpdateExamInput) => Promise<ExamWithCourse>;
  deleteExam: (id: string) => Promise<void>;
  // Notes (Phase 4)
  listNotes: (filters?: NoteFilters) => Promise<NoteWithCourse[]>;
  getNote: (id: string) => Promise<NoteWithCourse | null>;
  createNote: (input: CreateNoteInput) => Promise<NoteWithCourse>;
  updateNote: (id: string, input: UpdateNoteInput) => Promise<NoteWithCourse>;
  toggleNotePin: (id: string) => Promise<NoteWithCourse>;
  deleteNote: (id: string) => Promise<void>;
  // Markdown Export (Phase 4)
  exportMarkdown: (request: ExportMarkdownRequest) => Promise<ExportMarkdownResult>;
}

declare global {
  interface Window {
    cursadaApi?: Partial<CursadaIpcApi>;
  }
}
