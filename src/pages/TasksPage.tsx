import { useCallback, useEffect, useState } from 'react';
import { TaskList } from '../components/tasks/TaskList';
import { cursadaClient, DATA_CHANGED_EVENT } from '../lib/api/client';
import { toIsoDateString } from '../lib/dates';

export interface TasksPageProps {
  onSelectCourse: (courseId: string | null) => void;
  onTasksChanged?: () => void;
}

export function TasksPage({ onSelectCourse, onTasksChanged }: TasksPageProps) {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [overdueCount, setOverdueCount] = useState<number>(0);
  const [dueTodayCount, setDueTodayCount] = useState<number>(0);
  const [createRequestVersion, setCreateRequestVersion] = useState<number>(0);

  const loadSummary = useCallback(async () => {
    const pendingTasks = await cursadaClient.listTasks({ status: 'pending' });
    const todayIso = toIsoDateString(new Date());
    const overdue = pendingTasks.filter(
      (t) => t.dueDate !== null && t.dueDate < todayIso
    ).length;
    const dueToday = pendingTasks.filter((t) => t.dueDate === todayIso).length;

    setPendingCount(pendingTasks.length);
    setOverdueCount(overdue);
    setDueTodayCount(dueToday);
  }, []);

  useEffect(() => {
    let active = true;
    void cursadaClient.listTasks({ status: 'pending' }).then((pendingTasks) => {
      if (!active) return;
      const todayIso = toIsoDateString(new Date());
      setPendingCount(pendingTasks.length);
      setOverdueCount(
        pendingTasks.filter((t) => t.dueDate !== null && t.dueDate < todayIso).length
      );
      setDueTodayCount(pendingTasks.filter((t) => t.dueDate === todayIso).length);
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

  function handleTasksChanged(): void {
    void loadSummary();
    onTasksChanged?.();
  }

  return (
    <div className="basic-view tasks-page">
      <header className="page-header">
        <div className="page-header-titles">
          <div className="page-date-row">
            <span className="page-date-text">Gestión de entregas</span>
            <span className="page-week-pill">
              {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
            </span>
            {overdueCount > 0 ? (
              <span className="tasks-summary-pill is-urgent">
                {overdueCount} {overdueCount === 1 ? 'vencida' : 'vencidas'}
              </span>
            ) : null}
            {dueTodayCount > 0 ? (
              <span className="tasks-summary-pill is-today">
                {dueTodayCount} para hoy
              </span>
            ) : null}
          </div>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Tareas
          </h1>
          <p className="page-subtitle">
            Entregas y pendientes por materia. Filtrá por estado o materia y marcá tus avances.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() => setCreateRequestVersion((v) => v + 1)}
        >
          Nueva tarea
        </button>
      </header>

      <TaskList
        onSelectCourse={onSelectCourse}
        onTasksChanged={handleTasksChanged}
        showCreateButton={false}
        createRequestVersion={createRequestVersion}
      />
    </div>
  );
}
