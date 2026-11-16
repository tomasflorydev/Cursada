import type {
  BackupInfo,
  CourseWithSchedules,
  CursadaIpcApi,
  ExamWithCourse,
  NoteWithCourse,
  OpenDataDirResult,
  RestoreBackupResult,
  TaskWithCourse,
} from '../../types/domain';
import { resetPomodoroStore } from '../pomodoro/pomodoroStore';
import { resetStoredReports } from '../reportsStore';
import {
  mockDeleteAttendanceRecord,
  mockGetCourseAttendance,
  mockRecordAttendance,
  mockUpdateCourseAttendanceConfig,
  resetMockAttendance,
} from './mockAttendance';
import {
  mockAddCalendarFeed,
  mockConnectGoogleCalendar,
  mockDisconnectGoogleCalendar,
  mockExportCalendarIcs,
  mockGetGoogleCalendarConfig,
  mockListCalendarFeeds,
  mockListExternalCalendarEvents,
  mockRemoveCalendarFeed,
  mockSyncCalendarFeeds,
  mockSyncGoogleCalendarNow,
  mockUpdateGoogleCalendarConfig,
  resetMockCalendarSync,
} from './mockCalendarSync';
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
  mockGetKnowledgeGraph,
  mockGetNoteLinks,
  mockImportObsidianVault,
  mockOpenOrCreateWikiLink,
  resetMockKnowledge,
} from './mockKnowledge';
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
  mockCheckDueReminders,
  mockGetNotificationSettings,
  mockSendTestNotification,
  mockUpdateNotificationSettings,
  resetMockNotifications,
} from './mockNotifications';
import {
  mockCheckOllamaStatus,
  mockGetAiSettings,
  mockUpdateAiSettings,
  resetMockOllama,
} from './mockOllama';
import {
  mockCreateChatThread,
  mockDeleteChatThread,
  mockGetChatThread,
  mockListChatThreads,
  mockSaveChatMessageAsNote,
  mockSendChatMessage,
  resetMockChat,
} from './mockChat';
import {
  mockDeleteStudyReport,
  mockDeleteStudyReportsByCourse,
  mockGenerateStudyReport,
  mockGetStudyReportById,
  mockListStudyReports,
  mockSaveStudyReport,
  resetMockStudyReports,
} from './mockReports';
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
  mockUpdateSourceStage,
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

interface MockSnapshot {
  courses: CourseWithSchedules[];
  tasks: TaskWithCourse[];
  exams: ExamWithCourse[];
  notes: NoteWithCourse[];
}

let backupsStore: BackupInfo[] = structuredClone(INITIAL_MOCK_BACKUPS);
let backupSeq = 1;
const snapshotsMap = new Map<string, MockSnapshot>();
const pendingSnapshotsMap = new Map<string, Promise<void>>();
let isRestoringMock = false;

function captureSnapshotForFilename(filename: string): void {
  const promise = Promise.all([
    mockListCourses({ status: 'all' }),
    mockListTasks({ status: 'all' }),
    mockListExams({ graded: 'all' }),
    mockListNotes(),
  ]).then(([courses, tasks, exams, notes]) => {
    snapshotsMap.set(filename, { courses, tasks, exams, notes });
    pendingSnapshotsMap.delete(filename);
  });
  pendingSnapshotsMap.set(filename, promise);
}

function areSchedulesEqual(
  a: CourseWithSchedules['schedules'],
  b: CourseWithSchedules['schedules']
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].dayOfWeek !== b[i].dayOfWeek ||
      a[i].startTime !== b[i].startTime ||
      a[i].endTime !== b[i].endTime ||
      a[i].location !== b[i].location
    ) {
      return false;
    }
  }
  return true;
}

function areCoursesEqual(a: CourseWithSchedules, b: CourseWithSchedules): boolean {
  return (
    a.name === b.name &&
    a.color === b.color &&
    a.professor === b.professor &&
    a.term === b.term &&
    a.status === b.status &&
    areSchedulesEqual(a.schedules, b.schedules)
  );
}

async function restoreMockSnapshot(snapshot: MockSnapshot): Promise<void> {
  isRestoringMock = true;
  try {
    resetMockCourses();
    resetMockTasks();
    resetMockExams();
    resetMockNotes();

    const initialCourses = await mockListCourses({ status: 'all' });
    const initialCourseById = new Map(initialCourses.map((c) => [c.id, c]));
    const snapshotCourseIds = new Set(snapshot.courses.map((c) => c.id));
    const courseIdMap = new Map<string, string>();

    for (const initCourse of initialCourses) {
      if (!snapshotCourseIds.has(initCourse.id)) {
        await mockDeleteCourse(initCourse.id);
      }
    }

    for (const snapCourse of snapshot.courses) {
      const initCourse = initialCourseById.get(snapCourse.id);
      const scheduleInputs = snapCourse.schedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
      }));

      if (initCourse) {
        courseIdMap.set(snapCourse.id, snapCourse.id);
        if (!areCoursesEqual(initCourse, snapCourse)) {
          await mockUpdateCourse(snapCourse.id, {
            name: snapCourse.name,
            color: snapCourse.color,
            professor: snapCourse.professor,
            term: snapCourse.term,
            status: snapCourse.status,
            schedules: scheduleInputs,
          });
        }
      } else {
        const created = await mockCreateCourse({
          name: snapCourse.name,
          color: snapCourse.color,
          professor: snapCourse.professor,
          term: snapCourse.term,
          status: snapCourse.status,
          schedules: scheduleInputs,
        });
        courseIdMap.set(snapCourse.id, created.id);
      }
    }

    const remainingInitTasks = await mockListTasks({ status: 'all' });
    const remainingInitTaskById = new Map(remainingInitTasks.map((t) => [t.id, t]));
    const snapshotTaskIds = new Set(snapshot.tasks.map((t) => t.id));

    for (const initTask of remainingInitTasks) {
      if (!snapshotTaskIds.has(initTask.id)) {
        await mockDeleteTask(initTask.id);
      }
    }

    for (const snapTask of snapshot.tasks) {
      const targetCourseId = courseIdMap.get(snapTask.courseId) ?? snapTask.courseId;
      const initTask = remainingInitTaskById.get(snapTask.id);
      if (initTask) {
        if (
          initTask.courseId !== targetCourseId ||
          initTask.title !== snapTask.title ||
          initTask.description !== snapTask.description ||
          initTask.dueDate !== snapTask.dueDate ||
          initTask.priority !== snapTask.priority ||
          initTask.status !== snapTask.status
        ) {
          await mockUpdateTask(snapTask.id, {
            courseId: targetCourseId,
            title: snapTask.title,
            description: snapTask.description,
            dueDate: snapTask.dueDate,
            priority: snapTask.priority,
            status: snapTask.status,
          });
        }
      } else {
        const created = await mockCreateTask({
          courseId: targetCourseId,
          title: snapTask.title,
          description: snapTask.description,
          dueDate: snapTask.dueDate,
          priority: snapTask.priority,
        });
        if (snapTask.status === 'done') {
          await mockUpdateTask(created.id, { status: 'done' });
        }
      }
    }

    const remainingInitExams = await mockListExams({ graded: 'all' });
    const remainingInitExamById = new Map(remainingInitExams.map((e) => [e.id, e]));
    const snapshotExamIds = new Set(snapshot.exams.map((e) => e.id));

    for (const initExam of remainingInitExams) {
      if (!snapshotExamIds.has(initExam.id)) {
        await mockDeleteExam(initExam.id);
      }
    }

    for (const snapExam of snapshot.exams) {
      const targetCourseId = courseIdMap.get(snapExam.courseId) ?? snapExam.courseId;
      const initExam = remainingInitExamById.get(snapExam.id);
      if (initExam) {
        if (
          initExam.courseId !== targetCourseId ||
          initExam.title !== snapExam.title ||
          initExam.category !== snapExam.category ||
          initExam.examDate !== snapExam.examDate ||
          initExam.examTime !== snapExam.examTime ||
          initExam.location !== snapExam.location ||
          initExam.topics !== snapExam.topics ||
          initExam.grade !== snapExam.grade
        ) {
          await mockUpdateExam(snapExam.id, {
            courseId: targetCourseId,
            title: snapExam.title,
            category: snapExam.category,
            examDate: snapExam.examDate,
            examTime: snapExam.examTime,
            location: snapExam.location,
            topics: snapExam.topics,
            grade: snapExam.grade,
          });
        }
      } else {
        await mockCreateExam({
          courseId: targetCourseId,
          title: snapExam.title,
          category: snapExam.category,
          examDate: snapExam.examDate,
          examTime: snapExam.examTime,
          location: snapExam.location,
          topics: snapExam.topics,
          grade: snapExam.grade,
        });
      }
    }

    const remainingInitNotes = await mockListNotes();
    const remainingInitNoteById = new Map(remainingInitNotes.map((n) => [n.id, n]));
    const snapshotNoteIds = new Set(snapshot.notes.map((n) => n.id));

    for (const initNote of remainingInitNotes) {
      if (!snapshotNoteIds.has(initNote.id)) {
        await mockDeleteNote(initNote.id);
      }
    }

    for (const snapNote of snapshot.notes) {
      const targetCourseId = courseIdMap.get(snapNote.courseId) ?? snapNote.courseId;
      const initNote = remainingInitNoteById.get(snapNote.id);
      if (initNote) {
        if (
          initNote.courseId !== targetCourseId ||
          initNote.title !== snapNote.title ||
          initNote.content !== snapNote.content ||
          initNote.isPinned !== snapNote.isPinned
        ) {
          await mockUpdateNote(snapNote.id, {
            courseId: targetCourseId,
            title: snapNote.title,
            content: snapNote.content,
            isPinned: snapNote.isPinned,
          });
        }
      } else {
        await mockCreateNote({
          courseId: targetCourseId,
          title: snapNote.title,
          content: snapNote.content,
          origin: snapNote.origin,
          isPinned: snapNote.isPinned,
        });
      }
    }
  } finally {
    isRestoringMock = false;
  }
}

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
  captureSnapshotForFilename(filename);
  backupsStore.unshift(info);
  if (backupsStore.length > 15) {
    const evicted = backupsStore.slice(15);
    backupsStore = backupsStore.slice(0, 15);
    for (const item of evicted) {
      snapshotsMap.delete(item.filename);
      pendingSnapshotsMap.delete(item.filename);
    }
  }
  return structuredClone(info);
}

captureSnapshotForFilename(INITIAL_MOCK_BACKUPS[0].filename);

registerCourseTaskHooks({
  countTasksByCourse: mockCountTasksByCourse,
  deleteTasksByCourse: mockDeleteTasksByCourse,
  countExamsByCourse: mockCountExamsByCourse,
  deleteExamsByCourse: mockDeleteExamsByCourse,
  countNotesByCourse: mockCountNotesByCourse,
  deleteNotesByCourse: mockDeleteNotesByCourse,
  countSourcesByCourse: mockCountSourcesByCourse,
  deleteSourcesByCourse: mockDeleteSourcesByCourse,
  deleteReportsByCourse: mockDeleteStudyReportsByCourse,
  onBeforeDeleteCourse: () => {
    if (!isRestoringMock) {
      createMockBackupSync('pre-course-delete');
    }
  },
});

export function resetAllMocks(): void {
  resetMockCourses();
  resetMockTasks();
  resetMockExams();
  resetMockNotes();
  resetMockOllama();
  resetMockSources();
  resetMockChat();
  resetMockNotifications();
  resetMockKnowledge();
  resetMockAttendance();
  resetMockCalendarSync();
  resetPomodoroStore();
  resetMockStudyReports();
  resetStoredReports();
  backupsStore = structuredClone(INITIAL_MOCK_BACKUPS);
  backupSeq = 1;
  isRestoringMock = false;
  snapshotsMap.clear();
  pendingSnapshotsMap.clear();
  captureSnapshotForFilename(INITIAL_MOCK_BACKUPS[0].filename);
}

export const mockClient: CursadaIpcApi = {
  platform: 'darwin',
  createBackup: async () => createMockBackupSync('manual'),
  listBackups: async () => structuredClone(backupsStore),
  restoreBackup: async (filename: string): Promise<RestoreBackupResult> => {
    const trimmed = (filename ?? '').trim();
    const target = backupsStore.find((b) => b.filename === trimmed);
    if (!target) {
      throw new Error(`No se encontró el backup "${trimmed}".`);
    }
    const restoredFrom = structuredClone(target);
    const pendingTarget = pendingSnapshotsMap.get(trimmed);
    if (pendingTarget) {
      await pendingTarget;
    }
    const snapshot = snapshotsMap.get(trimmed);
    if (!snapshot) {
      throw new Error(`No se encontró el snapshot del backup "${trimmed}".`);
    }

    const preRestoreBackup = createMockBackupSync('pre-restore');
    const pendingPreRestore = pendingSnapshotsMap.get(preRestoreBackup.filename);
    if (pendingPreRestore) {
      await pendingPreRestore;
    }

    await restoreMockSnapshot(snapshot);
    return {
      restoredFrom,
      preRestoreBackup,
    };
  },
  getDataDir: async () => MOCK_DATA_DIR,
  openDataDir: async (): Promise<OpenDataDirResult> => ({
    dataDir: MOCK_DATA_DIR,
    opened: true,
  }),
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
  listChatThreads: mockListChatThreads,
  getChatThread: mockGetChatThread,
  createChatThread: mockCreateChatThread,
  deleteChatThread: mockDeleteChatThread,
  sendChatMessage: mockSendChatMessage,
  cancelChatMessage: async () => {},
  saveChatMessageAsNote: mockSaveChatMessageAsNote,
  generateStudyReport: mockGenerateStudyReport,
  cancelStudyReport: async () => {},
  onAiStreamProgress: () => () => {},
  listStudyReports: mockListStudyReports,
  getStudyReportById: mockGetStudyReportById,
  saveStudyReport: mockSaveStudyReport,
  deleteStudyReport: mockDeleteStudyReport,
  getNotificationSettings: mockGetNotificationSettings,
  updateNotificationSettings: mockUpdateNotificationSettings,
  sendTestNotification: mockSendTestNotification,
  checkDueReminders: mockCheckDueReminders,
  // Knowledge Graph, WikiLinks & Obsidian (Phase 12)
  getNoteLinks: mockGetNoteLinks,
  openOrCreateWikiLink: mockOpenOrCreateWikiLink,
  getKnowledgeGraph: mockGetKnowledgeGraph,
  importObsidianVault: mockImportObsidianVault,
  // Active Study, Exam Stage & Attendance (Phase 13)
  updateSourceStage: mockUpdateSourceStage,
  getCourseAttendance: mockGetCourseAttendance,
  updateCourseAttendanceConfig: mockUpdateCourseAttendanceConfig,
  recordAttendance: mockRecordAttendance,
  deleteAttendanceRecord: mockDeleteAttendanceRecord,
  // Google Calendar Sync & iCal (Phase 14)
  exportCalendarIcs: mockExportCalendarIcs,
  listCalendarFeeds: mockListCalendarFeeds,
  addCalendarFeed: mockAddCalendarFeed,
  removeCalendarFeed: mockRemoveCalendarFeed,
  syncCalendarFeeds: mockSyncCalendarFeeds,
  listExternalCalendarEvents: mockListExternalCalendarEvents,
  getGoogleCalendarConfig: mockGetGoogleCalendarConfig,
  updateGoogleCalendarConfig: mockUpdateGoogleCalendarConfig,
  connectGoogleCalendar: mockConnectGoogleCalendar,
  disconnectGoogleCalendar: mockDisconnectGoogleCalendar,
  syncGoogleCalendarNow: mockSyncGoogleCalendarNow,
};
