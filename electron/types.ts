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
