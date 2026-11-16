import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ClassSchedule,
  ClassScheduleInput,
  CourseColor,
  CourseDeleteImpact,
  CourseStatus,
  CourseWithSchedules,
  CreateCourseInput,
  DayOfWeek,
  UpdateCourseInput,
} from '../types.js';
import { removeStoredSourceFile } from './sourcesRepo.js';

export const VALID_COURSE_COLORS: readonly CourseColor[] = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'rose',
  'cyan',
  'orange',
  'slate',
];

export const VALID_COURSE_STATUSES: readonly CourseStatus[] = ['active', 'archived'];

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(time: string): number {
  const match = TIME_HH_MM_REGEX.exec(time);
  if (!match) {
    throw new Error(`Invalid time format "${time}". Expected HH:MM (00:00 to 23:59)`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function validateCourseColor(color: string): asserts color is CourseColor {
  if (!VALID_COURSE_COLORS.includes(color as CourseColor)) {
    throw new Error(`Invalid course color: "${color}"`);
  }
}

export function validateCourseStatus(status: string): asserts status is CourseStatus {
  if (!VALID_COURSE_STATUSES.includes(status as CourseStatus)) {
    throw new Error(`Invalid course status: "${status}"`);
  }
}

export function validateScheduleInput(sched: ClassScheduleInput): void {
  if (
    typeof sched.dayOfWeek !== 'number' ||
    !Number.isInteger(sched.dayOfWeek) ||
    sched.dayOfWeek < 1 ||
    sched.dayOfWeek > 7
  ) {
    throw new Error(
      `Invalid dayOfWeek "${String(sched.dayOfWeek)}". Must be an integer between 1 (Lunes) and 7 (Domingo)`
    );
  }

  const startMinutes = parseTimeToMinutes(sched.startTime);
  const endMinutes = parseTimeToMinutes(sched.endTime);

  if (startMinutes >= endMinutes) {
    throw new Error(
      `Invalid schedule time range: startTime (${sched.startTime}) must be strictly before endTime (${sched.endTime})`
    );
  }
}

interface CourseRow {
  id: string;
  name: string;
  color: CourseColor;
  professor: string;
  term: string;
  status: CourseStatus;
  attendance_enabled?: number;
  max_absences?: number;
  created_at: string;
  updated_at: string;
}

interface ScheduleRow {
  id: string;
  course_id: string;
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
  location: string;
}

function validateMaxAbsences(rawValue: unknown): number {
  if (
    typeof rawValue !== 'number' ||
    !Number.isFinite(rawValue) ||
    !Number.isInteger(rawValue) ||
    rawValue < 1 ||
    rawValue > 50
  ) {
    throw new Error(
      `Invalid maxAbsences "${String(rawValue)}". Must be an integer between 1 and 50.`
    );
  }
  return rawValue;
}

function mapScheduleRow(row: ScheduleRow): ClassSchedule {
  return {
    id: row.id,
    courseId: row.course_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
  };
}

function mapCourseRow(
  row: CourseRow,
  schedules: ClassSchedule[]
): CourseWithSchedules {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    professor: row.professor,
    term: row.term,
    status: row.status,
    attendanceEnabled: Boolean(row.attendance_enabled),
    maxAbsences: Number(row.max_absences ?? 4),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schedules,
  };
}

export function listCourses(
  db: DatabaseSync,
  opts?: { status?: CourseStatus | 'all' }
): CourseWithSchedules[] {
  const statusFilter = opts?.status ?? 'all';
  if (statusFilter !== 'all') {
    validateCourseStatus(statusFilter);
  }

  const courses = (
    statusFilter === 'all'
      ? db.prepare('SELECT * FROM courses ORDER BY created_at ASC').all()
      : db
          .prepare('SELECT * FROM courses WHERE status = ? ORDER BY created_at ASC')
          .all(statusFilter)
  ) as unknown as CourseRow[];

  const schedules = db
    .prepare('SELECT * FROM class_schedules ORDER BY day_of_week ASC, start_time ASC')
    .all() as unknown as ScheduleRow[];

  const schedulesByCourse = new Map<string, ClassSchedule[]>();
  for (const s of schedules) {
    const list = schedulesByCourse.get(s.course_id) ?? [];
    list.push(mapScheduleRow(s));
    schedulesByCourse.set(s.course_id, list);
  }

  return courses.map((c) => mapCourseRow(c, schedulesByCourse.get(c.id) ?? []));
}

export function getCourseById(db: DatabaseSync, id: string): CourseWithSchedules | null {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id) as
    | CourseRow
    | undefined;
  if (!course) {
    return null;
  }

  const schedules = db
    .prepare(
      'SELECT * FROM class_schedules WHERE course_id = ? ORDER BY day_of_week ASC, start_time ASC'
    )
    .all(id) as unknown as ScheduleRow[];

  return mapCourseRow(course, schedules.map(mapScheduleRow));
}

export function createCourse(
  db: DatabaseSync,
  input: CreateCourseInput
): CourseWithSchedules {
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = (input.name ?? '').trim();
  const term = (input.term ?? '').trim();
  const status = input.status ?? 'active';
  const attendanceEnabled = input.attendanceEnabled ? 1 : 0;
  const maxAbsences =
    input.maxAbsences !== undefined
      ? validateMaxAbsences(input.maxAbsences)
      : 4;

  if (!name) {
    throw new Error('Course name cannot be empty');
  }
  validateCourseColor(input.color);
  validateCourseStatus(status);

  const schedules = input.schedules ?? [];
  for (const sched of schedules) {
    validateScheduleInput(sched);
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO courses (id, name, color, professor, term, status, attendance_enabled, max_absences, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      input.color,
      (input.professor ?? '').trim(),
      term,
      status,
      attendanceEnabled,
      maxAbsences,
      now,
      now
    );

    const insertSchedule = db.prepare(
      `INSERT INTO class_schedules (id, course_id, day_of_week, start_time, end_time, location)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const sched of schedules) {
      insertSchedule.run(
        sched.id ?? randomUUID(),
        id,
        sched.dayOfWeek,
        sched.startTime,
        sched.endTime,
        (sched.location ?? '').trim()
      );
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const created = getCourseById(db, id);
  if (!created) {
    throw new Error('Failed to load created course');
  }
  return created;
}

export function updateCourse(
  db: DatabaseSync,
  id: string,
  input: UpdateCourseInput
): CourseWithSchedules {
  const existing = getCourseById(db, id);
  if (!existing) {
    throw new Error(`Course not found: ${id}`);
  }

  const now = new Date().toISOString();
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const term = input.term !== undefined ? input.term.trim() : existing.term;
  const color = input.color ?? existing.color;
  const professor =
    input.professor !== undefined ? input.professor.trim() : existing.professor;
  const status = input.status ?? existing.status;
  const attendanceEnabled =
    input.attendanceEnabled !== undefined
      ? input.attendanceEnabled
        ? 1
        : 0
      : existing.attendanceEnabled
        ? 1
        : 0;
  const maxAbsences =
    input.maxAbsences !== undefined
      ? validateMaxAbsences(input.maxAbsences)
      : existing.maxAbsences ?? 4;

  if (!name) {
    throw new Error('Course name cannot be empty');
  }
  validateCourseColor(color);
  validateCourseStatus(status);

  if (input.schedules !== undefined) {
    for (const sched of input.schedules) {
      validateScheduleInput(sched);
    }
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `UPDATE courses
       SET name = ?, color = ?, professor = ?, term = ?, status = ?, attendance_enabled = ?, max_absences = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      color,
      professor,
      term,
      status,
      attendanceEnabled,
      maxAbsences,
      now,
      id
    );

    if (input.schedules !== undefined) {
      db.prepare('DELETE FROM class_schedules WHERE course_id = ?').run(id);
      const insertSchedule = db.prepare(
        `INSERT INTO class_schedules (id, course_id, day_of_week, start_time, end_time, location)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const sched of input.schedules) {
        insertSchedule.run(
          sched.id ?? randomUUID(),
          id,
          sched.dayOfWeek,
          sched.startTime,
          sched.endTime,
          (sched.location ?? '').trim()
        );
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const updated = getCourseById(db, id);
  if (!updated) {
    throw new Error('Failed to load updated course');
  }
  return updated;
}

export function getCourseDeleteImpact(
  db: DatabaseSync,
  id: string
): CourseDeleteImpact {
  const course = db
    .prepare('SELECT id, name FROM courses WHERE id = ?')
    .get(id) as { id: string; name: string } | undefined;
  if (!course) {
    throw new Error(`Course not found: ${id}`);
  }

  const countRow = db
    .prepare('SELECT COUNT(*) AS count FROM tasks WHERE course_id = ?')
    .get(id) as { count: number } | undefined;

  const examsCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM exams WHERE course_id = ?')
    .get(id) as { count: number } | undefined;

  const notesCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM notes WHERE course_id = ?')
    .get(id) as { count: number } | undefined;

  const sourcesCountRow = db
    .prepare('SELECT COUNT(*) AS count FROM sources WHERE course_id = ?')
    .get(id) as { count: number } | undefined;

  const examsCount = Number(examsCountRow?.count ?? 0);
  const notesCount = Number(notesCountRow?.count ?? 0);
  const sourcesCount = Number(sourcesCountRow?.count ?? 0);

  return {
    courseId: course.id,
    courseName: course.name,
    tasksCount: Number(countRow?.count ?? 0),
    ...(examsCount > 0 ? { examsCount } : {}),
    ...(notesCount > 0 ? { notesCount } : {}),
    ...(sourcesCount > 0 ? { sourcesCount } : {}),
  };
}

export function deleteCourse(
  db: DatabaseSync,
  id: string,
  dataDir?: string
): void {
  const storedRows = dataDir
    ? (db
        .prepare(
          'SELECT stored_filename FROM sources WHERE course_id = ? AND stored_filename IS NOT NULL'
        )
        .all(id) as unknown as Array<{ stored_filename: string | null }>)
    : [];

  db.prepare('DELETE FROM courses WHERE id = ?').run(id);

  if (dataDir) {
    for (const row of storedRows) {
      if (row.stored_filename) {
        removeStoredSourceFile(dataDir, row.stored_filename);
      }
    }
  }
}
