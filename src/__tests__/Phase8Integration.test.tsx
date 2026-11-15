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

  it('opens Cmd+K palette, searches a note accent-insensitively, and jumps directly to the course Notas tab with that note open', async () => {
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

    // Verifies navigation to Diseño de Sistemas -> Notas tab -> note selected
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Diseño de Sistemas',
      })
    ).toBeInTheDocument();

    const notesPanel = await screen.findByTestId('course-notes-tab-panel');
    await waitFor(() => {
      expect(
        within(notesPanel).getByLabelText('Título de la nota')
      ).toHaveValue(
        'Comparativa práctica: Strategy vs. State en el dominio de envíos'
      );
    });
  });

  it('supports Cmd+2..5, Cmd+, section shortcuts and contextual Cmd+N creation', async () => {
    render(<App />);

    // Cmd+2 -> Calendario
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Calendario' })
    ).toBeInTheDocument();

    // Cmd+3 -> Tareas, then Cmd+N opens new task form
    fireEvent.keyDown(window, { key: '3', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tareas' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByRole('heading', { name: 'Nueva tarea' })
    ).toBeInTheDocument();

    // Cmd+4 -> Exámenes, then Cmd+N opens new exam form
    fireEvent.keyDown(window, { key: '4', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Exámenes' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByRole('heading', { name: 'Agendar examen' })
    ).toBeInTheDocument();

    // Cmd+5 -> Materias, then Cmd+N opens new course modal
    fireEvent.keyDown(window, { key: '5', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Materias' })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(
      await screen.findByRole('dialog', { name: /Nueva materia/i })
    ).toBeInTheDocument();

    // Cmd+, -> Ajustes and inspect NotificationSettingsSection
    fireEvent.keyDown(window, { key: ',', metaKey: true });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ajustes' })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Notificaciones y recordatorios/i,
      })
    ).toBeInTheDocument();

    const testNotifBtn = screen.getByTestId('send-test-notification-btn');
    fireEvent.click(testNotifBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Notificación de prueba enviada/i)
      ).toBeInTheDocument();
    });

    const checkRemindersBtn = screen.getByTestId('check-reminders-btn');
    fireEvent.click(checkRemindersBtn);

    await waitFor(() => {
      expect(screen.getByTestId('reminders-check-result')).toBeInTheDocument();
    });
  });

  it('opens Cmd+K palette from the Sidebar trigger and executes contextual Cmd+N inside a course Notas tab', async () => {
    render(<App />);

    // Open palette via sidebar trigger button
    const sidebarTrigger = screen.getByTestId('sidebar-command-palette-trigger');
    fireEvent.click(sidebarTrigger);

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

    // Switch to Notas tab and press Cmd+N to create a new note
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Notas' }));

    const notesPanel = await screen.findByTestId('course-notes-tab-panel');
    await waitFor(() => {
      expect(
        within(notesPanel).getByLabelText('Título de la nota')
      ).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'n', metaKey: true });

    await waitFor(() => {
      expect(
        within(notesPanel).getByLabelText('Título de la nota')
      ).toHaveValue('Nuevo apunte');
    });
  });
});
