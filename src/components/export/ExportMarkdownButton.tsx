import { useState } from 'react';
import { cursadaClient } from '../../lib/api/client';
import type { ExportMarkdownResult, ExportScope } from '../../types/domain';

export interface ExportMarkdownButtonProps {
  scope: ExportScope;
  courseId?: string;
  noteId?: string;
  label?: string;
  className?: string;
  'data-testid'?: string;
}

const DEFAULT_LABELS: Record<ExportScope, string> = {
  note: 'Exportar nota (.md)',
  course: 'Exportar anotador (.md)',
  all: 'Exportar toda la cursada (.md)',
};

export function ExportMarkdownButton({
  scope,
  courseId,
  noteId,
  label,
  className,
  'data-testid': dataTestId,
}: ExportMarkdownButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<ExportMarkdownResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const buttonLabel = isExporting ? 'Exportando...' : (label ?? DEFAULT_LABELS[scope]);

  async function handleExport(): Promise<void> {
    setIsExporting(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const exportResult = await cursadaClient.exportMarkdown({
        scope,
        courseId,
        noteId,
      });
      setResult(exportResult);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo exportar a Markdown'
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <button
          type="button"
          className={className ?? 'secondary-button'}
          disabled={isExporting}
          data-testid={dataTestId}
          onClick={() => void handleExport()}
        >
          {buttonLabel}
        </button>
      </div>

      {errorMsg ? (
        <div role="alert" className="settings-alert is-error">
          {errorMsg}
        </div>
      ) : null}

      {result && result.canceled ? (
        <div role="status" aria-live="polite" className="settings-meta-box">
          <span>Exportación cancelada.</span>
        </div>
      ) : null}

      {result && !result.canceled && result.mode === 'filesystem' ? (
        <div role="status" aria-live="polite" className="settings-alert is-success">
          <strong>
            Exportación completada ({result.fileCount}{' '}
            {result.fileCount === 1 ? 'archivo' : 'archivos'})
          </strong>
          {result.targetDir ? (
            <span>
              Carpeta: <code className="settings-code-path">{result.targetDir}</code>
            </span>
          ) : null}
        </div>
      ) : null}

      {result && !result.canceled && result.mode === 'download' ? (
        <div role="status" aria-live="polite" className="settings-alert is-success">
          <strong>Descarga iniciada ({result.fileCount} archivo)</strong>
          <span>
            Archivo:{' '}
            <code className="settings-code-path">
              {result.filesCreated[0] ?? 'export.md'}
            </code>
          </span>
        </div>
      ) : null}
    </div>
  );
}
