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

    fireEvent.click(screen.getByRole('button', { name: /\+ Nueva materia/i }));

    fireEvent.change(screen.getByLabelText(/Nombre de la materia/i), {
      target: { value: 'Arquitectura de Computadoras' },
    });
    fireEvent.change(screen.getByLabelText(/Profesor \/ Cátedra/i), {
      target: { value: 'Roberto Funes' },
    });
    fireEvent.change(screen.getByLabelText(/Referencia interna/i), {
      target: { value: 'cyan' },
    });

    // Add first schedule row and test invalid schedule range (startTime >= endTime)
    fireEvent.click(screen.getByRole('button', { name: /Agregar horario/i }));
    fireEvent.change(screen.getByLabelText(/^Inicio$/i), {
      target: { value: '20:00' },
    });
    fireEvent.change(screen.getByLabelText(/^Fin$/i), {
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
    fireEvent.change(screen.getByLabelText(/^Inicio$/i), {
      target: { value: '18:30' },
    });
    fireEvent.change(screen.getByLabelText(/^Fin$/i), {
      target: { value: '22:30' },
    });
    fireEvent.change(screen.getByLabelText(/^Aula \/ Sede$/i), {
      target: { value: 'Aula 112 · Lima' },
    });

    // Add a second schedule block: Jueves 18:30 to 22:30
    fireEvent.click(screen.getByRole('button', { name: /Agregar horario/i }));
    fireEvent.change(screen.getByLabelText(/Día \(2\)/i), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText(/Aula \/ Sede \(2\)/i), {
      target: { value: 'Virtual' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Crear materia/i }));

    const createdButton = await screen.findByRole('button', {
      name: 'Arquitectura de Computadoras',
    });
    expect(createdButton).toBeInTheDocument();
    const createdRow = createdButton.closest('.courses-table-row') as HTMLElement;
    expect(within(createdRow).getByText(/Roberto Funes/i)).toBeInTheDocument();
    expect(within(createdRow).getByText(/18:30/i)).toBeInTheDocument();

    const persisted = (await cursadaClient.listCourses({ status: 'active' })).find(
      (c) => c.name === 'Arquitectura de Computadoras'
    );
    expect(persisted).toBeDefined();
    expect(persisted?.color).toBe('cyan');
    expect(persisted?.schedules).toHaveLength(2);
    expect(persisted?.schedules[0]).toMatchObject({
      dayOfWeek: 1,
      startTime: '18:30',
      endTime: '22:30',
      location: 'Aula 112 · Lima',
    });
    expect(persisted?.schedules[1]).toMatchObject({
      dayOfWeek: 4,
      startTime: '18:30',
      endTime: '22:30',
      location: 'Virtual',
    });
  });

  it('renders dedicated 3-panel course notebook view and shows task count impact on delete confirmation', async () => {
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

    // Check 3 Swiss notebook panels: Notas, inline Editor, Informe con IA + Fuentes
    const notesPane = screen.getByLabelText('Notas de la materia');
    expect(
      within(notesPane).getByRole('heading', { name: /Notas · 1/i })
    ).toBeInTheDocument();
    expect(within(notesPane).getByRole('button', { name: '+ Nueva' })).toBeInTheDocument();

    expect(screen.getByLabelText('Título de la nota')).toBeInTheDocument();
    expect(screen.getByLabelText('Contenido de la nota')).toBeInTheDocument();

    const aiPane = screen.getByLabelText('Asistente e informes con IA');
    expect(
      within(aiPane).getByRole('heading', { name: 'Informe con IA' })
    ).toBeInTheDocument();
    expect(
      within(aiPane).getByRole('heading', { name: /Fuentes ·/i })
    ).toBeInTheDocument();

    // Click Eliminar materia and verify delete impact dialog
    fireEvent.click(within(notesPane).getByRole('button', { name: /Eliminar materia/i }));

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

  it('renders weekly calendar by default, navigates between weeks and months, and selects a course on class click', async () => {
    const onSelectCourse = vi.fn();
    // Reference date: Wednesday, November 11, 2026
    const initialDate = new Date(2026, 10, 11);

    render(
      <CalendarPage onSelectCourse={onSelectCourse} initialDate={initialDate} />
    );

    const ddsMatches = await screen.findAllByText('Diseño de Sistemas');
    expect(ddsMatches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('calendar-period-label')).toHaveTextContent('9–15 nov');
    expect(screen.getByTestId('calendar-week-range')).toHaveTextContent(
      'Semana actual · 2026'
    );

    // Check weekly grid has Monday-to-Sunday columns (2026-11-09 to 2026-11-15)
    const weekGrid = screen.getByLabelText('Grilla semanal de cursada');
    expect(weekGrid.querySelector('.calendar-day-col[data-date="2026-11-09"]')).not.toBeNull();
    expect(weekGrid.querySelector('.calendar-day-col[data-date="2026-11-15"]')).not.toBeNull();

    // Click on "Base de Datos II" block inside Wednesday Nov 11 column in weekly grid
    const wedNov11Col = weekGrid.querySelector(
      '.calendar-day-col[data-date="2026-11-11"]'
    ) as HTMLElement;
    fireEvent.click(
      within(wedNov11Col).getByRole('button', { name: /Base de Datos II/i })
    );
    expect(onSelectCourse).toHaveBeenCalledWith('bd-2');

    // Navigate to next week -> 16–22 nov
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-period-label')).toHaveTextContent('16–22 nov');
    });
    expect(screen.getByTestId('calendar-week-range')).toHaveTextContent(
      'Semana siguiente · 2026'
    );

    // Return to Hoy -> 9–15 nov
    fireEvent.click(screen.getByRole('button', { name: /^Hoy$/i }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-period-label')).toHaveTextContent('9–15 nov');
    });

    // Switch to Monthly view via segmented toggle
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-period-label')).toHaveTextContent(
        'Noviembre 2026'
      );
    });
    expect(screen.getByTestId('calendar-week-range')).toHaveTextContent(
      'Mes actual · 2026'
    );

    const monthSection = screen.getByLabelText('Calendario mensual de cursada');
    expect(
      monthSection.querySelector('.calendar-month-cell[data-date="2026-11-01"]')
    ).not.toBeNull();
    expect(
      monthSection.querySelector('.calendar-month-cell[data-date="2026-11-30"]')
    ).not.toBeNull();

    // Navigate to next month -> Diciembre 2026
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-period-label')).toHaveTextContent(
        'Diciembre 2026'
      );
    });

    // Return to Hoy -> Noviembre 2026
    fireEvent.click(screen.getByRole('button', { name: /^Hoy$/i }));
    await waitFor(() => {
      expect(screen.getByTestId('calendar-period-label')).toHaveTextContent(
        'Noviembre 2026'
      );
    });

    // Click Wednesday Nov 11 cell in monthly grid and select Base de Datos II from day agenda
    const wedNov11Cell = monthSection.querySelector(
      '.calendar-month-cell[data-date="2026-11-11"]'
    ) as HTMLElement;
    fireEvent.click(wedNov11Cell);
    expect(
      await within(monthSection).findByRole('heading', {
        name: /Miércoles 11 de noviembre/i,
      })
    ).toBeInTheDocument();

    fireEvent.click(
      within(monthSection).getByRole('button', { name: /Base de Datos II/i })
    );
    expect(onSelectCourse).toHaveBeenCalledTimes(2);
    expect(onSelectCourse).toHaveBeenLastCalledWith('bd-2');
  });
});
