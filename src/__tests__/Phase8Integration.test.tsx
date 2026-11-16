import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { resetAllMocks } from '../lib/api/mockClient';

describe('Phase 8 Integration: Cmd+K Palette, macOS Shortcuts & Notifications Settings', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens Cmd+K palette, searches a note accent-insensitively, and jumps directly to the course 3-pane notebook with that note open', async () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Inicio' })
    ).toBeInTheDocument();

    // Trigger Cmd+K
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const dialog = await screen.findByTestId('command-palette-dialog');
    const searchInput = within(dialog).getByTestId('command-palette-input');

    // Wait for async palette data to load and filter for a note
    await within(dialog).findAllByText(/Diseño de Sistemas/i);
    fireEvent.change(searchInput, { target: { value: 'Strategy State' } });

    await waitFor(() => {
      expect(
        within(dialog).getByText(
          /Comparativa práctica: Strategy vs\. State en el dominio de envíos/i
        )
      ).toBeInTheDocument();
    });

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(
        screen.queryByTestId('command-palette-dialog')
      ).not.toBeInTheDocument();
    });

    // Verifies navigation to Diseño de Sistemas -> 3-pane notebook -> note selected
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Diseño de Sistemas',
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nota')).toHaveValue(
        'Comparativa práctica: Strategy vs. State en el dominio de envíos'
      );
    });
  });

  it('supports Cmd+1..6, Cmd+, section shortcuts and contextual Cmd+N creation', async () => {
    render(<App />);

    // Cmd+2 -> Materias, then Cmd+N opens Nueva materia modal
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Materias' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    const courseDialog = await screen.findByRole('dialog', {
      name: /Nueva materia/i,
    });
    expect(courseDialog).toBeInTheDocument();
    fireEvent.click(within(courseDialog).getByRole('button', { name: 'Cancelar' }));

    // Cmd+3 -> Calendario
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    expect(
      await screen.findByTestId('calendar-period-label')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Grilla semanal de cursada' })
    ).toBeInTheDocument();

    // Cmd+4 -> Tareas, then Cmd+N focuses quick-add task input
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tareas' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nueva tarea')).toHaveFocus();
    });

    // Cmd+5 -> Exámenes, then Cmd+N opens new exam form
    fireEvent.keyDown(window, { key: '5', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Exámenes' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByRole('region', { name: 'Nuevo examen' })
    ).toBeInTheDocument();

    // Cmd+6 -> Informes, then Cmd+N opens inline report generator form
    fireEvent.keyDown(window, { key: '6', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Informes' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByLabelText('Tipo de informe')
    ).toBeInTheDocument();

    // Cmd+, -> Ajustes and inspect General notifications settings
    fireEvent.keyDown(window, { key: ',', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ajustes' })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'General',
      })
    ).toBeInTheDocument();

    const testNotifBtn = screen.getByRole('button', {
      name: 'Probar notificación',
    });
    fireEvent.click(testNotifBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Recordatorio de prueba · Cursada/i)
      ).toBeInTheDocument();
    });

    const notifSwitch = screen.getByRole('switch', {
      name: 'Activar recordatorios de macOS',
    });
    expect(notifSwitch).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(notifSwitch);
    await waitFor(() => {
      expect(notifSwitch).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByText('Pausados')).toBeInTheDocument();
    });

    // Cmd+1 -> Inicio
    fireEvent.keyDown(window, { key: '1', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Inicio' })
    ).toBeInTheDocument();
  });

  it('opens Cmd+K palette, jumps to a Materia, and executes contextual Cmd+N inside its 3-pane notebook', async () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const dialog = await screen.findByTestId('command-palette-dialog');
    const searchInput = within(dialog).getByTestId('command-palette-input');
    fireEvent.change(searchInput, { target: { value: 'Ingenieria de Software' } });

    await waitFor(() => {
      expect(
        within(dialog).getByText('Ingeniería de Software I')
      ).toBeInTheDocument();
    });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Ingeniería de Software I',
        })
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nota')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'n', metaKey: true });

    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nota')).toHaveValue(
        'Nueva nota'
      );
    });
  });
});
