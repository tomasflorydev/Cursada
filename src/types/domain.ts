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
  sourcesCount?: number;
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

// Phase 5: AI & Ollama Settings
export type OllamaConnectionStatus = 'connected' | 'disconnected';

export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  family?: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface AiSettings {
  baseUrl: string;
  chatModel: string;
  embeddingModel: string;
}

export interface UpdateAiSettingsInput {
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
}

export interface OllamaHealthCheckResult {
  status: OllamaConnectionStatus;
  baseUrl: string;
  version: string | null;
  models: OllamaModelInfo[];
  chatModel: string;
  embeddingModel: string;
  errorMessage: string | null;
  checkedAt: string;
}

// Phase 5: Sources & Local Indexing
export type SourceType = 'pdf' | 'markdown' | 'txt' | 'pasted_text';

export type SourceIndexingStatus = 'pending' | 'indexing' | 'ready' | 'error';

export interface Source {
  id: string;
  courseId: string;
  title: string;
  sourceType: SourceType;
  originalPath: string | null;
  storedFilename: string | null;
  rawText: string;
  pageCount: number;
  charCount: number;
  chunkCount: number;
  indexingStatus: SourceIndexingStatus;
  indexingError: string | null;
  embeddingModel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceChunk {
  id: string;
  sourceId: string;
  courseId: string;
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
  embeddingDim: number | null;
}

export interface SourceWithChunks extends Source {
  chunks: SourceChunk[];
}

export interface SourceChunkSearchResult {
  chunk: SourceChunk;
  sourceTitle: string;
  sourceType: SourceType;
  score: number;
  vectorScore: number;
  ftsScore: number;
}

export interface CreateSourceFromTextInput {
  courseId: string;
  title: string;
  text: string;
  sourceType?: SourceType;
  pageCount?: number;
  pages?: Array<{ pageNumber: number; text: string }>;
  originalPath?: string | null;
}

export interface ImportSourceFileInput {
  courseId: string;
  filePath?: string;
  title?: string;
  contentBase64?: string;
  fileName?: string;
}

export interface ImportSourceFileResult {
  canceled: boolean;
  source: Source | null;
}

export interface SearchSourceChunksInput {
  courseId: string;
  query: string;
  limit?: number;
}

// Phase 6: RAG Chat with Verifiable Citations
export type ChatMessageRole = 'user' | 'assistant';

export interface ChatCitation {
  citationNumber: number;
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: SourceType;
  pageNumber: number | null;
  excerpt: string;
  score: number;
}

export interface ChatThread {
  id: string;
  courseId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: ChatMessageRole;
  content: string;
  citations: ChatCitation[];
  modelUsed: string | null;
  createdAt: string;
}

export interface ChatThreadWithMessages extends ChatThread {
  messages: ChatMessage[];
}

export interface CreateChatThreadInput {
  courseId: string;
  title?: string;
}

export interface SendChatMessageInput {
  courseId: string;
  threadId?: string;
  content: string;
  customInstructions?: string;
}

export interface SendChatMessageResult {
  thread: ChatThread;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export interface SaveChatMessageAsNoteInput {
  messageId: string;
  title?: string;
}

// Phase 7: Map-Reduce Study Reports & Custom Material Generator
export type StudyReportType =
  | 'summary'
  | 'report'
  | 'study_guide'
  | 'practice_exam';

export type PracticeExamFormat = 'develop' | 'multiple_choice' | 'mixed';

export interface StudyReportStepInfo {
  stepNumber: number;
  totalSteps: number;
  stage: 'map' | 'reduce';
  label: string;
  sourceId?: string;
  sourceTitle?: string;
}

export interface GenerateStudyReportInput {
  courseId: string;
  reportType: StudyReportType;
  sourceIds?: string[];
  examFormat?: PracticeExamFormat;
  customInstructions?: string;
  title?: string;
  autoSaveAsNote?: boolean;
}

export interface GenerateStudyReportResult {
  reportType: StudyReportType;
  examFormat: PracticeExamFormat | null;
  title: string;
  content: string;
  sourcesUsed: Array<{
    sourceId: string;
    title: string;
    pageCount: number;
    chunkCount: number;
  }>;
  steps: StudyReportStepInfo[];
  modelUsed: string;
  note: NoteWithCourse | null;
}

// Phase 8: Command Palette (Cmd+K) & Global Shortcuts (Agent A)
export type CourseTabId =
  | 'resumen'
  | 'tareas'
  | 'examenes'
  | 'notas'
  | 'fuentes'
  | 'asistente';

export type CommandPaletteItemKind =
  | 'course'
  | 'note'
  | 'task'
  | 'exam'
  | 'action';

export type CommandPaletteTarget =
  | {
      type: 'section';
      section: 'inicio' | 'calendario' | 'tareas' | 'examenes' | 'materias' | 'ajustes';
      triggerCreate?: boolean;
    }
  | {
      type: 'course';
      courseId: string;
      tab?: CourseTabId;
      noteId?: string;
      triggerCreate?: boolean;
    };

export interface CommandPaletteItem {
  id: string;
  kind: CommandPaletteItemKind;
  title: string;
  subtitle: string;
  badge?: string;
  courseId?: string;
  courseName?: string;
  courseColor?: CourseColor;
  shortcutHint?: string;
  keywords?: string;
  target: CommandPaletteTarget;
}

// Phase 8: Native macOS Notifications & Configurable Reminders (Agent B)
export interface NotificationSettings {
  enabled: boolean;
  upcomingClassesEnabled: boolean;
  classLeadMinutes: number; // 5..180, default 15
  tasksDueTodayEnabled: boolean;
  upcomingExamsEnabled: boolean;
  examLeadDays: number;     // 1..30, default 2
}

export interface UpdateNotificationSettingsInput {
  enabled?: boolean;
  upcomingClassesEnabled?: boolean;
  classLeadMinutes?: number;
  tasksDueTodayEnabled?: boolean;
  upcomingExamsEnabled?: boolean;
  examLeadDays?: number;
}

export type ReminderKind = 'upcoming_class' | 'task_due_today' | 'upcoming_exam';

export interface ReminderCandidate {
  id: string;
  kind: ReminderKind;
  title: string;
  body: string;
  courseId: string;
  courseName: string;
  referenceIso: string;
}

export interface NotificationDispatchResult {
  supported: boolean;
  dispatched: boolean;
  title: string;
  body: string;
  dispatchedAt: string;
  mode: 'electron-native' | 'web-notification' | 'simulated';
}

export interface CheckRemindersResult {
  evaluatedAt: string;
  settings: NotificationSettings;
  candidates: ReminderCandidate[];
  dispatchedCount: number;
  results: NotificationDispatchResult[];
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
  // AI & Ollama Settings (Phase 5 - Agent A)
  getAiSettings: () => Promise<AiSettings>;
  updateAiSettings: (input: UpdateAiSettingsInput) => Promise<AiSettings>;
  checkOllamaStatus: (baseUrl?: string) => Promise<OllamaHealthCheckResult>;
  // Sources & Local Indexing (Phase 5 - Agent B)
  listSources: (courseId: string) => Promise<Source[]>;
  getSourceWithChunks: (sourceId: string) => Promise<SourceWithChunks | null>;
  createSourceFromText: (input: CreateSourceFromTextInput) => Promise<Source>;
  importSourceFile: (input: ImportSourceFileInput) => Promise<ImportSourceFileResult>;
  reindexSource: (sourceId: string) => Promise<Source>;
  deleteSource: (sourceId: string) => Promise<void>;
  searchSourceChunks: (input: SearchSourceChunksInput) => Promise<SourceChunkSearchResult[]>;
  // Chat RAG with Citations (Phase 6 - Agent A)
  listChatThreads: (courseId: string) => Promise<ChatThread[]>;
  getChatThread: (threadId: string) => Promise<ChatThreadWithMessages | null>;
  createChatThread: (input: CreateChatThreadInput) => Promise<ChatThread>;
  deleteChatThread: (threadId: string) => Promise<void>;
  sendChatMessage: (input: SendChatMessageInput) => Promise<SendChatMessageResult>;
  saveChatMessageAsNote: (input: SaveChatMessageAsNoteInput) => Promise<NoteWithCourse>;
  // AI Study Reports & Material Generator (Phase 7 - Agent B)
  generateStudyReport: (input: GenerateStudyReportInput) => Promise<GenerateStudyReportResult>;
  // Native Notifications & Reminders (Phase 8 - Agent B)
  getNotificationSettings: () => Promise<NotificationSettings>;
  updateNotificationSettings: (
    input: UpdateNotificationSettingsInput
  ) => Promise<NotificationSettings>;
  sendTestNotification: () => Promise<NotificationDispatchResult>;
  checkDueReminders: (opts?: {
    referenceIso?: string;
    dispatch?: boolean;
  }) => Promise<CheckRemindersResult>;
}

declare global {
  interface Window {
    cursadaApi?: Partial<CursadaIpcApi>;
  }
}
