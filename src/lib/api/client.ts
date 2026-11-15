import type {
  AiSettings,
  BackupInfo,
  ChatThread,
  ChatThreadWithMessages,
  CheckRemindersResult,
  CourseDeleteImpact,
  CourseStatus,
  CourseWithSchedules,
  CreateChatThreadInput,
  CreateCourseInput,
  CreateExamInput,
  CreateNoteInput,
  CreateSourceFromTextInput,
  CreateTaskInput,
  CursadaIpcApi,
  ExamFilters,
  ExamWithCourse,
  ExportMarkdownRequest,
  ExportMarkdownResult,
  GenerateStudyReportInput,
  GenerateStudyReportResult,
  ImportSourceFileInput,
  ImportSourceFileResult,
  NoteFilters,
  NoteWithCourse,
  NotificationDispatchResult,
  NotificationSettings,
  OllamaHealthCheckResult,
  SaveChatMessageAsNoteInput,
  SearchSourceChunksInput,
  SendChatMessageInput,
  SendChatMessageResult,
  Source,
  SourceChunkSearchResult,
  SourceWithChunks,
  TaskFilters,
  TaskWithCourse,
  UpdateAiSettingsInput,
  UpdateCourseInput,
  UpdateExamInput,
  UpdateNoteInput,
  UpdateNotificationSettingsInput,
  UpdateTaskInput,
} from '../../types/domain';
import { mockClient } from './mockClient';

export const DATA_CHANGED_EVENT = 'cursada:data-changed';

export function notifyCursadaDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
  }
}

function getBridge(): Partial<CursadaIpcApi> | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.cursadaApi;
}

export const cursadaClient: CursadaIpcApi = {
  get platform(): string {
    return getBridge()?.platform ?? mockClient.platform;
  },

  // System & Backups
  async createBackup(): Promise<BackupInfo> {
    const fn = getBridge()?.createBackup;
    return fn ? fn() : mockClient.createBackup();
  },

  async listBackups(): Promise<BackupInfo[]> {
    const fn = getBridge()?.listBackups;
    return fn ? fn() : mockClient.listBackups();
  },

  async getDataDir(): Promise<string> {
    const fn = getBridge()?.getDataDir;
    return fn ? fn() : mockClient.getDataDir();
  },

  // Courses & Schedules
  async listCourses(opts?: {
    status?: CourseStatus | 'all';
  }): Promise<CourseWithSchedules[]> {
    const fn = getBridge()?.listCourses;
    return fn ? fn(opts) : mockClient.listCourses(opts);
  },

  async getCourse(id: string): Promise<CourseWithSchedules | null> {
    const fn = getBridge()?.getCourse;
    return fn ? fn(id) : mockClient.getCourse(id);
  },

  async createCourse(input: CreateCourseInput): Promise<CourseWithSchedules> {
    const fn = getBridge()?.createCourse;
    const created = fn ? await fn(input) : await mockClient.createCourse(input);
    notifyCursadaDataChanged();
    return created;
  },

  async updateCourse(
    id: string,
    input: UpdateCourseInput
  ): Promise<CourseWithSchedules> {
    const fn = getBridge()?.updateCourse;
    const updated = fn ? await fn(id, input) : await mockClient.updateCourse(id, input);
    notifyCursadaDataChanged();
    return updated;
  },

  async getCourseDeleteImpact(id: string): Promise<CourseDeleteImpact> {
    const fn = getBridge()?.getCourseDeleteImpact;
    return fn ? fn(id) : mockClient.getCourseDeleteImpact(id);
  },

  async deleteCourse(id: string): Promise<void> {
    const fn = getBridge()?.deleteCourse;
    if (fn) {
      await fn(id);
    } else {
      await mockClient.deleteCourse(id);
    }
    notifyCursadaDataChanged();
  },

  // Tasks
  async listTasks(filters?: TaskFilters): Promise<TaskWithCourse[]> {
    const fn = getBridge()?.listTasks;
    return fn ? fn(filters) : mockClient.listTasks(filters);
  },

  async createTask(input: CreateTaskInput): Promise<TaskWithCourse> {
    const fn = getBridge()?.createTask;
    const created = fn ? await fn(input) : await mockClient.createTask(input);
    notifyCursadaDataChanged();
    return created;
  },

  async updateTask(id: string, input: UpdateTaskInput): Promise<TaskWithCourse> {
    const fn = getBridge()?.updateTask;
    const updated = fn ? await fn(id, input) : await mockClient.updateTask(id, input);
    notifyCursadaDataChanged();
    return updated;
  },

  async toggleTaskStatus(id: string): Promise<TaskWithCourse> {
    const fn = getBridge()?.toggleTaskStatus;
    const updated = fn ? await fn(id) : await mockClient.toggleTaskStatus(id);
    notifyCursadaDataChanged();
    return updated;
  },

  async deleteTask(id: string): Promise<void> {
    const fn = getBridge()?.deleteTask;
    if (fn) {
      await fn(id);
    } else {
      await mockClient.deleteTask(id);
    }
    notifyCursadaDataChanged();
  },

  // Exams
  async listExams(filters?: ExamFilters): Promise<ExamWithCourse[]> {
    const fn = getBridge()?.listExams;
    return fn ? fn(filters) : mockClient.listExams(filters);
  },

  async createExam(input: CreateExamInput): Promise<ExamWithCourse> {
    const fn = getBridge()?.createExam;
    const created = fn ? await fn(input) : await mockClient.createExam(input);
    notifyCursadaDataChanged();
    return created;
  },

  async updateExam(id: string, input: UpdateExamInput): Promise<ExamWithCourse> {
    const fn = getBridge()?.updateExam;
    const updated = fn ? await fn(id, input) : await mockClient.updateExam(id, input);
    notifyCursadaDataChanged();
    return updated;
  },

  async deleteExam(id: string): Promise<void> {
    const fn = getBridge()?.deleteExam;
    if (fn) {
      await fn(id);
    } else {
      await mockClient.deleteExam(id);
    }
    notifyCursadaDataChanged();
  },

  // Notes (Phase 4)
  async listNotes(filters?: NoteFilters): Promise<NoteWithCourse[]> {
    const fn = getBridge()?.listNotes;
    return fn ? fn(filters) : mockClient.listNotes(filters);
  },

  async getNote(id: string): Promise<NoteWithCourse | null> {
    const fn = getBridge()?.getNote;
    return fn ? fn(id) : mockClient.getNote(id);
  },

  async createNote(input: CreateNoteInput): Promise<NoteWithCourse> {
    const fn = getBridge()?.createNote;
    const created = fn ? await fn(input) : await mockClient.createNote(input);
    notifyCursadaDataChanged();
    return created;
  },

  async updateNote(id: string, input: UpdateNoteInput): Promise<NoteWithCourse> {
    const fn = getBridge()?.updateNote;
    const updated = fn ? await fn(id, input) : await mockClient.updateNote(id, input);
    notifyCursadaDataChanged();
    return updated;
  },

  async toggleNotePin(id: string): Promise<NoteWithCourse> {
    const fn = getBridge()?.toggleNotePin;
    const updated = fn ? await fn(id) : await mockClient.toggleNotePin(id);
    notifyCursadaDataChanged();
    return updated;
  },

  async deleteNote(id: string): Promise<void> {
    const fn = getBridge()?.deleteNote;
    if (fn) {
      await fn(id);
    } else {
      await mockClient.deleteNote(id);
    }
    notifyCursadaDataChanged();
  },

  // Markdown Export (Phase 4)
  async exportMarkdown(
    request: ExportMarkdownRequest
  ): Promise<ExportMarkdownResult> {
    const fn = getBridge()?.exportMarkdown;
    return fn ? fn(request) : mockClient.exportMarkdown(request);
  },

  // AI & Ollama Settings (Phase 5 - Agent A)
  async getAiSettings(): Promise<AiSettings> {
    const fn = getBridge()?.getAiSettings;
    return fn ? fn() : mockClient.getAiSettings();
  },

  async updateAiSettings(input: UpdateAiSettingsInput): Promise<AiSettings> {
    const fn = getBridge()?.updateAiSettings;
    const updated = fn ? await fn(input) : await mockClient.updateAiSettings(input);
    notifyCursadaDataChanged();
    return updated;
  },

  async checkOllamaStatus(baseUrl?: string): Promise<OllamaHealthCheckResult> {
    const fn = getBridge()?.checkOllamaStatus;
    return fn ? fn(baseUrl) : mockClient.checkOllamaStatus(baseUrl);
  },

  // Sources & Local Indexing (Phase 5 - Agent B)
  async listSources(courseId: string): Promise<Source[]> {
    const fn = getBridge()?.listSources;
    return fn ? fn(courseId) : mockClient.listSources(courseId);
  },

  async getSourceWithChunks(sourceId: string): Promise<SourceWithChunks | null> {
    const fn = getBridge()?.getSourceWithChunks;
    return fn ? fn(sourceId) : mockClient.getSourceWithChunks(sourceId);
  },

  async createSourceFromText(input: CreateSourceFromTextInput): Promise<Source> {
    const fn = getBridge()?.createSourceFromText;
    const created = fn
      ? await fn(input)
      : await mockClient.createSourceFromText(input);
    notifyCursadaDataChanged();
    return created;
  },

  async importSourceFile(
    input: ImportSourceFileInput
  ): Promise<ImportSourceFileResult> {
    const fn = getBridge()?.importSourceFile;
    const result = fn ? await fn(input) : await mockClient.importSourceFile(input);
    if (!result.canceled) {
      notifyCursadaDataChanged();
    }
    return result;
  },

  async reindexSource(sourceId: string): Promise<Source> {
    const fn = getBridge()?.reindexSource;
    const reindexed = fn
      ? await fn(sourceId)
      : await mockClient.reindexSource(sourceId);
    notifyCursadaDataChanged();
    return reindexed;
  },

  async deleteSource(sourceId: string): Promise<void> {
    const fn = getBridge()?.deleteSource;
    if (fn) {
      await fn(sourceId);
    } else {
      await mockClient.deleteSource(sourceId);
    }
    notifyCursadaDataChanged();
  },

  async searchSourceChunks(
    input: SearchSourceChunksInput
  ): Promise<SourceChunkSearchResult[]> {
    const fn = getBridge()?.searchSourceChunks;
    return fn ? fn(input) : mockClient.searchSourceChunks(input);
  },

  // Chat RAG with Citations (Phase 6 - Agent A)
  async listChatThreads(courseId: string): Promise<ChatThread[]> {
    const fn = getBridge()?.listChatThreads;
    return fn ? fn(courseId) : mockClient.listChatThreads(courseId);
  },

  async getChatThread(threadId: string): Promise<ChatThreadWithMessages | null> {
    const fn = getBridge()?.getChatThread;
    return fn ? fn(threadId) : mockClient.getChatThread(threadId);
  },

  async createChatThread(input: CreateChatThreadInput): Promise<ChatThread> {
    const fn = getBridge()?.createChatThread;
    const created = fn ? await fn(input) : await mockClient.createChatThread(input);
    notifyCursadaDataChanged();
    return created;
  },

  async deleteChatThread(threadId: string): Promise<void> {
    const fn = getBridge()?.deleteChatThread;
    if (fn) {
      await fn(threadId);
    } else {
      await mockClient.deleteChatThread(threadId);
    }
    notifyCursadaDataChanged();
  },

  async sendChatMessage(input: SendChatMessageInput): Promise<SendChatMessageResult> {
    const fn = getBridge()?.sendChatMessage;
    const result = fn ? await fn(input) : await mockClient.sendChatMessage(input);
    notifyCursadaDataChanged();
    return result;
  },

  async saveChatMessageAsNote(
    input: SaveChatMessageAsNoteInput
  ): Promise<NoteWithCourse> {
    const fn = getBridge()?.saveChatMessageAsNote;
    const note = fn
      ? await fn(input)
      : await mockClient.saveChatMessageAsNote(input);
    notifyCursadaDataChanged();
    return note;
  },

  // AI Study Reports & Material Generator (Phase 7 - Agent B)
  async generateStudyReport(
    input: GenerateStudyReportInput
  ): Promise<GenerateStudyReportResult> {
    const fn = getBridge()?.generateStudyReport;
    const result = fn
      ? await fn(input)
      : await mockClient.generateStudyReport(input);
    notifyCursadaDataChanged();
    return result;
  },

  // Native Notifications & Reminders (Phase 8 - Agent B)
  async getNotificationSettings(): Promise<NotificationSettings> {
    const fn = getBridge()?.getNotificationSettings;
    return fn ? fn() : mockClient.getNotificationSettings();
  },

  async updateNotificationSettings(
    input: UpdateNotificationSettingsInput
  ): Promise<NotificationSettings> {
    const fn = getBridge()?.updateNotificationSettings;
    const updated = fn
      ? await fn(input)
      : await mockClient.updateNotificationSettings(input);
    notifyCursadaDataChanged();
    return updated;
  },

  async sendTestNotification(): Promise<NotificationDispatchResult> {
    const fn = getBridge()?.sendTestNotification;
    return fn ? fn() : mockClient.sendTestNotification();
  },

  async checkDueReminders(opts?: {
    referenceIso?: string;
    dispatch?: boolean;
  }): Promise<CheckRemindersResult> {
    const fn = getBridge()?.checkDueReminders;
    return fn ? fn(opts) : mockClient.checkDueReminders(opts);
  },
};
