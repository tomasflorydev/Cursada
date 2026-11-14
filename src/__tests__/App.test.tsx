import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { resetAllMocks } from '../lib/api/mockClient';

describe('Cursada Stage 0 & Task 1.1', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  it('renders the sidebar with all main sections including Ajustes and Bento con Aire on Inicio', async () => {
    render(<App />);

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(primaryNav).getByRole('button', { name: /Inicio/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Calendario/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Tareas/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Exámenes/i })).toBeInTheDocument();
    expect(within(primaryNav).queryByRole('button', { name: /Notas/i })).not.toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Materias/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Ajustes/i })).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tareas por vencer' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Próximos exámenes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Pulso de la semana' })
    ).toBeInTheDocument();

    expect(screen.queryByText(/Clases de hoy/i)).not.toBeInTheDocument();

    // Sidebar lists courses via listCourses() and navigates on click
    const coursesNav = screen.getByRole('navigation', { name: 'Materias en curso' });
    const courseBtn = await within(coursesNav).findByRole('button', {
      name: /Ingeniería de Software I/i,
    });
    fireEvent.click(courseBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Ingeniería de Software I' })
      ).toBeInTheDocument();
    });
  });

  it('navigates to Ajustes and creates a manual backup confirming date and location', async () => {
    render(<App />);

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Ajustes/i }));

    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Datos y Backups' })
    ).toBeInTheDocument();

    const backupBtn = screen.getByRole('button', { name: /Crear backup ahora/i });
    fireEvent.click(backupBtn);

    await waitFor(() => {
      expect(screen.getByText(/Backup creado correctamente/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Ubicación:/i)).toBeInTheDocument();
  });
});
