import { useEffect, useId, useRef, useState } from 'react';
import type { CourseDeleteImpact } from '../../types/domain';
import { SwissButton, SwissErrorAlert } from '../../ui';

export interface DeleteCourseDialogProps {
  impact: CourseDeleteImpact | null;
  onCancel: () => void;
  onConfirm: (courseId: string) => Promise<void>;
}

export function DeleteCourseDialog({
  impact,
  onCancel,
  onConfirm,
}: DeleteCourseDialogProps) {
  const baseId = useId();
  const titleId = `${baseId}-delete-title`;
  const descId = `${baseId}-delete-desc`;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOpen = impact !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen) {
      setIsDeleting(false);
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

  if (!impact) {
    return null;
  }

  function handleDialogClose(): void {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    onCancel();
  }

  async function handleConfirm(): Promise<void> {
    if (!impact) {
      return;
    }
    setIsDeleting(true);
    try {
      await onConfirm(impact.courseId);
    } finally {
      setIsDeleting(false);
    }
  }

  const tasksLabel =
    impact.tasksCount === 1
      ? '1 tarea asociada'
      : `${impact.tasksCount} tareas asociadas`;

  const examsCount = impact.examsCount ?? 0;
  const examsLabel =
    examsCount === 1 ? '1 examen asociado' : `${examsCount} exámenes asociados`;

  const notesCount = impact.notesCount ?? 0;
  const notesLabel =
    notesCount === 1 ? '1 nota asociada' : `${notesCount} notas asociadas`;

  const sourcesCount = impact.sourcesCount ?? 0;
  const sourcesLabel =
    sourcesCount === 1 ? '1 fuente asociada' : `${sourcesCount} fuentes asociadas`;

  const impactItems = [
    tasksLabel,
    examsCount > 0 ? examsLabel : null,
    notesCount > 0 ? notesLabel : null,
    sourcesCount > 0 ? sourcesLabel : null,
  ].filter(Boolean);

  return (
    <dialog
      ref={dialogRef}
      className="cursada-modal-dialog cursada-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={handleDialogClose}
    >
      <div className="cursada-modal-content">
        <header className="cursada-modal-header">
          <h2 id={titleId} className="cursada-modal-title">
            Eliminar materia
          </h2>
        </header>

        <div id={descId} className="delete-course-dialog-body">
          <p className="delete-course-warning-main">
            ¿Estás seguro de que querés eliminar <strong>{impact.courseName}</strong>?
          </p>
          <SwissErrorAlert
            message={`Se eliminarán también ${impactItems.join(', ')} y sus bloques horarios. Se realiza un backup automático antes del borrado.`}
          />
        </div>

        <footer className="cursada-modal-footer">
          <SwissButton
            variant="secondary"
            autoFocus
            disabled={isDeleting}
            onClick={handleDialogClose}
          >
            Cancelar
          </SwissButton>
          <SwissButton
            variant="primary"
            disabled={isDeleting}
            onClick={() => void handleConfirm()}
          >
            {isDeleting ? 'Eliminando…' : 'Confirmar eliminación'}
          </SwissButton>
        </footer>
      </div>
    </dialog>
  );
}
