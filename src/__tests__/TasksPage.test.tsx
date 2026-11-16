import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskList } from '../components/tasks/TaskList';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { TasksPage } from '../pages/TasksPage';

describe('TasksPage and TaskList (Task 2.1)', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('renders the global Tasks view with open summary, task items, completed toggle, and course navigation', async () => {
    const onSelectCourse = vi.fn();
    render(<TasksPage onSelectCourse={onSelectCourse} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Tareas' })
    ).toBeInTheDocument();

    // Wait for mock tasks to load
    expect(
      await screen.findByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Completar matriz de trazabilidad de requerimientos y criterios de aceptación/i
      )
    ).toBeInTheDocument();

    // Sidebar Ver filters show 4 open and 1 completed
    const sidebar = document.querySelector('aside.swiss-col-3') as HTMLElement;
    expect(
      within(sidebar).getByRole('button', { name: /Abiertas\s*4/i })
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('button', { name: /Completadas\s*1/i })
    ).toBeInTheDocument();

    // Expand Completadas group inside Abiertas view to confirm done task and badge
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(
      await screen.findByText(
        /Actualizar diagrama de clases con las interfaces de notificación/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Completada')).toBeInTheDocument();

    // Clicking on a course link in a task row calls onSelectCourse with that courseId
    const bd2TaskRow = document.querySelector('[data-task-id="task-1"]') as HTMLElement;
    fireEvent.click(
      within(bd2TaskRow).getByRole('button', { name: 'Base de Datos II' })
    );
    expect(onSelectCourse).toHaveBeenCalledWith('bd-2');
  });

  it('creates a new task via quick-add bar and sets description and priority via inline edit', async () => {
    const onTasksChanged = vi.fn();
    render(<TasksPage onSelectCourse={vi.fn()} onTasksChanged={onTasksChanged} />);

    await screen.findByText(
      /Entregar script de índices compuestos y análisis de plan de ejecución/i
    );

    const quickForm = screen.getByRole('form', { name: 'Alta rápida de tarea' });
    fireEvent.change(
      within(quickForm).getByLabelText('Título de la nueva tarea'),
      { target: { value: 'Implementar consultas recursivas con CTE' } }
    );
    fireEvent.change(
      within(quickForm).getByLabelText('Materia de la nueva tarea'),
      { target: { value: 'bd-2' } }
    );
    fireEvent.change(
      within(quickForm).getByLabelText('Fecha de la nueva tarea'),
      { target: { value: 'custom' } }
    );
    fireEvent.change(
      within(quickForm).getByLabelText('Fecha personalizada de entrega'),
      { target: { value: '2026-11-18' } }
    );
    fireEvent.submit(quickForm);

    const createdTitle = await screen.findByText(
      'Implementar consultas recursivas con CTE'
    );
    expect(createdTitle).toBeInTheDocument();
    expect(screen.getByText('18 nov')).toBeInTheDocument();
    expect(onTasksChanged).toHaveBeenCalled();

    // Edit newly created task to set detail & priority
    const createdRow = createdTitle.closest('.tasks-item-row') as HTMLElement;
    fireEvent.click(within(createdRow).getByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Detalle'), {
      target: { value: 'Probar con jerarquía de categorías.' },
    });
    fireEvent.change(screen.getByLabelText('Prioridad'), {
      target: { value: 'high' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(
      await screen.findByText('Probar con jerarquía de categorías.')
    ).toBeInTheDocument();

    const persisted = (await cursadaClient.listTasks({ courseId: 'bd-2' })).find(
      (t) => t.title === 'Implementar consultas recursivas con CTE'
    );
    expect(persisted?.priority).toBe('high');
    expect(persisted?.dueDate).toBe('2026-11-18');
  });

  it('edits and deletes an existing task with inline confirmation', async () => {
    render(<TasksPage onSelectCourse={vi.fn()} />);

    const originalTitle = await screen.findByText(
      /Subir resolución funcional de composición de consultas al repositorio/i
    );
    const taskRow = originalTitle.closest('.tasks-item-row') as HTMLElement;

    fireEvent.click(within(taskRow).getByRole('button', { name: 'Editar' }));

    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Subir TP Funcional de Haskell corregido' },
    });
    fireEvent.change(screen.getByLabelText('Prioridad'), {
      target: { value: 'medium' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const updatedTitle = await screen.findByText(
      'Subir TP Funcional de Haskell corregido'
    );
    expect(updatedTitle).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Subir resolución funcional de composición de consultas al repositorio/i
      )
    ).not.toBeInTheDocument();

    // Delete the edited task (requires inline Confirmar)
    const updatedRow = updatedTitle.closest('.tasks-item-row') as HTMLElement;
    fireEvent.click(within(updatedRow).getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(within(updatedRow).getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(
        screen.queryByText('Subir TP Funcional de Haskell corregido')
      ).not.toBeInTheDocument();
    });
  });

  it('toggles task completion with a single click and filters by Ver (Abiertas / Completadas) and Por materia', async () => {
    render(<TasksPage onSelectCourse={vi.fn()} />);

    const taskTitle =
      'Completar matriz de trazabilidad de requerimientos y criterios de aceptación';
    const checkbox = await screen.findByRole('checkbox', {
      name: `Marcar "${taskTitle}" como completada`,
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    // One-click complete -> moves out of open list into Completadas
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).toBeInTheDocument();

    const sidebar = document.querySelector('aside.swiss-col-3') as HTMLElement;

    // Filter by Completadas -> completed task is shown checked, pending task is hidden
    fireEvent.click(
      within(sidebar).getByRole('button', { name: /Completadas/i })
    );
    expect(await screen.findByText(taskTitle)).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: `Marcar "${taskTitle}" como pendiente`,
      })
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.queryByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).not.toBeInTheDocument();

    // Filter back to Abiertas, then filter by Por materia (Base de Datos II)
    fireEvent.click(within(sidebar).getByRole('button', { name: /Abiertas/i }));
    expect(
      await screen.findByText(
        /Resolver ejercicios 12 al 18 de la Guía 6/i
      )
    ).toBeInTheDocument();

    fireEvent.click(
      within(sidebar).getByRole('button', { name: /Base de Datos II/i })
    );
    await waitFor(() => {
      expect(
        screen.queryByText(/Resolver ejercicios 12 al 18 de la Guía 6/i)
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).toBeInTheDocument();
  });

  it('works in contextual course mode (<TaskList courseId="ing-soft-1" />) showing only that course tasks and associating new tasks automatically', async () => {
    render(<TaskList courseId="ing-soft-1" />);

    // Shows task belonging to ing-soft-1
    expect(
      await screen.findByText(
        /Completar matriz de trazabilidad de requerimientos y criterios de aceptación/i
      )
    ).toBeInTheDocument();

    // Does not show tasks from other courses
    expect(
      screen.queryByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).not.toBeInTheDocument();

    // Does not render course filter dropdown in contextual mode
    expect(
      screen.queryByLabelText(/Filtrar por anotador/i)
    ).not.toBeInTheDocument();

    // Create a task directly inside the course context without asking for course selection
    fireEvent.click(screen.getByRole('button', { name: /Nueva tarea/i }));

    const form = screen.getByRole('form', { name: /Nueva tarea/i });
    expect(within(form).queryByLabelText(/^Anotador$/i)).not.toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText(/Título/i), {
      target: { value: 'Definir casos de prueba de aceptación del Sprint 4' },
    });
    fireEvent.change(within(form).getByLabelText(/Prioridad/i), {
      target: { value: 'high' },
    });
    fireEvent.click(within(form).getByRole('button', { name: /Guardar tarea/i }));

    expect(
      await screen.findByText(
        'Definir casos de prueba de aceptación del Sprint 4'
      )
    ).toBeInTheDocument();
  });
});
