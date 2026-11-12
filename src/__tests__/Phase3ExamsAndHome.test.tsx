import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAllMocks } from '../lib/api/mockClient';
import { CalendarPage } from '../pages/CalendarPage';
import { CoursesPage } from '../pages/CoursesPage';
import { ExamsPage } from '../pages/ExamsPage';
import { HomePage } from '../pages/HomePage';

describe('Phase 3: Exams CRUD, Course Average, Calendar Overlay, and Live HomePage', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('creates an exam, loads a grade (scale 1-10), and updates the course average in CourseDetailView', async () => {
    const onSelectCourse = vi.fn();
    render(<ExamsPage onSelectCourse={onSelectCourse} />);

    // Wait for initial upcoming exam to appear
    expect(
      await screen.findByRole('heading', { name: /2° Parcial Teórico-Práctico/i })
    ).toBeInTheDocument();

    // Open new exam form and create a new exam for Base de Datos II
    fireEvent.click(screen.getByRole('button', { name: /Agendar examen/i }));

    fireEvent.change(screen.getByLabelText(/Instancia \/ Título/i), {
      target: { value: 'Defensa TP Integrador Motor SQL' },
    });
    fireEvent.change(screen.getByLabelText(/^Materia$/i), {
      target: { value: 'bd-2' },
    });
    fireEvent.change(screen.getByLabelText(/^Categoría$/i), {
      target: { value: 'tp' },
    });
    fireEvent.change(screen.getByLabelText(/^Fecha$/i), {
      target: { value: '2026-11-20' },
    });
    fireEvent.change(screen.getByLabelText(/Nota obtenida/i), {
      target: { value: '10' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Guardar examen/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Defensa TP Integrador Motor SQL/i })
      ).toBeInTheDocument();
    });

    // Now render CourseDetailView for Base de Datos II (which had 8.0 + new 10.0 -> average 9.0)
    render(<CoursesPage selectedCourseId="bd-2" onSelectCourse={onSelectCourse} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Base de Datos II' })
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId('course-detail-average-pill')
    ).toHaveTextContent(/Promedio 9\.0/i);

    // Switch to Exámenes tab inside CourseDetailView
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Exámenes' }));

    const examsPanel = screen.getByTestId('course-exams-tab-panel');
    expect(
      await within(examsPanel).findByRole('heading', {
        name: /Defensa TP Integrador Motor SQL/i,
      })
    ).toBeInTheDocument();
    expect(within(examsPanel).getByTestId('exams-average-pill')).toHaveTextContent(
      /Promedio 9\.0/i
    );
  });

  it('superimposes exams on CalendarPage (monthly and weekly) and opens exam detail dialog on click', async () => {
    const onSelectCourse = vi.fn();
    const initialDate = new Date(2026, 10, 11); // Wednesday Nov 11, 2026

    render(<CalendarPage onSelectCourse={onSelectCourse} initialDate={initialDate} />);

    // Wait for calendar to load and verify Friday Nov 13 has the exam superimposed
    const examContainer = await screen.findByTestId('calendar-exams-2026-11-13');
    const examButton = within(examContainer).getByRole('button', {
      name: /2° Parcial Teórico-Práctico/i,
    });
    expect(examButton).toBeInTheDocument();

    // Click the exam card to open the detail dialog
    fireEvent.click(examButton);
    expect(
      await screen.findByRole('heading', {
        name: /2° Parcial Teórico-Práctico/i,
      })
    ).toBeInTheDocument();

    // Navigate to the course from the exam dialog
    fireEvent.click(screen.getByRole('button', { name: /Ir a Ingeniería de Software I/i }));
    expect(onSelectCourse).toHaveBeenCalledWith('ing-soft-1');
  });

  it('connects HomePage to live tasks, upcoming exams, and dynamic 7-day week pulse', async () => {
    const onNavigateSection = vi.fn();
    const onSelectCourse = vi.fn();
    const refDate = new Date(2026, 10, 10); // Tuesday Nov 10, 2026

    render(
      <HomePage
        onNavigateSection={onNavigateSection}
        onSelectCourse={onSelectCourse}
        referenceDate={refDate}
      />
    );

    // Wait for live tasks & exams to load
    expect(await screen.findByTestId('home-pending-tasks-counter')).toHaveTextContent(
      '4 pendientes'
    );
    expect(screen.getByTestId('home-upcoming-exams-counter')).toHaveTextContent(
      '3 fechas'
    );
    expect(screen.getByTestId('home-summary-subtitle')).toHaveTextContent(
      /Tenés 4 entregas pendientes y tu próximo examen es en 3 días/i
    );

    // Verify dynamic week pulse on Tuesday (Mar 10) has 1 entrega before completing task-1
    const tuesdayCell = screen.getByTestId('week-pulse-day-Mar');
    expect(tuesdayCell).toHaveTextContent(/2 clases · 1 entrega/i);

    // Verify Friday (Vie 13) shows the exam in the week pulse
    const fridayCell = screen.getByTestId('week-pulse-day-Vie');
    expect(fridayCell).toHaveTextContent(/1 examen/i);

    // Complete task-1 (due on 2026-11-10) with 1 click directly from HomePage
    const taskRowT1 = screen.getByTestId('home-task-row-task-1');
    const checkbox = within(taskRowT1).getByRole('checkbox');
    fireEvent.click(checkbox);

    // Pending count drops to 3 and Tuesday pulse updates dynamically to "2 clases"
    await waitFor(() => {
      expect(screen.getByTestId('home-pending-tasks-counter')).toHaveTextContent(
        '3 pendientes'
      );
    });
    expect(screen.getByTestId('week-pulse-day-Mar')).toHaveTextContent(/^Mar102 clases$/i);
  });
});
