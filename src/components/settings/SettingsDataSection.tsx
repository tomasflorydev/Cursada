import { useEffect, useState, type RefObject } from 'react';
import { cursadaClient } from '../../lib/api/client';
import type {
  BackupInfo,
  ExportMarkdownResult,
  ImportObsidianVaultResult,
  RestoreBackupResult,
} from '../../types';
import { SwissButton, SwissErrorAlert, SwissSectionHeader } from '../../ui';
import { ObsidianImportModal } from '../courses/ObsidianImportModal';
import { CalendarSyncSettingsSection } from './CalendarSyncSettingsSection';

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

export interface SettingsDataSectionProps {
  sectionRef: RefObject<HTMLElement | null>;
}

/**
 * Local storage, backups, Markdown export, Obsidian Vault importer, and Calendar Sync section.
 */
export function SettingsDataSection({ sectionRef }: SettingsDataSectionProps) {
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

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      cursadaClient.listBackups(),
      cursadaClient.getDataDir(),
    ]).then(([backupsRes, dataDirRes]) => {
      if (!active) return;
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
  }, []);

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

  const isBackupBusy = isCreatingBackup || restoringFilename !== null;

  return (
    <>
      <section
        ref={sectionRef}
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
                              onClick={() => void handleConfirmRestore(backup.filename)}
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

      <ObsidianImportModal
        isOpen={isObsidianModalOpen}
        onClose={() => setIsObsidianModalOpen(false)}
        onImported={(res) => setLastObsidianImportResult(res)}
      />
    </>
  );
}
