import { useEffect, useState } from 'react';
import { cursadaClient } from '../../lib/api/client';
import type { TaskWithCourse } from '../../types';

export interface TaskListProps {
  courseId?: string;
  onSelectCourse?: (courseId: string | null) => void;
  onTasksChanged?: () => void;
}

export function TaskList({
  courseId,
  onSelectCourse,
  onTasksChanged,
}: TaskListProps) {
  const [tasks, setTasks] = useState<TaskWithCourse[]>([]);

  useEffect(() => {
    let active = true;
    void cursadaClient.listTasks(courseId ? { courseId } : undefined).then((loaded) => {
      if (active) {
        setTasks(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [courseId]);

  async function handleToggle(taskId: string): Promise<void> {
    await cursadaClient.toggleTaskStatus(taskId);
    const reloaded = await cursadaClient.listTasks(courseId ? { courseId } : undefined);
    setTasks(reloaded);
    onTasksChanged?.();
  }

  return (
    <section className="surface-panel" aria-label="Lista de tareas">
      <div className="task-checklist">
        {tasks.map((task) => {
          const checkboxId = `task-list-item-${task.id}`;
          const isCompleted = task.status === 'done';
          return (
            <div
              key={task.id}
              className={`task-row ${isCompleted ? 'is-completed' : ''}`}
              data-course-color={task.courseColor}
            >
              <div className="task-row-main">
                <input
                  id={checkboxId}
                  type="checkbox"
                  className="task-checkbox"
                  checked={isCompleted}
                  onChange={() => void handleToggle(task.id)}
                />
                <label htmlFor={checkboxId} className="task-title-label">
                  {task.title}
                </label>
              </div>
              <div className="task-row-meta">
                {!courseId ? (
                  <button
                    type="button"
                    className="inline-course-link"
                    onClick={() => onSelectCourse?.(task.courseId)}
                  >
                    <span className="course-pill" data-course-color={task.courseColor}>
                      <span
                        className="course-dot"
                        data-course-color={task.courseColor}
                        aria-hidden="true"
                      />
                      {task.courseName}
                    </span>
                  </button>
                ) : null}
                <span className={`task-due-badge urgency-week ${isCompleted ? 'is-done' : ''}`}>
                  {isCompleted ? 'Completada' : (task.dueDate ?? 'Sin fecha')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
