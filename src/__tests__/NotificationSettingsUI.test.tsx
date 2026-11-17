import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockGetNotificationSettings } from '../lib/api/mockNotifications';
import { SettingsPage } from '../pages/SettingsPage';

describe('Phase 8 Task 8.2 Frontend: SettingsPage General notifications', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads notification settings, updates switches/lead times, and persists preferences', async () => {
    const updateSpy = vi.spyOn(cursadaClient, 'updateNotificationSettings');

    render(<SettingsPage themeMode="system" onChangeThemeMode={() => {}} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'General' })
    ).toBeInTheDocument();

    const enabledSwitch = screen.getByRole('switch', {
      name: 'Activar recordatorios de macOS',
    });
    const tasksSwitch = screen.getByRole('switch', {
      name: 'Recordatorios de entregas que vencen hoy',
    });
    const classLeadSelect = screen.getByLabelText(
      'Anticipación para clases'
    ) as HTMLSelectElement;
    const examLeadSelect = screen.getByLabelText(
      'Días de anticipación para exámenes'
    ) as HTMLSelectElement;

    await waitFor(() => {
      expect(enabledSwitch).toHaveAttribute('aria-checked', 'true');
      expect(classLeadSelect.value).toBe('15');
      expect(examLeadSelect.value).toBe('2');
    });

    fireEvent.change(classLeadSelect, { target: { value: '30' } });
    fireEvent.change(examLeadSelect, { target: { value: '7' } });
    fireEvent.click(tasksSwitch);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ classLeadMinutes: 30 });
      expect(updateSpy).toHaveBeenCalledWith({ examLeadDays: 7 });
      expect(updateSpy).toHaveBeenCalledWith({ tasksDueTodayEnabled: false });
    });

    expect(await mockGetNotificationSettings()).toEqual({
      enabled: true,
      upcomingClassesEnabled: true,
      classLeadMinutes: 30,
      tasksDueTodayEnabled: false,
      upcomingExamsEnabled: true,
      examLeadDays: 7,
    });
  });

  it('dispatches a test notification from General settings and surfaces feedback', async () => {
    const sendTestSpy = vi.spyOn(cursadaClient, 'sendTestNotification');

    render(<SettingsPage themeMode="system" onChangeThemeMode={() => {}} />);

    const testBtn = screen.getByRole('button', { name: 'Probar notificación' });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(sendTestSpy).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(/Enviado \(simulated\): Recordatorio de prueba · Cursada/i)
    ).toBeInTheDocument();
  });
});
