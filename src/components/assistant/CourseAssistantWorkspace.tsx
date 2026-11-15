import { useEffect, useState } from 'react';
import { CourseChatPanel } from './CourseChatPanel';
import { CourseReportGenerator } from './CourseReportGenerator';

export type AssistantWorkspaceMode = 'generator' | 'chat';

export interface CourseAssistantWorkspaceProps {
  courseId: string;
  courseName: string;
  onOpenNotesTab?: () => void;
}

export function CourseAssistantWorkspace({
  courseId,
  courseName,
  onOpenNotesTab,
}: CourseAssistantWorkspaceProps) {
  const [mode, setMode] = useState<AssistantWorkspaceMode>('generator');
  const [lastCreatedNoteId, setLastCreatedNoteId] = useState<string | null>(null);

  useEffect(() => {
    setLastCreatedNoteId(null);
  }, [courseId]);

  const handleNoteCreated = (noteId: string) => {
    setLastCreatedNoteId(noteId);
  };

  return (
    <div className="assistant-workspace" data-testid="course-assistant-workspace">
      <div className="assistant-workspace-header surface-panel">
        <div className="assistant-workspace-top">
          <div className="assistant-workspace-heading">
            <h2 className="section-title">Asistente IA de {courseName}</h2>
            <p className="assistant-ondemand-badge" data-testid="assistant-ondemand-badge">
              IA local bajo demanda (Ollama se activa solo al generar y libera memoria al terminar)
            </p>
          </div>

          <div
            className="assistant-mode-switch"
            role="group"
            aria-label="Modo del asistente de estudio"
          >
            <button
              type="button"
              className={`assistant-mode-btn${mode === 'generator' ? ' is-active' : ''}`}
              aria-pressed={mode === 'generator'}
              onClick={() => setMode('generator')}
            >
              Generar Resumen / Informe / Examen
            </button>
            <button
              type="button"
              className={`assistant-mode-btn${mode === 'chat' ? ' is-active' : ''}`}
              aria-pressed={mode === 'chat'}
              onClick={() => setMode('chat')}
            >
              Chat con Fuentes (RAG)
            </button>
          </div>
        </div>

        {lastCreatedNoteId && onOpenNotesTab ? (
          <div
            className="assistant-last-note-banner"
            role="status"
            aria-live="polite"
            data-testid="assistant-last-note-banner"
          >
            <span className="assistant-last-note-text">
              Último material guardado en Notas de esta materia.
            </span>
            <button
              type="button"
              className="secondary-button assistant-banner-notes-btn"
              onClick={() => onOpenNotesTab()}
            >
              Ver en la pestaña Notas
            </button>
          </div>
        ) : null}
      </div>

      {mode === 'generator' ? (
        <CourseReportGenerator
          courseId={courseId}
          courseName={courseName}
          onNoteCreated={handleNoteCreated}
          onOpenNotesTab={onOpenNotesTab}
        />
      ) : (
        <CourseChatPanel
          courseId={courseId}
          courseName={courseName}
          onNoteCreated={handleNoteCreated}
          onOpenNotesTab={onOpenNotesTab}
        />
      )}
    </div>
  );
}
