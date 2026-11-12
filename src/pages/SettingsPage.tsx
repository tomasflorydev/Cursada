import { useEffect, useState } from 'react';
import { ExportMarkdownButton } from '../components/export/ExportMarkdownButton';
import { cursadaClient } from '../lib/api/client';
import type { BackupInfo, ThemeMode } from '../types';

export interface SettingsPageProps {
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
}

function formatBackupDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
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

export function SettingsPage({ themeMode, onChangeThemeMode }: SettingsPageProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [dataDir, setDataDir] = useState<string>('');
  const [lastCreatedBackup, setLastCreatedBackup] = useState<BackupInfo | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([cursadaClient.listBackups(), cursadaClient.getDataDir()])
      .then(([loadedBackups, dir]) => {
        if (!active) return;
        setBackups(loadedBackups);
        setDataDir(dir);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Error al cargar ajustes');
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreateBackupNow(): Promise<void> {
    setIsCreating(true);
    setErrorMsg(null);
    try {
      const created = await cursadaClient.createBackup();
      setLastCreatedBackup(created);
      const updatedList = await cursadaClient.listBackups();
      setBackups(updatedList);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo crear el backup');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="basic-view settings-page">
      <header className="page-header">
        <div className="page-header-titles">
          <span className="page-date-text">Preferencias y almacenamiento local</span>
          <h1 id="main-title" tabIndex={-1} className="page-title">
            Ajustes
          </h1>
          <p className="page-subtitle">
            Configurá la apariencia de Cursada y gestioná las copias de seguridad locales de tu base
            de datos académica.
          </p>
        </div>
      </header>

      <section className="surface-panel settings-section" aria-labelledby="settings-backups-heading">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 id="settings-backups-heading" className="section-title">
              Datos y Backups
            </h2>
            <span className="section-counter">Rotación automática (últimos 15)</span>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={isCreating}
            onClick={() => void handleCreateBackupNow()}
          >
            {isCreating ? 'Creando backup...' : 'Crear backup ahora'}
          </button>
        </div>

        <p className="settings-description">
          Cursada guarda toda tu información localmente en SQLite y realiza copias de seguridad
          automáticas al iniciar la aplicación (cada 24 h), antes de cada migración y antes de
          eliminar una materia.
        </p>

        {dataDir ? (
          <div className="settings-meta-box">
            <span className="settings-meta-label">Carpeta de datos activa</span>
            <code className="settings-code-path">{dataDir}</code>
          </div>
        ) : null}

        {errorMsg ? (
          <div role="alert" className="settings-alert is-error">
            {errorMsg}
          </div>
        ) : null}

        {lastCreatedBackup ? (
          <div role="status" aria-live="polite" className="settings-alert is-success">
            <strong>Backup creado correctamente</strong>
            <span>Fecha: {formatBackupDate(lastCreatedBackup.createdAt)}</span>
            <span>
              Ubicación: <code>{lastCreatedBackup.filePath}</code>
            </span>
          </div>
        ) : null}

        <div className="settings-backups-list-wrapper">
          <h3 className="settings-subheading">Backups disponibles ({backups.length})</h3>
          {backups.length === 0 ? (
            <p className="settings-empty-text">Todavía no hay backups registrados.</p>
          ) : (
            <ul className="settings-backups-list">
              {backups.map((backup) => (
                <li key={backup.filename} className="settings-backup-row">
                  <div className="settings-backup-main">
                    <span className="settings-backup-name">{backup.filename}</span>
                    <code className="settings-backup-path">{backup.filePath}</code>
                  </div>
                  <div className="settings-backup-meta">
                    <span className="settings-backup-date">
                      {formatBackupDate(backup.createdAt)}
                    </span>
                    <span className="settings-backup-size">{formatBytes(backup.sizeBytes)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="surface-panel settings-section" aria-labelledby="settings-export-heading">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 id="settings-export-heading" className="section-title">
              Exportar a Markdown
            </h2>
            <span className="section-counter">Portabilidad local (.md)</span>
          </div>
        </div>

        <p className="settings-description">
          Exportá todas tus materias (en curso y archivadas), horarios, tareas, exámenes con
          promedio y apuntes en formato Markdown estándar, organizados por carpeta con un índice
          general.
        </p>

        <ExportMarkdownButton
          scope="all"
          label="Exportar toda la cursada (.md)"
          className="primary-button"
          data-testid="settings-export-all-button"
        />
      </section>

      <section className="surface-panel settings-section" aria-labelledby="settings-theme-heading">
        <div className="section-heading-bar">
          <div className="section-heading-left">
            <h2 id="settings-theme-heading" className="section-title">
              Apariencia
            </h2>
          </div>
        </div>
        <p className="settings-description">
          Elegí si Cursada sigue automáticamente el modo claro/oscuro de macOS o fijá un esquema
          manualmente.
        </p>
        <div className="settings-theme-controls" role="group" aria-label="Selector de tema">
          <button
            type="button"
            className={`secondary-button ${themeMode === 'system' ? 'is-selected' : ''}`}
            aria-pressed={themeMode === 'system'}
            onClick={() => onChangeThemeMode('system')}
          >
            Automático (Sistema)
          </button>
          <button
            type="button"
            className={`secondary-button ${themeMode === 'light' ? 'is-selected' : ''}`}
            aria-pressed={themeMode === 'light'}
            onClick={() => onChangeThemeMode('light')}
          >
            Modo Claro
          </button>
          <button
            type="button"
            className={`secondary-button ${themeMode === 'dark' ? 'is-selected' : ''}`}
            aria-pressed={themeMode === 'dark'}
            onClick={() => onChangeThemeMode('dark')}
          >
            Modo Oscuro
          </button>
        </div>
      </section>
    </div>
  );
}
