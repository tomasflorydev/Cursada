import type {
  BackupInfo,
  CourseDeleteImpact,
  CourseStatus,
  CourseWithSchedules,
  CreateCourseInput,
  CreateTaskInput,
  CursadaIpcApi,
  TaskFilters,
  TaskWithCourse,
  UpdateCourseInput,
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
};
