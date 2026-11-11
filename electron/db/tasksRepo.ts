import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CourseColor,
  CreateTaskInput,
  TaskFilters,
  TaskPriority,
  TaskStatus,
  TaskWithCourse,
  UpdateTaskInput,
} from '../types.js';

interface TaskJoinedRow {
  id: string;
  course_id: string;
  title: string;
  description: string;
  due_date: string | null;
  priority: TaskPriority | null;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  course_name: string;
  course_color: CourseColor;
}

const VALID_PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high']);
const VALID_STATUSES = new Set<TaskStatus>(['pending', 'done']);

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateTitle(rawTitle: string): string {
  const title = (rawTitle ?? '').trim();
  if (!title) {
    throw new Error('Task title cannot be empty');
  }
  return title;
}

function assertCourseExists(db: DatabaseSync, rawCourseId: string): string {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Course ID is required');
  }
  const row = db
    .prepare('SELECT id FROM courses WHERE id = ?')
    .get(courseId) as { id: string } | undefined;
  if (!row) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function validateDueDate(dueDate: string | null | undefined): string | null {
  if (dueDate === undefined || dueDate === null) {
    return null;
  }
  if (typeof dueDate !== 'string' || !isValidIsoDate(dueDate)) {
    throw new Error(`Invalid dueDate "${String(dueDate)}". Expected YYYY-MM-DD.`);
  }
  return dueDate;
}

function validatePriority(
  priority: TaskPriority | null | undefined
): TaskPriority | null {
  if (priority === undefined || priority === null) {
    return null;
  }
  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error(
      `Invalid task priority "${String(priority)}". Expected 'low', 'medium', 'high', or null.`
    );
  }
  return priority;
}

function validateStatus(status: TaskStatus): TaskStatus {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(
      `Invalid task status "${String(status)}". Expected 'pending' or 'done'.`
    );
  }
  return status;
}

function mapTaskRow(row: TaskJoinedRow): TaskWithCourse {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    courseName: row.course_name,
    courseColor: row.course_color,
  };
}

export function listTasks(
  db: DatabaseSync,
  filters?: TaskFilters
): TaskWithCourse[] {
  const conditions: string[] = [];
  const params: Array<string> = [];

  if (filters?.courseId) {
    conditions.push('t.course_id = ?');
    params.push(filters.courseId);
  }
  if (filters?.status && filters.status !== 'all') {
    validateStatus(filters.status);
    conditions.push('t.status = ?');
    params.push(filters.status);
  }
  if (filters?.dueFrom) {
    if (!isValidIsoDate(filters.dueFrom)) {
      throw new Error(`Invalid dueFrom "${filters.dueFrom}". Expected YYYY-MM-DD.`);
    }
    conditions.push('t.due_date IS NOT NULL AND t.due_date >= ?');
    params.push(filters.dueFrom);
  }
  if (filters?.dueTo) {
    if (!isValidIsoDate(filters.dueTo)) {
      throw new Error(`Invalid dueTo "${filters.dueTo}". Expected YYYY-MM-DD.`);
    }
    conditions.push('t.due_date IS NOT NULL AND t.due_date <= ?');
    params.push(filters.dueTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      t.*,
      c.name AS course_name,
      c.color AS course_color
    FROM tasks t
    INNER JOIN courses c ON c.id = t.course_id
    ${whereClause}
    ORDER BY
      CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END ASC,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC,
      t.due_date ASC,
      CASE t.priority
        WHEN 'high' THEN 0
        WHEN 'medium' THEN 1
        WHEN 'low' THEN 2
        ELSE 3
      END ASC,
      t.created_at DESC,
      t.id ASC
  `;

  const rows = db.prepare(sql).all(...params) as unknown as TaskJoinedRow[];
  return rows.map(mapTaskRow);
}

export function getTaskById(db: DatabaseSync, id: string): TaskWithCourse | null {
  const row = db
    .prepare(
      `SELECT t.*, c.name AS course_name, c.color AS course_color
       FROM tasks t
       INNER JOIN courses c ON c.id = t.course_id
       WHERE t.id = ?`
    )
    .get(id) as TaskJoinedRow | undefined;
  return row ? mapTaskRow(row) : null;
}

export function createTask(
  db: DatabaseSync,
  input: CreateTaskInput
): TaskWithCourse {
  const id = randomUUID();
  const now = new Date().toISOString();
  const title = validateTitle(input.title);
  const courseId = assertCourseExists(db, input.courseId);
  const description = (input.description ?? '').trim();
  const dueDate = validateDueDate(input.dueDate);
  const priority = validatePriority(input.priority);

  db.prepare(
    `INSERT INTO tasks (id, course_id, title, description, due_date, priority, status, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
  ).run(id, courseId, title, description, dueDate, priority, now, now);

  const created = getTaskById(db, id);
  if (!created) {
    throw new Error('Failed to load created task');
  }
  return created;
}

export function updateTask(
  db: DatabaseSync,
  id: string,
  input: UpdateTaskInput
): TaskWithCourse {
  const existing = getTaskById(db, id);
  if (!existing) {
    throw new Error(`Task not found: ${id}`);
  }

  const now = new Date().toISOString();
  const courseId =
    input.courseId !== undefined
      ? assertCourseExists(db, input.courseId)
      : existing.courseId;
  const title =
    input.title !== undefined ? validateTitle(input.title) : existing.title;
  const description =
    input.description !== undefined ? input.description.trim() : existing.description;
  const dueDate =
    input.dueDate !== undefined ? validateDueDate(input.dueDate) : existing.dueDate;
  const priority =
    input.priority !== undefined
      ? validatePriority(input.priority)
      : existing.priority;
  const status =
    input.status !== undefined ? validateStatus(input.status) : existing.status;
  const completedAt =
    status === 'done'
      ? existing.status === 'done' && existing.completedAt
        ? existing.completedAt
        : now
      : null;

  db.prepare(
    `UPDATE tasks
     SET course_id = ?, title = ?, description = ?, due_date = ?, priority = ?, status = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(courseId, title, description, dueDate, priority, status, completedAt, now, id);

  const updated = getTaskById(db, id);
  if (!updated) {
    throw new Error('Failed to load updated task');
  }
  return updated;
}

export function toggleTaskStatus(db: DatabaseSync, id: string): TaskWithCourse {
  const existing = getTaskById(db, id);
  if (!existing) {
    throw new Error(`Task not found: ${id}`);
  }
  const nextStatus: TaskStatus = existing.status === 'pending' ? 'done' : 'pending';
  return updateTask(db, id, { status: nextStatus });
}

export function deleteTask(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}
