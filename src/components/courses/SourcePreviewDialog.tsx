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
      open
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
      <div
        className="cursada-modal-content"
        style={{
          maxWidth: '46rem',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <header className="cursada-modal-header">
          <div>
            <h2 className="cursada-modal-title">{source.title}</h2>
            <p
              className="cursada-muted-text"
              style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}
            >
              Tipo: {source.sourceType.toUpperCase()}
              {source.pageCount != null ? ` · ${source.pageCount} pág.` : ''}
              {` · ${source.chunkCount} fragmentos · Estado: ${source.indexingStatus}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
          <p className="cursada-inline-error" role="alert">
            Error de indexación: {source.indexingError}
          </p>
        ) : null}

        <div
          style={{
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingRight: '0.25rem',
          }}
        >
          {source.chunks.length > 0 ? (
            source.chunks.map((chunk) => (
              <article
                key={chunk.id}
                style={{
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                  borderRadius: '0.5rem',
                  padding: '0.65rem 0.75rem',
                }}
              >
                <div
                  className="cursada-muted-text"
                  style={{ fontSize: '0.78rem', marginBottom: '0.35rem' }}
                >
                  Fragmento #{chunk.chunkIndex + 1}
                  {chunk.pageNumber != null ? ` · Página ${chunk.pageNumber}` : ''}
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {chunk.content}
                </p>
              </article>
            ))
          ) : (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
                fontFamily: 'inherit',
              }}
            >
              {source.rawText || 'Sin texto extraído disponible.'}
            </pre>
          )}
        </div>
      </div>
    </dialog>
  );
}
