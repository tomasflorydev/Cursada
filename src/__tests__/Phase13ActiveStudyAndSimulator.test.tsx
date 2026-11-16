import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { registeredHandlers } = vi.hoisted(() => ({
  registeredHandlers: new Map<string, (...args: unknown[]) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler);
    }),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  },
}));

import {
  deleteAttendanceRecord,
  getCourseAttendance,
  recordAttendance,
  updateCourseAttendanceConfig,
} from '../../electron/db/attendanceRepo';
import { createCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import { createNote, getNoteById, listNotes, updateNote } from '../../electron/db/notesRepo';
import {
  getSourceById,
  updateSourceExamStage,
} from '../../electron/db/sourcesRepo';
import { registerAttendanceHandlers } from '../../electron/ipc/attendanceHandlers';
import { registerSourcesHandlers } from '../../electron/ipc/sourcesHandlers';
import { sendChatMessageService } from '../../electron/services/ragService';
import { generateStudyReportService } from '../../electron/services/reportService';
import {
  createSourceFromTextService,
  type SourceEmbedder,
} from '../../electron/services/sourcesService';
import { PracticeExamSimulatorModal } from '../components/assistant/PracticeExamSimulatorModal';
import { CourseAttendancePanel } from '../components/courses/CourseAttendancePanel';
import { PomodoroHeaderWidget } from '../components/pomodoro/PomodoroHeaderWidget';
import { cursadaClient } from '../lib/api/client';
import {
  mockDeleteAttendanceRecord,
  mockGetCourseAttendance,
  mockRecordAttendance,
  mockUpdateCourseAttendanceConfig,
  resetMockAttendance,
} from '../lib/api/mockAttendance';
import { mockSendChatMessage } from '../lib/api/mockChat';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockCreateNote, mockListNotes } from '../lib/api/mockNotes';
import { mockGenerateStudyReport } from '../lib/api/mockReports';
import {
  mockCreateSourceFromText,
  mockListSources,
  mockUpdateSourceStage,
} from '../lib/api/mockSources';
import {
  POMODORO_STORAGE_KEY,
  formatPomodoroTime,
  getPomodoroState,
  linkPomodoroCourse,
  pausePomodoro,
  resetPomodoro,
  resetPomodoroStore,
  skipPomodoroPhase,
  startPomodoro,
  subscribePomodoroNotifications,
  tickPomodoro,
  updatePomodoroSettings,
} from '../lib/pomodoro/pomodoroStore';
import {
  buildInteractivePracticeExam,
  gradePracticeExamAttempt,
} from '../lib/simulator/practiceExamSimulator';
import type { NoteWithCourse, Source } from '../types/domain';

function createKeywordEmbedder(): SourceEmbedder {
  return async (texts: string[]) => ({
    modelUsed: 'test-embedder-p13',
    embeddings: texts.map((text) => {
      const vec = new Float32Array(8);
      const lower = text.toLowerCase();
      if (lower.includes('transacciones') || lower.includes('acid') || lower.includes('aislamiento')) {
        vec[0] += 1;
      }
      if (lower.includes('distribuidos') || lower.includes('sharding') || lower.includes('raft')) {
        vec[1] += 1;
      }
      if (lower.includes('indice') || lower.includes('b+')) {
        vec[2] += 1;
      }
      vec[7] = 0.1;
      return vec;
    }),
  });
}

describe('Phase 13 (v2.3.0): Pomodoro, Exam-Stage AI Sources, Interactive Simulator, and Attendance', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    registeredHandlers.clear();
    resetAllMocks();
    resetMockAttendance();
    localStorage.clear();
    resetPomodoroStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('1. Pomodoro store & <PomodoroHeaderWidget />', () => {
    it('tracks countdown, transitions to short/long break, persists settings, and triggers completion notifications', () => {
      const notificationsMock = vi.fn();
      vi.stubGlobal('Notification', notificationsMock);

      const hookEvents: Array<{ completedPhase: string; nextPhase: string; title: string }> = [];
      const unsub = subscribePomodoroNotifications((payload) => {
        hookEvents.push({
          completedPhase: payload.completedPhase,
          nextPhase: payload.nextPhase,
          title: payload.title,
        });
      });

      // Validation boundaries
      expect(() => updatePomodoroSettings({ focusMinutes: 0 })).toThrow();
      expect(() => updatePomodoroSettings({ focusMinutes: 181 })).toThrow();
      expect(() => updatePomodoroSettings({ shortBreakMinutes: 61 })).toThrow();
      expect(() => updatePomodoroSettings({ roundsBeforeLongBreak: 13 })).toThrow();

      // Configure 2 rounds before long break, 10 min focus, 3 min short, 8 min long
      updatePomodoroSettings({
        focusMinutes: 10,
        shortBreakMinutes: 3,
        longBreakMinutes: 8,
        roundsBeforeLongBreak: 2,
        notifyOnComplete: true,
      });

      const persistedRaw = localStorage.getItem(POMODORO_STORAGE_KEY);
      expect(persistedRaw).toBeTruthy();
      expect(JSON.parse(persistedRaw!).settings.focusMinutes).toBe(10);

      linkPomodoroCourse('bd-2', 'Base de Datos II');
      startPomodoro();
      expect(getPomodoroState().isRunning).toBe(true);
      expect(formatPomodoroTime(getPomodoroState().remainingSeconds)).toBe('10:00');

      tickPomodoro(60);
      expect(formatPomodoroTime(getPomodoroState().remainingSeconds)).toBe('09:00');

      // Complete round 1 -> transitions to short_break and notifies
      tickPomodoro(9 * 60);
      expect(getPomodoroState().phase).toBe('short_break');
      expect(getPomodoroState().completedFocusRounds).toBe(1);
      expect(getPomodoroState().remainingSeconds).toBe(3 * 60);
      expect(getPomodoroState().isRunning).toBe(false);
      expect(notificationsMock).toHaveBeenCalledTimes(1);
      expect(hookEvents[0].nextPhase).toBe('short_break');

      // Skip short break -> back to focus
      skipPomodoroPhase();
      expect(getPomodoroState().phase).toBe('focus');
      expect(getPomodoroState().remainingSeconds).toBe(10 * 60);

      // Pause & Reset
      startPomodoro();
      tickPomodoro(120);
      pausePomodoro();
      expect(getPomodoroState().isRunning).toBe(false);
      expect(getPomodoroState().remainingSeconds).toBe(8 * 60);
      resetPomodoro();
      expect(getPomodoroState().remainingSeconds).toBe(10 * 60);

      // Complete round 2 -> transitions to long_break
      startPomodoro();
      tickPomodoro(10 * 60);
      expect(getPomodoroState().phase).toBe('long_break');
      expect(getPomodoroState().completedFocusRounds).toBe(2);
      expect(getPomodoroState().remainingSeconds).toBe(8 * 60);
      expect(notificationsMock).toHaveBeenCalledTimes(2);

      // Disable notifications and complete break -> no new Notification call
      updatePomodoroSettings({ notifyOnComplete: false });
      tickPomodoro(8 * 60);
      expect(getPomodoroState().phase).toBe('focus');
      expect(notificationsMock).toHaveBeenCalledTimes(2);

      unsub();
    });

    it('renders <PomodoroHeaderWidget />, counts down via fake timers, and updates settings via popover', () => {
      vi.useFakeTimers();

      render(
        <PomodoroHeaderWidget
          activeCourseId="ing-soft-1"
          activeCourseName="Ingeniería de Software I"
        />
      );

      expect(screen.getByTestId('pomodoro-timer')).toHaveTextContent('25:00');
      expect(screen.getByTestId('pomodoro-phase')).toHaveTextContent('Enfoque');
      expect(screen.getByText('Ingeniería de Software I')).toBeInTheDocument();

      // Start countdown and advance 3 seconds
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByTestId('pomodoro-timer')).toHaveTextContent('24:57');

      fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));
      expect(screen.getByTestId('pomodoro-timer')).toHaveTextContent('25:00');

      // Open config popover and update focus minutes to 40
      fireEvent.click(screen.getByRole('button', { name: 'Configurar Pomodoro' }));
      const focusInput = screen.getByLabelText('Enfoque (min)');
      fireEvent.change(focusInput, { target: { value: '40' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(screen.getByTestId('pomodoro-timer')).toHaveTextContent('40:00');
      expect(getPomodoroState().settings.focusMinutes).toBe(40);
    });
  });

  describe('2. Exam-stage tagging + Notes as first-class AI sources (SQLite & Mock)', () => {
    it('persists examStage & frontmatter on notes/sources, updates stage via IPC, and isolates RAG + Reports by parcial_1 vs parcial_2', async () => {
      const ctx = createTestDatabase({ inMemory: true });
      const db: DatabaseSync = ctx.db;

      try {
        const course = createCourse(db, {
          name: 'Base de Datos II',
          color: 'emerald',
          term: '2026-2C',
        });

        const noteP1 = createNote(db, {
          courseId: course.id,
          title: 'Transacciones ACID — Apunte Clase 3',
          content:
            'Las propiedades ACID aseguran atomicidad, consistencia, aislamiento y durabilidad en transacciones concurrentes.',
          examStage: 'parcial_1',
          frontmatter: { unidad: '3', docente: 'Vera' },
        });
        const noteP2 = createNote(db, {
          courseId: course.id,
          title: 'Bases Distribuidas y Sharding',
          content:
            'El protocolo Raft coordina consenso distribuido y el sharding particiona tablas horizontalmente.',
          examStage: 'parcial_2',
        });

        expect(noteP1.examStage).toBe('parcial_1');
        expect(noteP1.frontmatter).toEqual({ unidad: '3', docente: 'Vera' });
        expect(getNoteById(db, noteP1.id)?.examStage).toBe('parcial_1');

        const p1Notes = listNotes(db, { courseId: course.id, examStage: 'parcial_1' });
        expect(p1Notes.map((n) => n.id)).toEqual([noteP1.id]);

        const updatedNoteP2 = updateNote(db, noteP2.id, {
          frontmatter: { unidad: '7' },
        });
        expect(updatedNoteP2.frontmatter).toEqual({ unidad: '7' });
        expect(updatedNoteP2.examStage).toBe('parcial_2');

        // Sources examStage persistence + IPC sources:updateStage
        const embedder = createKeywordEmbedder();
        const srcRaw = await createSourceFromTextService(
          db,
          {
            courseId: course.id,
            title: 'PDF Índices B+ Tree',
            text: 'Los índices B+ Tree mantienen hojas enlazadas para búsquedas por rango.',
          },
          { embedder }
        );
        expect(srcRaw.examStage).toBe('general');

        registerSourcesHandlers();
        const stageHandler = registeredHandlers.get('sources:updateStage');
        expect(stageHandler).toBeDefined();

        const updatedSrc = updateSourceExamStage(db, {
          sourceId: srcRaw.id,
          examStage: 'parcial_1',
        });
        expect(updatedSrc.examStage).toBe('parcial_1');
        expect(getSourceById(db, srcRaw.id)?.examStage).toBe('parcial_1');

        // Verify note-only RAG search & citation accuracy scoped to parcial_1
        const offlineFetch = vi.fn(async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch;

        const ragP1 = await sendChatMessageService(
          db,
          {
            courseId: course.id,
            sourceIds: [], // Force notes-only retrieval
            examStage: 'parcial_1',
            includeNotes: true,
            content: '¿Qué garantizan las propiedades ACID en transacciones?',
          },
          { embedder, fetchFn: offlineFetch }
        );

        expect(ragP1.assistantMessage.citations.length).toBeGreaterThanOrEqual(1);
        const noteCitation = ragP1.assistantMessage.citations[0];
        expect(noteCitation.sourceType).toBe('note');
        expect(noteCitation.sourceId).toBe(noteP1.id);
        expect(noteCitation.sourceTitle).toBe('Transacciones ACID — Apunte Clase 3');
        expect(noteCitation.pageNumber).toBeNull();
        expect(ragP1.assistantMessage.content).toContain('[1]');
        expect(ragP1.assistantMessage.content).not.toContain('Raft');

        // Verify parcial_2 RAG excludes parcial_1 notes/sources
        const ragP2 = await sendChatMessageService(
          db,
          {
            courseId: course.id,
            examStage: 'parcial_2',
            includeNotes: true,
            content: '¿Cómo funciona el protocolo Raft y el sharding?',
          },
          { embedder, fetchFn: offlineFetch }
        );
        expect(ragP2.assistantMessage.citations).toHaveLength(1);
        expect(ragP2.assistantMessage.citations[0].sourceId).toBe(noteP2.id);
        expect(ragP2.assistantMessage.citations[0].sourceType).toBe('note');

        // Verify reportService generates a report using ONLY notes (0 sources) filtered by parcial_1
        const notesOnlyReport = await generateStudyReportService(
          db,
          {
            courseId: course.id,
            reportType: 'summary',
            sourceIds: [],
            examStage: 'parcial_1',
            includeNotes: true,
            autoSaveAsNote: false,
          },
          { fetchFn: offlineFetch }
        );

        expect(notesOnlyReport.sourcesUsed.map((s) => s.sourceId)).toEqual([noteP1.id]);
        expect(notesOnlyReport.content).toContain('Transacciones ACID — Apunte Clase 3');
        expect(notesOnlyReport.content).not.toContain('Bases Distribuidas y Sharding');

        // Verify error when neither sources nor notes match 'final'
        await expect(
          generateStudyReportService(
            db,
            {
              courseId: course.id,
              reportType: 'summary',
              examStage: 'final',
              includeNotes: true,
            },
            { fetchFn: offlineFetch }
          )
        ).rejects.toThrow(/ni notas etiquetadas para Final/i);
      } finally {
        ctx.close();
      }
    });

    it('supports examStage tagging and notes-only reports/chat in browser mock modules', async () => {
      const mockNoteP1 = await mockCreateNote({
        courseId: 'bd-2',
        title: 'Apunte 1P — Dependencias Funcionales',
        content: 'Una relación está en FNBC cuando todo determinante es superclave.',
        examStage: 'parcial_1',
      });
      const mockNoteP2 = await mockCreateNote({
        courseId: 'bd-2',
        title: 'Apunte 2P — Replicación Multi-Líder',
        content: 'La replicación multi-líder requiere resolución de conflictos de escritura.',
        examStage: 'parcial_2',
      });

      const createdSrc = await mockCreateSourceFromText({
        courseId: 'bd-2',
        title: 'Guía de Normalización',
        text: 'La tercera forma normal elimina dependencias transitivas.',
        examStage: 'parcial_2',
      });
      const movedSrc = await mockUpdateSourceStage({
        sourceId: createdSrc.id,
        examStage: 'parcial_1',
      });
      expect(movedSrc.examStage).toBe('parcial_1');

      const filteredSources = (await mockListSources('bd-2')).filter(
        (s) => s.examStage === 'parcial_1'
      );
      expect(filteredSources.map((s) => s.id)).toContain(createdSrc.id);

      const chatRes = await mockSendChatMessage({
        courseId: 'bd-2',
        examStage: 'parcial_1',
        sourceIds: [],
        noteIds: [mockNoteP1.id, mockNoteP2.id],
        includeNotes: true,
        content: '¿Cuándo está en FNBC una relación?',
      });
      expect(chatRes.assistantMessage.citations).toHaveLength(1);
      expect(chatRes.assistantMessage.citations[0].sourceId).toBe(mockNoteP1.id);
      expect(chatRes.assistantMessage.citations[0].sourceType).toBe('note');

      const notesReport = await mockGenerateStudyReport({
        courseId: 'bd-2',
        reportType: 'study_guide',
        sourceIds: [],
        noteIds: [mockNoteP1.id],
        examStage: 'parcial_1',
        includeNotes: true,
        autoSaveAsNote: false,
      });
      expect(notesReport.sourcesUsed.map((s) => s.sourceId)).toEqual([mockNoteP1.id]);
      expect(notesReport.content).toContain('Apunte 1P — Dependencias Funcionales');
    });
  });

  describe('3. Interactive Practice Exam Simulator (<PracticeExamSimulatorModal />)', () => {
    it('hides answers during test, grades on submit, triggers clickable citations, and saves summary as note', async () => {
      const sampleSources: Source[] = [
        {
          id: 'src-sim-1',
          courseId: 'ing-soft-1',
          title: 'Guía de Requerimientos 1P',
          sourceType: 'pdf',
          originalPath: null,
          storedFilename: null,
          rawText:
            'Los criterios de aceptación verificables permiten validar historias de usuario sin ambigüedad antes del cierre del sprint.',
          pageCount: 2,
          charCount: 120,
          chunkCount: 1,
          indexingStatus: 'ready',
          indexingError: null,
          embeddingModel: 'local-fnv1a-128',
          examStage: 'parcial_1',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 'src-sim-2',
          courseId: 'ing-soft-1',
          title: 'Mantenimiento 2P (Excluido)',
          sourceType: 'txt',
          originalPath: null,
          storedFilename: null,
          rawText: 'Contenido exclusivo del segundo parcial sobre refactorización.',
          pageCount: 1,
          charCount: 60,
          chunkCount: 1,
          indexingStatus: 'ready',
          indexingError: null,
          embeddingModel: 'local-fnv1a-128',
          examStage: 'parcial_2',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z',
        },
      ];

      const sampleNotes: NoteWithCourse[] = [
        {
          id: 'note-sim-1',
          courseId: 'ing-soft-1',
          title: 'Nota 1P — Trazabilidad',
          content:
            'La matriz de trazabilidad conecta requisitos funcionales con casos de prueba automatizados.',
          origin: 'manual',
          isPinned: false,
          examStage: 'parcial_1',
          createdAt: '2026-11-02T10:00:00.000Z',
          updatedAt: '2026-11-02T10:00:00.000Z',
          courseName: 'Ingeniería de Software I',
          courseColor: 'blue',
        },
      ];

      const questions = buildInteractivePracticeExam({
        courseId: 'ing-soft-1',
        courseName: 'Ingeniería de Software I',
        examStage: 'parcial_1',
        sources: sampleSources,
        notes: sampleNotes,
        questionCount: 2,
        format: 'mixed',
      });

      expect(questions).toHaveLength(2);
      expect(questions.every((q) => !q.citationTitle.includes('Excluido'))).toBe(true);
      expect(questions[0].kind).toBe('multiple_choice');
      expect(questions[1].kind).toBe('develop');

      // Pure grading check
      const pureAttempt = gradePracticeExamAttempt({
        courseId: 'ing-soft-1',
        courseName: 'Ingeniería de Software I',
        examStage: 'parcial_1',
        questions,
        answers: {
          [questions[0].id]: questions[0].correctOption!,
          [questions[1].id]:
            'La matriz de trazabilidad conecta los requisitos funcionales con pruebas automatizadas.',
        },
      });
      expect(pureAttempt.correctCount).toBe(2);
      expect(pureAttempt.scorePercent).toBe(100);

      // Modal interaction
      const onClose = vi.fn();
      const onCitationClick = vi.fn();
      const onSavedNote = vi.fn();

      render(
        <PracticeExamSimulatorModal
          isOpen
          courseId="ing-soft-1"
          courseName="Ingeniería de Software I"
          examStage="parcial_1"
          sources={sampleSources}
          notes={sampleNotes}
          questionCount={2}
          format="mixed"
          onClose={onClose}
          onCitationClick={onCitationClick}
          onSavedNote={onSavedNote}
        />
      );

      // Before submitting: answers, modelAnswer, and citations MUST be hidden
      expect(screen.queryByTestId('simulator-score-banner')).not.toBeInTheDocument();
      expect(screen.queryByText(/Pauta esperada:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/La respuesta correcta es/i)).not.toBeInTheDocument();

      // Answer Q1 (MC) correctly and Q2 (develop)
      const q1Group = screen.getByRole('group', { name: 'Opciones de la pregunta 1' });
      const correctRadio = within(q1Group).getByDisplayValue(questions[0].correctOption!);
      fireEvent.click(correctRadio);

      const devTextarea = screen.getByLabelText('Tu respuesta');
      fireEvent.change(devTextarea, {
        target: {
          value:
            'La matriz de trazabilidad vincula requisitos funcionales con casos de prueba.',
        },
      });

      // Submit exam
      fireEvent.click(
        screen.getByRole('button', { name: 'Finalizar y corregir simulacro' })
      );

      const scoreBanner = await screen.findByTestId('simulator-score-banner');
      expect(scoreBanner).toHaveTextContent('2 / 2 · 100%');
      expect(screen.getByText('Correcta')).toBeInTheDocument();
      expect(screen.getByText('Revisar pauta')).toBeInTheDocument();
      expect(screen.getAllByText(/Pauta esperada:/i)).toHaveLength(2);

      // Click citation [1]
      const citationButtons = screen.getAllByRole('button', { name: /Fuente \[/i });
      fireEvent.click(citationButtons[0]);
      expect(onCitationClick).toHaveBeenCalledWith(
        expect.objectContaining({
          index: questions[0].citationIndex,
          sourceId: questions[0].citationSourceId,
        })
      );

      // Save simulation result as note
      fireEvent.click(
        screen.getByRole('button', { name: 'Guardar resultado como nota' })
      );
      await waitFor(() => {
        expect(onSavedNote).toHaveBeenCalledTimes(1);
      });
      const savedNote = onSavedNote.mock.calls[0][0] as NoteWithCourse;
      expect(savedNote.origin).toBe('ai_practice_exam');
      expect(savedNote.examStage).toBe('parcial_1');
      expect(savedNote.content).toContain('100%');

      const courseNotes = await mockListNotes({ courseId: 'ing-soft-1' });
      expect(courseNotes.some((n) => n.id === savedNote.id)).toBe(true);
    });

    it('parses structured generatedMarkdown with answer key into interactive simulator questions', () => {
      const sampleSources: Source[] = [
        {
          id: 'src-md-1',
          courseId: 'bd-2',
          title: 'Normalización e Índices.pdf',
          sourceType: 'pdf',
          originalPath: null,
          storedFilename: null,
          rawText: 'Un índice B+ Tree acelera consultas por rango.',
          pageCount: 2,
          charCount: 47,
          chunkCount: 1,
          indexingStatus: 'ready',
          indexingError: null,
          embeddingModel: 'local-fnv1a-128',
          examStage: 'parcial_1',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z',
        },
      ];

      const generatedMarkdown = [
        '# Simulacro Multiple Choice — Bases de Datos II',
        '',
        '### 1. Opción múltiple — Normalización e Índices.pdf',
        '¿Qué estructura optimiza consultas por rango en disco?',
        '- **A)** Hash lineal',
        '- **B)** B+ Tree',
        '- **C)** Heap sin orden',
        '- **D)** Grafo bipartito',
        '',
        '### 2. Desarrollo — Normalización e Índices.pdf',
        'Explicá la ventaja de las hojas enlazadas en B+ Tree.',
        '',
        '## Clave de respuestas / corrección',
        '1. **(Multiple Choice · Normalización e Índices.pdf)**: **B)** — Las hojas enlazadas facilitan recorridos secuenciales.',
        '2. **(Desarrollo · Normalización e Índices.pdf)**: Debe explicar recorridos por rango sin volver a la raíz.',
      ].join('\n');

      const parsed = buildInteractivePracticeExam({
        courseId: 'bd-2',
        courseName: 'Bases de Datos II',
        examStage: 'parcial_1',
        sources: sampleSources,
        notes: [],
        generatedMarkdown,
      });

      expect(parsed).toHaveLength(2);
      expect(parsed[0].kind).toBe('multiple_choice');
      expect(parsed[0].correctOption).toBe('B');
      expect(parsed[0].citationSourceId).toBe('src-md-1');
      expect(parsed[1].kind).toBe('develop');
      expect(parsed[1].modelAnswer).toContain('recorridos por rango');
    });
  });

  describe('4. Attendance Tracking (SQLite v7 attendanceRepo + attendanceHandlers + <CourseAttendancePanel />)', () => {
    it('calculates attendance summary, triggers warning at 1 remaining absence, validates inputs, and registers IPC handlers', async () => {
      const ctx = createTestDatabase({ inMemory: true });
      const db = ctx.db;

      try {
        const course = createCourse(db, {
          name: 'Sistemas Operativos',
          color: 'rose',
          term: '2026-2C',
        });

        registerAttendanceHandlers({ db });
        expect(registeredHandlers.has('attendance:getCourse')).toBe(true);
        expect(registeredHandlers.has('attendance:updateConfig')).toBe(true);
        expect(registeredHandlers.has('attendance:record')).toBe(true);
        expect(registeredHandlers.has('attendance:deleteRecord')).toBe(true);

        // Initial defaults
        const initial = getCourseAttendance(db, course.id);
        expect(initial.attendanceEnabled).toBe(false);
        expect(initial.maxAbsences).toBe(4);
        expect(initial.isWarning).toBe(false);

        // Input validations
        expect(() =>
          updateCourseAttendanceConfig(db, { courseId: course.id, maxAbsences: 0 })
        ).toThrow();
        expect(() =>
          updateCourseAttendanceConfig(db, { courseId: course.id, maxAbsences: 51 })
        ).toThrow();
        expect(() =>
          recordAttendance(db, {
            courseId: course.id,
            status: 'absent',
            sessionDate: '2026-02-30',
          })
        ).toThrow();

        // Enable & configure maxAbsences = 3 via IPC handler
        const configHandler = registeredHandlers.get('attendance:updateConfig')!;
        const configured = (await configHandler(
          {},
          { courseId: course.id, attendanceEnabled: true, maxAbsences: 3 }
        )) as ReturnType<typeof getCourseAttendance>;
        expect(configured.attendanceEnabled).toBe(true);
        expect(configured.maxAbsences).toBe(3);

        // Record 1 present + 2 absences -> remainingAbsences === 1 -> isWarning === true
        const recordHandler = registeredHandlers.get('attendance:record')!;
        await recordHandler(
          {},
          { courseId: course.id, status: 'present', sessionDate: '2026-11-01' }
        );
        await recordHandler(
          {},
          {
            courseId: course.id,
            status: 'absent',
            sessionDate: '2026-11-08',
            note: 'Parcial otra materia',
          }
        );
        const warningState = (await recordHandler(
          {},
          { courseId: course.id, status: 'absent', sessionDate: '2026-11-15' }
        )) as ReturnType<typeof getCourseAttendance>;

        expect(warningState.absencesCount).toBe(2);
        expect(warningState.presentsCount).toBe(1);
        expect(warningState.remainingAbsences).toBe(1);
        expect(warningState.absenceRatio).toBeCloseTo(2 / 3, 4);
        expect(warningState.isWarning).toBe(true);
        expect(warningState.isExceeded).toBe(false);

        // 3rd absence -> isExceeded === true
        const exceededState = recordAttendance(db, {
          courseId: course.id,
          status: 'absent',
          sessionDate: '2026-11-16',
        });
        expect(exceededState.isExceeded).toBe(true);
        expect(exceededState.isWarning).toBe(false);
        expect(exceededState.remainingAbsences).toBe(0);

        // Delete last absence directly & verify IPC handler works cleanly
        const afterDirectDelete = deleteAttendanceRecord(
          db,
          exceededState.records[0].id
        );
        expect(afterDirectDelete.absencesCount).toBe(2);
        expect(afterDirectDelete.isWarning).toBe(true);
        expect(afterDirectDelete.isExceeded).toBe(false);

        const deleteHandler = registeredHandlers.get('attendance:deleteRecord')!;
        const afterIpcDelete = (await deleteHandler(
          {},
          afterDirectDelete.records[0].id
        )) as ReturnType<typeof getCourseAttendance>;
        expect(afterIpcDelete.absencesCount).toBe(1);
        expect(afterIpcDelete.isWarning).toBe(false);
      } finally {
        ctx.close();
      }
    });

    it('renders <CourseAttendancePanel />, toggles enabled state, records absences, shows 1-remaining warning, and deletes records', async () => {
      // Wire cursadaClient attendance methods to mockAttendance for standalone panel test
      vi.spyOn(cursadaClient, 'getCourseAttendance').mockImplementation(
        mockGetCourseAttendance
      );
      vi.spyOn(cursadaClient, 'updateCourseAttendanceConfig').mockImplementation(
        mockUpdateCourseAttendanceConfig
      );
      vi.spyOn(cursadaClient, 'recordAttendance').mockImplementation(
        mockRecordAttendance
      );
      vi.spyOn(cursadaClient, 'deleteAttendanceRecord').mockImplementation(
        mockDeleteAttendanceRecord
      );

      render(<CourseAttendancePanel courseId="ing-soft-1" />);

      const toggleSwitch = await screen.findByRole('switch', {
        name: 'Activar control de asistencia',
      });
      expect(toggleSwitch).toHaveAttribute('aria-checked', 'false');
      expect(
        screen.getByText(/Activá el control de asistencia/i)
      ).toBeInTheDocument();

      // Enable attendance tracking
      fireEvent.click(toggleSwitch);
      expect(
        await screen.findByTestId('attendance-progress-readout')
      ).toHaveTextContent('0 / 4 faltas · 0% del límite');

      // Set limit to 3
      const limitInput = screen.getByLabelText('Límite máximo de faltas');
      fireEvent.change(limitInput, { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar límite' }));

      await waitFor(() => {
        expect(screen.getByTestId('attendance-progress-readout')).toHaveTextContent(
          '0 / 3 faltas · 0% del límite'
        );
      });

      // Record 2 absences -> 1 remaining warning banner appears
      fireEvent.click(screen.getByRole('button', { name: '+ Falta' }));
      await waitFor(() => {
        expect(screen.getByTestId('attendance-progress-readout')).toHaveTextContent(
          '1 / 3 falta · 33% del límite'
        );
      });

      fireEvent.click(screen.getByRole('button', { name: '+ Falta' }));
      const warningBanner = await screen.findByTestId('attendance-warning-banner');
      expect(warningBanner).toHaveTextContent('Queda 1 falta disponible');
      expect(screen.getByTestId('attendance-progress-readout')).toHaveTextContent(
        '2 / 3 faltas · 67% del límite'
      );

      // Delete one absence -> warning clears
      const deleteButtons = screen.getAllByRole('button', {
        name: /Eliminar registro del/i,
      });
      fireEvent.click(deleteButtons[0]);
      await waitFor(() => {
        expect(
          screen.queryByTestId('attendance-warning-banner')
        ).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('attendance-progress-readout')).toHaveTextContent(
        '1 / 3 falta · 33% del límite'
      );

      // Toggle off cleanly
      fireEvent.click(
        screen.getByRole('switch', { name: 'Activar control de asistencia' })
      );
      expect(
        await screen.findByText(/Activá el control de asistencia/i)
      ).toBeInTheDocument();
    });
  });
});
