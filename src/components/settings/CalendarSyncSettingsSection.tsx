import { useEffect, useId, useRef, useState } from 'react';
import { cursadaClient } from '../../lib/api/client';
import '../../styles/calendar-sync.css';
import type {
  CalendarFeed,
  ExportIcsResult,
  GoogleCalendarSyncConfig,
  GoogleCalendarSyncResult,
} from '../../types/domain';
import { SwissButton, SwissErrorAlert, SwissSwitch } from '../../ui';

const DEFAULT_GOOGLE_CONFIG: GoogleCalendarSyncConfig = {
  clientId: '',
  connectedEmail: null,
  isConnected: false,
  targetCalendarId: 'primary',
  autoSyncEnabled: false,
  lastSyncedAt: null,
  lastSyncSummary: null,
};

function formatSyncTimestamp(iso: string | null): string {
  if (!iso) {
    return 'Nunca';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function CalendarSyncSettingsSection() {
  const baseId = useId();
  const headingId = `${baseId}-calendar-sync-heading`;
  const feedNameId = `${baseId}-feed-name`;
  const feedUrlId = `${baseId}-feed-url`;
  const clientIdInputId = `${baseId}-google-client-id`;
  const calendarIdInputId = `${baseId}-google-calendar-id`;

  const isMountedRef = useRef(true);

  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [googleConfig, setGoogleConfig] =
    useState<GoogleCalendarSyncConfig>(DEFAULT_GOOGLE_CONFIG);

  const [feedNameInput, setFeedNameInput] = useState('');
  const [feedUrlInput, setFeedUrlInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [calendarIdInput, setCalendarIdInput] = useState('primary');

  const [isLoading, setIsLoading] = useState(true);
  const [isExportingIcs, setIsExportingIcs] = useState(false);
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [isSyncingFeeds, setIsSyncingFeeds] = useState(false);
  const [removingFeedId, setRemovingFeedId] = useState<string | null>(null);
  const [isSavingGoogleConfig, setIsSavingGoogleConfig] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportIcsResult | null>(null);
  const [feedNotice, setFeedNotice] = useState<string | null>(null);
  const [lastGoogleSync, setLastGoogleSync] =
    useState<GoogleCalendarSyncResult | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    void Promise.allSettled([
      cursadaClient.listCalendarFeeds(),
      cursadaClient.getGoogleCalendarConfig(),
    ]).then(([feedsRes, configRes]) => {
      if (!active || !isMountedRef.current) {
        return;
      }

      if (feedsRes.status === 'fulfilled') {
        setFeeds(feedsRes.value);
      } else {
        setErrorMsg('No se pudieron cargar las suscripciones .ics.');
      }

      if (configRes.status === 'fulfilled') {
        setGoogleConfig(configRes.value);
        setClientIdInput(configRes.value.clientId);
        setCalendarIdInput(configRes.value.targetCalendarId || 'primary');
      } else {
        setErrorMsg('No se pudo cargar la configuración de Google Calendar.');
      }

      setIsLoading(false);
    });

    return () => {
      active = false;
      isMountedRef.current = false;
    };
  }, []);

  async function handleExportIcs(): Promise<void> {
    setIsExportingIcs(true);
    setErrorMsg(null);
    try {
      const result = await cursadaClient.exportCalendarIcs({
        includeSchedules: true,
        includeTasks: true,
        includeExams: true,
      });
      if (!isMountedRef.current) return;
      setExportResult(result);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo exportar el calendario .ics.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsExportingIcs(false);
      }
    }
  }

  async function handleAddFeed(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();
    const name = feedNameInput.trim();
    const url = feedUrlInput.trim();

    if (!name) {
      setErrorMsg('Ingresá un nombre para la suscripción .ics.');
      return;
    }
    if (!url) {
      setErrorMsg('Pegá la URL privada .ics de tu calendario.');
      return;
    }

    setIsAddingFeed(true);
    setErrorMsg(null);
    setFeedNotice(null);

    try {
      const created = await cursadaClient.addCalendarFeed({ name, url });
      if (!isMountedRef.current) return;
      setFeeds((prev) => [...prev, created]);
      setFeedNameInput('');
      setFeedUrlInput('');
      setFeedNotice(
        `Suscripción "${created.name}" agregada (${created.eventsCount} eventos).`
      );
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo agregar la suscripción .ics.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsAddingFeed(false);
      }
    }
  }

  async function handleSyncFeeds(): Promise<void> {
    setIsSyncingFeeds(true);
    setErrorMsg(null);
    setFeedNotice(null);
    try {
      const updated = await cursadaClient.syncCalendarFeeds();
      if (!isMountedRef.current) return;
      setFeeds(updated);
      setFeedNotice(
        updated.length === 0
          ? 'No hay suscripciones activas para actualizar.'
          : `Feeds actualizados (${updated.length}).`
      );
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudieron actualizar las suscripciones .ics.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSyncingFeeds(false);
      }
    }
  }

  async function handleRemoveFeed(feedId: string): Promise<void> {
    setRemovingFeedId(feedId);
    setErrorMsg(null);
    setFeedNotice(null);
    try {
      await cursadaClient.removeCalendarFeed(feedId);
      if (!isMountedRef.current) return;
      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo quitar la suscripción .ics.'
      );
    } finally {
      if (isMountedRef.current) {
        setRemovingFeedId(null);
      }
    }
  }

  async function handleSaveGoogleConfig(): Promise<void> {
    setIsSavingGoogleConfig(true);
    setErrorMsg(null);
    try {
      const updated = await cursadaClient.updateGoogleCalendarConfig({
        clientId: clientIdInput.trim(),
        targetCalendarId: calendarIdInput.trim() || 'primary',
      });
      if (!isMountedRef.current) return;
      setGoogleConfig(updated);
      setClientIdInput(updated.clientId);
      setCalendarIdInput(updated.targetCalendarId);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la configuración de Google Calendar.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSavingGoogleConfig(false);
      }
    }
  }

  async function handleToggleAutoSync(next: boolean): Promise<void> {
    const previous = googleConfig;
    setGoogleConfig({ ...googleConfig, autoSyncEnabled: next });
    setErrorMsg(null);
    try {
      const updated = await cursadaClient.updateGoogleCalendarConfig({
        autoSyncEnabled: next,
      });
      if (!isMountedRef.current) return;
      setGoogleConfig(updated);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setGoogleConfig(previous);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar la sincronización automática.'
      );
    }
  }

  async function handleConnectGoogle(): Promise<void> {
    setIsConnectingGoogle(true);
    setErrorMsg(null);
    try {
      const trimmedCalId = calendarIdInput.trim() || 'primary';
      if (trimmedCalId !== googleConfig.targetCalendarId) {
        await cursadaClient.updateGoogleCalendarConfig({
          targetCalendarId: trimmedCalId,
        });
      }
      const connected = await cursadaClient.connectGoogleCalendar({
        clientId: clientIdInput.trim() || undefined,
      });
      if (!isMountedRef.current) return;
      setGoogleConfig(connected);
      setClientIdInput(connected.clientId);
      setCalendarIdInput(connected.targetCalendarId);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar la cuenta de Google.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsConnectingGoogle(false);
      }
    }
  }

  async function handleDisconnectGoogle(): Promise<void> {
    setIsConnectingGoogle(true);
    setErrorMsg(null);
    try {
      const disconnected = await cursadaClient.disconnectGoogleCalendar();
      if (!isMountedRef.current) return;
      setGoogleConfig(disconnected);
      setLastGoogleSync(null);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo desconectar la cuenta de Google.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsConnectingGoogle(false);
      }
    }
  }

  async function handleSyncGoogleNow(): Promise<void> {
    setIsSyncingGoogle(true);
    setErrorMsg(null);
    try {
      const result = await cursadaClient.syncGoogleCalendarNow();
      if (!isMountedRef.current) return;
      setLastGoogleSync(result);
      setGoogleConfig((prev) => ({
        ...prev,
        lastSyncedAt: result.syncedAt,
        lastSyncSummary: result.summary,
      }));
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo sincronizar con Google Calendar.'
      );
    } finally {
      if (isMountedRef.current) {
        setIsSyncingGoogle(false);
      }
    }
  }

  const syncSummaryText =
    lastGoogleSync?.summary ?? googleConfig.lastSyncSummary;

  return (
    <section
      id="settings-calendar-sync"
      className="settings-section-block calendar-sync-section"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="settings-section-block-head">
        Sincronización de Calendario
      </h2>

      {errorMsg ? (
        <div style={{ marginBottom: '12px' }}>
          <SwissErrorAlert message={errorMsg} />
        </div>
      ) : null}

      {/* 1. Exportar .ics */}
      {exportResult ? (
        <div
          role="status"
          aria-live="polite"
          className={`calendar-sync-notice ${exportResult.canceled ? 'is-neutral' : ''}`.trim()}
          data-testid="export-ics-status"
        >
          {exportResult.canceled ? (
            <span>Exportación .ics cancelada.</span>
          ) : (
            <span>
              Archivo <code>.ics</code> exportado ({exportResult.eventsCount}{' '}
              {exportResult.eventsCount === 1 ? 'evento' : 'eventos'}
              {exportResult.filePath ? ` · ${exportResult.filePath}` : ''}).
            </span>
          )}
        </div>
      ) : null}

      <div className="settings-row">
        <div className="settings-row-info">
          <div className="settings-row-title">Exportar calendario (.ics)</div>
          <div className="settings-row-desc">
            Exportá tus horarios semanales, entregas con fecha y exámenes en un
            archivo iCalendar compatible con Google Calendar y Apple Calendar.
          </div>
        </div>
        <div className="settings-row-control">
          <SwissButton
            variant="secondary"
            data-testid="export-ics-btn"
            disabled={isLoading || isExportingIcs}
            onClick={() => void handleExportIcs()}
          >
            {isExportingIcs ? 'Exportando…' : 'Exportar .ics'}
          </SwissButton>
        </div>
      </div>

      {/* 2. Suscripciones .ics externas */}
      <div className="calendar-sync-subsection">
        <div className="calendar-sync-subhead">
          <div className="calendar-sync-subhead-left">
            <h3 className="swiss-section-label">
              Suscripciones .ics de Google Calendar
            </h3>
            <span className="swiss-meta">{feeds.length} conectadas</span>
          </div>

          <SwissButton
            variant="secondary"
            data-testid="sync-feeds-btn"
            disabled={isLoading || isSyncingFeeds || feeds.length === 0}
            onClick={() => void handleSyncFeeds()}
          >
            {isSyncingFeeds ? 'Actualizando…' : 'Actualizar feeds'}
          </SwissButton>
        </div>

        {feedNotice ? (
          <div
            role="status"
            aria-live="polite"
            className="calendar-sync-notice is-neutral"
            data-testid="feed-sync-notice"
          >
            {feedNotice}
          </div>
        ) : null}

        <form
          className="calendar-sync-feed-form"
          aria-label="Agregar suscripción .ics"
          onSubmit={(e) => void handleAddFeed(e)}
        >
          <div className="calendar-sync-field">
            <label htmlFor={feedNameId} className="calendar-sync-field-label">
              Nombre
            </label>
            <input
              id={feedNameId}
              type="text"
              className="swiss-input"
              placeholder="Ej. Google Calendar personal"
              value={feedNameInput}
              disabled={isAddingFeed}
              onChange={(e) => setFeedNameInput(e.target.value)}
            />
          </div>

          <div className="calendar-sync-field">
            <label htmlFor={feedUrlId} className="calendar-sync-field-label">
              URL privada (.ics)
            </label>
            <input
              id={feedUrlId}
              type="url"
              className="swiss-input"
              placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
              value={feedUrlInput}
              disabled={isAddingFeed}
              onChange={(e) => setFeedUrlInput(e.target.value)}
            />
          </div>

          <SwissButton
            type="submit"
            variant="secondary"
            data-testid="add-feed-btn"
            disabled={isAddingFeed}
          >
            {isAddingFeed ? 'Agregando…' : '+ Agregar feed'}
          </SwissButton>
        </form>

        {feeds.length === 0 ? (
          <p className="swiss-meta-md">
            Todavía no conectaste ninguna URL privada .ics.
          </p>
        ) : (
          <div className="calendar-feed-list" data-testid="calendar-feeds-list">
            {feeds.map((feed) => (
              <div key={feed.id} className="calendar-feed-row">
                <div className="calendar-feed-row-info">
                  <div className="calendar-feed-row-title">{feed.name}</div>
                  <div className="calendar-feed-row-url" title={feed.url}>
                    {feed.url}
                  </div>
                  <div className="calendar-feed-row-meta">
                    {feed.eventsCount}{' '}
                    {feed.eventsCount === 1 ? 'evento' : 'eventos'} · Última
                    sincronización: {formatSyncTimestamp(feed.lastSyncedAt)}
                  </div>
                  {feed.lastError ? (
                    <div className="calendar-feed-row-error" role="alert">
                      Error: {feed.lastError}
                    </div>
                  ) : null}
                </div>

                <div className="calendar-feed-row-actions">
                  <SwissButton
                    variant="secondary"
                    aria-label={`Quitar ${feed.name}`}
                    disabled={removingFeedId === feed.id}
                    onClick={() => void handleRemoveFeed(feed.id)}
                  >
                    {removingFeedId === feed.id ? 'Quitando…' : 'Quitar'}
                  </SwissButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Google Calendar OAuth2 (Sincronización bidireccional) */}
      <div className="calendar-sync-subsection">
        <div className="calendar-sync-subhead">
          <div className="calendar-sync-subhead-left">
            <h3 className="swiss-section-label">
              Google Calendar OAuth2 (Sincronización bidireccional)
            </h3>
            <span
              className={`calendar-sync-dot ${googleConfig.isConnected ? 'is-connected' : ''}`.trim()}
              aria-hidden="true"
            />
            <span className="swiss-meta" data-testid="google-connection-status">
              {googleConfig.isConnected
                ? `Conectado · ${googleConfig.connectedEmail ?? 'Cuenta vinculada'}`
                : 'Desconectado'}
            </span>
          </div>
        </div>

        {syncSummaryText ? (
          <div
            role="status"
            aria-live="polite"
            className="calendar-sync-notice"
            data-testid="google-sync-summary"
          >
            Última sincronización ({formatSyncTimestamp(googleConfig.lastSyncedAt)}):{' '}
            <strong>{syncSummaryText}</strong>
          </div>
        ) : null}

        <div className="settings-row">
          <div className="settings-row-info">
            <label htmlFor={clientIdInputId} className="settings-row-title">
              Client ID OAuth2 Desktop
            </label>
            <div className="settings-row-desc">
              Credencial OAuth2 de escritorio de Google Cloud para flujo local
              PKCE (127.0.0.1).
            </div>
          </div>
          <div className="settings-row-control">
            <input
              id={clientIdInputId}
              type="text"
              className="swiss-input"
              placeholder="123456789-abc.apps.googleusercontent.com"
              value={clientIdInput}
              disabled={isLoading || isSavingGoogleConfig}
              onChange={(e) => setClientIdInput(e.target.value)}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <label htmlFor={calendarIdInputId} className="settings-row-title">
              ID de calendario destino
            </label>
            <div className="settings-row-desc">
              Usá <code>primary</code> o el identificador de un calendario
              dedicado para tus cursadas.
            </div>
          </div>
          <div className="settings-row-control">
            <input
              id={calendarIdInputId}
              type="text"
              className="swiss-input"
              placeholder="primary"
              value={calendarIdInput}
              disabled={isLoading || isSavingGoogleConfig}
              onChange={(e) => setCalendarIdInput(e.target.value)}
            />
            <SwissButton
              variant="secondary"
              data-testid="save-google-config-btn"
              disabled={isLoading || isSavingGoogleConfig}
              onClick={() => void handleSaveGoogleConfig()}
            >
              {isSavingGoogleConfig ? 'Guardando…' : 'Guardar'}
            </SwissButton>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Sincronización automática</div>
            <div className="settings-row-desc">
              Publicá cambios de cursadas, entregas y exámenes al guardar en
              Cursada.
            </div>
          </div>
          <div className="settings-row-control">
            <SwissSwitch
              checked={googleConfig.autoSyncEnabled}
              ariaLabel="Sincronización automática con Google Calendar"
              disabled={isLoading}
              onChange={(next) => void handleToggleAutoSync(next)}
            />
            <span className="swiss-meta-md">
              {googleConfig.autoSyncEnabled ? 'Activada' : 'Manual'}
            </span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Cuenta y sincronización</div>
            <div className="settings-row-desc">
              {googleConfig.isConnected
                ? `Vinculado como ${googleConfig.connectedEmail ?? 'cuenta Google'}.`
                : 'Conectá tu cuenta Google para publicar y actualizar eventos.'}
            </div>
          </div>
          <div className="settings-row-control">
            <div className="calendar-sync-oauth-actions">
              {googleConfig.isConnected ? (
                <>
                  <SwissButton
                    variant="secondary"
                    data-testid="disconnect-google-btn"
                    disabled={isConnectingGoogle || isSyncingGoogle}
                    onClick={() => void handleDisconnectGoogle()}
                  >
                    Desconectar
                  </SwissButton>
                  <SwissButton
                    variant="primary"
                    data-testid="sync-google-now-btn"
                    disabled={isSyncingGoogle || isConnectingGoogle}
                    onClick={() => void handleSyncGoogleNow()}
                  >
                    {isSyncingGoogle ? 'Sincronizando…' : 'Sincronizar ahora'}
                  </SwissButton>
                </>
              ) : (
                <SwissButton
                  variant="primary"
                  data-testid="connect-google-btn"
                  disabled={isLoading || isConnectingGoogle}
                  onClick={() => void handleConnectGoogle()}
                >
                  {isConnectingGoogle
                    ? 'Conectando…'
                    : 'Conectar cuenta Google'}
                </SwissButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
