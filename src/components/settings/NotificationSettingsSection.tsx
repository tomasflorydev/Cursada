import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cursadaClient } from '../../lib/api/client';
import type {
  CheckRemindersResult,
  NotificationDispatchResult,
  NotificationSettings,
  ReminderKind,
} from '../../types/domain';

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  upcomingClassesEnabled: true,
  classLeadMinutes: 15,
  tasksDueTodayEnabled: true,
  upcomingExamsEnabled: true,
  examLeadDays: 2,
};

const CLASS_LEAD_OPTIONS = [10, 15, 30, 60] as const;
const EXAM_LEAD_OPTIONS = [1, 2, 3, 7] as const;

const REMINDER_KIND_LABELS: Record<ReminderKind, string> = {
  upcoming_class: 'Clase próxima',
  task_due_today: 'Entrega hoy',
  upcoming_exam: 'Examen cercano',
};

export function NotificationSettingsSection() {
  const baseId = useId();
  const enabledId = `${baseId}-notifications-enabled`;
  const classesId = `${baseId}-upcoming-classes`;
  const classLeadId = `${baseId}-class-lead-minutes`;
  const tasksId = `${baseId}-tasks-due-today`;
  const examsId = `${baseId}-upcoming-exams`;
  const examLeadId = `${baseId}-exam-lead-days`;

  const isMountedRef = useRef(true);
  const hasUserEditedRef = useRef(false);

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isCheckingReminders, setIsCheckingReminders] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] =
    useState<NotificationDispatchResult | null>(null);
  const [checkResult, setCheckResult] = useState<CheckRemindersResult | null>(
    null
  );

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    void cursadaClient
      .getNotificationSettings()
      .then((loaded) => {
        if (!active || !isMountedRef.current) {
          return;
        }
        if (!hasUserEditedRef.current) {
          setSettings(loaded);
        }
      })
      .catch((err: unknown) => {
        if (!active || !isMountedRef.current) {
          return;
        }
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar las preferencias de notificaciones.'
        );
      })
      .finally(() => {
        if (active && isMountedRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
      isMountedRef.current = false;
    };
  }, []);

  const classLeadOptions = useMemo(() => {
    const values = new Set<number>(CLASS_LEAD_OPTIONS);
    values.add(settings.classLeadMinutes);
    return Array.from(values).sort((a, b) => a - b);
  }, [settings.classLeadMinutes]);

  const examLeadOptions = useMemo(() => {
    const values = new Set<number>(EXAM_LEAD_OPTIONS);
    values.add(settings.examLeadDays);
    return Array.from(values).sort((a, b) => a - b);
  }, [settings.examLeadDays]);

  function updateField<K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ): void {
    hasUserEditedRef.current = true;
    setSaveSuccess(false);
    setErrorMsg(null);
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMsg(null);

    try {
      const updated = await cursadaClient.updateNotificationSettings(settings);
      if (!isMountedRef.current) {
        return;
      }
      setSettings(updated);
      hasUserEditedRef.current = false;
      setSaveSuccess(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar las preferencias de notificaciones.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }

  async function handleSendTest(): Promise<void> {
    setIsSendingTest(true);
    setErrorMsg(null);

    try {
      const result = await cursadaClient.sendTestNotification();
      if (!isMountedRef.current) {
        return;
      }
      setTestResult(result);
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo enviar la notificación de prueba.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSendingTest(false);
      }
    }
  }

  async function handleCheckReminders(): Promise<void> {
    setIsCheckingReminders(true);
    setErrorMsg(null);

    try {
      const result = await cursadaClient.checkDueReminders({ dispatch: true });
      if (!isMountedRef.current) {
        return;
      }
      setCheckResult(result);
    } catch (err: unknown) {
      if (!isMountedRef.current) {
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudieron verificar los recordatorios pendientes.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsCheckingReminders(false);
      }
    }
  }

  return (
    <section
      className="surface-panel settings-section"
      aria-labelledby="settings-notifications-heading"
    >
      <div className="section-heading-bar">
        <div
          className="section-heading-left"
          style={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          <h2 id="settings-notifications-heading" className="section-title">
            Notificaciones y recordatorios
          </h2>
          <span
            className={
              settings.enabled
                ? 'course-status-pill is-active'
                : 'tasks-summary-pill'
            }
          >
            {settings.enabled ? 'Activos' : 'Pausados'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="secondary-button"
            data-testid="send-test-notification-btn"
            disabled={isSendingTest}
            onClick={() => void handleSendTest()}
          >
            {isSendingTest ? 'Enviando...' : 'Probar notificación ahora'}
          </button>

          <button
            type="button"
            className="secondary-button"
            data-testid="check-reminders-btn"
            disabled={isCheckingReminders}
            onClick={() => void handleCheckReminders()}
          >
            {isCheckingReminders
              ? 'Verificando...'
              : 'Verificar recordatorios de hoy'}
          </button>
        </div>
      </div>

      <p className="settings-description">
        Recibí alertas nativas en macOS antes de tus clases, el día de una
        entrega pendiente y en los días previos a un parcial o final. Todo se
        evalúa localmente desde tu base de datos SQLite.
      </p>

      <form
        className="course-form"
        aria-labelledby="settings-notifications-heading"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <label
              htmlFor={enabledId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              <input
                id={enabledId}
                type="checkbox"
                className="task-checkbox"
                style={{ marginBlockStart: 0 }}
                checked={settings.enabled}
                disabled={isLoading || isSaving}
                onChange={(e) => updateField('enabled', e.target.checked)}
              />
              <span>Activar recordatorios locales en macOS</span>
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              opacity: settings.enabled ? 1 : 0.7,
            }}
          >
            <label
              htmlFor={classesId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <input
                id={classesId}
                type="checkbox"
                className="task-checkbox"
                style={{ marginBlockStart: 0 }}
                checked={settings.upcomingClassesEnabled}
                disabled={isLoading || isSaving || !settings.enabled}
                onChange={(e) =>
                  updateField('upcomingClassesEnabled', e.target.checked)
                }
              />
              <span>Recordar próximas clases</span>
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <label htmlFor={classLeadId} className="settings-meta-label">
                Anticipación
              </label>
              <select
                id={classLeadId}
                aria-label="Anticipación de clases"
                className="course-form-select"
                style={{ width: 'auto', minWidth: '140px' }}
                value={settings.classLeadMinutes}
                disabled={
                  isLoading ||
                  isSaving ||
                  !settings.enabled ||
                  !settings.upcomingClassesEnabled
                }
                onChange={(e) =>
                  updateField('classLeadMinutes', Number(e.target.value))
                }
              >
                {classLeadOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutos
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              opacity: settings.enabled ? 1 : 0.7,
            }}
          >
            <label
              htmlFor={tasksId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <input
                id={tasksId}
                type="checkbox"
                className="task-checkbox"
                style={{ marginBlockStart: 0 }}
                checked={settings.tasksDueTodayEnabled}
                disabled={isLoading || isSaving || !settings.enabled}
                onChange={(e) =>
                  updateField('tasksDueTodayEnabled', e.target.checked)
                }
              />
              <span>Recordar entregas que vencen hoy</span>
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              opacity: settings.enabled ? 1 : 0.7,
            }}
          >
            <label
              htmlFor={examsId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              <input
                id={examsId}
                type="checkbox"
                className="task-checkbox"
                style={{ marginBlockStart: 0 }}
                checked={settings.upcomingExamsEnabled}
                disabled={isLoading || isSaving || !settings.enabled}
                onChange={(e) =>
                  updateField('upcomingExamsEnabled', e.target.checked)
                }
              />
              <span>Recordar exámenes cercanos</span>
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <label htmlFor={examLeadId} className="settings-meta-label">
                Anticipación
              </label>
              <select
                id={examLeadId}
                aria-label="Anticipación de exámenes"
                className="course-form-select"
                style={{ width: 'auto', minWidth: '140px' }}
                value={settings.examLeadDays}
                disabled={
                  isLoading ||
                  isSaving ||
                  !settings.enabled ||
                  !settings.upcomingExamsEnabled
                }
                onChange={(e) =>
                  updateField('examLeadDays', Number(e.target.value))
                }
              >
                {examLeadOptions.map((days) => (
                  <option key={days} value={days}>
                    {days} {days === 1 ? 'día' : 'días'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {errorMsg ? (
          <div role="alert" className="settings-alert is-error">
            {errorMsg}
          </div>
        ) : null}

        {saveSuccess ? (
          <div
            role="status"
            aria-live="polite"
            className="settings-alert is-success"
          >
            <strong>Preferencias de notificaciones actualizadas</strong>
            <span>
              {settings.enabled
                ? `Clases: ${settings.classLeadMinutes} min · Exámenes: ${settings.examLeadDays} ${settings.examLeadDays === 1 ? 'día' : 'días'}`
                : 'Los recordatorios locales quedaron pausados.'}
            </span>
          </div>
        ) : null}

        {testResult ? (
          testResult.dispatched ? (
            <div
              role="status"
              aria-live="polite"
              className="settings-alert is-success"
              data-testid="test-notification-status"
            >
              <strong>Notificación de prueba enviada</strong>
              <span>
                {testResult.title} · {testResult.body}
              </span>
            </div>
          ) : (
            <div
              role="alert"
              className="settings-alert is-error"
              data-testid="test-notification-status"
            >
              Las notificaciones nativas no están habilitadas o soportadas en
              este sistema.
            </div>
          )
        ) : null}

        {checkResult ? (
          <div
            role="status"
            aria-live="polite"
            className="settings-meta-box"
            style={{ gap: '10px' }}
            data-testid="reminders-check-result"
          >
            {checkResult.candidates.length === 0 ? (
              <>
                <span className="settings-meta-label">
                  Sin recordatorios próximos por el momento
                </span>
                <p className="settings-description">
                  {checkResult.settings.enabled
                    ? 'No se detectaron clases próximas, entregas pendientes para hoy ni exámenes cercanos dentro de la anticipación configurada.'
                    : 'Los recordatorios están desactivados en tus preferencias.'}
                </p>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="settings-meta-label">
                    Recordatorios detectados hoy ({checkResult.candidates.length}
                    )
                  </span>
                  <span className="section-counter">
                    Notificados ahora: {checkResult.dispatchedCount}
                  </span>
                </div>

                <ul
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                  }}
                >
                  {checkResult.candidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <strong
                          style={{
                            fontSize: '0.84rem',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {candidate.title}
                        </strong>
                        <span className="section-counter">
                          {REMINDER_KIND_LABELS[candidate.kind]}
                        </span>
                      </div>
                      <span className="settings-description">
                        {candidate.body}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="primary-button"
            disabled={isLoading || isSaving}
          >
            {isSaving ? 'Guardando...' : 'Guardar preferencias'}
          </button>
        </div>
      </form>
    </section>
  );
}
