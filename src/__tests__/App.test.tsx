import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { resetAllMocks } from '../lib/api/mockClient';

describe('Cursada Stage 0 & Task 1.1', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  it('renders SwissHeader navigation, Inicio layout without Clases de hoy, and navigates to CourseDetailView', async () => {
    render(<App />);

    const banner = screen.getByRole('banner');
    const primaryNav = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });
    expect(within(primaryNav).getByRole('button', { name: 'Inicio' })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: 'Materias' })).toBeInTheDocument();
    expect(
      within(primaryNav).getByRole('button', { name: 'Calendario' })
    ).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: 'Tareas' })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: 'Exámenes' })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: 'Informes' })).toBeInTheDocument();
    expect(
      within(primaryNav).queryByRole('button', { name: /^Notas$/i })
    ).not.toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Ajustes' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Tareas · 4' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Esta semana' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Exámenes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Informes' })
    ).toBeInTheDocument();

    expect(screen.queryByText(/Clases de hoy/i)).not.toBeInTheDocument();

    // Footer lists active courses via listCourses() and navigates on click
    const coursesFooter = screen.getByLabelText('Materias activas');
    const courseBtn = await within(coursesFooter).findByRole('button', {
      name: /Ingeniería de Software I/i,
    });
    fireEvent.click(courseBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Ingeniería de Software I' })
      ).toBeInTheDocument();
    });
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: /← Inicio/i })
    ).toBeInTheDocument();
  });

  it('navigates to Ajustes and creates a manual backup confirming date and location', async () => {
    render(<App />);

    const banner = screen.getByRole('banner');
    fireEvent.click(within(banner).getByRole('button', { name: 'Ajustes' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Datos' })
    ).toBeInTheDocument();

    // Confirms local data directory location is loaded and visible
    expect(await screen.findByText(/com\.cursada\.app/i)).toBeInTheDocument();

    const backupBtn = screen.getByRole('button', { name: /Exportar copia/i });
    fireEvent.click(backupBtn);

    await waitFor(() => {
      expect(screen.getByText(/Copia creada:/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Respaldos disponibles (2)' })
    ).toBeInTheDocument();
  });
});
