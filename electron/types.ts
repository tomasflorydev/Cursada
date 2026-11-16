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
  attendanceEnabled?: boolean;
  maxAbsences?: number;
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
  term?: string;
  status?: CourseStatus;
  attendanceEnabled?: boolean;
  maxAbsences?: number;
  schedules?: ClassScheduleInput[];
}

export interface UpdateCourseInput {
  name?: string;
  color?: CourseColor;
  professor?: string;
  term?: string;
  status?: CourseStatus;
  attendanceEnabled?: boolean;
  maxAbsences?: number;
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

export interface RestoreBackupResult {
  restoredFrom: BackupInfo;
  preRestoreBackup: BackupInfo;
}

export interface OpenDataDirResult {
  dataDir: string;
  opened: boolean;
}

export type ExamStageTag = 'parcial_1' | 'parcial_2' | 'final' | 'general';

export type NoteOrigin = 'manual' | 'ai_summary' | 'ai_study_guide' | 'ai_practice_exam';

export interface Note {
  id: string;
  courseId: string;
  title: string;
  content: string;
  origin: NoteOrigin;
  isPinned: boolean;
  examStage?: ExamStageTag;
  frontmatter?: Record<string, string>;
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
  examStage?: ExamStageTag;
  frontmatter?: Record<string, string>;
}

export interface UpdateNoteInput {
  courseId?: string;
  title?: string;
  content?: string;
  isPinned?: boolean;
  examStage?: ExamStageTag;
  frontmatter?: Record<string, string>;
}

export interface NoteFilters {
  courseId?: string;
  query?: string;
  pinnedOnly?: boolean;
  examStage?: ExamStageTag | 'all';
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
export type SourceType = 'pdf' | 'markdown' | 'txt' | 'pasted_text' | 'note';

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
  examStage?: ExamStageTag;
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
  examStage?: ExamStageTag;
}

export interface ImportSourceFileInput {
  courseId: string;
  filePath?: string;
  title?: string;
  contentBase64?: string;
  fileName?: string;
  examStage?: ExamStageTag;
}

export interface UpdateSourceStageInput {
  sourceId: string;
  examStage: ExamStageTag;
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
  requestId?: string;
  courseId: string;
  threadId?: string;
  content: string;
  customInstructions?: string;
  sourceIds?: string[];
  noteIds?: string[];
  examStage?: ExamStageTag | 'all';
  includeNotes?: boolean;
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
  requestId?: string;
  courseId: string;
  reportType: StudyReportType;
  sourceIds?: string[];
  noteIds?: string[];
  examStage?: ExamStageTag | 'all';
  includeNotes?: boolean;
  examFormat?: PracticeExamFormat;
  customInstructions?: string;
  title?: string;
  autoSaveAsNote?: boolean;
}

export interface AiStreamProgressEvent {
  requestId: string;
  kind: 'chat' | 'report';
  delta?: string;
  accumulated?: string;
  stepLabel?: string;
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

export interface ReportCitationSource {
  index: number;
  kind: 'note' | 'source';
  id: string;
  title: string;
  snippet: string;
  pageLabel?: string;
}

export interface StoredReport {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  reportType: StudyReportType;
  createdAt: string;
  updatedAt: string;
  summaryLine: string;
  content: string;
  notesCount: number;
  pdfsCount: number;
  usedLocalModel: boolean;
  modelLabel: string;
  noteId: string | null;
  citations: ReportCitationSource[];
  sourceIds?: string[];
  noteIds?: string[];
  examStage?: ExamStageTag | 'all';
  includeNotes?: boolean;
  examFormat?: PracticeExamFormat;
  customInstructions?: string;
}

export interface SaveStudyReportInput {
  id?: string;
  courseId: string;
  courseName?: string;
  title: string;
  reportType: StudyReportType;
  summaryLine?: string;
  content: string;
  notesCount?: number;
  pdfsCount?: number;
  usedLocalModel?: boolean;
  modelLabel?: string;
  noteId?: string | null;
  citations?: ReportCitationSource[];
  sourceIds?: string[];
  noteIds?: string[];
  examStage?: ExamStageTag | 'all';
  includeNotes?: boolean;
  examFormat?: PracticeExamFormat;
  customInstructions?: string;
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

// Phase 11: Super-Editor Markdown, Math & Configurable Shortcuts
export type EditorShortcutActionId =
  | 'insert_table'
  | 'insert_callout_note'
  | 'insert_callout_warning'
  | 'insert_callout_tip'
  | 'insert_math_block'
  | 'insert_code_block'
  | 'toggle_task'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bold'
  | 'italic'
  | 'insert_wikilink';

export type EditorShortcutsMap = Record<EditorShortcutActionId, string>;

export interface EditorShortcutDefinition {
  id: EditorShortcutActionId;
  title: string;
  description: string;
  defaultBinding: string;
}

// Phase 12: Knowledge Graph, WikiLinks & Obsidian Vault Importer
export interface NoteLinkItem {
  id: string;
  sourceNoteId: string;
  sourceNoteTitle: string;
  sourceCourseId: string;
  sourceCourseName: string;
  targetNoteId: string | null;
  targetTitle: string;
  displayText: string;
  contextSnippet: string;
}

export interface NoteLinksSummary {
  noteId: string;
  forwardLinks: NoteLinkItem[];
  backlinks: NoteLinkItem[];
}

export interface KnowledgeGraphNode {
  id: string;
  noteId: string;
  title: string;
  courseId: string;
  courseName: string;
  courseColor: CourseColor;
  courseStatus: CourseStatus;
  degree: number;
  updatedAt: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  label: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface ImportObsidianVaultInput {
  vaultDir?: string;
  targetStatus?: CourseStatus;
  courseNameOverride?: string;
  filesPayload?: Array<{ relativePath: string; content: string }>;
}

export interface ImportObsidianVaultResult {
  canceled: boolean;
  vaultPath: string | null;
  coursesCreated: CourseWithSchedules[];
  notesImportedCount: number;
  linksResolvedCount: number;
}

// Phase 13: Pomodoro, Exam Stage AI Context, Interactive Simulator & Attendance
export interface PomodoroSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  roundsBeforeLongBreak: number;
  notifyOnComplete: boolean;
}

export type AttendanceStatus = 'present' | 'absent';

export interface AttendanceRecord {
  id: string;
  courseId: string;
  sessionDate: string;
  status: AttendanceStatus;
  note: string;
  createdAt: string;
}

export interface CourseAttendanceSummary {
  courseId: string;
  attendanceEnabled: boolean;
  maxAbsences: number;
  absencesCount: number;
  presentsCount: number;
  remainingAbsences: number;
  absenceRatio: number;
  isWarning: boolean;
  isExceeded: boolean;
  records: AttendanceRecord[];
}

export interface UpdateCourseAttendanceConfigInput {
  courseId: string;
  attendanceEnabled?: boolean;
  maxAbsences?: number;
}

export interface RecordAttendanceInput {
  courseId: string;
  sessionDate?: string;
  status: AttendanceStatus;
  note?: string;
}

export interface PracticeExamQuestionItem {
  id: string;
  number: number;
  kind: 'multiple_choice' | 'develop';
  prompt: string;
  options?: Array<{ letter: 'A' | 'B' | 'C' | 'D'; text: string }>;
  correctOption?: 'A' | 'B' | 'C' | 'D';
  modelAnswer: string;
  explanation: string;
  citationIndex: number;
  citationTitle: string;
  citationSourceId: string;
  citationKind: 'note' | 'source';
  pageLabel?: string;
}

export interface PracticeExamSimulationAttempt {
  courseId: string;
  courseName: string;
  examStage: ExamStageTag | 'all';
  questions: PracticeExamQuestionItem[];
  answers: Record<string, string>;
  scorePercent: number;
  correctCount: number;
  totalCount: number;
  completedAt: string;
}

// Phase 14: Google Calendar Sync & iCal
export interface ExportIcsInput {
  courseId?: string;
  includeSchedules?: boolean;
  includeTasks?: boolean;
  includeExams?: boolean;
  targetPath?: string;
}

export interface ExportIcsResult {
  canceled: boolean;
  filePath: string | null;
  icsContent: string;
  eventsCount: number;
  mode: 'filesystem' | 'download';
}

export interface CalendarFeed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  eventsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalCalendarEvent {
  id: string;
  feedId: string;
  feedName: string;
  uid: string;
  title: string;
  dateIso: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  description: string;
}

export interface CreateCalendarFeedInput {
  name: string;
  url: string;
  rawIcsOverride?: string;
}

export interface GoogleCalendarSyncConfig {
  clientId: string;
  connectedEmail: string | null;
  isConnected: boolean;
  targetCalendarId: string;
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncSummary: string | null;
}

export interface UpdateGoogleCalendarConfigInput {
  clientId?: string;
  targetCalendarId?: string;
  autoSyncEnabled?: boolean;
  connectedEmail?: string | null;
}

export interface GoogleCalendarSyncResult {
  syncedAt: string;
  createdCount: number;
  updatedCount: number;
  totalMappedCount: number;
  calendarId: string;
  mode: 'google-api' | 'local-loopback-simulated';
  summary: string;
}
