import { useEffect, useRef } from 'react';
import type { SourceWithChunks } from '../../types';
import { SwissButton } from '../../ui';

export interface SourcePreviewDialogProps {
  source: SourceWithChunks | null;
  reindexingSourceId: string | null;
  onReindexSource: (sourceId: string) => void;
  onClose: () => void;
}

/**
 * Native modal dialog displaying extracted text or indexed chunks for a course source.
 */
export function SourcePreviewDialog({
  source,
  reindexingSourceId,
  onReindexSource,
  onClose,
}: SourcePreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (source) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (dialog.open || dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [source]);

  if (!source) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={source.title}
      className="cursada-modal-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="cursada-modal-content source-preview-content">
        <header className="cursada-modal-header">
          <div>
            <h2 className="cursada-modal-title">{source.title}</h2>
            <p className="source-preview-meta">
              Tipo: {source.sourceType.toUpperCase()}
              {source.pageCount != null ? ` · ${source.pageCount} pág.` : ''}
              {` · ${source.chunkCount} fragmentos · Estado: ${source.indexingStatus}`}
            </p>
          </div>
          <div className="source-preview-actions">
            {source.indexingStatus === 'error' ? (
              <SwissButton
                variant="secondary"
                disabled={reindexingSourceId === source.id}
                onClick={() => onReindexSource(source.id)}
              >
                {reindexingSourceId === source.id ? 'Reindexando...' : 'Reindexar'}
              </SwissButton>
            ) : null}
            <SwissButton variant="tertiary" onClick={onClose}>
              Cerrar
            </SwissButton>
          </div>
        </header>

        {source.indexingError ? (
          <p className="swiss-error" role="alert">
            Error de indexación: {source.indexingError}
          </p>
        ) : null}

        <div className="source-preview-body">
          {source.chunks.length > 0 ? (
            source.chunks.map((chunk) => (
              <article key={chunk.id} className="source-chunk-card">
                <div className="source-chunk-meta">
                  Fragmento #{chunk.chunkIndex + 1}
                  {chunk.pageNumber != null ? ` · Página ${chunk.pageNumber}` : ''}
                </div>
                <p className="source-chunk-copy">{chunk.content}</p>
              </article>
            ))
          ) : (
            <pre className="source-raw-copy">
              {source.rawText || 'Sin texto extraído disponible.'}
            </pre>
          )}
        </div>
      </div>
    </dialog>
  );
}
