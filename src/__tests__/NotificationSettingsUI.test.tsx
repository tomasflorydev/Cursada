import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettingsSection } from '../components/settings/NotificationSettingsSection';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockGetNotificationSettings } from '../lib/api/mockNotifications';

describe('Phase 8 Task 8.2 Frontend: NotificationSettingsSection', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads notification settings, updates lead times, and persists preferences', async () => {
    const updateSpy = vi.spyOn(cursadaClient, 'updateNotificationSettings');

    render(<NotificationSettingsSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Notificaciones y recordatorios',
      })
    ).toBeInTheDocument();

    const enabledCheckbox = screen.getByLabelText(
      'Activar recordatorios locales en macOS'
    ) as HTMLInputElement;
    const classesCheckbox = screen.getByLabelText(
      'Recordar próximas clases'
    ) as HTMLInputElement;
    const tasksCheckbox = screen.getByLabelText(
      'Recordar entregas que vencen hoy'
    ) as HTMLInputElement;
    const examsCheckbox = screen.getByLabelText(
      'Recordar exámenes cercanos'
    ) as HTMLInputElement;
    const classLeadSelect = screen.getByLabelText(
      'Anticipación de clases'
    ) as HTMLSelectElement;
    const examLeadSelect = screen.getByLabelText(
      'Anticipación de exámenes'
    ) as HTMLSelectElement;

    await waitFor(() => {
      expect(enabledCheckbox).not.toBeDisabled();
    });

    expect(enabledCheckbox.checked).toBe(true);
    expect(classesCheckbox.checked).toBe(true);
    expect(tasksCheckbox.checked).toBe(true);
    expect(examsCheckbox.checked).toBe(true);
    expect(classLeadSelect.value).toBe('15');
    expect(examLeadSelect.value).toBe('2');

    fireEvent.change(classLeadSelect, { target: { value: '30' } });
    fireEvent.change(examLeadSelect, { target: { value: '7' } });
    fireEvent.click(tasksCheckbox);

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar preferencias' })
    );

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({
        enabled: true,
        upcomingClassesEnabled: true,
        classLeadMinutes: 30,
        tasksDueTodayEnabled: false,
        upcomingExamsEnabled: true,
        examLeadDays: 7,
      });
    });

    expect(
      await screen.findByText('Preferencias de notificaciones actualizadas')
    ).toBeInTheDocument();

    expect(await mockGetNotificationSettings()).toEqual({
      enabled: true,
      upcomingClassesEnabled: true,
      classLeadMinutes: 30,
      tasksDueTodayEnabled: false,
      upcomingExamsEnabled: true,
      examLeadDays: 7,
    });
  });

  it('dispatches a test notification and checks due reminders on demand', async () => {
    const sendTestSpy = vi.spyOn(cursadaClient, 'sendTestNotification');
    const checkRemindersSpy = vi.spyOn(cursadaClient, 'checkDueReminders');

    render(<NotificationSettingsSection />);

    await waitFor(() => {
      expect(
        screen.getByTestId('send-test-notification-btn')
      ).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('send-test-notification-btn'));

    await waitFor(() => {
      expect(sendTestSpy).toHaveBeenCalledTimes(1);
    });

    const testStatus = await screen.findByTestId('test-notification-status');
    expect(testStatus).toHaveTextContent('Notificación de prueba enviada');
    expect(testStatus).toHaveTextContent('Recordatorio de prueba · Cursada');

    // Mock checkDueReminders returning both empty and non-empty results
    checkRemindersSpy.mockResolvedValueOnce({
      evaluatedAt: '2026-11-16T14:00:00.000Z',
      settings: await mockGetNotificationSettings(),
      candidates: [],
      dispatchedCount: 0,
      results: [],
    });

    fireEvent.click(screen.getByTestId('check-reminders-btn'));

    await waitFor(() => {
      expect(checkRemindersSpy).toHaveBeenCalledWith({ dispatch: true });
    });

    const emptyBox = await screen.findByTestId('reminders-check-result');
    expect(emptyBox).toHaveTextContent(/sin recordatorios próximos/i);

    checkRemindersSpy.mockResolvedValueOnce({
      evaluatedAt: '2026-11-16T14:00:00.000Z',
      settings: await mockGetNotificationSettings(),
      candidates: [
        {
          id: 'task:t1:2026-11-16',
          kind: 'task_due_today',
          title: 'Entrega de hoy: TP Final de Arquitectura',
          body: 'Materia: Diseño de Sistemas',
          courseId: 'diseno-sistemas',
          courseName: 'Diseño de Sistemas',
          referenceIso: '2026-11-16',
        },
      ],
      dispatchedCount: 1,
      results: [
        {
          supported: true,
          dispatched: true,
          title: 'Entrega de hoy: TP Final de Arquitectura',
          body: 'Materia: Diseño de Sistemas',
          dispatchedAt: '2026-11-16T14:00:00.000Z',
          mode: 'simulated',
        },
      ],
    });

    fireEvent.click(screen.getByTestId('check-reminders-btn'));

    const detectedBox = await screen.findByTestId('reminders-check-result');
    await waitFor(() => {
      expect(
        within(detectedBox).getByText(
          'Entrega de hoy: TP Final de Arquitectura'
        )
      ).toBeInTheDocument();
    });
    expect(
      within(detectedBox).getByText('Materia: Diseño de Sistemas')
    ).toBeInTheDocument();
    expect(detectedBox).toHaveTextContent('Notificados ahora: 1');
  });
});
