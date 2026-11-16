import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { motion } from 'framer-motion';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import {
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../../lib/dates';
import { renderTextWithMathAndCitations } from '../../lib/math/latexRenderer';
import {
  formatRelativeAgeEs,
  generateAndStoreReport,
  getLatestStoredReport,
  refreshStoredReports,
  subscribeReports,
  type StoredReport,
} from '../../lib/reportsStore';
import type {
  ChatMessage,
  CourseWithSchedules,
  ExamCategory,
  ExamStageTag,
  ExamWithCourse,
  NoteWithCourse,
  Source,
  SourceType,
  StudyReportType,
} from '../../types';
import {
  SwissButton,
  SwissCheckbox,
  SwissEmptyState,
  SwissErrorAlert,
  SwissLinkButton,
  SwissLoadingBar,
  SwissSectionHeader,
  SwissSelect,
  SwissTitleUnderline,
} from '../../ui';
import { PracticeExamSimulatorModal } from '../assistant/PracticeExamSimulatorModal';
import { NoteBacklinksPanel } from '../notes/NoteBacklinksPanel';
import { SuperMarkdownEditor } from '../notes/SuperMarkdownEditor';
import { CourseAttendancePanel } from './CourseAttendancePanel';

export interface CourseDetailViewProps {
  courseId: string;
  initialNoteId?: string | null;
  navigationVersion?: number;
  newNoteRequestVersion?: number;
  onSelectCourse: (courseId: string | null, opts?: { noteId?: string }) => void;
  onHeaderMetaChange?: (header: { name: string; summary: string } | null) => void;
  onOpenReport?: (reportId: string) => void;
  onEditCourse?: (course: CourseWithSchedules) => void;
  onArchiveCourse?: (course: CourseWithSchedules) => void;
  onDeleteCourse?: (courseId: string) => void;
  onCoursesChanged?: () => void;
}

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

const NOTE_AUTOSAVE_DELAY_MS = 450;

const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  parcial: 'parcial',
  recuperatorio: 'recuperatorio',
  final: 'final',
  tp: 'TP',
};

const SOURCE_TYPE_SHORT: Record<SourceType, string> = {
  pdf: 'PDF',
  markdown: 'MD',
  txt: 'TXT',
  pasted_text: 'Texto',
  note: 'Nota',
};

const EXAM_STAGE_OPTIONS: ReadonlyArray<{ value: ExamStageTag; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'parcial_1', label: '1° Parcial' },
  { value: 'parcial_2', label: '2° Parcial' },
  { value: 'final', label: 'Final' },
];

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatNoteDateShort(isoTimestamp: string, todayIso: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'hoy';
  }
  const noteIso = toIsoDateString(parsed);
  if (noteIso === todayIso) {
    return 'hoy';
  }
  const todayDate = parseIsoDateLocal(todayIso);
  const noteDate = parseIsoDateLocal(noteIso);
  const diffDays = Math.round((todayDate.getTime() - noteDate.getTime()) / 86_400_000);
  if (diffDays === 1) {
    return 'ayer';
  }
  const monthShort = MONTH_SHORT_NAMES_ES[parsed.getMonth()] ?? '';
  return `${parsed.getDate()} ${monthShort}`;
}

function sortNotes(notes: NoteWithCourse[]): NoteWithCourse[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function extractReportExcerpt(content: string): string {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !b.startsWith('#'));
  const first = blocks[0] ?? content.trim();
  const singleLine = first.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 220) {
    return singleLine;
  }
  return `${singleLine.slice(0, 217).trimEnd()}…`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    let chunkStr = '';
    for (let j = 0; j < slice.length; j++) {
      chunkStr += String.fromCharCode(slice[j]);
    }
    binary += chunkStr;
  }
  return btoa(binary);
}

async function readFileAsBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('No se pudo leer el archivo seleccionado.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Error al leer el archivo.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export function CourseDetailView({
  courseId,
  initialNoteId,
  navigationVersion = 0,
  newNoteRequestVersion = 0,
  onSelectCourse,
  onHeaderMetaChange,
  onOpenReport,
  onEditCourse,
  onArchiveCourse,
  onDeleteCourse,
  onCoursesChanged,
}: CourseDetailViewProps) {
  const askInputId = useId();
  const pasteTitleId = useId();
  const pasteBodyId = useId();

  const [course, setCourse] = useState<CourseWithSchedules | null>(null);
  const [notes, setNotes] = useState<NoteWithCourse[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [exams, setExams] = useState<ExamWithCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selected note & editor state
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialNoteId ?? null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);
  const [noteFeedback, setNoteFeedback] = useState<string | null>(null);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Sources, notes & stage checklist state
  const [includeNotes, setIncludeNotes] = useState(true);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => new Set());
  const knownSourceIdsRef = useRef<Set<string>>(new Set());
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(() => new Set());
  const knownNoteIdsRef = useRef<Set<string>>(new Set());
  const [isNotePickerExpanded, setIsNotePickerExpanded] = useState(false);
  const [aiStageFilter, setAiStageFilter] = useState<ExamStageTag | 'all'>('all');
  const [aiContextFilter, setAiContextFilter] = useState<'all' | 'sources_only' | 'notes_only'>('all');
  const [isImportingSource, setIsImportingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');

  // Report generation, simulator & latest report state
  const [latestReport, setLatestReport] = useState<StoredReport | null>(() =>
    getLatestStoredReport(courseId)
  );
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  // Ask sources chat state
  const [askQuery, setAskQuery] = useState('');
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<ChatMessage | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const onHeaderMetaChangeRef = useRef(onHeaderMetaChange);
  onHeaderMetaChangeRef.current = onHeaderMetaChange;

  const lastNavVersionRef = useRef<number>(navigationVersion);
  const lastNewNoteVersionRef = useRef<number>(0);

  const savedSnapshotRef = useRef<{ noteId: string; title: string; content: string } | null>(
    null
  );
  const latestDraftRef = useRef<{ noteId: string; title: string; content: string } | null>(
    null
  );

  const todayIso = useMemo(() => toIsoDateString(new Date()), []);

  const clearAutosaveTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const persistSnapshot = useCallback(
    async (target: { noteId: string; title: string; content: string }) => {
      const trimmedTitle = target.title.trim();
      if (!trimmedTitle) {
        if (latestDraftRef.current?.noteId === target.noteId) {
          setSaveStatus('error');
          setSaveError('El título no puede estar vacío.');
        }
        return;
      }

      if (latestDraftRef.current?.noteId === target.noteId) {
        setSaveStatus('saving');
        setSaveError(null);
      }

      try {
        const updated = await cursadaClient.updateNote(target.noteId, {
          title: trimmedTitle,
          content: target.content,
        });
        if (savedSnapshotRef.current?.noteId === target.noteId) {
          savedSnapshotRef.current = {
            noteId: target.noteId,
            title: updated.title,
            content: updated.content,
          };
        }
        setNotes((prev) =>
          sortNotes(prev.map((n) => (n.id === updated.id ? updated : n)))
        );
        if (latestDraftRef.current?.noteId === target.noteId) {
          const matchesLatest =
            latestDraftRef.current.title.trim() === updated.title &&
            latestDraftRef.current.content === updated.content;
          setSaveStatus(matchesLatest ? 'saved' : 'dirty');
        }
      } catch (err) {
        if (latestDraftRef.current?.noteId === target.noteId) {
          setSaveStatus('error');
          setSaveError(
            err instanceof Error ? err.message : 'No se pudo guardar la nota.'
          );
        }
      }
    },
    []
  );

  const flushPendingSave = useCallback(async () => {
    clearAutosaveTimer();
    const draft = latestDraftRef.current;
    const saved = savedSnapshotRef.current;
    if (!draft || !saved || draft.noteId !== saved.noteId) {
      return;
    }
    const isDirty =
      draft.title.trim() !== saved.title || draft.content !== saved.content;
    if (isDirty && draft.title.trim()) {
      await persistSnapshot(draft);
    }
  }, [clearAutosaveTimer, persistSnapshot]);

  const showTransientNoteFeedback = useCallback((msg: string) => {
    setNoteFeedback(msg);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setNoteFeedback(null);
      feedbackTimerRef.current = null;
    }, 3500);
  }, []);

  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setIsLoading(true);
      }
      try {
        const [loadedCourse, loadedNotes, loadedSources, loadedExams] =
          await Promise.all([
            cursadaClient.getCourse(courseId),
            cursadaClient.listNotes({ courseId }),
            cursadaClient.listSources(courseId),
            cursadaClient.listExams({ courseId }),
          ]);

        if (!loadedCourse) {
          setLoadError('No se encontró la materia solicitada.');
          setCourse(null);
          return;
        }

        const sortedNotes = sortNotes(loadedNotes);
        setCourse(loadedCourse);
        setNotes(sortedNotes);
        setSources(loadedSources);
        setExams(loadedExams);
        setLoadError(null);

        setSelectedSourceIds((prev) => {
          const next = new Set(prev);
          for (const src of loadedSources) {
            if (!knownSourceIdsRef.current.has(src.id)) {
              knownSourceIdsRef.current.add(src.id);
              next.add(src.id);
            }
          }
          for (const id of Array.from(next)) {
            if (!loadedSources.some((s) => s.id === id)) {
              next.delete(id);
            }
          }
          return next;
        });

        setSelectedNoteIds((prev) => {
          const next = new Set(prev);
          for (const n of sortedNotes) {
            if (!knownNoteIdsRef.current.has(n.id)) {
              knownNoteIdsRef.current.add(n.id);
              next.add(n.id);
            }
          }
          for (const id of Array.from(next)) {
            if (!sortedNotes.some((n) => n.id === id)) {
              next.delete(id);
            }
          }
          return next;
        });

        setSelectedNoteId((currentId) => {
          if (currentId && sortedNotes.some((n) => n.id === currentId)) {
            return currentId;
          }
          if (initialNoteId && sortedNotes.some((n) => n.id === initialNoteId)) {
            return initialNoteId;
          }
          return sortedNotes[0]?.id ?? null;
        });
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'No se pudo cargar la materia.'
        );
      } finally {
        if (!opts?.silent) {
          setIsLoading(false);
        }
      }
    },
    [courseId, initialNoteId]
  );

  useEffect(() => {
    void loadData();

    const handleDataChanged = () => {
      void loadData({ silent: true });
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);

    setLatestReport(getLatestStoredReport(courseId));
    void refreshStoredReports().then(() => {
      setLatestReport(getLatestStoredReport(courseId));
    });
    const unsubscribeReports = subscribeReports(() => {
      setLatestReport(getLatestStoredReport(courseId));
    });

    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
      unsubscribeReports();
    };
  }, [courseId, loadData]);

  // Clear header meta on unmount & flush unsaved note edits
  useEffect(() => {
    return () => {
      clearAutosaveTimer();
      const draft = latestDraftRef.current;
      const saved = savedSnapshotRef.current;
      if (
        draft &&
        saved &&
        draft.noteId === saved.noteId &&
        draft.title.trim() &&
        (draft.title.trim() !== saved.title || draft.content !== saved.content)
      ) {
        void cursadaClient.updateNote(draft.noteId, {
          title: draft.title.trim(),
          content: draft.content,
        });
      }
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      onHeaderMetaChangeRef.current?.(null);
    };
  }, [clearAutosaveTimer]);

  // Report course header metadata to SwissHeader
  useEffect(() => {
    if (!course) {
      return;
    }
    const notesCount = notes.length;
    const pdfsCount = sources.filter((s) => s.sourceType === 'pdf').length;
    const otherSourcesCount = sources.length - pdfsCount;

    const parts: string[] = [
      `${notesCount} ${notesCount === 1 ? 'nota' : 'notas'}`,
      `${pdfsCount} ${pdfsCount === 1 ? 'PDF' : 'PDFs'}`,
    ];
    if (otherSourcesCount > 0) {
      parts.push(
        `${otherSourcesCount} ${otherSourcesCount === 1 ? 'texto' : 'textos'}`
      );
    }

    const upcoming = exams
      .filter((e) => e.grade === null && e.examDate >= todayIso)
      .sort((a, b) => a.examDate.localeCompare(b.examDate))[0];

    if (upcoming) {
      const target = parseIsoDateLocal(upcoming.examDate);
      const today = parseIsoDateLocal(todayIso);
      const days = Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
      const catLabel = EXAM_CATEGORY_LABELS[upcoming.category];
      const daysPart =
        days === 0 ? 'hoy' : days === 1 ? 'en 1 día' : `en ${days} días`;
      parts.push(`${catLabel} ${daysPart}`);
    }

    onHeaderMetaChangeRef.current?.({
      name: course.name,
      summary: parts.join(' · '),
    });
  }, [course, notes.length, sources, exams, todayIso]);

  // Handle explicit external navigation to a noteId
  useEffect(() => {
    if (navigationVersion > lastNavVersionRef.current) {
      lastNavVersionRef.current = navigationVersion;
      if (initialNoteId && notes.some((n) => n.id === initialNoteId)) {
        void flushPendingSave().then(() => {
          setSelectedNoteId(initialNoteId);
        });
      }
    }
  }, [navigationVersion, initialNoteId, notes, flushPendingSave]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  // Sync editor draft only when selectedNoteId switches to a different note
  const syncedNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedNote) {
      syncedNoteIdRef.current = null;
      savedSnapshotRef.current = null;
      latestDraftRef.current = null;
      setDraftTitle('');
      setDraftContent('');
      setSaveStatus('saved');
      setSaveError(null);
      return;
    }

    if (syncedNoteIdRef.current !== selectedNote.id) {
      syncedNoteIdRef.current = selectedNote.id;
      savedSnapshotRef.current = {
        noteId: selectedNote.id,
        title: selectedNote.title,
        content: selectedNote.content,
      };
      latestDraftRef.current = {
        noteId: selectedNote.id,
        title: selectedNote.title,
        content: selectedNote.content,
      };
      setDraftTitle(selectedNote.title);
      setDraftContent(selectedNote.content);
      setSaveStatus('saved');
      setSaveError(null);
      setConfirmDeleteNoteId(null);
    }
  }, [selectedNote]);

  // Auto-resize title textarea height
  useEffect(() => {
    const el = titleTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draftTitle, selectedNoteId]);

  const handleCreateNote = useCallback(async () => {
    await flushPendingSave();
    const created = await cursadaClient.createNote({
      courseId,
      title: 'Nueva nota',
      content: '',
      origin: 'manual',
    });
    setNotes((prev) => sortNotes([created, ...prev]));
    setSelectedNoteId(created.id);
    onCoursesChanged?.();
    window.setTimeout(() => {
      const el = titleTextareaRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
  }, [courseId, flushPendingSave, onCoursesChanged]);

  // Handle global Cmd+N when inside course detail view
  useEffect(() => {
    if (
      newNoteRequestVersion > 0 &&
      newNoteRequestVersion > lastNewNoteVersionRef.current
    ) {
      lastNewNoteVersionRef.current = newNoteRequestVersion;
      void handleCreateNote();
    }
  }, [newNoteRequestVersion, handleCreateNote]);

  async function handleSelectNote(noteId: string): Promise<void> {
    if (noteId === selectedNoteId) {
      return;
    }
    await flushPendingSave();
    setSelectedNoteId(noteId);
  }

  function scheduleAutosave(noteId: string, nextTitle: string, nextContent: string): void {
    latestDraftRef.current = { noteId, title: nextTitle, content: nextContent };
    const saved = savedSnapshotRef.current;
    if (!saved || saved.noteId !== noteId) {
      return;
    }

    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      clearAutosaveTimer();
      setSaveStatus('error');
      setSaveError('El título no puede estar vacío.');
      return;
    }

    const isDirty = trimmedTitle !== saved.title || nextContent !== saved.content;
    if (!isDirty) {
      clearAutosaveTimer();
      setSaveStatus('saved');
      setSaveError(null);
      return;
    }

    setSaveStatus('dirty');
    setSaveError(null);
    clearAutosaveTimer();
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void persistSnapshot({ noteId, title: nextTitle, content: nextContent });
    }, NOTE_AUTOSAVE_DELAY_MS);
  }

  function handleTitleChange(nextTitle: string): void {
    setDraftTitle(nextTitle);
    if (selectedNote) {
      scheduleAutosave(selectedNote.id, nextTitle, draftContent);
    }
  }

  function handleContentChange(nextContent: string): void {
    setDraftContent(nextContent);
    if (selectedNote) {
      scheduleAutosave(selectedNote.id, draftTitle, nextContent);
    }
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = editorPaneRef.current?.querySelector<HTMLElement>(
        '[aria-label="Contenido de la nota"]'
      );
      target?.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void flushPendingSave();
    }
  }

  async function handleOpenOrCreateWikiLink(targetTitle: string): Promise<void> {
    const trimmed = targetTitle.trim();
    if (!trimmed) return;
    await flushPendingSave();
    const targetNote = await cursadaClient.openOrCreateWikiLink({
      courseId,
      targetTitle: trimmed,
    });
    if (targetNote.courseId === courseId) {
      await loadData({ silent: true });
      setSelectedNoteId(targetNote.id);
      showTransientNoteFeedback(`Enlace abierto: ${targetNote.title}`);
    } else {
      onSelectCourse(targetNote.courseId, { noteId: targetNote.id });
    }
  }

  async function handleNoteStageChange(nextStage: ExamStageTag): Promise<void> {
    if (!selectedNote) return;
    await flushPendingSave();
    const updated = await cursadaClient.updateNote(selectedNote.id, {
      examStage: nextStage,
    });
    setNotes((prev) =>
      sortNotes(prev.map((n) => (n.id === updated.id ? updated : n)))
    );
  }

  async function handleSourceStageChange(
    sourceId: string,
    nextStage: ExamStageTag
  ): Promise<void> {
    setSourceError(null);
    try {
      const updated = await cursadaClient.updateSourceStage({
        sourceId,
        examStage: nextStage,
      });
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setSourceError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar la instancia de la fuente.'
      );
    }
  }

  function toggleNoteSelection(noteId: string): void {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }

  async function handleTogglePin(): Promise<void> {
    if (!selectedNote) return;
    await flushPendingSave();
    const updated = await cursadaClient.toggleNotePin(selectedNote.id);
    setNotes((prev) =>
      sortNotes(prev.map((n) => (n.id === updated.id ? updated : n)))
    );
    showTransientNoteFeedback(updated.isPinned ? 'Nota fijada.' : 'Nota desfijada.');
  }

  async function handleExportNote(): Promise<void> {
    if (!selectedNote) return;
    await flushPendingSave();
    const result = await cursadaClient.exportMarkdown({
      scope: 'note',
      noteId: selectedNote.id,
    });
    if (!result.canceled) {
      showTransientNoteFeedback('Nota exportada en Markdown.');
    }
  }

  async function handleExportCourse(): Promise<void> {
    await flushPendingSave();
    const result = await cursadaClient.exportMarkdown({
      scope: 'course',
      courseId,
    });
    if (!result.canceled) {
      showTransientNoteFeedback('Materia exportada en Markdown.');
    }
  }

  async function handleConfirmDeleteNote(noteId: string): Promise<void> {
    clearAutosaveTimer();
    await cursadaClient.deleteNote(noteId);
    setConfirmDeleteNoteId(null);
    const remaining = notes.filter((n) => n.id !== noteId);
    setNotes(remaining);
    setSelectedNoteId(remaining[0]?.id ?? null);
    onCoursesChanged?.();
  }

  function toggleSourceSelection(sourceId: string): void {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }

  async function handleUploadSourceTrigger(): Promise<void> {
    setSourceError(null);
    const hasNativeDialog =
      typeof window !== 'undefined' &&
      typeof window.cursadaApi?.importSourceFile === 'function';

    if (hasNativeDialog) {
      setIsImportingSource(true);
      try {
        const result = await cursadaClient.importSourceFile({ courseId });
        if (!result.canceled && result.source) {
          await loadData({ silent: true });
        }
      } catch (err) {
        setSourceError(
          err instanceof Error ? err.message : 'No se pudo importar el archivo.'
        );
      } finally {
        setIsImportingSource(false);
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleFileInputChange(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSourceError(null);
    setIsImportingSource(true);
    try {
      const bytes = await readFileAsBytes(file);
      const contentBase64 = bytesToBase64(bytes);
      const result = await cursadaClient.importSourceFile({
        courseId,
        fileName: file.name,
        contentBase64,
      });
      if (!result.canceled && result.source) {
        await loadData({ silent: true });
      }
    } catch (err) {
      setSourceError(
        err instanceof Error ? err.message : 'No se pudo procesar el archivo.'
      );
    } finally {
      setIsImportingSource(false);
    }
  }

  async function handlePasteSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const title = pasteTitle.trim();
    const text = pasteText.trim();
    if (!title || !text) {
      setSourceError('Completá un título y el texto de la fuente.');
      return;
    }

    setSourceError(null);
    setIsImportingSource(true);
    try {
      await cursadaClient.createSourceFromText({
        courseId,
        title,
        text,
        sourceType: 'pasted_text',
      });
      setPasteTitle('');
      setPasteText('');
      setIsPasteOpen(false);
      await loadData({ silent: true });
    } catch (err) {
      setSourceError(
        err instanceof Error ? err.message : 'No se pudo indexar el texto.'
      );
    } finally {
      setIsImportingSource(false);
    }
  }

  async function handleDeleteSource(sourceId: string): Promise<void> {
    setSourceError(null);
    try {
      await cursadaClient.deleteSource(sourceId);
      await loadData({ silent: true });
    } catch (err) {
      setSourceError(
        err instanceof Error ? err.message : 'No se pudo eliminar la fuente.'
      );
    }
  }

  function resolveFilteredContext() {
    const stageActive = aiStageFilter !== 'all' ? aiStageFilter : null;
    const filteredSources = stageActive
      ? sources.filter((s) => (s.examStage ?? 'general') === stageActive)
      : sources;
    const filteredNotes = stageActive
      ? notes.filter((n) => (n.examStage ?? 'general') === stageActive)
      : notes;

    const effectiveIncludeSources = aiContextFilter !== 'notes_only';
    const effectiveIncludeNotes = aiContextFilter !== 'sources_only' && includeNotes;

    const readySelectedSourceIds = effectiveIncludeSources
      ? filteredSources
          .filter((s) => s.indexingStatus === 'ready' && selectedSourceIds.has(s.id))
          .map((s) => s.id)
      : [];

    const selectedNotesList = effectiveIncludeNotes
      ? filteredNotes.filter((n) => selectedNoteIds.has(n.id))
      : [];

    return {
      filteredSources,
      filteredNotes,
      effectiveIncludeSources,
      effectiveIncludeNotes,
      readySelectedSourceIds,
      selectedNotesList,
    };
  }

  async function handleGenerateReport(reportType: StudyReportType): Promise<void> {
    if (!course) return;
    setReportError(null);

    const {
      effectiveIncludeNotes,
      readySelectedSourceIds,
      selectedNotesList,
    } = resolveFilteredContext();

    const noteIdsToUse = selectedNotesList.map((n) => n.id);

    if (readySelectedSourceIds.length === 0 && (!effectiveIncludeNotes || noteIdsToUse.length === 0)) {
      setReportError('Seleccioná al menos una nota o una fuente para generar el informe.');
      return;
    }

    setIsGeneratingReport(true);
    try {
      const report = await generateAndStoreReport({
        courseId: course.id,
        courseName: course.name,
        reportType,
        sourceIds: readySelectedSourceIds,
        noteIds: effectiveIncludeNotes ? noteIdsToUse : [],
        examStage: aiStageFilter,
        includeNotes: effectiveIncludeNotes,
      });
      setLatestReport(report);
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : 'No se pudo generar el informe.'
      );
    } finally {
      setIsGeneratingReport(false);
    }
  }

  function handleReportCitationClick(citationIndex: number): void {
    if (!latestReport) return;
    const citation = latestReport.citations.find((c) => c.index === citationIndex);
    if (citation?.kind === 'note' && notes.some((n) => n.id === citation.id)) {
      void handleSelectNote(citation.id);
      return;
    }
    onOpenReport?.(latestReport.id);
  }

  function handleChatCitationClick(citationIndex: number): void {
    if (!lastAnswer) return;
    const citation = lastAnswer.citations.find((c) => c.citationNumber === citationIndex);
    if (citation) {
      if (citation.sourceType === 'note' && notes.some((n) => n.id === citation.sourceId)) {
        void handleSelectNote(citation.sourceId);
        setNoteFeedback(`Fuente [${citationIndex}]: ${citation.sourceTitle}`);
        return;
      }
      const matchedSource = sources.find((s) => s.id === citation.sourceId);
      if (matchedSource) {
        setNoteFeedback(`Fuente [${citationIndex}]: ${matchedSource.title}`);
        return;
      }
      setNoteFeedback(`Fuente [${citationIndex}]: ${citation.sourceTitle}`);
    }
  }

  async function handleAskSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = askQuery.trim();
    if (!trimmed || isAsking) {
      return;
    }

    const {
      effectiveIncludeNotes,
      readySelectedSourceIds,
      selectedNotesList,
    } = resolveFilteredContext();

    setAskError(null);
    setIsAsking(true);
    setLastQuestion(trimmed);
    try {
      const result = await cursadaClient.sendChatMessage({
        courseId,
        threadId: chatThreadId ?? undefined,
        content: trimmed,
        sourceIds: readySelectedSourceIds,
        noteIds: effectiveIncludeNotes ? selectedNotesList.map((n) => n.id) : [],
        examStage: aiStageFilter,
        includeNotes: effectiveIncludeNotes,
      });
      setChatThreadId(result.thread.id);
      setLastAnswer(result.assistantMessage);
      setAskQuery('');
    } catch (err) {
      setAskError(
        err instanceof Error ? err.message : 'No se pudo consultar tus fuentes.'
      );
    } finally {
      setIsAsking(false);
    }
  }

  if (isLoading) {
    return (
      <section className="swiss-grid" aria-label="Cargando materia">
        <div className="swiss-col-12">
          <SwissLoadingBar text="Cargando cuaderno de materia…" />
        </div>
      </section>
    );
  }

  if (loadError || !course) {
    return (
      <section className="swiss-grid" aria-label="Error al cargar materia">
        <div className="swiss-col-12">
          <SwissErrorAlert message={loadError ?? 'No se encontró la materia.'} />
          <div style={{ marginTop: '16px' }}>
            <SwissButton variant="secondary" onClick={() => onSelectCourse(null)}>
              ← Volver a Materias
            </SwissButton>
          </div>
        </div>
      </section>
    );
  }

  const {
    filteredSources,
    filteredNotes,
    effectiveIncludeSources,
    effectiveIncludeNotes,
    selectedNotesList,
  } = resolveFilteredContext();

  const totalSources = 1 + filteredSources.length;
  const checkedCount =
    (effectiveIncludeNotes ? 1 : 0) +
    (effectiveIncludeSources
      ? filteredSources.filter((s) => selectedSourceIds.has(s.id)).length
      : 0);

  const saveStatusText =
    saveStatus === 'saving'
      ? 'Guardando…'
      : saveStatus === 'dirty'
        ? 'Sin guardar'
        : saveStatus === 'error'
          ? saveError ?? 'Error al guardar'
          : 'Guardado';

  const gridClassName = [
    'notebook-grid',
    !isLeftSidebarOpen ? 'is-left-collapsed' : '',
    !isRightSidebarOpen ? 'is-right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={gridClassName} aria-labelledby="main-title">
      {/* Panel izquierdo: Listado de notas + Red de conocimiento + Asistencia */}
      {isLeftSidebarOpen ? (
        <aside className="notebook-notes-pane" aria-label="Notas de la materia">
          <div className="notebook-notes-top">
            <div className="notebook-pane-header-bar">
              <h2 className="swiss-section-label">Notas · {notes.length}</h2>
              <div className="notebook-pane-header-actions">
                <SwissLinkButton
                  className="swiss-link-sm"
                  onClick={() => {
                    void handleCreateNote();
                  }}
                >
                  + Nueva
                </SwissLinkButton>
                <button
                  type="button"
                  className="notebook-collapse-btn"
                  aria-label="Colapsar panel izquierdo"
                  aria-expanded={isLeftSidebarOpen}
                  title="Ocultar panel de notas"
                  onClick={() => setIsLeftSidebarOpen(false)}
                >
                  ‹
                </button>
              </div>
            </div>

            {notes.length === 0 ? (
              <p className="swiss-meta-md">No hay notas cargadas todavía.</p>
            ) : (
              <div>
                {notes.map((note) => {
                  const isSelected = selectedNote?.id === note.id;
                  const words = countWords(note.content);
                  const dateLabel = formatNoteDateShort(note.updatedAt, todayIso);
                  const stageTag = note.examStage ?? 'general';
                  const stageShort =
                    stageTag === 'parcial_1'
                      ? '1°P'
                      : stageTag === 'parcial_2'
                        ? '2°P'
                        : stageTag === 'final'
                          ? 'Final'
                          : null;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      className={`notebook-note-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        void handleSelectNote(note.id);
                      }}
                    >
                      <span className="notebook-note-title">
                        {note.title || 'Nota sin título'}
                      </span>
                      <span className="notebook-note-meta">
                        {dateLabel} · {words} {words === 1 ? 'palabra' : 'palabras'}
                        {stageShort ? ` · ${stageShort}` : ''}
                        {note.isPinned ? ' · Fijada' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedNote ? (
              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--rule)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  <SwissLinkButton
                    className="swiss-link-sm"
                    onClick={() => void handleTogglePin()}
                  >
                    {selectedNote.isPinned ? 'Desfijar' : 'Fijar'}
                  </SwissLinkButton>
                  <SwissLinkButton
                    className="swiss-link-sm"
                    onClick={() => void handleExportNote()}
                  >
                    Exportar .md
                  </SwissLinkButton>
                  {confirmDeleteNoteId === selectedNote.id ? (
                    <>
                      <SwissLinkButton
                        className="swiss-link-sm"
                        style={{ fontWeight: 600 }}
                        onClick={() => void handleConfirmDeleteNote(selectedNote.id)}
                      >
                        Confirmar
                      </SwissLinkButton>
                      <SwissLinkButton
                        className="swiss-link-sm"
                        onClick={() => setConfirmDeleteNoteId(null)}
                      >
                        Cancelar
                      </SwissLinkButton>
                    </>
                  ) : (
                    <SwissLinkButton
                      className="swiss-link-sm"
                      onClick={() => setConfirmDeleteNoteId(selectedNote.id)}
                    >
                      Eliminar nota
                    </SwissLinkButton>
                  )}
                </div>
                {noteFeedback ? <span className="swiss-meta">{noteFeedback}</span> : null}
              </div>
            ) : null}

            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--rule)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <SwissLinkButton
                className="swiss-link-sm"
                onClick={() => onSelectCourse(null)}
              >
                ← Todas las materias
              </SwissLinkButton>
              <SwissLinkButton
                className="swiss-link-sm"
                onClick={() => void handleExportCourse()}
              >
                Exportar materia .md
              </SwissLinkButton>
              {onEditCourse ? (
                <SwissLinkButton
                  className="swiss-link-sm"
                  onClick={() => onEditCourse(course)}
                >
                  Editar materia
                </SwissLinkButton>
              ) : null}
              {onArchiveCourse ? (
                <SwissLinkButton
                  className="swiss-link-sm"
                  onClick={() => onArchiveCourse(course)}
                >
                  {course.status === 'active' ? 'Archivar' : 'Activar'}
                </SwissLinkButton>
              ) : null}
              {onDeleteCourse ? (
                <SwissLinkButton
                  className="swiss-link-sm"
                  onClick={() => onDeleteCourse(course.id)}
                >
                  Eliminar materia
                </SwissLinkButton>
              ) : null}
            </div>
          </div>

          <div className="notebook-knowledge-section">
            {selectedNote ? (
              <NoteBacklinksPanel
                noteId={selectedNote.id}
                courseId={course.id}
                refreshKey={selectedNote.updatedAt}
                onOpenNote={(noteId, targetCourseId) => {
                  if (targetCourseId === course.id) {
                    void handleSelectNote(noteId);
                  } else {
                    onSelectCourse(targetCourseId, { noteId });
                  }
                }}
                onOpenOrCreateWikiLink={(targetTitle) =>
                  void handleOpenOrCreateWikiLink(targetTitle)
                }
              />
            ) : null}

            <CourseAttendancePanel courseId={course.id} />
          </div>
        </aside>
      ) : null}

      {/* Panel central: Super-Editor Markdown */}
      <div ref={editorPaneRef} className="notebook-editor-pane">
        <h1 id="main-title" tabIndex={-1} className="visually-hidden">
          {course.name}
        </h1>

        <div className="notebook-editor-topbar">
          <div className="notebook-editor-topbar-left">
            <button
              type="button"
              className={`notebook-collapse-btn ${
                !isLeftSidebarOpen ? 'is-collapsed-restore' : ''
              }`.trim()}
              aria-label={
                isLeftSidebarOpen
                  ? 'Ocultar panel de notas'
                  : 'Mostrar panel de notas'
              }
              aria-expanded={isLeftSidebarOpen}
              onClick={() => setIsLeftSidebarOpen((open) => !open)}
            >
              {isLeftSidebarOpen ? '‹ Notas' : '› Notas'}
            </button>
          </div>
          <div className="notebook-editor-topbar-right">
            <button
              type="button"
              className={`notebook-collapse-btn ${
                !isRightSidebarOpen ? 'is-collapsed-restore' : ''
              }`.trim()}
              aria-label={
                isRightSidebarOpen
                  ? 'Ocultar panel de asistente IA'
                  : 'Mostrar panel de asistente IA'
              }
              aria-expanded={isRightSidebarOpen}
              onClick={() => setIsRightSidebarOpen((open) => !open)}
            >
              {isRightSidebarOpen ? 'IA ›' : '‹ IA'}
            </button>
          </div>
        </div>

        <motion.div
          key={selectedNote ? 'course-editor' : 'course-empty'}
          className="notebook-editor-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {!selectedNote ? (
            <SwissEmptyState
              title="Sin notas en esta materia"
              description="Creá tu primera nota para empezar a escribir apuntes, usar atajos Markdown y armar informes."
              actionLabel="+ Nueva nota"
              onAction={() => void handleCreateNote()}
            />
          ) : (
            <>
              <div className="notebook-breadcrumb-row">
                <span className="swiss-meta-md">
                  {course.name} / {draftTitle.trim() || 'Sin título'}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <SwissSelect
                    aria-label="Instancia de la nota"
                    value={selectedNote.examStage ?? 'general'}
                    onChange={(e) =>
                      void handleNoteStageChange(e.target.value as ExamStageTag)
                    }
                  >
                    {EXAM_STAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </SwissSelect>
                  <span className="swiss-meta" aria-live="polite">
                    {saveStatusText}
                  </span>
                </span>
              </div>

              <textarea
                ref={titleTextareaRef}
                rows={1}
                className="notebook-title-input"
                aria-label="Título de la nota"
                placeholder="Título de la nota"
                value={draftTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                onKeyDown={handleTitleKeyDown}
              />

              <SwissTitleUnderline />

              <SuperMarkdownEditor
                noteId={selectedNote.id}
                courseId={course.id}
                content={draftContent}
                onChangeContent={handleContentChange}
                onSaveShortcut={() => void flushPendingSave()}
                availableNotes={notes.map((n) => ({
                  id: n.id,
                  title: n.title,
                  courseId: n.courseId,
                }))}
                onOpenWikiLink={(targetTitle) =>
                  void handleOpenOrCreateWikiLink(targetTitle)
                }
                onFocusTitle={() => titleTextareaRef.current?.focus()}
                ariaLabel="Contenido de la nota"
              />
            </>
          )}
        </motion.div>
      </div>

      {/* Panel derecho: Fuentes + Notas + Etapa + Informe con IA + Chat */}
      {isRightSidebarOpen ? (
        <aside className="notebook-ai-pane" aria-label="Asistente e informes con IA">
          <div className="notebook-pane-header-bar" style={{ marginBottom: 0 }}>
            <h2 className="swiss-section-label">Informe con IA</h2>
            <button
              type="button"
              className="notebook-collapse-btn"
              aria-label="Colapsar panel derecho"
              aria-expanded={isRightSidebarOpen}
              title="Ocultar panel de asistente IA"
              onClick={() => setIsRightSidebarOpen(false)}
            >
              ›
            </button>
          </div>

          <div
            className="stage-filter-row"
            role="group"
            aria-label="Filtrar contexto de IA por instancia"
          >
          {(
            [
              { id: 'all', label: 'Todo' },
              { id: 'parcial_1', label: '1° Parcial' },
              { id: 'parcial_2', label: '2° Parcial' },
              { id: 'final', label: 'Final' },
            ] as const
          ).map((stage) => {
            const isActive =
              aiStageFilter === stage.id && aiContextFilter === 'all';
            return (
              <button
                key={stage.id}
                type="button"
                className={`stage-pill ${isActive ? 'is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => {
                  setAiStageFilter(stage.id);
                  setAiContextFilter('all');
                }}
              >
                {stage.label}
              </button>
            );
          })}
          <button
            type="button"
            className={`stage-pill ${aiContextFilter === 'sources_only' ? 'is-active' : ''}`}
            aria-pressed={aiContextFilter === 'sources_only'}
            onClick={() =>
              setAiContextFilter((prev) =>
                prev === 'sources_only' ? 'all' : 'sources_only'
              )
            }
          >
            Solo Fuentes
          </button>
          <button
            type="button"
            className={`stage-pill ${aiContextFilter === 'notes_only' ? 'is-active' : ''}`}
            aria-pressed={aiContextFilter === 'notes_only'}
            onClick={() =>
              setAiContextFilter((prev) =>
                prev === 'notes_only' ? 'all' : 'notes_only'
              )
            }
          >
            Solo Notas
          </button>
        </div>

        <div>
          <SwissSectionHeader
            subtle
            title={`Fuentes · ${checkedCount} de ${totalSources}`}
            right={
              <span style={{ display: 'inline-flex', gap: '8px' }}>
                <SwissLinkButton
                  className="swiss-link-sm"
                  onClick={() => void handleUploadSourceTrigger()}
                >
                  + Subir PDF
                </SwissLinkButton>
                <SwissLinkButton
                  className="swiss-link-sm"
                  onClick={() => setIsPasteOpen((v) => !v)}
                >
                  + Texto
                </SwissLinkButton>
              </span>
            }
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt"
            className="visually-hidden"
            aria-label="Seleccionar archivo PDF, Markdown o texto"
            onChange={(e) => void handleFileInputChange(e)}
          />

          {isPasteOpen ? (
            <form
              onSubmit={(e) => void handlePasteSubmit(e)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '10px 0',
                borderTop: '1px solid var(--rule)',
              }}
            >
              <label htmlFor={pasteTitleId} className="visually-hidden">
                Título de la fuente
              </label>
              <input
                id={pasteTitleId}
                type="text"
                className="swiss-input"
                placeholder="Título de la fuente…"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
              <label htmlFor={pasteBodyId} className="visually-hidden">
                Contenido de la fuente
              </label>
              <textarea
                id={pasteBodyId}
                rows={4}
                className="swiss-input"
                placeholder="Pegá el texto de la bibliografía o consigna…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <SwissButton
                  type="submit"
                  variant="primary"
                  disabled={isImportingSource}
                >
                  Indexar
                </SwissButton>
                <SwissButton
                  variant="secondary"
                  onClick={() => setIsPasteOpen(false)}
                >
                  Cancelar
                </SwissButton>
              </div>
            </form>
          ) : null}

          <div className="notebook-sources-list">
            {aiContextFilter !== 'sources_only' ? (
              <div className="notebook-source-row">
                <div className="notebook-source-left">
                  <SwissCheckbox
                    checked={includeNotes}
                    ariaLabel="Incluir todas las notas"
                    onChange={() => setIncludeNotes((v) => !v)}
                  />
                  <span className="notebook-source-name">Todas las notas</span>
                </div>
                <span
                  className="swiss-meta"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>{filteredNotes.length}</span>
                  {filteredNotes.length > 0 ? (
                    <SwissLinkButton
                      style={{ fontSize: '11px', fontWeight: 500 }}
                      onClick={() => setIsNotePickerExpanded((v) => !v)}
                    >
                      {isNotePickerExpanded ? 'Ocultar' : 'Elegir'}
                    </SwissLinkButton>
                  ) : null}
                </span>
              </div>
            ) : null}

            {aiContextFilter !== 'sources_only' &&
            includeNotes &&
            isNotePickerExpanded
              ? filteredNotes.map((n) => (
                  <div
                    key={n.id}
                    className="notebook-source-row"
                    style={{ paddingLeft: '14px' }}
                  >
                    <div className="notebook-source-left">
                      <SwissCheckbox
                        checked={selectedNoteIds.has(n.id)}
                        ariaLabel={`Incluir nota ${n.title}`}
                        onChange={() => toggleNoteSelection(n.id)}
                      />
                      <span className="notebook-source-name" title={n.title}>
                        {n.title}
                      </span>
                    </div>
                    <span className="swiss-meta">Nota</span>
                  </div>
                ))
              : null}

            {aiContextFilter !== 'notes_only'
              ? filteredSources.map((src) => {
                  const isChecked = selectedSourceIds.has(src.id);
                  return (
                    <div key={src.id} className="notebook-source-row">
                      <div className="notebook-source-left">
                        <SwissCheckbox
                          checked={isChecked}
                          ariaLabel={`Incluir ${src.title}`}
                          onChange={() => toggleSourceSelection(src.id)}
                        />
                        <span className="notebook-source-name" title={src.title}>
                          {src.title}
                        </span>
                      </div>
                      <span
                        className="swiss-meta"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <select
                          aria-label={`Instancia de ${src.title}`}
                          value={src.examStage ?? 'general'}
                          onChange={(e) =>
                            void handleSourceStageChange(
                              src.id,
                              e.target.value as ExamStageTag
                            )
                          }
                          style={{
                            fontSize: '11px',
                            background: 'transparent',
                            border: '1px solid var(--rule)',
                            color: 'var(--mut)',
                            padding: '1px 4px',
                          }}
                        >
                          {EXAM_STAGE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <span>{SOURCE_TYPE_SHORT[src.sourceType]}</span>
                        <SwissLinkButton
                          className="swiss-link-sm"
                          style={{ fontWeight: 400 }}
                          aria-label={`Quitar ${src.title}`}
                          onClick={() => void handleDeleteSource(src.id)}
                        >
                          Quitar
                        </SwissLinkButton>
                      </span>
                    </div>
                  );
                })
              : null}
          </div>

          {isImportingSource ? <SwissLoadingBar text="Indexando fuente…" /> : null}
          {sourceError ? <SwissErrorAlert message={sourceError} /> : null}
        </div>

        <div className="notebook-report-actions">
          <SwissButton
            variant="primary"
            disabled={isGeneratingReport}
            onClick={() => void handleGenerateReport('summary')}
          >
            Resumen de parcial
          </SwissButton>
          <SwissButton
            variant="secondary"
            disabled={isGeneratingReport}
            onClick={() => void handleGenerateReport('study_guide')}
          >
            Guía de estudio
          </SwissButton>
          <SwissButton
            variant="secondary"
            disabled={isGeneratingReport}
            onClick={() => void handleGenerateReport('practice_exam')}
          >
            Preguntas
          </SwissButton>
          <SwissButton
            variant="secondary"
            onClick={() => setIsSimulatorOpen(true)}
          >
            Simulacro interactivo
          </SwissButton>
        </div>

        {isGeneratingReport ? <SwissLoadingBar text="Generando informe…" /> : null}
        {reportError ? <SwissErrorAlert message={reportError} /> : null}

        {latestReport ? (
          <div className="notebook-last-report">
            <span className="swiss-section-label">
              Último informe · {formatRelativeAgeEs(latestReport.updatedAt)}
            </span>
            <h3 className="notebook-last-report-title">{latestReport.title}</h3>
            <p className="notebook-last-report-excerpt">
              {renderTextWithMathAndCitations(
                extractReportExcerpt(latestReport.content),
                handleReportCitationClick
              )}
            </p>
            <div>
              <SwissLinkButton
                underlined
                onClick={() => onOpenReport?.(latestReport.id)}
              >
                Abrir informe →
              </SwissLinkButton>
            </div>
          </div>
        ) : null}

        <form
          className="notebook-ask-form"
          style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}
          onSubmit={(e) => void handleAskSubmit(e)}
        >
          <label htmlFor={askInputId} className="visually-hidden">
            Preguntale a tus fuentes
          </label>
          <input
            id={askInputId}
            type="text"
            className="swiss-input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Preguntale a tus fuentes…"
            value={askQuery}
            disabled={isAsking}
            onChange={(e) => setAskQuery(e.target.value)}
          />
          <SwissButton
            type="submit"
            variant="secondary"
            aria-label="Enviar consulta"
            disabled={isAsking || !askQuery.trim()}
          >
            →
          </SwissButton>
        </form>

        {isAsking ? <SwissLoadingBar text="Consultando tus fuentes…" /> : null}
        {askError ? <SwissErrorAlert message={askError} /> : null}

        {lastAnswer ? (
          <div
            style={{
              borderTop: '1px solid var(--rule)',
              paddingTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {lastQuestion ? (
              <div className="swiss-meta">{lastQuestion}</div>
            ) : null}
            <p className="notebook-answer-copy">
              {renderTextWithMathAndCitations(
                lastAnswer.content,
                handleChatCitationClick
              )}
            </p>
            {lastAnswer.citations.length > 0 ? (
              <div className="swiss-meta">
                {lastAnswer.citations.map((c) => (
                  <div key={c.chunkId}>
                    [{c.citationNumber}] {c.sourceTitle}
                    {c.pageNumber !== null ? ` (p. ${c.pageNumber})` : ''}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        </aside>
      ) : null}

      <PracticeExamSimulatorModal
        isOpen={isSimulatorOpen}
        courseId={course.id}
        courseName={course.name}
        examStage={aiStageFilter}
        sources={effectiveIncludeSources ? filteredSources : []}
        notes={effectiveIncludeNotes ? selectedNotesList : []}
        onClose={() => setIsSimulatorOpen(false)}
        onCitationClick={(target) => {
          if (target.kind === 'note' && notes.some((n) => n.id === target.sourceId)) {
            setIsSimulatorOpen(false);
            void handleSelectNote(target.sourceId);
          } else {
            setNoteFeedback(`Fuente [${target.index}]: ${target.title}`);
          }
        }}
        onSavedNote={(created) => {
          void loadData({ silent: true });
          setIsSimulatorOpen(false);
          void handleSelectNote(created.id);
        }}
      />
    </section>
  );
}
