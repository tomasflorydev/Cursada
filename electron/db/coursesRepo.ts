import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ClassSchedule,
  CourseColor,
  CourseDeleteImpact,
  CourseStatus,
  CourseWithSchedules,
  CreateCourseInput,
  DayOfWeek,
  UpdateCourseInput,
} from '../types.js';

interface CourseRow {
  id: string;
  name: string;
  color: CourseColor;
  professor: string;
  term: string;
  status: CourseStatus;
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

export function listCourses(
  db: DatabaseSync,
  opts?: { status?: CourseStatus | 'all' }
): CourseWithSchedules[] {
  const statusFilter = opts?.status ?? 'all';
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

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    professor: c.professor,
    term: c.term,
    status: c.status,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    schedules: schedulesByCourse.get(c.id) ?? [],
  }));
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

  return {
    id: course.id,
    name: course.name,
    color: course.color,
    professor: course.professor,
    term: course.term,
    status: course.status,
    createdAt: course.created_at,
    updatedAt: course.updated_at,
    schedules: schedules.map(mapScheduleRow),
  };
}

export function createCourse(
  db: DatabaseSync,
  input: CreateCourseInput
): CourseWithSchedules {
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = input.name.trim();
  const term = input.term.trim();
  if (!name) {
    throw new Error('Course name cannot be empty');
  }
  if (!term) {
    throw new Error('Course term cannot be empty');
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `INSERT INTO courses (id, name, color, professor, term, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      input.color,
      (input.professor ?? '').trim(),
      term,
      input.status ?? 'active',
      now,
      now
    );

    const insertSchedule = db.prepare(
      `INSERT INTO class_schedules (id, course_id, day_of_week, start_time, end_time, location)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const sched of input.schedules ?? []) {
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

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(
      `UPDATE courses
       SET name = ?, color = ?, professor = ?, term = ?, status = ?, updated_at = ?
       WHERE id = ?`
    ).run(name, color, professor, term, status, now, id);

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

  return {
    courseId: course.id,
    courseName: course.name,
    tasksCount: Number(countRow?.count ?? 0),
  };
}

export function deleteCourse(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM courses WHERE id = ?').run(id);
}
