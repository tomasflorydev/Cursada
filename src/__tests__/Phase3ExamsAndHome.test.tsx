import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { CalendarPage } from '../pages/CalendarPage';
import { ExamsPage } from '../pages/ExamsPage';
import { HomePage } from '../pages/HomePage';

describe('Phase 3: Exams CRUD, Average Calculation, Calendar Overlay, and Live HomePage', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  it('creates an exam, loads a grade (scale 1-10), updates overall and course averages, and generates a study guide', async () => {
    const onSelectCourse = vi.fn();
    const onOpenReport = vi.fn();
    const refDate = new Date(2026, 10, 10); // Tuesday Nov 10, 2026

    render(
      <ExamsPage
        onSelectCourse={onSelectCourse}
        onOpenReport={onOpenReport}
        referenceDate={refDate}
      />
    );

    // Wait for initial upcoming exam and Temas progress bar to appear
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: /2° Parcial Teórico-Práctico/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', {
        name: /Notas repasadas de Ingeniería de Software I/i,
      })
    ).toBeInTheDocument();

    // Open new exam form and create an ungraded exam for Base de Datos II
    fireEvent.click(screen.getByRole('button', { name: /\+ Nuevo examen/i }));

    fireEvent.change(screen.getByLabelText(/^Título$/i), {
      target: { value: 'Defensa TP Integrador Motor SQL' },
    });
    fireEvent.change(screen.getByLabelText(/^Materia$/i), {
      target: { value: 'bd-2' },
    });
    fireEvent.change(screen.getByLabelText(/^Instancia$/i), {
      target: { value: 'tp' },
    });
    fireEvent.change(screen.getByLabelText(/^Fecha$/i), {
      target: { value: '2026-11-20' },
    });
    fireEvent.change(screen.getByLabelText(/Temas a evaluar/i), {
      target: { value: 'Optimización SQL, planes de ejecución y concurrencia.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Agendar examen/i }));

    const createdHeading = await screen.findByRole('heading', {
      level: 2,
      name: /Defensa TP Integrador Motor SQL/i,
    });
    const createdRow = createdHeading.closest('[data-exam-id]') as HTMLElement;
    expect(createdRow).not.toBeNull();
    expect(within(createdRow).getByLabelText('Faltan 10 días')).toBeInTheDocument();

    // Load a grade inline via Cargar nota (10) -> moves to Anteriores and updates average
    fireEvent.click(within(createdRow).getByRole('button', { name: 'Cargar nota' }));
    fireEvent.change(
      within(createdRow).getByLabelText('Nota para Defensa TP Integrador Motor SQL'),
      { target: { value: '10' } }
    );
    fireEvent.click(within(createdRow).getByRole('button', { name: 'Guardar' }));

    // Initial 5 graded exams sum to 41.5 + 10 = 51.5 / 6 = 8.58 -> 8.6
    await waitFor(() => {
      expect(
        screen.getByText(/Anteriores: 6 · Promedio general: 8\.6/i)
      ).toBeInTheDocument();
    });

    // Open Anteriores section and verify the graded exam and course link
    fireEvent.click(screen.getByRole('button', { name: /Ver anteriores/i }));
    const pastSection = await screen.findByRole('region', {
      name: 'Exámenes anteriores',
    });
    expect(
      within(pastSection).getByText('Defensa TP Integrador Motor SQL')
    ).toBeInTheDocument();
    expect(within(pastSection).getByText('Nota: 10.0')).toBeInTheDocument();
    expect(
      within(pastSection).getByText(/Promedio general: 8\.6/i)
    ).toBeInTheDocument();

    // Verify course-level persisted exams for Base de Datos II (8.0 + 10.0 -> 9.0 avg)
    const bd2Exams = await cursadaClient.listExams({ courseId: 'bd-2' });
    const bd2Graded = bd2Exams
      .map((e) => e.grade)
      .filter((g): g is number => typeof g === 'number');
    expect(bd2Graded).toEqual([8, 10]);
    expect(
      bd2Graded.reduce((acc, g) => acc + g, 0) / bd2Graded.length
    ).toBe(9);

    // Generate study guide for the first upcoming exam
    const guideButtons = screen.getAllByRole('button', {
      name: 'Generar guía de estudio',
    });
    fireEvent.click(guideButtons[0]);
    await waitFor(() => {
      expect(onOpenReport).toHaveBeenCalledTimes(1);
    });
  });

  it('superimposes exams on CalendarPage (weekly Entregas band and monthly grid) and navigates on click', async () => {
    const onSelectCourse = vi.fn();
    const initialDate = new Date(2026, 10, 11); // Wednesday Nov 11, 2026

    const { rerender } = render(
      <CalendarPage onSelectCourse={onSelectCourse} initialDate={initialDate} />
    );

    // Weekly view (default) shows exam inside Friday Nov 13 Entregas cell
    const weekGrid = await screen.findByLabelText('Grilla semanal de cursada');
    const fridayCell = weekGrid.querySelector(
      '.calendar-deliverable-cell[data-date="2026-11-13"]'
    ) as HTMLElement;
    expect(fridayCell).not.toBeNull();

    const weeklyExamButton = await within(fridayCell).findByRole('button', {
      name: /Parcial · 2° Parcial Teórico-Práctico/i,
    });
    fireEvent.click(weeklyExamButton);
    expect(onSelectCourse).toHaveBeenCalledWith('ing-soft-1');

    // Switch to Monthly view and verify Nov 13 day cell + agenda overlay
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    const monthSection = await screen.findByLabelText('Calendario mensual de cursada');
    const nov13MonthCell = monthSection.querySelector(
      '.calendar-month-cell[data-date="2026-11-13"]'
    ) as HTMLElement;
    expect(nov13MonthCell).not.toBeNull();
    fireEvent.click(nov13MonthCell);

    const monthlyExamBtn = await within(monthSection).findByRole('button', {
      name: /2° Parcial Teórico-Práctico/i,
    });
    fireEvent.click(monthlyExamBtn);
    expect(onSelectCourse).toHaveBeenCalledTimes(2);
    expect(onSelectCourse).toHaveBeenLastCalledWith('ing-soft-1');

    // When onNavigateSection is provided, clicking an exam navigates to Examenes
    const onNavigateSection = vi.fn();
    rerender(
      <CalendarPage
        onSelectCourse={onSelectCourse}
        onNavigateSection={onNavigateSection}
        initialDate={initialDate}
      />
    );
    fireEvent.click(
      within(monthSection).getByRole('button', {
        name: /2° Parcial Teórico-Práctico/i,
      })
    );
    expect(onNavigateSection).toHaveBeenCalledWith('examenes');
  });

  it('connects HomePage to live tasks, weekly classes, upcoming exams, latest report, and course footer', async () => {
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

    // Big day number and live summary
    expect(document.querySelector('.home-day-number')).toHaveTextContent('10');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Tareas · 4' })
    ).toBeInTheDocument();
    expect(document.querySelector('.home-summary')).toHaveTextContent(
      /Tu próxima clase es Diseño de Sistemas hoy a las 14:00\. Hoy tenés 4 tareas abiertas y 2 informes listos para repasar\./i
    );

    // Upcoming exams section displays 3 days left for Ingeniería de Software I
    const examsSection = screen.getByRole('region', { name: 'Próximos exámenes' });
    expect(
      within(examsSection).getByText(/Ingeniería de Software I · Parcial/i)
    ).toBeInTheDocument();
    expect(
      within(examsSection).getByText(/Vie 13 nov · 18:30/i)
    ).toBeInTheDocument();

    // Latest report section
    const reportSection = screen.getByRole('region', { name: 'Informe listo' });
    expect(
      within(reportSection).getByText(/Resumen para el parcial de Base de Datos/i)
    ).toBeInTheDocument();

    // Completing task-1 via API updates HomePage live via DATA_CHANGED_EVENT
    await cursadaClient.toggleTaskStatus('task-1');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Tareas · 3' })
      ).toBeInTheDocument();
    });
    expect(document.querySelector('.home-summary')).toHaveTextContent(
      /Hoy tenés 3 tareas abiertas/i
    );

    // Navigation callbacks from HomePage sections and footer
    fireEvent.click(screen.getByRole('button', { name: 'Todas →' }));
    expect(onNavigateSection).toHaveBeenCalledWith('tareas');

    fireEvent.click(screen.getByRole('button', { name: 'Ver todos →' }));
    expect(onNavigateSection).toHaveBeenCalledWith('examenes');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir informe →' }));
    expect(onNavigateSection).toHaveBeenCalledWith('informes', {
      reportId: 'report-bd2-parcial',
    });

    const coursesFooter = screen.getByLabelText('Materias activas');
    fireEvent.click(
      within(coursesFooter).getByRole('button', {
        name: /Ingeniería de Software I/i,
      })
    );
    expect(onSelectCourse).toHaveBeenCalledWith('ing-soft-1');
  });
});
