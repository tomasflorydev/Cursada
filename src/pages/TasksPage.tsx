import { TaskList } from '../components/tasks/TaskList';

export interface TasksPageProps {
  onSelectCourse: (courseId: string | null) => void;
  onTasksChanged?: () => void;
}

export function TasksPage({ onSelectCourse, onTasksChanged }: TasksPageProps) {
  return (
    <div className="basic-view">
      <header className="page-header">
        <div className="page-header-titles">
          <span className="page-date-text">Gestión de entregas</span>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Tareas
          </h1>
          <p className="page-subtitle">
            Entregas y pendientes por materia. Filtrá por estado o materia y marcá tus avances.
          </p>
        </div>
        <button type="button" className="primary-button">
          Nueva tarea
        </button>
      </header>

      <TaskList onSelectCourse={onSelectCourse} onTasksChanged={onTasksChanged} />
    </div>
  );
}
