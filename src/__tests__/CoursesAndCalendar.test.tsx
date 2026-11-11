import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAllMocks } from '../lib/api/mockClient';
import { cursadaClient } from '../lib/api/client';
import { CalendarPage } from '../pages/CalendarPage';
import { CoursesPage } from '../pages/CoursesPage';

describe('Tasks 1.2 & 1.3: CoursesPage, CourseDetailView, and CalendarPage', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('creates a new course with weekly schedules and validates startTime < endTime', async () => {
    const onSelectCourse = vi.fn();
    render(<CoursesPage selectedCourseId={null} onSelectCourse={onSelectCourse} />);

    await screen.findByRole('button', { name: 'Ingeniería de Software I' });

    fireEvent.click(screen.getByRole('button', { name: /Nueva materia/i }));

    fireEvent.change(screen.getByLabelText(/Nombre de la materia/i), {
      target: { value: 'Arquitectura de Computadoras' },
    });
    fireEvent.change(screen.getByLabelText(/Profesor \/ Cátedra/i), {
      target: { value: 'Roberto Funes' },
    });
    fireEvent.change(screen.getByLabelText(/^Color$/i), {
      target: { value: 'cyan' },
    });

    // Test invalid schedule range first (startTime >= endTime)
    fireEvent.change(screen.getByLabelText(/^Hora de inicio$/i), {
      target: { value: '20:00' },
    });
    fireEvent.change(screen.getByLabelText(/^Hora de fin$/i), {
      target: { value: '18:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Crear materia/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /la hora de inicio \(20:00\) debe ser anterior a la hora de fin \(18:00\)/i
    );

    // Now fix first schedule block: Lunes 18:30 to 22:30
    fireEvent.change(screen.getByLabelText(/^Día$/i), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText(/^Hora de inicio$/i), {
      target: { value: '18:30' },
    });
    fireEvent.change(screen.getByLabelText(/^Hora de fin$/i), {
      target: { value: '22:30' },
    });
    fireEvent.change(screen.getByLabelText(/^Aula \/ Sede \/ Modalidad$/i), {
      target: { value: 'Aula 112 · Lima' },
    });

    // Add a second schedule block: Jueves 18:30 to 22:30
    fireEvent.click(screen.getByRole('button', { name: /Agregar horario/i }));
    fireEvent.change(screen.getByLabelText(/Día \(2\)/i), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText(/Aula \/ Sede \/ Modalidad \(2\)/i), {
      target: { value: 'Virtual' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Crear materia/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Arquitectura de Computadoras' })
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Prof\. Roberto Funes/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Lun 18:30–22:30 \(Aula 112 · Lima\) · Jue 18:30–22:30 \(Virtual\)/i)
    ).toBeInTheDocument();
  });

  it('renders dedicated course view with structured tabs and task count impact on delete confirmation', async () => {
    // Seed an extra task for 'ing-soft-1' to verify tasksCount in confirmation dialog
    await cursadaClient.createTask({
      courseId: 'ing-soft-1',
      title: 'Entrega TP Arquitectura Limpia',
      dueDate: '2026-11-18',
      priority: 'high',
    });

    const onSelectCourse = vi.fn();
    render(
      <CoursesPage selectedCourseId="ing-soft-1" onSelectCourse={onSelectCourse} />
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ingeniería de Software I' })
    ).toBeInTheDocument();

    // Check structured tabs
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getByRole('tab', { name: 'Resumen' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Tareas' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Exámenes' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Notas' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Fuentes' })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: 'Asistente IA' })).toBeInTheDocument();

    // Switch to Tareas tab and verify testid container for Etapa 2
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Tareas' }));
    expect(screen.getByTestId('course-tasks-tab-panel')).toBeInTheDocument();

    // Click Eliminar materia and verify delete impact dialog
    fireEvent.click(screen.getByRole('button', { name: /Eliminar materia/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Eliminar materia/i })
      ).toBeInTheDocument();
    });
    // Initial mockTasks has 1 task for ing-soft-1 + 1 we created = 2 tareas asociadas
    expect(screen.getByText(/2 tareas asociadas/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar eliminación/i }));

    await waitFor(() => {
      expect(onSelectCourse).toHaveBeenCalledWith(null);
    });
  });

  it('renders monthly calendar by default, navigates between months and weeks, and selects a course on class click', async () => {
    const onSelectCourse = vi.fn();
    // Reference date: Wednesday, November 11, 2026
    const initialDate = new Date(2026, 10, 11);

    render(
      <CalendarPage onSelectCourse={onSelectCourse} initialDate={initialDate} />
    );

    const ddsMatches = await screen.findAllByText('Diseño de Sistemas');
    expect(ddsMatches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('calendar-period-label')).toHaveTextContent(
      'Noviembre 2026 · Vista mensual'
    );

    // Check monthly grid has November days (e.g. 2026-11-01 to 2026-11-30)
    const monthGrid = screen.getByLabelText('Calendario mensual de cursada');
    expect(monthGrid.querySelector('.calendar-day-col[data-date="2026-11-01"]')).not.toBeNull();
    expect(monthGrid.querySelector('.calendar-day-col[data-date="2026-11-30"]')).not.toBeNull();

    // Navigate to next month -> Diciembre 2026
    fireEvent.click(screen.getByRole('button', { name: /Mes siguiente/i }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-period-label')).toHaveTextContent(
        'Diciembre 2026 · Vista mensual'
      );
    });

    // Return to Hoy -> Noviembre 2026
    fireEvent.click(screen.getByRole('button', { name: /^Hoy$/i }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-period-label')).toHaveTextContent(
        'Noviembre 2026 · Vista mensual'
      );
    });

    // Click on "Base de Datos II" block inside Wednesday Nov 11 cell in monthly grid
    const wedNov11Cell = monthGrid.querySelector(
      '.calendar-day-col[data-date="2026-11-11"]'
    ) as HTMLElement;
    const bd2MonthBlock = within(wedNov11Cell).getByRole('button', {
      name: /Base de Datos II/i,
    });
    fireEvent.click(bd2MonthBlock);
    expect(onSelectCourse).toHaveBeenCalledWith('bd-2');

    // Switch to Weekly view and verify Monday-to-Sunday navigation
    fireEvent.click(screen.getByRole('button', { name: 'Semanal' }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-week-range')).toHaveTextContent(
        '9 al 15 de noviembre de 2026'
      );
    });

    const weekGrid = screen.getByLabelText('Grilla semanal de cursada');
    expect(weekGrid.querySelector('.calendar-day-col[data-date="2026-11-09"]')).not.toBeNull();
    expect(weekGrid.querySelector('.calendar-day-col[data-date="2026-11-15"]')).not.toBeNull();

    // Navigate to next week -> 16 al 22 de noviembre de 2026
    fireEvent.click(screen.getByRole('button', { name: /Semana siguiente/i }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-week-range')).toHaveTextContent(
        '16 al 22 de noviembre de 2026'
      );
    });
  });
});
