import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { cursadaClient, DATA_CHANGED_EVENT } from '../../lib/api/client';
import { toIsoDateString } from '../../lib/dates';
import type {
  AttendanceStatus,
  CourseAttendanceSummary,
  CursadaIpcApi,
} from '../../types/domain';
import {
  SwissButton,
  SwissErrorAlert,
  SwissProgressBar,
  SwissSectionHeader,
  SwissSwitch,
} from '../../ui';

export interface CourseAttendancePanelProps {
  courseId: string;
  onChanged?: (summary: CourseAttendanceSummary) => void;
  api?: Pick<
    CursadaIpcApi,
    | 'getCourseAttendance'
    | 'updateCourseAttendanceConfig'
    | 'recordAttendance'
    | 'deleteAttendanceRecord'
  >;
}

function formatDateDisplay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function CourseAttendancePanel({
  courseId,
  onChanged,
  api = cursadaClient,
}: CourseAttendancePanelProps) {
  const baseId = useId();
  const maxAbsencesInputId = `${baseId}-max-absences`;
  const sessionDateInputId = `${baseId}-session-date`;
  const sessionNoteInputId = `${baseId}-session-note`;

  const [summary, setSummary] = useState<CourseAttendanceSummary | null>(null);
  const [maxAbsencesDraft, setMaxAbsencesDraft] = useState('4');
  const [sessionDateDraft, setSessionDateDraft] = useState(() =>
    toIsoDateString(new Date())
  );
  const [sessionNoteDraft, setSessionNoteDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSummary = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setIsLoading(true);
      }
      try {
        const data = await api.getCourseAttendance(courseId);
        setSummary(data);
        setMaxAbsencesDraft(String(data.maxAbsences));
        setErrorMessage(null);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'No se pudo cargar el control de asistencia.'
        );
      } finally {
        if (!opts?.silent) {
          setIsLoading(false);
        }
      }
    },
    [api, courseId]
  );

  useEffect(() => {
    void loadSummary();
    const handleDataChanged = () => {
      void loadSummary({ silent: true });
    };
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    };
  }, [loadSummary]);

  async function handleToggleEnabled(nextEnabled: boolean): Promise<void> {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const updated = await api.updateCourseAttendanceConfig({
        courseId,
        attendanceEnabled: nextEnabled,
      });
      setSummary(updated);
      setMaxAbsencesDraft(String(updated.maxAbsences));
      onChanged?.(updated);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el seguimiento de asistencia.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveMaxAbsences(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    const parsed = Number(maxAbsencesDraft);
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const updated = await api.updateCourseAttendanceConfig({
        courseId,
        maxAbsences: parsed,
      });
      setSummary(updated);
      setMaxAbsencesDraft(String(updated.maxAbsences));
      onChanged?.(updated);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Ingresá un límite de faltas válido (entre 1 y 50).'
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRecord(status: AttendanceStatus): Promise<void> {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const updated = await api.recordAttendance({
        courseId,
        status,
        sessionDate: sessionDateDraft.trim() || undefined,
        note: sessionNoteDraft.trim() || undefined,
      });
      setSummary(updated);
      setSessionNoteDraft('');
      onChanged?.(updated);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar la asistencia.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteRecord(recordId: string): Promise<void> {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const updated = await api.deleteAttendanceRecord(recordId);
      setSummary(updated);
      onChanged?.(updated);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo eliminar el registro de asistencia.'
      );
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading && !summary) {
    return (
      <section className="attendance-panel" aria-label="Control de asistencia">
        <SwissSectionHeader title="Asistencia" />
        <p className="swiss-meta-md">Cargando registro de asistencia…</p>
      </section>
    );
  }

  const resolved: CourseAttendanceSummary = summary ?? {
    courseId,
    attendanceEnabled: false,
    maxAbsences: 4,
    absencesCount: 0,
    presentsCount: 0,
    remainingAbsences: 4,
    absenceRatio: 0,
    isWarning: false,
    isExceeded: false,
    records: [],
  };

  const ratioPercent = Math.min(
    100,
    Math.round(resolved.absenceRatio * 100)
  );

  return (
    <section className="attendance-panel" aria-label="Control de asistencia">
      <SwissSectionHeader
        title="Asistencia"
        right={
          <div className="attendance-switch-wrap">
            <span className="swiss-meta">
              {resolved.attendanceEnabled ? 'Activo' : 'Desactivado'}
            </span>
            <SwissSwitch
              checked={resolved.attendanceEnabled}
              disabled={isBusy}
              ariaLabel="Activar control de asistencia"
              onChange={(next) => void handleToggleEnabled(next)}
            />
          </div>
        }
      />

      {errorMessage ? <SwissErrorAlert message={errorMessage} /> : null}

      {!resolved.attendanceEnabled ? (
        <p className="attendance-disabled-copy">
          Activá el control de asistencia para llevar la cuenta de faltas y recibir avisos antes de quedar libre.
        </p>
      ) : (
        <div className="attendance-body">
          <div className="attendance-summary-block">
            <div className="attendance-readout-row">
              <span
                className="attendance-readout-main"
                data-testid="attendance-progress-readout"
              >
                {resolved.absencesCount} / {resolved.maxAbsences}{' '}
                {resolved.absencesCount === 1 ? 'falta' : 'faltas'} ·{' '}
                {ratioPercent}% del límite
              </span>
              <span className="swiss-meta">
                {resolved.presentsCount}{' '}
                {resolved.presentsCount === 1 ? 'asistencia' : 'asistencias'} ·{' '}
                {resolved.remainingAbsences}{' '}
                {resolved.remainingAbsences === 1 ? 'disponible' : 'disponibles'}
              </span>
            </div>

            <div
              className={`attendance-progress-wrap ${
                resolved.isWarning || resolved.isExceeded ? 'is-alert' : ''
              }`.trim()}
            >
              <SwissProgressBar
                value={resolved.absencesCount}
                max={resolved.maxAbsences}
                ariaLabel="Porcentaje de faltas acumuladas"
              />
            </div>
          </div>

          {resolved.isWarning ? (
            <div
              className="attendance-alert is-warning"
              role="alert"
              data-testid="attendance-warning-banner"
            >
              Queda 1 falta disponible antes de alcanzar el límite de{' '}
              {resolved.maxAbsences}.
            </div>
          ) : null}

          {resolved.isExceeded ? (
            <div
              className="attendance-alert is-exceeded"
              role="alert"
              data-testid="attendance-exceeded-banner"
            >
              Límite de faltas alcanzado ({resolved.absencesCount} /{' '}
              {resolved.maxAbsences}). Revisá tu condición de regularidad.
            </div>
          ) : null}

          <form
            className="attendance-config-form"
            onSubmit={(e) => void handleSaveMaxAbsences(e)}
          >
            <label htmlFor={maxAbsencesInputId} className="attendance-field-label">
              Límite máximo de faltas
            </label>
            <div className="attendance-config-row">
              <input
                id={maxAbsencesInputId}
                type="number"
                min={1}
                max={50}
                className="swiss-input attendance-max-input"
                value={maxAbsencesDraft}
                onChange={(e) => setMaxAbsencesDraft(e.target.value)}
              />
              <SwissButton
                type="submit"
                variant="secondary"
                disabled={isBusy}
              >
                Guardar límite
              </SwissButton>
            </div>
          </form>

          <div className="attendance-record-composer">
            <div className="attendance-record-fields">
              <div className="attendance-field">
                <label
                  htmlFor={sessionDateInputId}
                  className="attendance-field-label"
                >
                  Fecha de clase
                </label>
                <input
                  id={sessionDateInputId}
                  type="date"
                  className="swiss-input"
                  value={sessionDateDraft}
                  onChange={(e) => setSessionDateDraft(e.target.value)}
                />
              </div>
              <div className="attendance-field">
                <label
                  htmlFor={sessionNoteInputId}
                  className="attendance-field-label"
                >
                  Nota (opcional)
                </label>
                <input
                  id={sessionNoteInputId}
                  type="text"
                  className="swiss-input"
                  placeholder="Ej. Certificado médico, clase práctica…"
                  value={sessionNoteDraft}
                  onChange={(e) => setSessionNoteDraft(e.target.value)}
                />
              </div>
            </div>

            <div className="attendance-actions">
              <SwissButton
                variant="primary"
                disabled={isBusy}
                onClick={() => void handleRecord('absent')}
              >
                + Falta
              </SwissButton>
              <SwissButton
                variant="secondary"
                disabled={isBusy}
                onClick={() => void handleRecord('present')}
              >
                + Asistencia
              </SwissButton>
            </div>
          </div>

          <div className="attendance-records">
            <span className="swiss-section-label">
              Registros recientes ({resolved.records.length})
            </span>
            {resolved.records.length === 0 ? (
              <p className="swiss-meta">
                Todavía no registraste asistencias ni faltas en esta materia.
              </p>
            ) : (
              <ul className="attendance-records-list">
                {resolved.records.map((rec) => (
                  <li key={rec.id} className="attendance-record-row">
                    <div className="attendance-record-info">
                      <span className="attendance-record-date">
                        {formatDateDisplay(rec.sessionDate)}
                      </span>
                      <span
                        className={`attendance-record-status ${
                          rec.status === 'absent' ? 'is-absent' : 'is-present'
                        }`.trim()}
                      >
                        {rec.status === 'absent' ? 'Falta' : 'Presente'}
                      </span>
                      {rec.note ? (
                        <span className="attendance-record-note">{rec.note}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="swiss-link attendance-delete-btn"
                      disabled={isBusy}
                      aria-label={`Eliminar registro del ${formatDateDisplay(rec.sessionDate)}`}
                      onClick={() => void handleDeleteRecord(rec.id)}
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
