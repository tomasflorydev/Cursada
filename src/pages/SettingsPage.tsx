import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ObsidianImportModal } from '../components/courses/ObsidianImportModal';
import { CalendarSyncSettingsSection } from '../components/settings/CalendarSyncSettingsSection';
import { EditorShortcutsSettingsSection } from '../components/settings/EditorShortcutsSettingsSection';
import { cursadaClient } from '../lib/api/client';
import type {
  BackupInfo,
  ExportMarkdownResult,
  ImportObsidianVaultResult,
  NoteFontSize,
  NotificationDispatchResult,
  NotificationSettings,
  OllamaHealthCheckResult,
  RestoreBackupResult,
  ThemeMode,
  UpdateNotificationSettingsInput,
} from '../types';
import {
  SwissButton,
  SwissErrorAlert,
  SwissLinkButton,
  SwissSectionHeader,
  SwissSegmented,
  SwissSelect,
  SwissSwitch,
} from '../ui';

export interface SettingsPageProps {
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  noteFontSize?: NoteFontSize;
  onChangeNoteFontSize?: (size: NoteFontSize) => void;
}

type SettingsCategoryId = 'general' | 'ai' | 'appearance' | 'data' | 'shortcuts';
type ReportLanguageOption = 'es' | 'en' | 'auto';

const REPORT_LANGUAGE_KEY = 'cursada-ai-report-language';
const CITE_SOURCES_KEY = 'cursada-ai-cite-sources';

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: true,
  upcomingClassesEnabled: true,
  classLeadMinutes: 15,
  tasksDueTodayEnabled: true,
  upcomingExamsEnabled: true,
  examLeadDays: 2,
};

const FALLBACK_CHAT_MODELS = ['llama3.2', 'qwen2.5:7b', 'mistral', 'gemma2'];
const FALLBACK_EMBED_MODELS = ['nomic-embed-text', 'mxbai-embed-large'];

const KEYBOARD_SHORTCUTS: ReadonlyArray<{
  keys: string;
  title: string;
  description: string;
}> = [
  {
    keys: '⌘K',
    title: 'Paleta de comandos',
    description: 'Buscar materias, notas, entregas, exámenes o acciones rápidas.',
  },
  {
    keys: '⌘N',
    title: 'Nuevo elemento contextual',
    description: 'Crea nota, tarea, examen o materia según la sección activa.',
  },
  {
    keys: '⌘1',
    title: 'Ir a Inicio',
    description: 'Abre el resumen de hoy y los próximos vencimientos.',
  },
  {
    keys: '⌘2',
    title: 'Ir a Materias',
    description: 'Abre el listado de materias y anotadores.',
  },
  {
    keys: '⌘3',
    title: 'Ir a Calendario',
    description: 'Abre la grilla semanal y mensual de cursada.',
  },
  {
    keys: '⌘4',
    title: 'Ir a Tareas',
    description: 'Abre la lista general de entregas pendientes.',
  },
  {
    keys: '⌘5',
    title: 'Ir a Exámenes',
    description: 'Abre los próximos parciales, finales y guías.',
  },
  {
    keys: '⌘6',
    title: 'Ir a Informes',
    description: 'Abre los informes y resúmenes generados con citas.',
  },
  {
    keys: '⌘,',
    title: 'Ir a Ajustes',
    description: 'Abre las preferencias generales, de IA y de datos.',
  },
];

function readStoredReportLanguage(): ReportLanguageOption {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(REPORT_LANGUAGE_KEY);
      if (value === 'es' || value === 'en' || value === 'auto') {
        return value;
      }
    }
  } catch {
    // Ignore storage access errors.
  }
  return 'es';
}

function readStoredCiteSources(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(CITE_SOURCES_KEY);
      if (value === 'false') return false;
      if (value === 'true') return true;
    }
  } catch {
    // Ignore storage access errors.
  }
  return true;
}

function formatBackupDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

function validateOllamaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('La URL del servidor Ollama no puede estar vacía.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Ingresá una URL válida, por ejemplo http://localhost:11434.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('La URL de Ollama debe usar http:// o https://.');
  }
  return trimmed;
}

export function SettingsPage({
  themeMode,
  onChangeThemeMode,
  noteFontSize = 'normal',
  onChangeNoteFontSize,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>('general');
  const [fallbackNoteFontSize, setFallbackNoteFontSize] =
    useState<NoteFontSize>(noteFontSize);

  const generalRef = useRef<HTMLElement | null>(null);
  const aiRef = useRef<HTMLElement | null>(null);
  const appearanceRef = useRef<HTMLElement | null>(null);
  const dataRef = useRef<HTMLElement | null>(null);
  const shortcutsRef = useRef<HTMLElement | null>(null);

  // Notifications state
  const [notifSettings, setNotifSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [isSendingTestNotif, setIsSendingTestNotif] = useState(false);
  const [lastTestNotif, setLastTestNotif] =
    useState<NotificationDispatchResult | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  // AI / Ollama state
  const [aiBaseUrl, setAiBaseUrl] = useState('http://localhost:11434');
  const [aiChatModel, setAiChatModel] = useState('llama3.2');
  const [aiEmbedModel, setAiEmbedModel] = useState('nomic-embed-text');
  const [isCustomChatModel, setIsCustomChatModel] = useState(false);
  const [customChatModelInput, setCustomChatModelInput] = useState('');
  const [ollamaHealth, setOllamaHealth] =
    useState<OllamaHealthCheckResult | null>(null);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [reportLanguage, setReportLanguage] = useState<ReportLanguageOption>(
    readStoredReportLanguage
  );
  const [citeSources, setCiteSources] = useState<boolean>(readStoredCiteSources);

  // Data / Backups / Export state
  const [dataDir, setDataDir] = useState('');
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isOpeningDataDir, setIsOpeningDataDir] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isExportingMd, setIsExportingMd] = useState(false);
  const [confirmingRestoreFilename, setConfirmingRestoreFilename] = useState<
    string | null
  >(null);
  const [restoringFilename, setRestoringFilename] = useState<string | null>(null);
  const [lastCreatedBackup, setLastCreatedBackup] = useState<BackupInfo | null>(
    null
  );
  const [lastRestoreResult, setLastRestoreResult] =
    useState<RestoreBackupResult | null>(null);
  const [lastExportResult, setLastExportResult] =
    useState<ExportMarkdownResult | null>(null);
  const [isObsidianModalOpen, setIsObsidianModalOpen] = useState(false);
  const [lastObsidianImportResult, setLastObsidianImportResult] =
    useState<ImportObsidianVaultResult | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const effectiveNoteFontSize = onChangeNoteFontSize
    ? noteFontSize
    : fallbackNoteFontSize;

  const checkOllama = useCallback(async (targetUrl?: string) => {
    setIsCheckingOllama(true);
    setAiError(null);
    try {
      const result = await cursadaClient.checkOllamaStatus(targetUrl);
      setOllamaHealth(result);
    } catch (err: unknown) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'No se pudo verificar la conexión con Ollama.'
      );
    } finally {
      setIsCheckingOllama(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      cursadaClient.getNotificationSettings(),
      cursadaClient.getAiSettings(),
      cursadaClient.listBackups(),
      cursadaClient.getDataDir(),
    ]).then(([notifRes, aiRes, backupsRes, dataDirRes]) => {
      if (!active) return;

      if (notifRes.status === 'fulfilled') {
        setNotifSettings(notifRes.value);
      } else {
        setNotifError('No se pudieron cargar las preferencias de recordatorios.');
      }

      if (aiRes.status === 'fulfilled') {
        setAiBaseUrl(aiRes.value.baseUrl);
        setAiChatModel(aiRes.value.chatModel);
        setAiEmbedModel(aiRes.value.embeddingModel);
        void checkOllama(aiRes.value.baseUrl);
      } else {
        setAiError('No se pudo cargar la configuración de IA local.');
      }

      if (backupsRes.status === 'fulfilled') {
        setBackups(backupsRes.value);
      } else {
        setDataError('No se pudo cargar el listado de respaldos.');
      }

      if (dataDirRes.status === 'fulfilled') {
        setDataDir(dataDirRes.value);
      }
    });

    return () => {
      active = false;
    };
  }, [checkOllama]);

  const chatModelOptions = useMemo(() => {
    const names = new Set<string>(FALLBACK_CHAT_MODELS);
    if (aiChatModel) names.add(aiChatModel);
    if (ollamaHealth?.models) {
      for (const m of ollamaHealth.models) {
        const lower = m.name.toLowerCase();
        if (!lower.includes('embed') && !lower.includes('bge')) {
          names.add(m.name);
        }
      }
    }
    return Array.from(names);
  }, [aiChatModel, ollamaHealth]);

  const embedModelOptions = useMemo(() => {
    const names = new Set<string>(FALLBACK_EMBED_MODELS);
    if (aiEmbedModel) names.add(aiEmbedModel);
    if (ollamaHealth?.models) {
      for (const m of ollamaHealth.models) {
        const lower = m.name.toLowerCase();
        if (lower.includes('embed') || lower.includes('bge')) {
          names.add(m.name);
        }
      }
    }
    return Array.from(names);
  }, [aiEmbedModel, ollamaHealth]);

  function handleSelectCategory(cat: SettingsCategoryId): void {
    setActiveCategory(cat);
    const refMap: Record<SettingsCategoryId, HTMLElement | null> = {
      general: generalRef.current,
      ai: aiRef.current,
      appearance: appearanceRef.current,
      data: dataRef.current,
      shortcuts: shortcutsRef.current,
    };
    const target = refMap[cat];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleUpdateNotification(
    patch: UpdateNotificationSettingsInput
  ): Promise<void> {
    const previous = notifSettings;
    const optimistic: NotificationSettings = { ...notifSettings, ...patch };
    setNotifSettings(optimistic);
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

  async function handleSaveAiSettings(
    override?: Partial<{ baseUrl: string; chatModel: string; embeddingModel: string }>
  ): Promise<void> {
    setIsSavingAi(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const normalizedUrl = validateOllamaUrl(override?.baseUrl ?? aiBaseUrl);
      const nextChat = (override?.chatModel ?? aiChatModel).trim();
      const nextEmbed = (override?.embeddingModel ?? aiEmbedModel).trim();
      if (!nextChat) {
        throw new Error('Indicá el nombre del modelo de chat.');
      }
      if (!nextEmbed) {
        throw new Error('Indicá el nombre del modelo de embeddings.');
      }
      const saved = await cursadaClient.updateAiSettings({
        baseUrl: normalizedUrl,
        chatModel: nextChat,
        embeddingModel: nextEmbed,
      });
      setAiBaseUrl(saved.baseUrl);
      setAiChatModel(saved.chatModel);
      setAiEmbedModel(saved.embeddingModel);
      setIsCustomChatModel(false);
      setAiNotice('Configuración de IA guardada.');
      await checkOllama(saved.baseUrl);
    } catch (err: unknown) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la configuración de Ollama.'
      );
    } finally {
      setIsSavingAi(false);
    }
  }

  function handleChangeReportLanguage(next: ReportLanguageOption): void {
    setReportLanguage(next);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(REPORT_LANGUAGE_KEY, next);
      }
    } catch {
      // Ignore storage errors.
    }
  }

  function handleToggleCiteSources(next: boolean): void {
    setCiteSources(next);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(CITE_SOURCES_KEY, String(next));
      }
    } catch {
      // Ignore storage errors.
    }
  }

  function handleChangeNoteFontSize(next: NoteFontSize): void {
    if (onChangeNoteFontSize) {
      onChangeNoteFontSize(next);
    } else {
      setFallbackNoteFontSize(next);
    }
  }

  async function handleOpenDataDir(): Promise<void> {
    setIsOpeningDataDir(true);
    setDataError(null);
    try {
      const result = await cursadaClient.openDataDir();
      if (!result.opened) {
        setDataError(`No se pudo abrir la carpeta (${result.dataDir}).`);
      }
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : 'No se pudo abrir la carpeta de datos.'
      );
    } finally {
      setIsOpeningDataDir(false);
    }
  }

  async function handleCreateBackup(): Promise<void> {
    setIsCreatingBackup(true);
    setDataError(null);
    setLastRestoreResult(null);
    try {
      const created = await cursadaClient.createBackup();
      setLastCreatedBackup(created);
      const updatedList = await cursadaClient.listBackups();
      setBackups(updatedList);
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : 'No se pudo exportar la copia.'
      );
    } finally {
      setIsCreatingBackup(false);
    }
  }

  async function handleExportMarkdown(): Promise<void> {
    setIsExportingMd(true);
    setDataError(null);
    try {
      const res = await cursadaClient.exportMarkdown({ scope: 'all' });
      setLastExportResult(res);
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : 'No se pudo exportar a Markdown.'
      );
    } finally {
      setIsExportingMd(false);
    }
  }

  async function handleConfirmRestore(filename: string): Promise<void> {
    setRestoringFilename(filename);
    setDataError(null);
    setLastCreatedBackup(null);
    setLastRestoreResult(null);
    try {
      const result = await cursadaClient.restoreBackup(filename);
      setLastRestoreResult(result);
      setConfirmingRestoreFilename(null);
      const updatedList = await cursadaClient.listBackups();
      setBackups(updatedList);
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : 'No se pudo restaurar la copia.'
      );
    } finally {
      setRestoringFilename(null);
    }
  }

  const isOllamaConnected = ollamaHealth?.status === 'connected';
  const isBackupBusy = isCreatingBackup || restoringFilename !== null;

  const categories: ReadonlyArray<{ id: SettingsCategoryId; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'ai', label: 'Inteligencia artificial' },
    { id: 'appearance', label: 'Apariencia' },
    { id: 'data', label: 'Datos' },
    { id: 'shortcuts', label: 'Atajos de teclado' },
  ];

  return (
    <section aria-labelledby="main-title" className="swiss-grid">
      <aside className="swiss-col-3">
        <h1
          id="main-title"
          tabIndex={-1}
          className="swiss-screen-title"
          style={{ marginBottom: '28px' }}
        >
          Ajustes
        </h1>

        <nav aria-label="Categorías de ajustes">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`swiss-list-row ${
                activeCategory === cat.id ? 'is-selected' : ''
              }`.trim()}
              aria-current={activeCategory === cat.id ? 'true' : undefined}
              onClick={() => handleSelectCategory(cat.id)}
            >
              <span>{cat.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="swiss-col-9">
        {/* 1. GENERAL */}
        <section
          ref={generalRef}
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
                disabled={
                  !notifSettings.enabled || !notifSettings.upcomingClassesEnabled
                }
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
                disabled={
                  !notifSettings.enabled || !notifSettings.upcomingExamsEnabled
                }
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

        {/* 2. INTELIGENCIA ARTIFICIAL */}
        <section
          ref={aiRef}
          id="settings-ai"
          className="settings-section-block"
          aria-labelledby="settings-ai-heading"
        >
          <h2 id="settings-ai-heading" className="settings-section-block-head">
            Inteligencia artificial
          </h2>

          {aiError ? (
            <div style={{ marginBottom: '12px' }}>
              <SwissErrorAlert message={aiError} />
            </div>
          ) : null}

          {aiNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="swiss-meta-md"
              style={{
                borderLeft: '4px solid var(--ink)',
                padding: '6px 12px',
                marginBottom: '12px',
                color: 'var(--ink)',
              }}
            >
              {aiNotice}
            </div>
          ) : null}

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Estado de Ollama (IA local)</div>
              <div className="settings-row-desc">
                {isOllamaConnected
                  ? `${ollamaHealth?.baseUrl ?? aiBaseUrl}${
                      ollamaHealth?.version ? ` · v${ollamaHealth.version}` : ''
                    } · ${ollamaHealth?.models.length ?? 0} modelos locales`
                  : ollamaHealth?.errorMessage ??
                    'Ejecutá ollama serve en Terminal para usar el asistente e informes con modelos locales.'}
              </div>
            </div>
            <div className="settings-row-control">
              <span
                className={`ollama-status-square ${
                  isOllamaConnected ? 'is-connected' : ''
                }`.trim()}
                aria-hidden="true"
              />
              <span className="swiss-meta-md">
                {isCheckingOllama
                  ? 'Verificando…'
                  : isOllamaConnected
                    ? 'Conectado'
                    : 'Sin conexión'}
              </span>
              <SwissButton
                variant="secondary"
                disabled={isCheckingOllama}
                onClick={() => void checkOllama(aiBaseUrl)}
              >
                {isCheckingOllama ? 'Probando…' : 'Probar'}
              </SwissButton>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Dirección del servidor</div>
              <div className="settings-row-desc">
                Endpoint local de Ollama en tu equipo.
              </div>
            </div>
            <div className="settings-row-control">
              <input
                type="url"
                className="swiss-input"
                aria-label="URL del servidor Ollama"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
              />
              <SwissButton
                variant="secondary"
                disabled={isSavingAi}
                onClick={() => void handleSaveAiSettings()}
              >
                {isSavingAi ? 'Guardando…' : 'Guardar'}
              </SwissButton>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Modelo de chat e informes</div>
              <div className="settings-row-desc">
                Modelo usado para responder consultas y generar guías de estudio.
              </div>
            </div>
            <div className="settings-row-control">
              {isCustomChatModel ? (
                <>
                  <input
                    type="text"
                    className="swiss-input"
                    aria-label="Nombre de modelo personalizado"
                    placeholder="Ej. llama3.2:latest"
                    value={customChatModelInput}
                    onChange={(e) => setCustomChatModelInput(e.target.value)}
                  />
                  <SwissButton
                    variant="secondary"
                    disabled={isSavingAi}
                    onClick={() =>
                      void handleSaveAiSettings({ chatModel: customChatModelInput })
                    }
                  >
                    Usar
                  </SwissButton>
                  <SwissLinkButton
                    className="swiss-meta"
                    onClick={() => setIsCustomChatModel(false)}
                  >
                    Cancelar
                  </SwissLinkButton>
                </>
              ) : (
                <SwissSelect
                  aria-label="Modelo de chat e informes"
                  value={aiChatModel}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setCustomChatModelInput(aiChatModel);
                      setIsCustomChatModel(true);
                      return;
                    }
                    setAiChatModel(val);
                    void handleSaveAiSettings({ chatModel: val });
                  }}
                >
                  {chatModelOptions.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                  <option value="__custom__">Otro modelo…</option>
                </SwissSelect>
              )}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Modelo de embeddings</div>
              <div className="settings-row-desc">
                Vectorización local de PDFs y apuntes para búsqueda semántica.
              </div>
            </div>
            <div className="settings-row-control">
              <SwissSelect
                aria-label="Modelo de embeddings"
                value={aiEmbedModel}
                onChange={(e) => {
                  const val = e.target.value;
                  setAiEmbedModel(val);
                  void handleSaveAiSettings({ embeddingModel: val });
                }}
              >
                {embedModelOptions.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </SwissSelect>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Idioma de informes</div>
              <div className="settings-row-desc">
                Idioma por defecto para resúmenes, guías y simulacros.
              </div>
            </div>
            <div className="settings-row-control">
              <SwissSelect
                aria-label="Idioma de informes"
                value={reportLanguage}
                onChange={(e) =>
                  handleChangeReportLanguage(e.target.value as ReportLanguageOption)
                }
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="auto">Según las fuentes</option>
              </SwissSelect>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Citar las fuentes</div>
              <div className="settings-row-desc">
                Incluir marcadores [1] verificables vinculados a notas y PDFs.
              </div>
            </div>
            <div className="settings-row-control">
              <SwissSwitch
                checked={citeSources}
                ariaLabel="Citar las fuentes"
                onChange={handleToggleCiteSources}
              />
              <span className="swiss-meta-md">
                {citeSources ? 'Incluir citas [1]' : 'Sin citas'}
              </span>
            </div>
          </div>
        </section>

        {/* 3. APARIENCIA */}
        <section
          ref={appearanceRef}
          id="settings-appearance"
          className="settings-section-block"
          aria-labelledby="settings-appearance-heading"
        >
          <h2
            id="settings-appearance-heading"
            className="settings-section-block-head"
          >
            Apariencia
          </h2>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Tema</div>
              <div className="settings-row-desc">
                Alterná entre papel claro, grafito oscuro o la preferencia de macOS.
              </div>
            </div>
            <div className="settings-row-control">
              <SwissSegmented<ThemeMode>
                ariaLabel="Tema de la aplicación"
                value={themeMode}
                onChange={onChangeThemeMode}
                options={[
                  { value: 'light', label: 'Claro' },
                  { value: 'dark', label: 'Oscuro' },
                  { value: 'system', label: 'Sistema' },
                ]}
              />
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Tamaño de texto de notas</div>
              <div className="settings-row-desc">
                Escala tipográfica del cuerpo al leer o escribir apuntes.
              </div>
            </div>
            <div className="settings-row-control">
              <SwissSegmented<NoteFontSize>
                ariaLabel="Tamaño de texto de notas"
                value={effectiveNoteFontSize}
                onChange={handleChangeNoteFontSize}
                options={[
                  { value: 'small', label: 'Chico' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'large', label: 'Grande' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* 4. DATOS */}
        <section
          ref={dataRef}
          id="settings-data"
          className="settings-section-block"
          aria-labelledby="settings-data-heading"
        >
          <h2 id="settings-data-heading" className="settings-section-block-head">
            Datos
          </h2>

          {dataError ? (
            <div style={{ marginBottom: '12px' }}>
              <SwissErrorAlert message={dataError} />
            </div>
          ) : null}

          {lastCreatedBackup ? (
            <div
              role="status"
              aria-live="polite"
              className="swiss-meta-md"
              style={{
                borderLeft: '4px solid var(--acc)',
                padding: '8px 12px',
                marginBottom: '12px',
                color: 'var(--ink)',
              }}
            >
              Copia creada: <code>{lastCreatedBackup.filename}</code> (
              {formatBackupDate(lastCreatedBackup.createdAt)})
            </div>
          ) : null}

          {lastRestoreResult ? (
            <div
              role="status"
              aria-live="polite"
              data-testid="backup-restored-alert"
              className="swiss-meta-md"
              style={{
                borderLeft: '4px solid var(--acc)',
                padding: '8px 12px',
                marginBottom: '12px',
                color: 'var(--ink)',
              }}
            >
              Restaurado desde{' '}
              <code>{lastRestoreResult.restoredFrom.filename}</code>. Respaldo
              preventivo creado:{' '}
              <code>{lastRestoreResult.preRestoreBackup.filename}</code>.
            </div>
          ) : null}

          {lastExportResult && !lastExportResult.canceled ? (
            <div
              role="status"
              aria-live="polite"
              className="swiss-meta-md"
              style={{
                borderLeft: '4px solid var(--ink)',
                padding: '8px 12px',
                marginBottom: '12px',
                color: 'var(--ink)',
              }}
            >
              Exportación Markdown completada ({lastExportResult.fileCount}{' '}
              {lastExportResult.fileCount === 1 ? 'archivo' : 'archivos'}).
            </div>
          ) : null}

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Carpeta de datos local</div>
              <div className="settings-row-desc">
                {dataDir ? <code>{dataDir}</code> : 'Cargando ruta local…'}
              </div>
            </div>
            <div className="settings-row-control">
              <SwissButton
                variant="secondary"
                data-testid="open-data-dir-button"
                disabled={isOpeningDataDir}
                onClick={() => void handleOpenDataDir()}
              >
                {isOpeningDataDir ? 'Abriendo…' : 'Mostrar en Finder'}
              </SwissButton>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Copia de seguridad SQLite</div>
              <div className="settings-row-desc">
                Guardá un respaldo manual inmediato (se conservan los últimos 15).
              </div>
            </div>
            <div className="settings-row-control">
              <SwissButton
                variant="secondary"
                disabled={isBackupBusy}
                onClick={() => void handleCreateBackup()}
              >
                {isCreatingBackup ? 'Exportando…' : 'Exportar copia'}
              </SwissButton>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Portabilidad en Markdown</div>
              <div className="settings-row-desc">
                Exportá todas tus materias y apuntes a archivos <code>.md</code>.
              </div>
            </div>
            <div className="settings-row-control">
              <SwissButton
                variant="secondary"
                data-testid="settings-export-all-button"
                disabled={isExportingMd}
                onClick={() => void handleExportMarkdown()}
              >
                {isExportingMd ? 'Exportando…' : 'Exportar Markdown'}
              </SwissButton>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">Importar Vault de Obsidian</div>
              <div className="settings-row-desc">
                {lastObsidianImportResult && !lastObsidianImportResult.canceled
                  ? `${lastObsidianImportResult.notesImportedCount} notas importadas · ${lastObsidianImportResult.linksResolvedCount} enlaces resueltos.`
                  : 'Traé carpetas con archivos .md, frontmatter y [[WikiLinks]] hacia activos o al Archivo.'}
              </div>
            </div>
            <div className="settings-row-control">
              <SwissButton
                variant="secondary"
                data-testid="settings-import-obsidian-button"
                onClick={() => setIsObsidianModalOpen(true)}
              >
                Importar Vault de Obsidian
              </SwissButton>
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <SwissSectionHeader
              title={`Respaldos disponibles (${backups.length})`}
              subtle
            />
            {backups.length === 0 ? (
              <p className="swiss-meta-md">
                Todavía no hay copias de seguridad registradas.
              </p>
            ) : (
              <div>
                {backups.map((backup) => {
                  const isConfirming = confirmingRestoreFilename === backup.filename;
                  const isRestoringThis = restoringFilename === backup.filename;
                  return (
                    <div key={backup.filename}>
                      <div className="settings-row">
                        <div className="settings-row-info">
                          <div className="settings-row-title">
                            <code>{backup.filename}</code>
                          </div>
                          <div className="settings-row-desc">
                            {formatBackupDate(backup.createdAt)} ·{' '}
                            {formatBytes(backup.sizeBytes)}
                          </div>
                        </div>
                        <div className="settings-row-control">
                          {isConfirming ? (
                            <>
                              <SwissButton
                                variant="primary"
                                data-testid={`confirm-restore-btn-${backup.filename}`}
                                disabled={isBackupBusy}
                                onClick={() =>
                                  void handleConfirmRestore(backup.filename)
                                }
                              >
                                {isRestoringThis
                                  ? 'Restaurando…'
                                  : 'Confirmar restauración'}
                              </SwissButton>
                              <SwissButton
                                variant="secondary"
                                disabled={isBackupBusy}
                                onClick={() => setConfirmingRestoreFilename(null)}
                              >
                                Cancelar
                              </SwissButton>
                            </>
                          ) : (
                            <SwissButton
                              variant="secondary"
                              data-testid={`restore-backup-btn-${backup.filename}`}
                              disabled={isBackupBusy}
                              onClick={() => {
                                setDataError(null);
                                setLastCreatedBackup(null);
                                setLastRestoreResult(null);
                                setConfirmingRestoreFilename(backup.filename);
                              }}
                            >
                              Restaurar
                            </SwissButton>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: '24px' }}>
            <CalendarSyncSettingsSection />
          </div>
        </section>

        {/* 5. ATAJOS DE TECLADO */}
        <section
          ref={shortcutsRef}
          id="settings-shortcuts"
          className="settings-section-block"
          aria-labelledby="settings-shortcuts-heading"
        >
          <h2
            id="settings-shortcuts-heading"
            className="settings-section-block-head"
          >
            Atajos de teclado
          </h2>

          <div>
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="settings-row">
                <div className="settings-row-info">
                  <div className="settings-row-title">{shortcut.title}</div>
                  <div className="settings-row-desc">{shortcut.description}</div>
                </div>
                <div
                  className="settings-row-control"
                  style={{ justifyContent: 'flex-end' }}
                >
                  <kbd style={{ fontWeight: 600 }}>{shortcut.keys}</kbd>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '24px' }}>
            <EditorShortcutsSettingsSection />
          </div>
        </section>
      </div>

      <ObsidianImportModal
        isOpen={isObsidianModalOpen}
        onClose={() => setIsObsidianModalOpen(false)}
        onImported={(res) => setLastObsidianImportResult(res)}
      />
    </section>
  );
}
