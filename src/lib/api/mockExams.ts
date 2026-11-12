import type {
  CreateExamInput,
  Exam,
  ExamCategory,
  ExamFilters,
  ExamWithCourse,
  UpdateExamInput,
} from '../../types/domain';
import { getMockCourseByIdSync } from './mockCourses';

const INITIAL_MOCK_EXAMS: Exam[] = [
  {
    id: 'exam-past-1',
    courseId: 'ing-soft-1',
    title: '1° Parcial de Ingeniería de Requerimientos y Diseño',
    category: 'parcial',
    examDate: '2026-09-29',
    examTime: '18:30',
    location: 'Aula 402 · Lima',
    topics: 'Ciclos de vida, elicitación de requerimientos, historias de usuario y atributos de calidad.',
    grade: 8.5,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-10-05T14:00:00.000Z',
  },
  {
    id: 'exam-past-2',
    courseId: 'diseno-sistemas',
    title: '1° Parcial de Patrones Creacionales y Estructurales',
    category: 'parcial',
    examDate: '2026-10-01',
    examTime: '18:30',
    location: 'Aula 308 · Lima',
    topics: 'GRASP, SOLID, Factory Method, Abstract Factory, Builder, Adapter, Decorator y Composite.',
    grade: 9.0,
    createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-10-08T16:00:00.000Z',
  },
  {
    id: 'exam-past-3',
    courseId: 'bd-2',
    title: '1° Parcial de Modelado Relacional y Álgebra',
    category: 'parcial',
    examDate: '2026-09-30',
    examTime: '18:30',
    location: 'Lab 504 · Lima',
    topics: 'Normalización (1FN a FNBC), dependencias funcionales, álgebra relacional y SQL avanzado.',
    grade: 8.0,
    createdAt: '2026-08-25T10:00:00.000Z',
    updatedAt: '2026-10-07T12:00:00.000Z',
  },
  {
    id: 'exam-past-4',
    courseId: 'proba-estadistica',
    title: '1° Parcial de Probabilidad y Variables Aleatorias',
    category: 'parcial',
    examDate: '2026-10-08',
    examTime: '14:00',
    location: 'Aula 215 · Monserrat',
    topics: 'Probabilidad condicional, Teorema de Bayes, variables discretas y continuas.',
    grade: 7.5,
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-10-15T15:00:00.000Z',
  },
  {
    id: 'exam-past-5',
    courseId: 'paradigmas',
    title: 'TP Evaluativo de Programación Funcional y Lógica',
    category: 'tp',
    examDate: '2026-10-16',
    examTime: '18:30',
    location: 'Virtual · Sincrónica',
    topics: 'Orden superior, aplicación parcial, composición, pattern matching e inferencia de tipos.',
    grade: 8.5,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-22T18:00:00.000Z',
  },
  {
    id: 'exam-1',
    courseId: 'ing-soft-1',
    title: '2° Parcial Teórico-Práctico',
    category: 'parcial',
    examDate: '2026-11-13',
    examTime: '18:30',
    location: 'Aula 402 · Lima',
    topics: 'Estimación ágil, pruebas unitarias/integración, gestión de configuración y calidad ISO 25010.',
    grade: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
  },
  {
    id: 'exam-2',
    courseId: 'diseno-sistemas',
    title: 'Defensa TP Integrador Anual',
    category: 'tp',
    examDate: '2026-11-19',
    examTime: '18:30',
    location: 'Aula 308 · Lima',
    topics: 'Arquitectura hexagonal, patrones GoF aplicados, mapeo objeto-relacional y casos de prueba.',
    grade: null,
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
  },
  {
    id: 'exam-3',
    courseId: 'bd-2',
    title: '2° Parcial de Laboratorio (SQL + Concurrencia)',
    category: 'parcial',
    examDate: '2026-11-25',
    examTime: '18:30',
    location: 'Lab 504 · Lima',
    topics: 'Transacciones ACID, niveles de aislamiento, deadlocks, optimización de consultas e índices.',
    grade: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  },
];

const VALID_CATEGORIES = new Set<ExamCategory>([
  'parcial',
  'recuperatorio',
  'final',
  'tp',
]);

const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidIsoDate(value: string): boolean {
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
    throw new Error('El título del examen es obligatorio.');
  }
  return title;
}

function assertMockCourseExists(rawCourseId: string): string {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Seleccioná una materia para el examen.');
  }
  const course = getMockCourseByIdSync(courseId);
  if (!course) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function validateCategory(category: ExamCategory | undefined): ExamCategory {
  const cat = category ?? 'parcial';
  if (!VALID_CATEGORIES.has(cat)) {
    throw new Error(`Categoría de examen inválida: "${String(category)}"`);
  }
  return cat;
}

function validateExamDate(rawDate: string): string {
  if (typeof rawDate !== 'string' || !isValidIsoDate(rawDate)) {
    throw new Error(`Fecha de examen inválida "${String(rawDate)}". Usá YYYY-MM-DD.`);
  }
  return rawDate;
}

function validateExamTime(rawTime: string | null | undefined): string | null {
  if (rawTime === undefined || rawTime === null || rawTime.trim() === '') {
    return null;
  }
  const trimmed = rawTime.trim();
  if (!TIME_HH_MM_REGEX.test(trimmed)) {
    throw new Error(`Horario inválido "${trimmed}". Usá HH:MM (00:00 a 23:59).`);
  }
  return trimmed;
}

function validateGrade(grade: number | null | undefined): number | null {
  if (grade === undefined || grade === null) {
    return null;
  }
  if (typeof grade !== 'number' || Number.isNaN(grade) || grade < 1 || grade > 10) {
    throw new Error('La nota debe estar en la escala de 1 a 10.');
  }
  return Math.round(grade * 100) / 100;
}

let examsStore: Exam[] = structuredClone(INITIAL_MOCK_EXAMS);
let nextExamSeq = 100;

export function resetMockExams(): void {
  examsStore = structuredClone(INITIAL_MOCK_EXAMS);
  nextExamSeq = 100;
}

function enrichExam(exam: Exam): ExamWithCourse {
  const course = getMockCourseByIdSync(exam.courseId);
  return {
    ...exam,
    courseName: course?.name ?? 'Materia',
    courseColor: course?.color ?? 'slate',
  };
}

export function mockCountExamsByCourse(courseId: string): number {
  return examsStore.filter((e) => e.courseId === courseId).length;
}

export function mockDeleteExamsByCourse(courseId: string): void {
  examsStore = examsStore.filter((e) => e.courseId !== courseId);
}

export async function mockListExams(
  filters?: ExamFilters
): Promise<ExamWithCourse[]> {
  let result = examsStore.slice();

  if (filters?.courseId) {
    result = result.filter((e) => e.courseId === filters.courseId);
  }
  if (filters?.dateFrom) {
    if (!isValidIsoDate(filters.dateFrom)) {
      throw new Error(`Invalid dateFrom "${filters.dateFrom}". Expected YYYY-MM-DD.`);
    }
    result = result.filter((e) => e.examDate >= filters.dateFrom!);
  }
  if (filters?.dateTo) {
    if (!isValidIsoDate(filters.dateTo)) {
      throw new Error(`Invalid dateTo "${filters.dateTo}". Expected YYYY-MM-DD.`);
    }
    result = result.filter((e) => e.examDate <= filters.dateTo!);
  }
  if (filters?.graded === 'graded') {
    result = result.filter((e) => e.grade !== null);
  } else if (filters?.graded === 'ungraded') {
    result = result.filter((e) => e.grade === null);
  }

  result.sort((a, b) => {
    const dateCmp = a.examDate.localeCompare(b.examDate);
    if (dateCmp !== 0) {
      return dateCmp;
    }
    if (a.examTime && b.examTime) {
      const timeCmp = a.examTime.localeCompare(b.examTime);
      if (timeCmp !== 0) {
        return timeCmp;
      }
    } else if (a.examTime) {
      return -1;
    } else if (b.examTime) {
      return 1;
    }
    const createdCmp = a.createdAt.localeCompare(b.createdAt);
    if (createdCmp !== 0) {
      return createdCmp;
    }
    return a.id.localeCompare(b.id);
  });

  return structuredClone(result.map(enrichExam));
}

export async function mockCreateExam(
  input: CreateExamInput
): Promise<ExamWithCourse> {
  const title = validateTitle(input.title);
  const courseId = assertMockCourseExists(input.courseId);
  const category = validateCategory(input.category);
  const examDate = validateExamDate(input.examDate);
  const examTime = validateExamTime(input.examTime);
  const location = (input.location ?? '').trim();
  const topics = (input.topics ?? '').trim();
  const grade = validateGrade(input.grade);

  const now = new Date().toISOString();
  const created: Exam = {
    id: `exam-${++nextExamSeq}`,
    courseId,
    title,
    category,
    examDate,
    examTime,
    location,
    topics,
    grade,
    createdAt: now,
    updatedAt: now,
  };

  examsStore.push(created);
  return structuredClone(enrichExam(created));
}

export async function mockUpdateExam(
  id: string,
  input: UpdateExamInput
): Promise<ExamWithCourse> {
  const index = examsStore.findIndex((e) => e.id === id);
  if (index === -1) {
    throw new Error(`Exam not found: ${id}`);
  }

  const current = examsStore[index];
  const now = new Date().toISOString();
  const courseId =
    input.courseId !== undefined
      ? assertMockCourseExists(input.courseId)
      : current.courseId;
  const title =
    input.title !== undefined ? validateTitle(input.title) : current.title;
  const category =
    input.category !== undefined
      ? validateCategory(input.category)
      : current.category;
  const examDate =
    input.examDate !== undefined
      ? validateExamDate(input.examDate)
      : current.examDate;
  const examTime =
    input.examTime !== undefined
      ? validateExamTime(input.examTime)
      : current.examTime;
  const location =
    input.location !== undefined ? input.location.trim() : current.location;
  const topics =
    input.topics !== undefined ? input.topics.trim() : current.topics;
  const grade =
    input.grade !== undefined ? validateGrade(input.grade) : current.grade;

  const updated: Exam = {
    ...current,
    courseId,
    title,
    category,
    examDate,
    examTime,
    location,
    topics,
    grade,
    updatedAt: now,
  };

  examsStore[index] = updated;
  return structuredClone(enrichExam(updated));
}

export async function mockDeleteExam(id: string): Promise<void> {
  examsStore = examsStore.filter((e) => e.id !== id);
}
