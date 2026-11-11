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

  it('switches between the 3 redesigned Home layouts, 3 palettes, 3 fonts and sidebar sections', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Bento con Aire' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Clases de hoy' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agenda con Personalidad' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Agenda de hoy' })).toBeInTheDocument();
    expect(
      screen.getByText(/Ahora · 35 min libres antes de entrar a cursar/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /P2 · Piedra/i }));
    expect(document.documentElement.getAttribute('data-palette')).toBe('p2');

    fireEvent.click(screen.getByRole('button', { name: /T2 · Serif \+ Sans/i }));
    expect(document.documentElement.getAttribute('data-font')).toBe('t2');

    const primaryNav = screen.getByRole('navigation', { name: 'Principal' });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Calendario/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario' })).toBeInTheDocument();
  });
});
