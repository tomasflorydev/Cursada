import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { CalendarPage } from '../pages/CalendarPage';
import { TasksPage } from '../pages/TasksPage';

describe('Stage 2 Integration & Task 2.2: Course-Scoped Tasks and Calendar Entregas Band', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('filters tasks by course in TasksPage and quick-adds new tasks scoped to that course', async () => {
    const onSelectCourse = vi.fn();
    render(<TasksPage onSelectCourse={onSelectCourse} />);

    expect(
      await screen.findByText(
        /Completar matriz de trazabilidad de requerimientos/i
      )
    ).toBeInTheDocument();

    const sidebar = document.querySelector('aside.swiss-col-3') as HTMLElement;
    const courseFilterBtn = await within(sidebar).findByRole('button', {
      name: /Ingeniería de Software I/i,
    });
    fireEvent.click(courseFilterBtn);

    expect(courseFilterBtn).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(/Completar matriz de trazabilidad de requerimientos/i)
    ).toBeInTheDocument();

    // Tasks from other courses should not appear while filtered
    expect(
      screen.queryByText(/Entregar script de índices compuestos/i)
    ).not.toBeInTheDocument();

    // Quick-add a task while filtered to Ingeniería de Software I (without picking course manually)
    const quickForm = screen.getByRole('form', { name: 'Alta rápida de tarea' });
    fireEvent.change(
      within(quickForm).getByLabelText('Título de la nueva tarea'),
      { target: { value: 'Preparar presentación de retrospectiva' } }
    );
    fireEvent.change(
      within(quickForm).getByLabelText('Fecha de la nueva tarea'),
      { target: { value: 'custom' } }
    );
    fireEvent.change(
      within(quickForm).getByLabelText('Fecha personalizada de entrega'),
      { target: { value: '2026-11-14' } }
    );
    fireEvent.submit(quickForm);

    expect(
      await screen.findByText('Preparar presentación de retrospectiva')
    ).toBeInTheDocument();

    const ingSoftTasks = await cursadaClient.listTasks({ courseId: 'ing-soft-1' });
    expect(
      ingSoftTasks.some(
        (t) =>
          t.title === 'Preparar presentación de retrospectiva' &&
          t.dueDate === '2026-11-14'
      )
    ).toBe(true);
  });

  it('superimposes task deliveries in the weekly Entregas band and updates status or navigates on click', async () => {
    const createdTask = await cursadaClient.createTask({
      courseId: 'ing-soft-1',
      title: 'Entrega TP Integrador en Calendario',
      description: 'Subir PDF y enlace al repositorio antes de las 23:59.',
      dueDate: '2026-11-14', // Saturday of week 2026-11-09..2026-11-15
      priority: 'high',
    });

    const onSelectCourse = vi.fn();
    const initialDate = new Date(2026, 10, 11); // Wednesday Nov 11, 2026
    const { rerender } = render(
      <CalendarPage onSelectCourse={onSelectCourse} initialDate={initialDate} />
    );

    const weekGrid = await screen.findByLabelText('Grilla semanal de cursada');
    expect(within(weekGrid).getByText('Entregas')).toBeInTheDocument();

    const saturdayDeliverableCell = weekGrid.querySelector(
      '.calendar-deliverable-cell[data-date="2026-11-14"]'
    ) as HTMLElement;
    expect(saturdayDeliverableCell).not.toBeNull();

    const deliverableButton = await within(saturdayDeliverableCell).findByRole(
      'button',
      { name: 'Entrega TP Integrador en Calendario' }
    );
    expect(deliverableButton).toBeInTheDocument();

    // Clicking deliverable without onNavigateSection jumps directly to its course
    fireEvent.click(deliverableButton);
    expect(onSelectCourse).toHaveBeenCalledWith('ing-soft-1');

    // Completing the task updates the weekly calendar Entregas band dynamically
    await cursadaClient.toggleTaskStatus(createdTask.id);
    await waitFor(() => {
      expect(
        within(saturdayDeliverableCell).getByRole('button', {
          name: 'Entrega TP Integrador en Calendario (hecha)',
        })
      ).toBeInTheDocument();
    });

    // When onNavigateSection is provided, clicking a task deliverable opens Tareas
    const onNavigateSection = vi.fn();
    rerender(
      <CalendarPage
        onSelectCourse={onSelectCourse}
        onNavigateSection={onNavigateSection}
        initialDate={initialDate}
      />
    );

    fireEvent.click(
      within(saturdayDeliverableCell).getByRole('button', {
        name: 'Entrega TP Integrador en Calendario (hecha)',
      })
    );
    expect(onNavigateSection).toHaveBeenCalledWith('tareas');
  });
});
