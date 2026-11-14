import type { BackupInfo, CursadaIpcApi } from '../../types/domain';
import {
  mockCreateCourse,
  mockDeleteCourse,
  mockGetCourse,
  mockGetCourseDeleteImpact,
  mockListCourses,
  mockUpdateCourse,
  registerCourseTaskHooks,
  resetMockCourses,
} from './mockCourses';
import {
  mockCountExamsByCourse,
  mockCreateExam,
  mockDeleteExam,
  mockDeleteExamsByCourse,
  mockListExams,
  mockUpdateExam,
  resetMockExams,
} from './mockExams';
import { mockExportMarkdown } from './mockExport';
import {
  mockCountNotesByCourse,
  mockCreateNote,
  mockDeleteNote,
  mockDeleteNotesByCourse,
  mockGetNote,
  mockListNotes,
  mockToggleNotePin,
  mockUpdateNote,
  resetMockNotes,
} from './mockNotes';
import {
  mockCheckOllamaStatus,
  mockGetAiSettings,
  mockUpdateAiSettings,
  resetMockOllama,
} from './mockOllama';
import {
  mockCountSourcesByCourse,
  mockCreateSourceFromText,
  mockDeleteSource,
  mockDeleteSourcesByCourse,
  mockGetSourceWithChunks,
  mockImportSourceFile,
  mockListSources,
  mockReindexSource,
  mockSearchSourceChunks,
  resetMockSources,
} from './mockSources';
import {
  mockCountTasksByCourse,
  mockCreateTask,
  mockDeleteTask,
  mockDeleteTasksByCourse,
  mockListTasks,
  mockToggleTaskStatus,
  mockUpdateTask,
  resetMockTasks,
} from './mockTasks';

const MOCK_DATA_DIR = '~/Library/Application Support/com.cursada.app (Modo navegador)';

const INITIAL_MOCK_BACKUPS: BackupInfo[] = [
  {
    filename: 'cursada-20261110-090000-000-startup.sqlite',
    filePath: `${MOCK_DATA_DIR}/backups/cursada-20261110-090000-000-startup.sqlite`,
    createdAt: '2026-11-10T12:00:00.000Z',
    sizeBytes: 65536,
  },
];

let backupsStore: BackupInfo[] = structuredClone(INITIAL_MOCK_BACKUPS);
let backupSeq = 1;

function createMockBackupSync(reason = 'manual'): BackupInfo {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 17);
  const filename = `cursada-${stamp}-${backupSeq++}-${reason}.sqlite`;
  const info: BackupInfo = {
    filename,
    filePath: `${MOCK_DATA_DIR}/backups/${filename}`,
    createdAt: now.toISOString(),
    sizeBytes: 65536,
  };
  backupsStore.unshift(info);
  if (backupsStore.length > 15) {
    backupsStore = backupsStore.slice(0, 15);
  }
  return structuredClone(info);
}

registerCourseTaskHooks({
  countTasksByCourse: mockCountTasksByCourse,
  deleteTasksByCourse: mockDeleteTasksByCourse,
  countExamsByCourse: mockCountExamsByCourse,
  deleteExamsByCourse: mockDeleteExamsByCourse,
  countNotesByCourse: mockCountNotesByCourse,
  deleteNotesByCourse: mockDeleteNotesByCourse,
  countSourcesByCourse: mockCountSourcesByCourse,
  deleteSourcesByCourse: mockDeleteSourcesByCourse,
  onBeforeDeleteCourse: () => {
    createMockBackupSync('pre-course-delete');
  },
});

export function resetAllMocks(): void {
  resetMockCourses();
  resetMockTasks();
  resetMockExams();
  resetMockNotes();
  resetMockOllama();
  resetMockSources();
  backupsStore = structuredClone(INITIAL_MOCK_BACKUPS);
  backupSeq = 1;
}

export const mockClient: CursadaIpcApi = {
  platform: 'darwin',
  createBackup: async () => createMockBackupSync('manual'),
  listBackups: async () => structuredClone(backupsStore),
  getDataDir: async () => MOCK_DATA_DIR,
  listCourses: mockListCourses,
  getCourse: mockGetCourse,
  createCourse: mockCreateCourse,
  updateCourse: mockUpdateCourse,
  getCourseDeleteImpact: mockGetCourseDeleteImpact,
  deleteCourse: mockDeleteCourse,
  listTasks: mockListTasks,
  createTask: mockCreateTask,
  updateTask: mockUpdateTask,
  toggleTaskStatus: mockToggleTaskStatus,
  deleteTask: mockDeleteTask,
  listExams: mockListExams,
  createExam: mockCreateExam,
  updateExam: mockUpdateExam,
  deleteExam: mockDeleteExam,
  listNotes: mockListNotes,
  getNote: mockGetNote,
  createNote: mockCreateNote,
  updateNote: mockUpdateNote,
  toggleNotePin: mockToggleNotePin,
  deleteNote: mockDeleteNote,
  exportMarkdown: mockExportMarkdown,
  getAiSettings: mockGetAiSettings,
  updateAiSettings: mockUpdateAiSettings,
  checkOllamaStatus: mockCheckOllamaStatus,
  listSources: mockListSources,
  getSourceWithChunks: mockGetSourceWithChunks,
  createSourceFromText: mockCreateSourceFromText,
  importSourceFile: mockImportSourceFile,
  reindexSource: mockReindexSource,
  deleteSource: mockDeleteSource,
  searchSourceChunks: mockSearchSourceChunks,
};
