import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { cursadaClient } from '../../lib/api/client';
import type {
  CourseStatus,
  ImportObsidianVaultResult,
} from '../../types/domain';
import {
  SwissButton,
  SwissErrorAlert,
  SwissLinkButton,
  SwissLoadingBar,
  SwissSegmented,
} from '../../ui';
import '../../styles/knowledge.css';

export interface ObsidianImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (result: ImportObsidianVaultResult) => void;
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error(`No se pudo leer "${file.name}".`));
    };
    reader.readAsText(file);
  });
}

function isHiddenVaultPath(rawPath: string): boolean {
  const segments = rawPath
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s.length > 0);
  return segments.some((seg) => seg.startsWith('.') || seg === '..');
}

function isMarkdownFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export function ObsidianImportModal({
  isOpen,
  onClose,
  onImported,
}: ObsidianImportModalProps) {
  const baseId = useId();
  const titleId = `${baseId}-obsidian-title`;
  const overrideInputId = `${baseId}-course-override`;
  const folderInputId = `${baseId}-folder-input`;

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [targetStatus, setTargetStatus] = useState<CourseStatus>('active');
  const [courseNameOverride, setCourseNameOverride] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [importResult, setImportResult] =
    useState<ImportObsidianVaultResult | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setTargetStatus('active');
    setCourseNameOverride('');
    setIsImporting(false);
    setErrorMessage(null);
    setStatusNote(null);
    setImportResult(null);
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }
    } else {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      dialog.returnValue = '';
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function handleDialogClose(): void {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    onClose();
  }

  async function runNativeImport(): Promise<void> {
    if (isImporting) {
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    setStatusNote(null);

    try {
      const result = await cursadaClient.importObsidianVault({
        targetStatus,
        courseNameOverride: courseNameOverride.trim() || undefined,
      });

      if (result.canceled) {
        setStatusNote('Importación cancelada.');
        return;
      }

      setImportResult(result);
      onImported?.(result);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo importar la bóveda de Obsidian.'
      );
    } finally {
      setIsImporting(false);
    }
  }

  function handleChooseFolderClick(): void {
    const hasNativeVaultImport =
      typeof window !== 'undefined' &&
      typeof window.cursadaApi?.importObsidianVault === 'function';

    if (hasNativeVaultImport) {
      void runNativeImport();
      return;
    }

    folderInputRef.current?.click();
  }

  async function handleFolderFilesChange(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const fileList = event.target.files;
    const files = fileList ? Array.from(fileList) : [];
    event.target.value = '';

    if (files.length === 0) {
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    setStatusNote(null);

    try {
      const withRelPaths = files.map((file) => {
        const rel =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name;
        return {
          file,
          rawRelPath: rel.replace(/\\/g, '/').replace(/^\/+/, ''),
        };
      });

      // If every file shares the picked root folder name (standard webkitdirectory behavior),
      // extract it as vaultDir and pass inner relative paths matching disk scanning.
      const firstSegments = withRelPaths
        .map((item) => item.rawRelPath.split('/').filter(Boolean))
        .filter((segs) => segs.length > 1)
        .map((segs) => segs[0]);

      const sharedRoot =
        firstSegments.length === withRelPaths.length &&
        firstSegments.length > 0 &&
        firstSegments.every((seg) => seg === firstSegments[0])
          ? firstSegments[0]
          : undefined;

      const filtered = withRelPaths
        .map(({ file, rawRelPath }) => {
          const innerPath = sharedRoot
            ? rawRelPath.slice(sharedRoot.length + 1)
            : rawRelPath;
          return { file, relativePath: innerPath };
        })
        .filter(
          ({ file, relativePath }) =>
            !isHiddenVaultPath(relativePath) &&
            isMarkdownFilename(file.name)
        );

      const filesPayload = await Promise.all(
        filtered.map(async ({ file, relativePath }) => ({
          relativePath,
          content: await readFileAsText(file),
        }))
      );

      if (filesPayload.length === 0) {
        setErrorMessage(
          'No se encontraron archivos Markdown (.md) válidos en la carpeta seleccionada.'
        );
        return;
      }

      const result = await cursadaClient.importObsidianVault({
        vaultDir: sharedRoot,
        targetStatus,
        courseNameOverride: courseNameOverride.trim() || undefined,
        filesPayload,
      });

      if (result.canceled) {
        setStatusNote('Importación cancelada.');
        return;
      }

      setImportResult(result);
      onImported?.(result);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo procesar la carpeta de Obsidian.'
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="obsidian-import-modal"
      aria-labelledby={titleId}
      onClose={handleDialogClose}
    >
      <div className="obsidian-import-body">
        <header className="obsidian-import-header">
          <h2 id={titleId} className="obsidian-import-title">
            Importar bóveda de Obsidian
          </h2>
          <SwissLinkButton onClick={handleDialogClose}>Cerrar</SwissLinkButton>
        </header>

        <p className="obsidian-import-desc">
          Importá archivos Markdown (.md), preservá sus propiedades YAML y resolvé
          automáticamente los [[WikiLinks]] y backlinks.
        </p>

        {errorMessage ? <SwissErrorAlert message={errorMessage} /> : null}

        <div className="obsidian-import-field">
          <span className="swiss-section-label">Destino de los anotadores</span>
          <SwissSegmented<CourseStatus>
            ariaLabel="Destino de importación"
            value={targetStatus}
            options={[
              { value: 'active', label: 'Anotadores activos' },
              { value: 'archived', label: 'Archivo (archivados)' },
            ]}
            onChange={(next) => setTargetStatus(next)}
          />
          <span className="obsidian-import-hint">
            Elegí Archivo si querés guardar apuntes históricos sin mostrarlos en
            tu cursada activa.
          </span>
        </div>

        <div className="obsidian-import-field">
          <label htmlFor={overrideInputId} className="swiss-section-label">
            Nombre de anotador único (opcional)
          </label>
          <input
            id={overrideInputId}
            type="text"
            className="swiss-input"
            placeholder="Dejar vacío para crear un anotador por carpeta"
            value={courseNameOverride}
            onChange={(e) => setCourseNameOverride(e.target.value)}
            autoFocus
          />
          <span className="obsidian-import-hint">
            Si lo dejás vacío, cada carpeta principal de la bóveda se importa
            como un anotador separado.
          </span>
        </div>

        <input
          id={folderInputId}
          ref={folderInputRef}
          type="file"
          multiple
          accept=".md,.markdown,text/markdown"
          aria-label="Seleccionar carpeta de Obsidian"
          data-testid="obsidian-folder-input"
          className="visually-hidden"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => void handleFolderFilesChange(e)}
        />

        {isImporting ? (
          <SwissLoadingBar text="Importando apuntes y resolviendo [[WikiLinks]]…" />
        ) : null}

        {statusNote ? <p className="swiss-meta-md">{statusNote}</p> : null}

        {importResult && !importResult.canceled ? (
          <div
            className="obsidian-import-summary"
            role="status"
            aria-live="polite"
            data-testid="obsidian-import-summary"
          >
            <span className="obsidian-import-summary-counts">
              {importResult.notesImportedCount}{' '}
              {importResult.notesImportedCount === 1
                ? 'nota importada'
                : 'notas importadas'}{' '}
              · {importResult.linksResolvedCount}{' '}
              {importResult.linksResolvedCount === 1
                ? 'enlace resuelto'
                : 'enlaces resueltos'}
            </span>
            {importResult.coursesCreated.length > 0 ? (
              <span className="obsidian-import-summary-courses">
                Anotadores creados:{' '}
                {importResult.coursesCreated.map((c) => c.name).join(', ')}
              </span>
            ) : null}
          </div>
        ) : null}

        <footer className="obsidian-import-footer">
          <SwissButton
            variant="tertiary"
            onClick={handleDialogClose}
            disabled={isImporting}
          >
            {importResult && !importResult.canceled ? 'Listo' : 'Cancelar'}
          </SwissButton>
          <SwissButton
            variant="primary"
            onClick={handleChooseFolderClick}
            disabled={isImporting}
          >
            {isImporting ? 'Importando…' : 'Elegir carpeta de Obsidian'}
          </SwissButton>
        </footer>
      </div>
    </dialog>
  );
}
