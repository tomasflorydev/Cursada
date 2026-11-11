import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

describe('Cursada Design Skeleton', () => {
  it('renders the sidebar with all main sections and sample Inicio dashboard', () => {
    render(<App />);

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(primaryNav).getByRole('button', { name: /Inicio/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Calendario/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Tareas/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Exámenes/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Notas/i })).toBeInTheDocument();
    expect(within(primaryNav).getByRole('button', { name: /Materias/i })).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Clases de hoy' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Tareas por vencer' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Próximos exámenes' })
    ).toBeInTheDocument();
  });

  it('switches between the 3 Home design variants and navigates across sidebar sections', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'B · Agenda' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Agenda de hoy' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'C · Editorial' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Hoy en la facultad' })
    ).toBeInTheDocument();

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Calendario/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeInTheDocument();

    fireEvent.click(within(primaryNav).getByRole('button', { name: /Notas/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Notas' })).toBeInTheDocument();
  });
});
