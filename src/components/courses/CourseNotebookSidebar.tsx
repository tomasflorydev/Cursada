import {
  MONTH_SHORT_NAMES_ES,
  parseIsoDateLocal,
  toIsoDateString,
} from '../../lib/dates';
import type { CourseWithSchedules, NoteWithCourse } from '../../types';
import { SwissLinkButton } from '../../ui';
import { NoteBacklinksPanel } from '../notes/NoteBacklinksPanel';
import { CourseAttendancePanel } from './CourseAttendancePanel';

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

export interface CourseNotebookSidebarProps {
  course: CourseWithSchedules;
  notes: NoteWithCourse[];
  selectedNote: NoteWithCourse | null;
  todayIso: string;
  confirmDeleteNoteId: string | null;
  noteFeedback: string | null;
  isLeftSidebarOpen: boolean;
  onCollapse: () => void;
  onCreateNote: () => void;
  onSelectNote: (noteId: string) => void;
  onTogglePin: () => void;
  onExportNote: () => void;
  onRequestDeleteNote: (noteId: string | null) => void;
  onConfirmDeleteNote: (noteId: string) => void;
  onBackToCourses: () => void;
  onExportCourse: () => void;
  onEditCourse?: (course: CourseWithSchedules) => void;
  onArchiveCourse?: (course: CourseWithSchedules) => void;
  onDeleteCourse?: (courseId: string) => void;
  onOpenExternalNote: (targetCourseId: string, noteId: string) => void;
  onOpenOrCreateWikiLink: (targetTitle: string) => void;
}

/**
 * Left pane of the 3-column course notebook: notes list, note/course actions,
 * WikiLink backlinks panel, and attendance tracking.
 */
export function CourseNotebookSidebar({
  course,
  notes,
  selectedNote,
  todayIso,
  confirmDeleteNoteId,
  noteFeedback,
  isLeftSidebarOpen,
  onCollapse,
  onCreateNote,
  onSelectNote,
  onTogglePin,
  onExportNote,
  onRequestDeleteNote,
  onConfirmDeleteNote,
  onBackToCourses,
  onExportCourse,
  onEditCourse,
  onArchiveCourse,
  onDeleteCourse,
  onOpenExternalNote,
  onOpenOrCreateWikiLink,
}: CourseNotebookSidebarProps) {
  return (
    <aside className="notebook-notes-pane" aria-label="Notas de la materia">
      <div className="notebook-notes-top">
        <div className="notebook-pane-header-bar">
          <h2 className="swiss-section-label">Notas · {notes.length}</h2>
          <div className="notebook-pane-header-actions">
            <SwissLinkButton className="swiss-link-sm" onClick={onCreateNote}>
              + Nueva
            </SwissLinkButton>
            <button
              type="button"
              className="notebook-collapse-btn"
              aria-label="Colapsar panel izquierdo"
              aria-expanded={isLeftSidebarOpen}
              title="Ocultar panel de notas"
              onClick={onCollapse}
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
                  onClick={() => onSelectNote(note.id)}
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
              <SwissLinkButton className="swiss-link-sm" onClick={onTogglePin}>
                {selectedNote.isPinned ? 'Desfijar' : 'Fijar'}
              </SwissLinkButton>
              <SwissLinkButton className="swiss-link-sm" onClick={onExportNote}>
                Exportar .md
              </SwissLinkButton>
              {confirmDeleteNoteId === selectedNote.id ? (
                <>
                  <SwissLinkButton
                    className="swiss-link-sm"
                    style={{ fontWeight: 600 }}
                    onClick={() => onConfirmDeleteNote(selectedNote.id)}
                  >
                    Confirmar
                  </SwissLinkButton>
                  <SwissLinkButton
                    className="swiss-link-sm"
                    onClick={() => onRequestDeleteNote(null)}
                  >
                    Cancelar
                  </SwissLinkButton>
                </>
              ) : (
                <SwissLinkButton
                  className="swiss-link-sm"
                  onClick={() => onRequestDeleteNote(selectedNote.id)}
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
          <SwissLinkButton className="swiss-link-sm" onClick={onBackToCourses}>
            ← Todas las materias
          </SwissLinkButton>
          <SwissLinkButton className="swiss-link-sm" onClick={onExportCourse}>
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
                onSelectNote(noteId);
              } else {
                onOpenExternalNote(targetCourseId, noteId);
              }
            }}
            onOpenOrCreateWikiLink={onOpenOrCreateWikiLink}
          />
        ) : null}

        <CourseAttendancePanel courseId={course.id} />
      </div>
    </aside>
  );
}
