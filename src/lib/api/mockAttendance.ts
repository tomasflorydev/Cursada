import type {
  AttendanceRecord,
  AttendanceStatus,
  CourseAttendanceSummary,
  RecordAttendanceInput,
  UpdateCourseAttendanceConfigInput,
} from '../../types/domain';
import { getMockCourseByIdSync } from './mockCourses';

interface CourseAttendanceConfigState {
  attendanceEnabled: boolean;
  maxAbsences: number;
}

const VALID_STATUSES = new Set<AttendanceStatus>(['present', 'absent']);
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

let configByCourse = new Map<string, CourseAttendanceConfigState>();
let attendanceRecords: AttendanceRecord[] = [];
let nextAttendanceSeq = 1;

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
      `Fecha inválida "${trimmed}". Usá el formato YYYY-MM-DD.`
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
    throw new Error(`Fecha de calendario inválida "${trimmed}".`);
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
    throw new Error('El límite de faltas debe ser un número entero entre 1 y 50.');
  }
  return rawValue;
}

function validateStatus(rawStatus: unknown): AttendanceStatus {
  if (
    typeof rawStatus !== 'string' ||
    !VALID_STATUSES.has(rawStatus as AttendanceStatus)
  ) {
    throw new Error(
      `Estado de asistencia inválido "${String(rawStatus)}".`
    );
  }
  return rawStatus as AttendanceStatus;
}

function assertCourseExists(rawCourseId: string): string {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Course ID is required');
  }
  const course = getMockCourseByIdSync(courseId);
  if (!course) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function getOrCreateConfig(courseId: string): CourseAttendanceConfigState {
  const existing = configByCourse.get(courseId);
  if (existing) {
    return existing;
  }
  const course = getMockCourseByIdSync(courseId);
  const initial: CourseAttendanceConfigState = {
    attendanceEnabled: Boolean(course?.attendanceEnabled ?? false),
    maxAbsences:
      typeof course?.maxAbsences === 'number' && course.maxAbsences >= 1
        ? course.maxAbsences
        : 4,
  };
  configByCourse.set(courseId, initial);
  return initial;
}

function buildSummarySync(courseId: string): CourseAttendanceSummary {
  const config = getOrCreateConfig(courseId);
  const courseRecords = attendanceRecords
    .filter((r) => r.courseId === courseId)
    .sort((a, b) => {
      const dateCmp = b.sessionDate.localeCompare(a.sessionDate);
      if (dateCmp !== 0) {
        return dateCmp;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  let absencesCount = 0;
  let presentsCount = 0;
  for (const rec of courseRecords) {
    if (rec.status === 'absent') {
      absencesCount += 1;
    } else {
      presentsCount += 1;
    }
  }

  const remainingAbsences = Math.max(0, config.maxAbsences - absencesCount);
  const absenceRatio =
    config.maxAbsences > 0 ? absencesCount / config.maxAbsences : 0;
  const isWarning = config.attendanceEnabled && remainingAbsences === 1;
  const isExceeded =
    config.attendanceEnabled && absencesCount >= config.maxAbsences;

  return structuredClone({
    courseId,
    attendanceEnabled: config.attendanceEnabled,
    maxAbsences: config.maxAbsences,
    absencesCount,
    presentsCount,
    remainingAbsences,
    absenceRatio,
    isWarning,
    isExceeded,
    records: courseRecords,
  });
}

export function resetMockAttendance(): void {
  configByCourse = new Map<string, CourseAttendanceConfigState>();
  attendanceRecords = [];
  nextAttendanceSeq = 1;
}

export async function mockGetCourseAttendance(
  courseId: string
): Promise<CourseAttendanceSummary> {
  const validId = assertCourseExists(courseId);
  return buildSummarySync(validId);
}

export async function mockUpdateCourseAttendanceConfig(
  input: UpdateCourseAttendanceConfigInput
): Promise<CourseAttendanceSummary> {
  const validId = assertCourseExists(input.courseId);
  const current = getOrCreateConfig(validId);

  const nextConfig: CourseAttendanceConfigState = {
    attendanceEnabled:
      input.attendanceEnabled !== undefined
        ? Boolean(input.attendanceEnabled)
        : current.attendanceEnabled,
    maxAbsences:
      input.maxAbsences !== undefined
        ? validateMaxAbsences(input.maxAbsences)
        : current.maxAbsences,
  };
  configByCourse.set(validId, nextConfig);
  return buildSummarySync(validId);
}

export async function mockRecordAttendance(
  input: RecordAttendanceInput
): Promise<CourseAttendanceSummary> {
  const validId = assertCourseExists(input.courseId);
  const status = validateStatus(input.status);
  const sessionDate = validateSessionDate(input.sessionDate);
  const note = typeof input.note === 'string' ? input.note.trim() : '';

  const record: AttendanceRecord = {
    id: `att-${nextAttendanceSeq++}`,
    courseId: validId,
    sessionDate,
    status,
    note,
    createdAt: new Date(Date.now() + nextAttendanceSeq).toISOString(),
  };

  attendanceRecords.unshift(record);
  return buildSummarySync(validId);
}

export async function mockDeleteAttendanceRecord(
  recordId: string
): Promise<CourseAttendanceSummary> {
  const trimmedId = (recordId ?? '').trim();
  if (!trimmedId) {
    throw new Error('Attendance record ID is required');
  }
  const target = attendanceRecords.find((r) => r.id === trimmedId);
  if (!target) {
    throw new Error(`Attendance record not found: ${trimmedId}`);
  }
  attendanceRecords = attendanceRecords.filter((r) => r.id !== trimmedId);
  return buildSummarySync(target.courseId);
}
