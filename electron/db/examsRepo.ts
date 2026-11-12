import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CourseColor,
  CreateExamInput,
  ExamCategory,
  ExamFilters,
  ExamWithCourse,
  UpdateExamInput,
} from '../types.js';
import { isValidIsoDate } from './tasksRepo.js';

interface ExamJoinedRow {
  id: string;
  course_id: string;
  title: string;
  category: ExamCategory;
  exam_date: string;
  exam_time: string | null;
  location: string;
  topics: string;
  grade: number | null;
  created_at: string;
  updated_at: string;
  course_name: string;
  course_color: CourseColor;
}

const VALID_CATEGORIES = new Set<ExamCategory>([
  'parcial',
  'recuperatorio',
  'final',
  'tp',
]);

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validateTitle(rawTitle: string): string {
  const title = (rawTitle ?? '').trim();
  if (!title) {
    throw new Error('Exam title cannot be empty');
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

function validateCategory(category: ExamCategory | undefined): ExamCategory {
  const cat = category ?? 'parcial';
  if (!VALID_CATEGORIES.has(cat)) {
    throw new Error(
      `Invalid exam category "${String(category)}". Expected 'parcial', 'recuperatorio', 'final', or 'tp'.`
    );
  }
  return cat;
}

function validateExamDate(rawDate: string): string {
  if (typeof rawDate !== 'string' || !isValidIsoDate(rawDate)) {
    throw new Error(`Invalid examDate "${String(rawDate)}". Expected YYYY-MM-DD.`);
  }
  return rawDate;
}

function validateExamTime(rawTime: string | null | undefined): string | null {
  if (rawTime === undefined || rawTime === null || rawTime.trim() === '') {
    return null;
  }
  const trimmed = rawTime.trim();
  if (!TIME_HH_MM_REGEX.test(trimmed)) {
    throw new Error(`Invalid examTime "${trimmed}". Expected HH:MM (00:00 to 23:59).`);
  }
  return trimmed;
}

function validateGrade(grade: number | null | undefined): number | null {
  if (grade === undefined || grade === null) {
    return null;
  }
  if (typeof grade !== 'number' || Number.isNaN(grade) || grade < 1 || grade > 10) {
    throw new Error(
      `Invalid exam grade "${String(grade)}". Grade must be between 1 and 10.`
    );
  }
  return Math.round(grade * 100) / 100;
}

function mapExamRow(row: ExamJoinedRow): ExamWithCourse {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    category: row.category,
    examDate: row.exam_date,
    examTime: row.exam_time,
    location: row.location,
    topics: row.topics,
    grade: row.grade !== null ? Number(row.grade) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    courseName: row.course_name,
    courseColor: row.course_color,
  };
}

export function listExams(
  db: DatabaseSync,
  filters?: ExamFilters
): ExamWithCourse[] {
  const conditions: string[] = [];
  const params: Array<string> = [];

  if (filters?.courseId) {
    conditions.push('e.course_id = ?');
    params.push(filters.courseId);
  }
  if (filters?.dateFrom) {
    if (!isValidIsoDate(filters.dateFrom)) {
      throw new Error(`Invalid dateFrom "${filters.dateFrom}". Expected YYYY-MM-DD.`);
    }
    conditions.push('e.exam_date >= ?');
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    if (!isValidIsoDate(filters.dateTo)) {
      throw new Error(`Invalid dateTo "${filters.dateTo}". Expected YYYY-MM-DD.`);
    }
    conditions.push('e.exam_date <= ?');
    params.push(filters.dateTo);
  }
  if (filters?.graded === 'graded') {
    conditions.push('e.grade IS NOT NULL');
  } else if (filters?.graded === 'ungraded') {
    conditions.push('e.grade IS NULL');
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT
      e.*,
      c.name AS course_name,
      c.color AS course_color
    FROM exams e
    INNER JOIN courses c ON c.id = e.course_id
    ${whereClause}
    ORDER BY
      e.exam_date ASC,
      CASE WHEN e.exam_time IS NULL THEN 1 ELSE 0 END ASC,
      e.exam_time ASC,
      e.created_at ASC,
      e.id ASC
  `;

  const rows = db.prepare(sql).all(...params) as unknown as ExamJoinedRow[];
  return rows.map(mapExamRow);
}

export function getExamById(db: DatabaseSync, id: string): ExamWithCourse | null {
  const row = db
    .prepare(
      `SELECT e.*, c.name AS course_name, c.color AS course_color
       FROM exams e
       INNER JOIN courses c ON c.id = e.course_id
       WHERE e.id = ?`
    )
    .get(id) as ExamJoinedRow | undefined;
  return row ? mapExamRow(row) : null;
}

export function createExam(
  db: DatabaseSync,
  input: CreateExamInput
): ExamWithCourse {
  const id = randomUUID();
  const now = new Date().toISOString();
  const title = validateTitle(input.title);
  const courseId = assertCourseExists(db, input.courseId);
  const category = validateCategory(input.category);
  const examDate = validateExamDate(input.examDate);
  const examTime = validateExamTime(input.examTime);
  const location = (input.location ?? '').trim();
  const topics = (input.topics ?? '').trim();
  const grade = validateGrade(input.grade);

  db.prepare(
    `INSERT INTO exams (id, course_id, title, category, exam_date, exam_time, location, topics, grade, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    courseId,
    title,
    category,
    examDate,
    examTime,
    location,
    topics,
    grade,
    now,
    now
  );

  const created = getExamById(db, id);
  if (!created) {
    throw new Error('Failed to load created exam');
  }
  return created;
}

export function updateExam(
  db: DatabaseSync,
  id: string,
  input: UpdateExamInput
): ExamWithCourse {
  const existing = getExamById(db, id);
  if (!existing) {
    throw new Error(`Exam not found: ${id}`);
  }

  const now = new Date().toISOString();
  const courseId =
    input.courseId !== undefined
      ? assertCourseExists(db, input.courseId)
      : existing.courseId;
  const title =
    input.title !== undefined ? validateTitle(input.title) : existing.title;
  const category =
    input.category !== undefined
      ? validateCategory(input.category)
      : existing.category;
  const examDate =
    input.examDate !== undefined
      ? validateExamDate(input.examDate)
      : existing.examDate;
  const examTime =
    input.examTime !== undefined
      ? validateExamTime(input.examTime)
      : existing.examTime;
  const location =
    input.location !== undefined ? input.location.trim() : existing.location;
  const topics =
    input.topics !== undefined ? input.topics.trim() : existing.topics;
  const grade =
    input.grade !== undefined ? validateGrade(input.grade) : existing.grade;

  db.prepare(
    `UPDATE exams
     SET course_id = ?, title = ?, category = ?, exam_date = ?, exam_time = ?, location = ?, topics = ?, grade = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    courseId,
    title,
    category,
    examDate,
    examTime,
    location,
    topics,
    grade,
    now,
    id
  );

  const updated = getExamById(db, id);
  if (!updated) {
    throw new Error('Failed to load updated exam');
  }
  return updated;
}

export function deleteExam(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM exams WHERE id = ?').run(id);
}

export function calculateCourseAverageGrade(
  db: DatabaseSync,
  courseId: string
): number | null {
  const row = db
    .prepare(
      'SELECT AVG(grade) AS avg_grade FROM exams WHERE course_id = ? AND grade IS NOT NULL'
    )
    .get(courseId) as { avg_grade: number | null } | undefined;
  if (!row || row.avg_grade === null || row.avg_grade === undefined) {
    return null;
  }
  return Math.round(Number(row.avg_grade) * 100) / 100;
}
