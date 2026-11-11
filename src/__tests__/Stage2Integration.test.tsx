import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { CalendarPage } from '../pages/CalendarPage';
import { CoursesPage } from '../pages/CoursesPage';

describe('Stage 2 Integration & Task 2.2: Course Tareas Tab and Calendar Deliveries Overlay', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('mounts <TaskList courseId /> inside the course Tareas tab and creates tasks scoped to that course', async () => {
    const onSelectCourse = vi.fn();
    render(
      <CoursesPage selectedCourseId="ing-soft-1" onSelectCourse={onSelectCourse} />
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ingeniería de Software I' })
    ).toBeInTheDocument();

    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Tareas' }));

    const tabPanel = screen.getByTestId('course-tasks-tab-panel');
    expect(
      await within(tabPanel).findByText(
        /Completar matriz de trazabilidad de requerimientos/i
      )
    ).toBeInTheDocument();

    // Tasks from other courses should not appear here
    expect(
      within(tabPanel).queryByText(/Entregar script de índices compuestos/i)
    ).not.toBeInTheDocument();

    // Create a new task directly inside the course's Tareas tab
    fireEvent.click(within(tabPanel).getByRole('button', { name: /Nueva tarea/i }));
    fireEvent.change(within(tabPanel).getByLabelText(/Título/i), {
      target: { value: 'Preparar presentación de retrospectiva' },
    });
    fireEvent.change(within(tabPanel).getByLabelText(/Fecha de entrega/i), {
      target: { value: '2026-11-14' },
    });
    fireEvent.click(within(tabPanel).getByRole('button', { name: /Guardar tarea/i }));

    expect(
      await within(tabPanel).findByText('Preparar presentación de retrospectiva')
    ).toBeInTheDocument();
  });

  it('superimposes task deliveries in the weekly calendar and allows marking or opening a task directly', async () => {
    await cursadaClient.createTask({
      courseId: 'ing-soft-1',
      title: 'Entrega TP Integrador en Calendario',
      description: 'Subir PDF y enlace al repositorio antes de las 23:59.',
      dueDate: '2026-11-14', // Saturday of week 2026-11-09..2026-11-15
      priority: 'high',
    });

    const onSelectCourse = vi.fn();
    const initialDate = new Date(2026, 10, 11); // Wednesday Nov 11, 2026
    render(
      <CalendarPage onSelectCourse={onSelectCourse} initialDate={initialDate} />
    );

    const saturdayTasksOverlay = await screen.findByTestId('calendar-tasks-2026-11-14');
    expect(
      within(saturdayTasksOverlay).getByText('Entrega TP Integrador en Calendario')
    ).toBeInTheDocument();

    const taskCard = saturdayTasksOverlay.querySelector(
      '.calendar-task-card[data-course-color="blue"]'
    ) as HTMLElement;
    expect(taskCard).not.toBeNull();
    expect(taskCard.getAttribute('data-status')).toBe('pending');
    expect(within(taskCard).getByText('Entrega')).toBeInTheDocument();

    // Toggle task completion directly from the calendar
    const checkbox = within(taskCard).getByRole('checkbox', {
      name: /Marcar entrega Entrega TP Integrador en Calendario/i,
    });
    fireEvent.click(checkbox);

    await waitFor(() => {
      const updatedCard = screen
        .getByTestId('calendar-tasks-2026-11-14')
        .querySelector('.calendar-task-card') as HTMLElement;
      expect(updatedCard.getAttribute('data-status')).toBe('done');
      expect(within(updatedCard).getByText('Completada')).toBeInTheDocument();
    });

    // Open the task directly from the calendar and navigate to its course
    fireEvent.click(
      within(screen.getByTestId('calendar-tasks-2026-11-14')).getByRole('button', {
        name: 'Entrega TP Integrador en Calendario',
      })
    );

    expect(
      await screen.findByText(/Subir PDF y enlace al repositorio antes de las 23:59/i)
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Ir a Ingeniería de Software I/i })
    );
    expect(onSelectCourse).toHaveBeenCalledWith('ing-soft-1');
  });
});
