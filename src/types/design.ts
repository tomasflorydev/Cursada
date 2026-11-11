export type NavSectionId =
  | 'inicio'
  | 'calendario'
  | 'tareas'
  | 'examenes'
  | 'notas'
  | 'materias';

export type HomeLayoutVariant = 'bento' | 'swiss';

export type ThemeMode = 'system' | 'light' | 'dark';

export type CourseColor =
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'orange'
  | 'slate';

export interface SampleCourse {
  id: string;
  name: string;
  shortCode: string;
  color: CourseColor;
  professor: string;
  term: string;
  scheduleSummary: string;
  location: string;
  pendingTasksCount: number;
  nextExamLabel?: string;
  averageGrade?: number;
}

export interface TodayClassItem {
  id: string;
  courseId: string;
  courseName: string;
  courseColor: CourseColor;
  startTime: string;
  endTime: string;
  location: string;
  professor: string;
  sessionTopic: string;
  status: 'completed' | 'current' | 'upcoming';
  statusLabel: string;
}

export interface UpcomingTaskItem {
  id: string;
  courseId: string;
  courseName: string;
  courseColor: CourseColor;
  title: string;
  dueLabel: string;
  dueIso: string;
  urgency: 'today' | 'tomorrow' | 'week';
  priority?: 'Alta' | 'Media' | 'Baja';
  completed: boolean;
}

export interface UpcomingExamItem {
  id: string;
  courseId: string;
  courseName: string;
  courseColor: CourseColor;
  title: string;
  category: 'Parcial' | 'TP evaluativo' | 'Final' | 'Recuperatorio';
  dateLabel: string;
  timeLabel: string;
  daysLeft: number;
  location: string;
  topics: string;
}

export interface WeekDayPulse {
  dayShort: string;
  dayName: string;
  dayNumber: string;
  isToday?: boolean;
  classesCount: number;
  tasksCount: number;
  hasExam?: boolean;
  summary: string;
}

export interface SampleNoteItem {
  id: string;
  courseId: string;
  courseName: string;
  courseColor: CourseColor;
  title: string;
  updatedAtLabel: string;
  excerpt: string;
  isPinned?: boolean;
  originLabel: string;
}
