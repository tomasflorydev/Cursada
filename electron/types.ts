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

export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ClassSchedule {
  id: string;
  courseId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
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
}

export type ExamCategory = 'parcial' | 'recuperatorio' | 'final' | 'tp';

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  category: ExamCategory;
  examDate: string;
  examTime: string | null;
  location: string;
  topics: string;
  grade: number | null;
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
  dateFrom?: string;
  dateTo?: string;
  graded?: 'all' | 'graded' | 'ungraded';
}

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'done';

export interface Task {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string | null;
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
  dueFrom?: string;
  dueTo?: string;
}

export interface BackupInfo {
  filename: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
}
