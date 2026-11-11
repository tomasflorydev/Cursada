import { contextBridge, ipcRenderer } from 'electron';
import type {
  CourseStatus,
  CreateCourseInput,
  CreateTaskInput,
  TaskFilters,
  UpdateCourseInput,
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
});
