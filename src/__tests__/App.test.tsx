import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('Cursada Design Skeleton', () => {
  it('renders the sidebar with all main sections and Bento con Aire as the confirmed layout', () => {
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
      screen.getByRole('heading', { level: 2, name: 'Calendario de la semana' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tareas por vencer' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Próximos exámenes' })
    ).toBeInTheDocument();

    // Verifies the weekly calendar hero includes the today highlight
    expect(screen.getByText('Hoy')).toBeInTheDocument();

    // Verifies "Clases de hoy" is NOT present on Inicio
    expect(screen.queryByText(/Clases de hoy/i)).not.toBeInTheDocument();
  });

  it('allows completing tasks and navigating between views', () => {
    render(<App />);

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Calendario/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeInTheDocument();

    fireEvent.click(within(primaryNav).getByRole('button', { name: /Inicio/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
  });
});
