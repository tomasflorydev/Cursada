export * from '../../shared/types.js';
import type {
  AiSettings,
  AiStreamProgressEvent,
  BackupInfo,
  CalendarFeed,
  ChatThread,
  ChatThreadWithMessages,
  CheckRemindersResult,
  CourseAttendanceSummary,
  CourseColor,
  CourseDeleteImpact,
  CourseStatus,
  CourseWithSchedules,
  CreateCalendarFeedInput,
  CreateChatThreadInput,
  CreateCourseInput,
  CreateExamInput,
  CreateNoteInput,
  CreateSourceFromTextInput,
  CreateTaskInput,
  ExamFilters,
  ExamWithCourse,
  ExportIcsInput,
  ExportIcsResult,
  ExportMarkdownRequest,
  ExportMarkdownResult,
  ExternalCalendarEvent,
  GenerateStudyReportInput,
  GenerateStudyReportResult,
  GoogleCalendarSyncConfig,
  GoogleCalendarSyncResult,
  ImportObsidianVaultInput,
  ImportObsidianVaultResult,
  ImportSourceFileInput,
  ImportSourceFileResult,
  KnowledgeGraphData,
  NoteFilters,
  NoteLinksSummary,
  NoteWithCourse,
  NotificationDispatchResult,
  NotificationSettings,
  OllamaHealthCheckResult,
  OpenDataDirResult,
  RecordAttendanceInput,
  RestoreBackupResult,
  SaveChatMessageAsNoteInput,
  SaveStudyReportInput,
  SearchSourceChunksInput,
  SendChatMessageInput,
  SendChatMessageResult,
  Source,
  SourceChunkSearchResult,
  SourceWithChunks,
  StoredReport,
  TaskFilters,
  TaskWithCourse,
  UpdateAiSettingsInput,
  UpdateCourseAttendanceConfigInput,
  UpdateCourseInput,
  UpdateExamInput,
  UpdateGoogleCalendarConfigInput,
  UpdateNoteInput,
  UpdateNotificationSettingsInput,
  UpdateSourceStageInput,
  UpdateTaskInput,
} from '../../shared/types.js';

// Phase 8: Command Palette (Cmd+K) & Global Shortcuts (Renderer UI contracts)
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
      section:
        | 'inicio'
        | 'materias'
        | 'calendario'
        | 'tareas'
        | 'examenes'
        | 'informes'
        | 'ajustes';
      triggerCreate?: boolean;
      reportId?: string;
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

/**
 * Shared navigation contract injected by App.tsx into domain views.
 * - `onSelectCourse(courseId)`: Navigates to the 'materias' section with `courseId` selected
 *   (or returns to the full courses list when `courseId` is `null`).
 * - `onNavigateSection(section)`: Switches the active top-level section in the app shell.
 */
export interface AppNavigationHandlers {
  onSelectCourse: (courseId: string | null) => void;
  onNavigateSection?: (
    section:
      | 'inicio'
      | 'materias'
      | 'calendario'
      | 'tareas'
      | 'examenes'
      | 'informes'
      | 'ajustes'
  ) => void;
}

export interface CursadaIpcApi {
  platform: string;
  // System & Backups
  createBackup: () => Promise<BackupInfo>;
  listBackups: () => Promise<BackupInfo[]>;
  restoreBackup: (filename: string) => Promise<RestoreBackupResult>;
  getDataDir: () => Promise<string>;
  openDataDir: () => Promise<OpenDataDirResult>;
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
  cancelChatMessage: (requestId: string) => Promise<void>;
  saveChatMessageAsNote: (input: SaveChatMessageAsNoteInput) => Promise<NoteWithCourse>;
  // AI Study Reports & Material Generator (Phase 7 + SQLite V9)
  generateStudyReport: (input: GenerateStudyReportInput) => Promise<GenerateStudyReportResult>;
  cancelStudyReport: (requestId: string) => Promise<void>;
  onAiStreamProgress: (listener: (event: AiStreamProgressEvent) => void) => () => void;
  listStudyReports: (courseId?: string) => Promise<StoredReport[]>;
  getStudyReportById: (id: string) => Promise<StoredReport | null>;
  saveStudyReport: (input: SaveStudyReportInput) => Promise<StoredReport>;
  deleteStudyReport: (id: string) => Promise<void>;
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
  // Knowledge Graph, WikiLinks & Obsidian (Phase 12)
  getNoteLinks: (noteId: string) => Promise<NoteLinksSummary>;
  openOrCreateWikiLink: (input: {
    courseId: string;
    targetTitle: string;
  }) => Promise<NoteWithCourse>;
  getKnowledgeGraph: (opts?: {
    courseId?: string;
    includeArchived?: boolean;
  }) => Promise<KnowledgeGraphData>;
  importObsidianVault: (
    input?: ImportObsidianVaultInput
  ) => Promise<ImportObsidianVaultResult>;
  // Active Study, Exam Stage & Attendance (Phase 13)
  updateSourceStage: (input: UpdateSourceStageInput) => Promise<Source>;
  getCourseAttendance: (courseId: string) => Promise<CourseAttendanceSummary>;
  updateCourseAttendanceConfig: (
    input: UpdateCourseAttendanceConfigInput
  ) => Promise<CourseAttendanceSummary>;
  recordAttendance: (input: RecordAttendanceInput) => Promise<CourseAttendanceSummary>;
  deleteAttendanceRecord: (recordId: string) => Promise<CourseAttendanceSummary>;
  // Google Calendar Sync & iCal (Phase 14)
  exportCalendarIcs: (input?: ExportIcsInput) => Promise<ExportIcsResult>;
  listCalendarFeeds: () => Promise<CalendarFeed[]>;
  addCalendarFeed: (input: CreateCalendarFeedInput) => Promise<CalendarFeed>;
  removeCalendarFeed: (feedId: string) => Promise<void>;
  syncCalendarFeeds: () => Promise<CalendarFeed[]>;
  listExternalCalendarEvents: (opts?: {
    dateFrom?: string;
    dateTo?: string;
  }) => Promise<ExternalCalendarEvent[]>;
  getGoogleCalendarConfig: () => Promise<GoogleCalendarSyncConfig>;
  updateGoogleCalendarConfig: (
    input: UpdateGoogleCalendarConfigInput
  ) => Promise<GoogleCalendarSyncConfig>;
  connectGoogleCalendar: (opts?: {
    email?: string;
    clientId?: string;
  }) => Promise<GoogleCalendarSyncConfig>;
  disconnectGoogleCalendar: () => Promise<GoogleCalendarSyncConfig>;
  syncGoogleCalendarNow: () => Promise<GoogleCalendarSyncResult>;
}

declare global {
  interface Window {
    cursadaApi?: Partial<CursadaIpcApi>;
  }
}
