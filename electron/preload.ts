import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiStreamProgressEvent,
  CourseStatus,
  CreateCalendarFeedInput,
  CreateChatThreadInput,
  CreateCourseInput,
  CreateExamInput,
  CreateNoteInput,
  CreateSourceFromTextInput,
  CreateTaskInput,
  ExamFilters,
  ExportIcsInput,
  ExportMarkdownRequest,
  GenerateStudyReportInput,
  ImportObsidianVaultInput,
  ImportSourceFileInput,
  NoteFilters,
  RecordAttendanceInput,
  SaveChatMessageAsNoteInput,
  SaveStudyReportInput,
  SearchSourceChunksInput,
  SendChatMessageInput,
  TaskFilters,
  UpdateAiSettingsInput,
  UpdateCourseAttendanceConfigInput,
  UpdateCourseInput,
  UpdateExamInput,
  UpdateGoogleCalendarConfigInput,
  UpdateNoteInput,
  UpdateNotificationSettingsInput,
  UpdateSourceStageInput,
  UpdateTaskInput,
} from './types.js';

contextBridge.exposeInMainWorld('cursadaApi', {
  platform: process.platform,
  // System & Backups
  createBackup: () => ipcRenderer.invoke('system:createBackup'),
  listBackups: () => ipcRenderer.invoke('system:listBackups'),
  restoreBackup: (filename: string) =>
    ipcRenderer.invoke('system:restoreBackup', filename),
  getDataDir: () => ipcRenderer.invoke('system:getDataDir'),
  openDataDir: () => ipcRenderer.invoke('system:openDataDir'),
  // Courses & Schedules
  listCourses: (opts?: { status?: CourseStatus | 'all' }) =>
    ipcRenderer.invoke('courses:list', opts),
  getCourse: (id: string) => ipcRenderer.invoke('courses:getById', id),
  createCourse: (input: CreateCourseInput) => ipcRenderer.invoke('courses:create', input),
  updateCourse: (id: string, input: UpdateCourseInput) =>
    ipcRenderer.invoke('courses:update', id, input),
  getCourseDeleteImpact: (id: string) =>
    ipcRenderer.invoke('courses:getDeleteImpact', id),
  deleteCourse: (id: string) => ipcRenderer.invoke('courses:delete', id),
  // Tasks
  listTasks: (filters?: TaskFilters) => ipcRenderer.invoke('tasks:list', filters),
  createTask: (input: CreateTaskInput) => ipcRenderer.invoke('tasks:create', input),
  updateTask: (id: string, input: UpdateTaskInput) =>
    ipcRenderer.invoke('tasks:update', id, input),
  toggleTaskStatus: (id: string) => ipcRenderer.invoke('tasks:toggleStatus', id),
  deleteTask: (id: string) => ipcRenderer.invoke('tasks:delete', id),
  // Exams
  listExams: (filters?: ExamFilters) => ipcRenderer.invoke('exams:list', filters),
  createExam: (input: CreateExamInput) => ipcRenderer.invoke('exams:create', input),
  updateExam: (id: string, input: UpdateExamInput) =>
    ipcRenderer.invoke('exams:update', id, input),
  deleteExam: (id: string) => ipcRenderer.invoke('exams:delete', id),
  // Notes
  listNotes: (filters?: NoteFilters) => ipcRenderer.invoke('notes:list', filters),
  getNote: (id: string) => ipcRenderer.invoke('notes:getById', id),
  createNote: (input: CreateNoteInput) => ipcRenderer.invoke('notes:create', input),
  updateNote: (id: string, input: UpdateNoteInput) =>
    ipcRenderer.invoke('notes:update', id, input),
  toggleNotePin: (id: string) => ipcRenderer.invoke('notes:togglePin', id),
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id),
  // Export
  exportMarkdown: (request: ExportMarkdownRequest) =>
    ipcRenderer.invoke('export:markdown', request),
  // AI & Ollama Settings (Phase 5)
  getAiSettings: () => ipcRenderer.invoke('ai:getSettings'),
  updateAiSettings: (input: UpdateAiSettingsInput) =>
    ipcRenderer.invoke('ai:updateSettings', input),
  checkOllamaStatus: (baseUrl?: string) =>
    ipcRenderer.invoke('ai:checkStatus', baseUrl),
  // Sources & Local Indexing (Phase 5)
  listSources: (courseId: string) => ipcRenderer.invoke('sources:list', courseId),
  getSourceWithChunks: (sourceId: string) =>
    ipcRenderer.invoke('sources:getWithChunks', sourceId),
  createSourceFromText: (input: CreateSourceFromTextInput) =>
    ipcRenderer.invoke('sources:createFromText', input),
  importSourceFile: (input: ImportSourceFileInput) =>
    ipcRenderer.invoke('sources:importFile', input),
  reindexSource: (sourceId: string) => ipcRenderer.invoke('sources:reindex', sourceId),
  deleteSource: (sourceId: string) => ipcRenderer.invoke('sources:delete', sourceId),
  searchSourceChunks: (input: SearchSourceChunksInput) =>
    ipcRenderer.invoke('sources:searchChunks', input),
  // Chat RAG with Citations (Phase 6)
  listChatThreads: (courseId: string) =>
    ipcRenderer.invoke('chat:listThreads', courseId),
  getChatThread: (threadId: string) =>
    ipcRenderer.invoke('chat:getThread', threadId),
  createChatThread: (input: CreateChatThreadInput) =>
    ipcRenderer.invoke('chat:createThread', input),
  deleteChatThread: (threadId: string) =>
    ipcRenderer.invoke('chat:deleteThread', threadId),
  sendChatMessage: (input: SendChatMessageInput) =>
    ipcRenderer.invoke('chat:sendMessage', input),
  cancelChatMessage: (requestId: string) =>
    ipcRenderer.invoke('chat:cancel', requestId),
  saveChatMessageAsNote: (input: SaveChatMessageAsNoteInput) =>
    ipcRenderer.invoke('chat:saveMessageAsNote', input),
  // AI Study Reports & Material Generator (Phase 7 + SQLite V9)
  generateStudyReport: (input: GenerateStudyReportInput) =>
    ipcRenderer.invoke('reports:generate', input),
  cancelStudyReport: (requestId: string) =>
    ipcRenderer.invoke('reports:cancel', requestId),
  onAiStreamProgress: (listener: (payload: AiStreamProgressEvent) => void) => {
    const wrapped = (_event: unknown, payload: AiStreamProgressEvent) => {
      listener(payload);
    };
    ipcRenderer.on('ai:streamProgress', wrapped);
    return () => {
      ipcRenderer.removeListener('ai:streamProgress', wrapped);
    };
  },
  listStudyReports: (courseId?: string) =>
    ipcRenderer.invoke('reports:list', courseId),
  getStudyReportById: (id: string) => ipcRenderer.invoke('reports:getById', id),
  saveStudyReport: (input: SaveStudyReportInput) =>
    ipcRenderer.invoke('reports:save', input),
  deleteStudyReport: (id: string) => ipcRenderer.invoke('reports:delete', id),
  // Native Notifications & Reminders (Phase 8)
  getNotificationSettings: () => ipcRenderer.invoke('notifications:getSettings'),
  updateNotificationSettings: (input: UpdateNotificationSettingsInput) =>
    ipcRenderer.invoke('notifications:updateSettings', input),
  sendTestNotification: () => ipcRenderer.invoke('notifications:sendTest'),
  checkDueReminders: (opts?: { referenceIso?: string; dispatch?: boolean }) =>
    ipcRenderer.invoke('notifications:checkReminders', opts),
  // Knowledge Graph, WikiLinks & Obsidian (Phase 12)
  getNoteLinks: (noteId: string) =>
    ipcRenderer.invoke('knowledge:getNoteLinks', noteId),
  openOrCreateWikiLink: (input: { courseId: string; targetTitle: string }) =>
    ipcRenderer.invoke('knowledge:openOrCreateWikiLink', input),
  getKnowledgeGraph: (opts?: { courseId?: string; includeArchived?: boolean }) =>
    ipcRenderer.invoke('knowledge:getGraph', opts),
  importObsidianVault: (input?: ImportObsidianVaultInput) =>
    ipcRenderer.invoke('knowledge:importObsidianVault', input),
  // Active Study, Exam Stage & Attendance (Phase 13)
  updateSourceStage: (input: UpdateSourceStageInput) =>
    ipcRenderer.invoke('sources:updateStage', input),
  getCourseAttendance: (courseId: string) =>
    ipcRenderer.invoke('attendance:getCourse', courseId),
  updateCourseAttendanceConfig: (input: UpdateCourseAttendanceConfigInput) =>
    ipcRenderer.invoke('attendance:updateConfig', input),
  recordAttendance: (input: RecordAttendanceInput) =>
    ipcRenderer.invoke('attendance:record', input),
  deleteAttendanceRecord: (recordId: string) =>
    ipcRenderer.invoke('attendance:deleteRecord', recordId),
  // Google Calendar Sync & iCal (Phase 14)
  exportCalendarIcs: (input?: ExportIcsInput) =>
    ipcRenderer.invoke('calendarSync:exportIcs', input),
  listCalendarFeeds: () => ipcRenderer.invoke('calendarSync:listFeeds'),
  addCalendarFeed: (input: CreateCalendarFeedInput) =>
    ipcRenderer.invoke('calendarSync:addFeed', input),
  removeCalendarFeed: (feedId: string) =>
    ipcRenderer.invoke('calendarSync:removeFeed', feedId),
  syncCalendarFeeds: () => ipcRenderer.invoke('calendarSync:syncFeeds'),
  listExternalCalendarEvents: (opts?: { dateFrom?: string; dateTo?: string }) =>
    ipcRenderer.invoke('calendarSync:listExternalEvents', opts),
  getGoogleCalendarConfig: () =>
    ipcRenderer.invoke('calendarSync:getGoogleConfig'),
  updateGoogleCalendarConfig: (input: UpdateGoogleCalendarConfigInput) =>
    ipcRenderer.invoke('calendarSync:updateGoogleConfig', input),
  connectGoogleCalendar: (opts?: { email?: string; clientId?: string }) =>
    ipcRenderer.invoke('calendarSync:connectGoogle', opts),
  disconnectGoogleCalendar: () =>
    ipcRenderer.invoke('calendarSync:disconnectGoogle'),
  syncGoogleCalendarNow: () =>
    ipcRenderer.invoke('calendarSync:syncGoogleNow'),
});
