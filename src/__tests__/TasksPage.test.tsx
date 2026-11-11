import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskList } from '../components/tasks/TaskList';
import { resetAllMocks } from '../lib/api/mockClient';
import { TasksPage } from '../pages/TasksPage';

describe('TasksPage and TaskList (Task 2.1)', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('renders the global Tasks view with pending summary, task items, priority badges, and course navigation', async () => {
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
    expect(
      screen.getByText(
        /Actualizar diagrama de clases con las interfaces de notificación/i
      )
    ).toBeInTheDocument();

    // Summary pill shows 4 pendientes
    expect(await screen.findByText(/4 pendientes/i)).toBeInTheDocument();

    // Priority badges in Spanish
    expect(screen.getAllByText('Prioridad alta').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Media').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Baja')).toBeInTheDocument();

    // Completed badge on done task
    expect(screen.getByText('Completada')).toBeInTheDocument();

    // Clicking on a course pill calls onSelectCourse with that courseId
    const coursePillButtons = screen.getAllByRole('button', {
      name: /Base de Datos II/i,
    });
    fireEvent.click(coursePillButtons[0]);
    expect(onSelectCourse).toHaveBeenCalledWith('bd-2');
  });

  it('creates a new task choosing title, course, due date, and priority', async () => {
    const onTasksChanged = vi.fn();
    render(<TasksPage onSelectCourse={vi.fn()} onTasksChanged={onTasksChanged} />);

    await screen.findByText(
      /Entregar script de índices compuestos y análisis de plan de ejecución/i
    );

    fireEvent.click(screen.getByRole('button', { name: /Nueva tarea/i }));

    const form = screen.getByRole('form', { name: /Nueva tarea/i });
    fireEvent.change(within(form).getByLabelText(/Título/i), {
      target: { value: 'Implementar consultas recursivas con CTE' },
    });
    fireEvent.change(within(form).getByLabelText(/^Materia$/i), {
      target: { value: 'bd-2' },
    });
    fireEvent.change(within(form).getByLabelText(/Fecha de entrega/i), {
      target: { value: '2026-11-18' },
    });
    fireEvent.change(within(form).getByLabelText(/Prioridad/i), {
      target: { value: 'high' },
    });
    fireEvent.change(within(form).getByLabelText(/Descripción/i), {
      target: { value: 'Probar con jerarquía de categorías.' },
    });

    fireEvent.click(within(form).getByRole('button', { name: /Guardar tarea/i }));

    expect(
      await screen.findByText('Implementar consultas recursivas con CTE')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Probar con jerarquía de categorías.')
    ).toBeInTheDocument();
    expect(screen.getByText('18 nov')).toBeInTheDocument();
    expect(onTasksChanged).toHaveBeenCalled();
  });

  it('edits and deletes an existing task', async () => {
    render(<TasksPage onSelectCourse={vi.fn()} />);

    await screen.findByText(
      /Subir resolución funcional de composición de consultas al repositorio/i
    );

    const editBtn = screen.getByRole('button', {
      name: /Editar Subir resolución funcional de composición de consultas al repositorio/i,
    });
    fireEvent.click(editBtn);

    const form = screen.getByRole('form', { name: /Editar tarea/i });
    const titleInput = within(form).getByLabelText(/Título/i);
    fireEvent.change(titleInput, {
      target: { value: 'Subir TP Funcional de Haskell corregido' },
    });
    fireEvent.change(within(form).getByLabelText(/Prioridad/i), {
      target: { value: 'medium' },
    });

    fireEvent.click(within(form).getByRole('button', { name: /Guardar cambios/i }));

    expect(
      await screen.findByText('Subir TP Funcional de Haskell corregido')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Subir resolución funcional de composición de consultas al repositorio/i
      )
    ).not.toBeInTheDocument();

    // Delete the edited task
    const deleteBtn = screen.getByRole('button', {
      name: /Eliminar Subir TP Funcional de Haskell corregido/i,
    });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(
        screen.queryByText('Subir TP Funcional de Haskell corregido')
      ).not.toBeInTheDocument();
    });
  });

  it('toggles task completion with a single click and filters by status (Pendientes / Completadas / Todas) and by course', async () => {
    render(<TasksPage onSelectCourse={vi.fn()} />);

    const taskTitle =
      'Completar matriz de trazabilidad de requerimientos y criterios de aceptación';
    const checkbox = (await screen.findByLabelText(taskTitle)) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // One-click complete
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(
        (screen.getByLabelText(taskTitle) as HTMLInputElement).checked
      ).toBe(true);
    });

    // Filter by Pendientes -> completed task should not be shown
    fireEvent.click(screen.getByRole('button', { name: 'Pendientes' }));
    await waitFor(() => {
      expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).toBeInTheDocument();

    // Filter by Completadas -> completed task is shown, pending task is hidden
    fireEvent.click(screen.getByRole('button', { name: 'Completadas' }));
    expect(await screen.findByText(taskTitle)).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).not.toBeInTheDocument();

    // Filter by Todas -> both shown
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(await screen.findByText(taskTitle)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Entregar script de índices compuestos y análisis de plan de ejecución/i
      )
    ).toBeInTheDocument();

    // Filter by course
    fireEvent.change(screen.getByLabelText(/Filtrar por materia/i), {
      target: { value: 'bd-2' },
    });
    await waitFor(() => {
      expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
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
      screen.queryByLabelText(/Filtrar por materia/i)
    ).not.toBeInTheDocument();

    // Create a task directly inside the course context without asking for course selection
    fireEvent.click(screen.getByRole('button', { name: /Nueva tarea/i }));

    const form = screen.getByRole('form', { name: /Nueva tarea/i });
    expect(within(form).queryByLabelText(/^Materia$/i)).not.toBeInTheDocument();

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
