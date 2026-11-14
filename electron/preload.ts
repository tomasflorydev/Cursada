import { contextBridge, ipcRenderer } from 'electron';
import type {
  CourseStatus,
  CreateCourseInput,
  CreateExamInput,
  CreateNoteInput,
  CreateSourceFromTextInput,
  CreateTaskInput,
  ExamFilters,
  ExportMarkdownRequest,
  ImportSourceFileInput,
  NoteFilters,
  SearchSourceChunksInput,
  TaskFilters,
  UpdateAiSettingsInput,
  UpdateCourseInput,
  UpdateExamInput,
  UpdateNoteInput,
  UpdateTaskInput,
} from './types.js';

contextBridge.exposeInMainWorld('cursadaApi', {
  platform: process.platform,
  // System & Backups
  createBackup: () => ipcRenderer.invoke('system:createBackup'),
  listBackups: () => ipcRenderer.invoke('system:listBackups'),
  getDataDir: () => ipcRenderer.invoke('system:getDataDir'),
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
});
