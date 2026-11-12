import { useCallback, useEffect, useState } from 'react';
import { NotesWorkspace } from '../components/notes/NotesWorkspace';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';

export interface NotesPageProps {
  onSelectCourse: (courseId: string | null) => void;
  onNotesChanged?: () => void;
}

export function NotesPage({ onSelectCourse, onNotesChanged }: NotesPageProps) {
  const [totalCount, setTotalCount] = useState<number>(0);
  const [pinnedCount, setPinnedCount] = useState<number>(0);

  const loadSummary = useCallback(async () => {
    const allNotes = await cursadaClient.listNotes();
    setTotalCount(allNotes.length);
    setPinnedCount(allNotes.filter((n) => n.isPinned).length);
  }, []);

  useEffect(() => {
    let active = true;
    void cursadaClient.listNotes().then((allNotes) => {
      if (!active) return;
      setTotalCount(allNotes.length);
      setPinnedCount(allNotes.filter((n) => n.isPinned).length);
    });

    const handleDataChanged = () => {
      void loadSummary();
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      active = false;
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadSummary]);

  function handleNotesChanged(): void {
    void loadSummary();
    onNotesChanged?.();
  }

  return (
    <div className="basic-view notes-page">
      <header className="page-header">
        <div className="page-header-titles">
          <div className="page-date-row">
            <span className="page-date-text">Apuntes y documentación</span>
            <span className="page-week-pill">
              {totalCount} {totalCount === 1 ? 'nota' : 'notas'}
            </span>
            {pinnedCount > 0 ? (
              <span className="tasks-summary-pill">
                {pinnedCount} {pinnedCount === 1 ? 'fijada' : 'fijadas'}
              </span>
            ) : null}
          </div>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Notas
          </h1>
          <p className="page-subtitle">
            Apuntes en Markdown con vista previa en vivo, guardado automático y
            búsqueda instantánea sin distinción de tildes.
          </p>
        </div>
      </header>

      <NotesWorkspace
        onSelectCourse={(courseId) => onSelectCourse(courseId)}
        onNotesChanged={handleNotesChanged}
      />
    </div>
  );
}
