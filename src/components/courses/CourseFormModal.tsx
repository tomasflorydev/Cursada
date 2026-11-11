import { useEffect, useId, useRef, useState } from 'react';
import { DAY_NAMES_ES, isValidTimeFormat, isValidTimeRange } from '../../lib/dates';
import type {
  ClassScheduleInput,
  CourseColor,
  CourseWithSchedules,
  CreateCourseInput,
  DayOfWeek,
  UpdateCourseInput,
} from '../../types/domain';
import { COURSE_COLOR_OPTIONS } from './courseColors';

export interface CourseFormModalProps {
  isOpen: boolean;
  initialCourse?: CourseWithSchedules | null;
  onClose: () => void;
  onSubmit: (
    data: CreateCourseInput | UpdateCourseInput,
    courseId?: string
  ) => Promise<void>;
}

interface EditableScheduleRow {
  rowKey: string;
  id?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location: string;
}

const DEFAULT_TERM = '2026 - 2° Cuatrimestre';
const DAYS_ORDER: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

let rowSeq = 1;
function makeScheduleRow(partial?: Partial<EditableScheduleRow>): EditableScheduleRow {
  return {
    rowKey: `sched-row-${++rowSeq}`,
    id: partial?.id,
    dayOfWeek: partial?.dayOfWeek ?? 1,
    startTime: partial?.startTime ?? '18:30',
    endTime: partial?.endTime ?? '22:30',
    location: partial?.location ?? '',
  };
}

export function CourseFormModal({
  isOpen,
  initialCourse,
  onClose,
  onSubmit,
}: CourseFormModalProps) {
  const baseId = useId();
  const titleId = `${baseId}-dialog-title`;
  const errorId = `${baseId}-form-error`;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const isEditing = Boolean(initialCourse);

  const [name, setName] = useState('');
  const [color, setColor] = useState<CourseColor>('blue');
  const [professor, setProfessor] = useState('');
  const [term, setTerm] = useState(DEFAULT_TERM);
  const [schedules, setSchedules] = useState<EditableScheduleRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (initialCourse) {
      setName(initialCourse.name);
      setColor(initialCourse.color);
      setProfessor(initialCourse.professor);
      setTerm(initialCourse.term);
      setSchedules(
        initialCourse.schedules.map((s) =>
          makeScheduleRow({
            id: s.id,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            location: s.location,
          })
        )
      );
    } else {
      setName('');
      setColor('blue');
      setProfessor('');
      setTerm(DEFAULT_TERM);
      setSchedules([makeScheduleRow({ dayOfWeek: 1, startTime: '18:30', endTime: '22:30' })]);
    }
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, initialCourse]);

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

  function handleAddScheduleRow(): void {
    setErrorMessage(null);
    setSchedules((prev) => [
      ...prev,
      makeScheduleRow({ dayOfWeek: 1, startTime: '18:30', endTime: '22:30' }),
    ]);
  }

  function handleRemoveScheduleRow(rowKey: string): void {
    setErrorMessage(null);
    setSchedules((prev) => prev.filter((r) => r.rowKey !== rowKey));
  }

  function handleUpdateScheduleRow(
    rowKey: string,
    patch: Partial<EditableScheduleRow>
  ): void {
    setErrorMessage(null);
    setSchedules((prev) =>
      prev.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row))
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedTerm = term.trim();

    if (!trimmedName) {
      setErrorMessage('El nombre de la materia es obligatorio.');
      nameInputRef.current?.focus();
      return;
    }

    if (!trimmedTerm) {
      setErrorMessage('El cuatrimestre es obligatorio.');
      return;
    }

    for (let i = 0; i < schedules.length; i++) {
      const row = schedules[i];
      const dayLabel = DAY_NAMES_ES[row.dayOfWeek];
      if (!isValidTimeFormat(row.startTime) || !isValidTimeFormat(row.endTime)) {
        setErrorMessage(
          `El horario #${i + 1} (${dayLabel}) debe tener formato HH:MM válido (00:00 a 23:59).`
        );
        return;
      }
      if (!isValidTimeRange(row.startTime, row.endTime)) {
        setErrorMessage(
          `En el horario #${i + 1} (${dayLabel}), la hora de inicio (${row.startTime}) debe ser anterior a la hora de fin (${row.endTime}).`
        );
        return;
      }
    }

    const scheduleInputs: ClassScheduleInput[] = schedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location.trim(),
    }));

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit(
        {
          name: trimmedName,
          color,
          professor: professor.trim(),
          term: trimmedTerm,
          schedules: scheduleInputs,
        },
        initialCourse?.id
      );
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'No se pudo guardar la materia.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="cursada-modal-dialog"
      aria-labelledby={titleId}
      onClose={handleDialogClose}
    >
      <div className="cursada-modal-content">
        <header className="cursada-modal-header">
          <h2 id={titleId} className="cursada-modal-title">
            {isEditing ? 'Editar materia' : 'Nueva materia'}
          </h2>
          <button
            type="button"
            className="ghost-action-button"
            onClick={handleDialogClose}
          >
            Cerrar
          </button>
        </header>

        <form noValidate onSubmit={(e) => void handleSubmit(e)} className="course-form">
          {errorMessage ? (
            <div id={errorId} role="alert" className="course-form-alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="course-form-grid">
            <div className="course-form-field course-form-field-full">
              <label htmlFor={`${baseId}-name`} className="course-form-label">
                Nombre de la materia <span aria-hidden="true">*</span>
              </label>
              <input
                ref={nameInputRef}
                id={`${baseId}-name`}
                name="name"
                type="text"
                className="course-form-input"
                placeholder="Ej. Algoritmos y Estructuras de Datos"
                value={name}
                required
                autoFocus
                aria-invalid={!name.trim() && Boolean(errorMessage) ? 'true' : undefined}
                aria-describedby={errorMessage ? errorId : undefined}
                onChange={(e) => {
                  setErrorMessage(null);
                  setName(e.target.value);
                }}
              />
            </div>

            <div className="course-form-field">
              <label htmlFor={`${baseId}-professor`} className="course-form-label">
                Profesor / Cátedra
              </label>
              <input
                id={`${baseId}-professor`}
                name="professor"
                type="text"
                className="course-form-input"
                placeholder="Ej. Martín Echeverría"
                value={professor}
                onChange={(e) => {
                  setErrorMessage(null);
                  setProfessor(e.target.value);
                }}
              />
            </div>

            <div className="course-form-field">
              <label htmlFor={`${baseId}-term`} className="course-form-label">
                Cuatrimestre <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${baseId}-term`}
                name="term"
                type="text"
                className="course-form-input"
                placeholder="Ej. 2026 - 2° Cuatrimestre"
                value={term}
                required
                onChange={(e) => {
                  setErrorMessage(null);
                  setTerm(e.target.value);
                }}
              />
            </div>

            <div className="course-form-field course-form-field-full">
              <label htmlFor={`${baseId}-color`} className="course-form-label">
                Color
              </label>
              <div className="course-color-selector-row">
                <select
                  id={`${baseId}-color`}
                  name="color"
                  className="course-form-select"
                  value={color}
                  onChange={(e) => {
                    setErrorMessage(null);
                    setColor(e.target.value as CourseColor);
                  }}
                >
                  {COURSE_COLOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <div className="course-color-swatches" role="group" aria-label="Paleta rápida de colores">
                  {COURSE_COLOR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`course-color-swatch ${color === opt.value ? 'is-selected' : ''}`}
                      data-course-color={opt.value}
                      aria-label={`Elegir tono ${opt.label}`}
                      aria-pressed={color === opt.value}
                      onClick={() => {
                        setErrorMessage(null);
                        setColor(opt.value);
                      }}
                    >
                      <span className="course-dot" data-course-color={opt.value} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <fieldset className="course-schedules-fieldset">
            <legend className="course-schedules-legend">Horarios semanales de cursada</legend>
            <div className="course-schedules-toolbar">
              <span className="course-schedules-hint">
                Configurá los días y franjas horarias en que cursás esta materia.
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={handleAddScheduleRow}
              >
                Agregar horario
              </button>
            </div>

            {schedules.length === 0 ? (
              <p className="course-schedules-empty">
                No agregaste bloques horarios todavía. Podés agregar uno con &ldquo;Agregar horario&rdquo;.
              </p>
            ) : (
              <div className="course-schedules-rows">
                {schedules.map((row, idx) => {
                  const rowPrefix = `${baseId}-sched-${idx}`;
                  return (
                    <div key={row.rowKey} className="course-schedule-row" data-testid={`schedule-row-${idx}`}>
                      <div className="course-form-field">
                        <label htmlFor={`${rowPrefix}-day`} className="course-form-label">
                          {idx === 0 ? 'Día' : `Día (${idx + 1})`}
                        </label>
                        <select
                          id={`${rowPrefix}-day`}
                          name={`schedule-day-${idx}`}
                          className="course-form-select"
                          value={row.dayOfWeek}
                          onChange={(e) =>
                            handleUpdateScheduleRow(row.rowKey, {
                              dayOfWeek: Number(e.target.value) as DayOfWeek,
                            })
                          }
                        >
                          {DAYS_ORDER.map((d) => (
                            <option key={d} value={d}>
                              {DAY_NAMES_ES[d]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="course-form-field">
                        <label htmlFor={`${rowPrefix}-start`} className="course-form-label">
                          {idx === 0 ? 'Hora de inicio' : `Hora de inicio (${idx + 1})`}
                        </label>
                        <input
                          id={`${rowPrefix}-start`}
                          name={`schedule-start-${idx}`}
                          type="time"
                          className="course-form-input"
                          value={row.startTime}
                          required
                          onChange={(e) =>
                            handleUpdateScheduleRow(row.rowKey, {
                              startTime: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="course-form-field">
                        <label htmlFor={`${rowPrefix}-end`} className="course-form-label">
                          {idx === 0 ? 'Hora de fin' : `Hora de fin (${idx + 1})`}
                        </label>
                        <input
                          id={`${rowPrefix}-end`}
                          name={`schedule-end-${idx}`}
                          type="time"
                          className="course-form-input"
                          value={row.endTime}
                          required
                          onChange={(e) =>
                            handleUpdateScheduleRow(row.rowKey, {
                              endTime: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="course-form-field course-schedule-location-field">
                        <label htmlFor={`${rowPrefix}-location`} className="course-form-label">
                          {idx === 0
                            ? 'Aula / Sede / Modalidad'
                            : `Aula / Sede / Modalidad (${idx + 1})`}
                        </label>
                        <input
                          id={`${rowPrefix}-location`}
                          name={`schedule-location-${idx}`}
                          type="text"
                          className="course-form-input"
                          placeholder="Ej. Aula 402 · Lima o Virtual"
                          value={row.location}
                          onChange={(e) =>
                            handleUpdateScheduleRow(row.rowKey, {
                              location: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="course-schedule-remove-col">
                        <button
                          type="button"
                          className="ghost-action-button course-remove-schedule-btn"
                          aria-label={`Quitar horario ${idx + 1}`}
                          onClick={() => handleRemoveScheduleRow(row.rowKey)}
                        >
                          Quitar horario
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          <footer className="cursada-modal-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={handleDialogClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting}
            >
              {isEditing ? 'Guardar cambios' : 'Crear materia'}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
