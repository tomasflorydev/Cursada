import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AttendanceRecord,
  AttendanceStatus,
  CourseAttendanceSummary,
  RecordAttendanceInput,
  UpdateCourseAttendanceConfigInput,
} from '../types.js';

interface CourseAttendanceRow {
  id: string;
  attendance_enabled: number;
  max_absences: number;
}

interface AttendanceRecordRow {
  id: string;
  course_id: string;
  session_date: string;
  status: AttendanceStatus;
  note: string;
  created_at: string;
}

const VALID_ATTENDANCE_STATUSES = new Set<AttendanceStatus>(['present', 'absent']);
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function getTodayLocalIso(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function validateSessionDate(rawDate: string | undefined): string {
  if (rawDate === undefined || rawDate.trim() === '') {
    return getTodayLocalIso();
  }
  const trimmed = rawDate.trim();
  const match = ISO_DATE_REGEX.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid sessionDate "${trimmed}". Expected YYYY-MM-DD format.`
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${trimmed}".`);
  }
  return trimmed;
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

function validateAttendanceStatus(rawStatus: unknown): AttendanceStatus {
  if (
    typeof rawStatus !== 'string' ||
    !VALID_ATTENDANCE_STATUSES.has(rawStatus as AttendanceStatus)
  ) {
    throw new Error(
      `Invalid attendance status "${String(rawStatus)}". Expected 'present' or 'absent'.`
    );
  }
  return rawStatus as AttendanceStatus;
}

function assertCourseAttendanceRow(
  db: DatabaseSync,
  rawCourseId: string
): CourseAttendanceRow {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Course ID is required');
  }
  const row = db
    .prepare(
      'SELECT id, attendance_enabled, max_absences FROM courses WHERE id = ?'
    )
    .get(courseId) as CourseAttendanceRow | undefined;
  if (!row) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return row;
}

function mapAttendanceRow(row: AttendanceRecordRow): AttendanceRecord {
  return {
    id: row.id,
    courseId: row.course_id,
    sessionDate: row.session_date,
    status: row.status,
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}

function buildSummary(
  courseRow: CourseAttendanceRow,
  records: AttendanceRecord[]
): CourseAttendanceSummary {
  const attendanceEnabled = Boolean(courseRow.attendance_enabled);
  const rawMax = Number(courseRow.max_absences ?? 4);
  const maxAbsences = Number.isInteger(rawMax) && rawMax >= 1 ? rawMax : 4;

  let absencesCount = 0;
  let presentsCount = 0;
  for (const record of records) {
    if (record.status === 'absent') {
      absencesCount += 1;
    } else if (record.status === 'present') {
      presentsCount += 1;
    }
  }

  const remainingAbsences = Math.max(0, maxAbsences - absencesCount);
  const absenceRatio = maxAbsences > 0 ? absencesCount / maxAbsences : 0;
  const isWarning = attendanceEnabled && remainingAbsences === 1;
  const isExceeded = attendanceEnabled && absencesCount >= maxAbsences;

  return {
    courseId: courseRow.id,
    attendanceEnabled,
    maxAbsences,
    absencesCount,
    presentsCount,
    remainingAbsences,
    absenceRatio,
    isWarning,
    isExceeded,
    records,
  };
}

export function getCourseAttendance(
  db: DatabaseSync,
  courseId: string
): CourseAttendanceSummary {
  const courseRow = assertCourseAttendanceRow(db, courseId);
  const recordRows = db
    .prepare(
      `SELECT id, course_id, session_date, status, note, created_at
       FROM attendance_records
       WHERE course_id = ?
       ORDER BY session_date DESC, created_at DESC, rowid DESC`
    )
    .all(courseRow.id) as unknown as AttendanceRecordRow[];

  return buildSummary(courseRow, recordRows.map(mapAttendanceRow));
}

export function updateCourseAttendanceConfig(
  db: DatabaseSync,
  input: UpdateCourseAttendanceConfigInput
): CourseAttendanceSummary {
  const courseRow = assertCourseAttendanceRow(db, input.courseId);
  const nextEnabled =
    input.attendanceEnabled !== undefined
      ? input.attendanceEnabled
        ? 1
        : 0
      : courseRow.attendance_enabled;
  const nextMaxAbsences =
    input.maxAbsences !== undefined
      ? validateMaxAbsences(input.maxAbsences)
      : Number(courseRow.max_absences ?? 4);
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE courses
     SET attendance_enabled = ?, max_absences = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextEnabled, nextMaxAbsences, now, courseRow.id);

  return getCourseAttendance(db, courseRow.id);
}

export function recordAttendance(
  db: DatabaseSync,
  input: RecordAttendanceInput
): CourseAttendanceSummary {
  const courseRow = assertCourseAttendanceRow(db, input.courseId);
  const status = validateAttendanceStatus(input.status);
  const sessionDate = validateSessionDate(input.sessionDate);
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO attendance_records (id, course_id, session_date, status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, courseRow.id, sessionDate, status, note, createdAt);

  return getCourseAttendance(db, courseRow.id);
}

export function deleteAttendanceRecord(
  db: DatabaseSync,
  recordId: string
): CourseAttendanceSummary {
  const trimmedId = (recordId ?? '').trim();
  if (!trimmedId) {
    throw new Error('Attendance record ID is required');
  }

  const existing = db
    .prepare('SELECT id, course_id FROM attendance_records WHERE id = ?')
    .get(trimmedId) as { id: string; course_id: string } | undefined;
  if (!existing) {
    throw new Error(`Attendance record not found: ${trimmedId}`);
  }

  db.prepare('DELETE FROM attendance_records WHERE id = ?').run(trimmedId);
  return getCourseAttendance(db, existing.course_id);
}
