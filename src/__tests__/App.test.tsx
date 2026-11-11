import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('Cursada Design Skeleton', () => {
  it('renders the sidebar with all main sections and Bento con Aire by default', () => {
    render(<App />);

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(primaryNav).getByRole('button', { name: /Inicio/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Calendario/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Tareas/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Exámenes/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Notas/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Materias/i })).toBeInTheDocument();

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

    // Verifies "Clases de hoy" is NOT present
    expect(screen.queryByText(/Clases de hoy/i)).not.toBeInTheDocument();
  });

  it('switches between Bento con Aire and Swiss Editorial layouts', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Swiss Editorial' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Resumen Académico' })
    ).toBeInTheDocument();
    expect(screen.getByText('Entregas por vencer')).toBeInTheDocument();
    expect(screen.getByText('Fechas de examen')).toBeInTheDocument();
    expect(screen.getByText('Cronograma semanal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bento con Aire' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tareas por vencer' })
    ).toBeInTheDocument();
  });
});
