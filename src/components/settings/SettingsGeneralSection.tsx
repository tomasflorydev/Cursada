import { useEffect, useState, type RefObject } from 'react';
import { cursadaClient } from '../../lib/api/client';
import type {
  NotificationDispatchResult,
  NotificationSettings,
  UpdateNotificationSettingsInput,
} from '../../types';
import {
  SwissButton,
  SwissErrorAlert,
  SwissSelect,
  SwissSwitch,
} from '../../ui';

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: true,
  upcomingClassesEnabled: true,
  classLeadMinutes: 15,
  tasksDueTodayEnabled: true,
  upcomingExamsEnabled: true,
  examLeadDays: 2,
};

export interface SettingsGeneralSectionProps {
  sectionRef: RefObject<HTMLElement | null>;
}

/**
 * General settings section managing macOS local reminder preferences and test notifications.
 */
export function SettingsGeneralSection({ sectionRef }: SettingsGeneralSectionProps) {
  const [notifSettings, setNotifSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [isSendingTestNotif, setIsSendingTestNotif] = useState(false);
  const [lastTestNotif, setLastTestNotif] =
    useState<NotificationDispatchResult | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void cursadaClient
      .getNotificationSettings()
      .then((settings) => {
        if (active) setNotifSettings(settings);
      })
      .catch(() => {
        if (active) {
          setNotifError('No se pudieron cargar las preferencias de recordatorios.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleUpdateNotification(
    patch: UpdateNotificationSettingsInput
  ): Promise<void> {
    const previous = notifSettings;
    setNotifSettings({ ...notifSettings, ...patch });
    setNotifError(null);
    try {
      const saved = await cursadaClient.updateNotificationSettings(patch);
      setNotifSettings(saved);
    } catch (err: unknown) {
      setNotifSettings(previous);
      setNotifError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la preferencia de recordatorios.'
      );
    }
  }

  async function handleSendTestNotification(): Promise<void> {
    setIsSendingTestNotif(true);
    setNotifError(null);
    try {
      const result = await cursadaClient.sendTestNotification();
      setLastTestNotif(result);
    } catch (err: unknown) {
      setNotifError(
        err instanceof Error
          ? err.message
          : 'No se pudo enviar la notificación de prueba.'
      );
    } finally {
      setIsSendingTestNotif(false);
    }
  }

  return (
    <section
      ref={sectionRef}
      id="settings-general"
      className="settings-section-block"
      aria-labelledby="settings-general-heading"
    >
      <h2 id="settings-general-heading" className="settings-section-block-head">
        General
      </h2>

      {notifError ? (
        <div style={{ marginBottom: '12px' }}>
          <SwissErrorAlert message={notifError} />
        </div>
      ) : null}

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Recordatorios de macOS</div>
          <div className="settings-row-desc">
            Avisos locales para clases próximas, entregas de hoy y exámenes.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSwitch
            checked={notifSettings.enabled}
            ariaLabel="Activar recordatorios de macOS"
            onChange={(next) => void handleUpdateNotification({ enabled: next })}
          />
          <span className="swiss-meta-md">
            {notifSettings.enabled ? 'Activados' : 'Pausados'}
          </span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Clases próximas</div>
          <div className="settings-row-desc">
            Cuándo avisarte antes del inicio de una cursada.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSwitch
            checked={notifSettings.upcomingClassesEnabled}
            disabled={!notifSettings.enabled}
            ariaLabel="Recordatorios de clases próximas"
            onChange={(next) =>
              void handleUpdateNotification({ upcomingClassesEnabled: next })
            }
          />
          <SwissSelect
            aria-label="Anticipación para clases"
            disabled={!notifSettings.enabled || !notifSettings.upcomingClassesEnabled}
            value={String(notifSettings.classLeadMinutes)}
            onChange={(e) =>
              void handleUpdateNotification({
                classLeadMinutes: Number(e.target.value),
              })
            }
          >
            <option value="10">10 min antes</option>
            <option value="15">15 min antes</option>
            <option value="30">30 min antes</option>
            <option value="60">60 min antes</option>
          </SwissSelect>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Entregas que vencen hoy</div>
          <div className="settings-row-desc">
            Recordatorio diario cuando tenés tareas pendientes para la fecha.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSwitch
            checked={notifSettings.tasksDueTodayEnabled}
            disabled={!notifSettings.enabled}
            ariaLabel="Recordatorios de entregas que vencen hoy"
            onChange={(next) =>
              void handleUpdateNotification({ tasksDueTodayEnabled: next })
            }
          />
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Días de anticipación para exámenes</div>
          <div className="settings-row-desc">
            Ventana previa para parciales, recuperatorios, finales y TPs.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissSwitch
            checked={notifSettings.upcomingExamsEnabled}
            disabled={!notifSettings.enabled}
            ariaLabel="Recordatorios de exámenes próximos"
            onChange={(next) =>
              void handleUpdateNotification({ upcomingExamsEnabled: next })
            }
          />
          <SwissSelect
            aria-label="Días de anticipación para exámenes"
            disabled={!notifSettings.enabled || !notifSettings.upcomingExamsEnabled}
            value={String(notifSettings.examLeadDays)}
            onChange={(e) =>
              void handleUpdateNotification({
                examLeadDays: Number(e.target.value),
              })
            }
          >
            <option value="1">1 día antes</option>
            <option value="2">2 días antes</option>
            <option value="3">3 días antes</option>
            <option value="7">7 días antes</option>
          </SwissSelect>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Probar recordatorio</div>
          <div className="settings-row-desc">
            {lastTestNotif
              ? lastTestNotif.dispatched
                ? `Enviado (${lastTestNotif.mode}): ${lastTestNotif.title}`
                : 'El sistema operativo bloqueó la notificación.'
              : 'Dispará un aviso local de prueba para validar permisos en tu Mac.'}
          </div>
        </div>
        <div className="settings-row-control">
          <SwissButton
            variant="secondary"
            disabled={isSendingTestNotif}
            onClick={() => void handleSendTestNotification()}
          >
            {isSendingTestNotif ? 'Enviando…' : 'Probar notificación'}
          </SwissButton>
        </div>
      </div>
    </section>
  );
}
