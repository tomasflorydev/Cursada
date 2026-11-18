import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import {
  formatPomodoroTime,
  getPomodoroState,
  linkPomodoroCourse,
  pausePomodoro,
  resetPomodoro,
  skipPomodoroPhase,
  startPomodoro,
  subscribePomodoro,
  subscribePomodoroNotifications,
  updatePomodoroSettings,
  type PomodoroNotificationPayload,
  type PomodoroPhase,
} from '../../lib/pomodoro/pomodoroStore';
import { SwissButton, SwissErrorAlert, SwissSwitch } from '../../ui';

export interface PomodoroHeaderWidgetProps {
  activeCourseId?: string | null;
  activeCourseName?: string | null;
  onNotify?: (payload: PomodoroNotificationPayload) => void;
}

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: 'Enfoque',
  short_break: 'Descanso',
  long_break: 'Descanso largo',
};

export function PomodoroHeaderWidget({
  activeCourseId,
  activeCourseName,
  onNotify,
}: PomodoroHeaderWidgetProps) {
  const state = useSyncExternalStore(
    subscribePomodoro,
    getPomodoroState,
    getPomodoroState
  );

  const baseId = useId();
  const focusInputId = `${baseId}-focus-min`;
  const shortInputId = `${baseId}-short-min`;
  const longInputId = `${baseId}-long-min`;
  const roundsInputId = `${baseId}-rounds`;
  const notifyId = `${baseId}-notify`;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [focusDraft, setFocusDraft] = useState(String(state.settings.focusMinutes));
  const [shortDraft, setShortDraft] = useState(
    String(state.settings.shortBreakMinutes)
  );
  const [longDraft, setLongDraft] = useState(
    String(state.settings.longBreakMinutes)
  );
  const [roundsDraft, setRoundsDraft] = useState(
    String(state.settings.roundsBeforeLongBreak)
  );
  const [notifyDraft, setNotifyDraft] = useState(state.settings.notifyOnComplete);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [lastNotice, setLastNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  // Link active course context when viewing a course while idle
  useEffect(() => {
    if (activeCourseId && (!state.isRunning || !state.linkedCourseId)) {
      linkPomodoroCourse(activeCourseId, activeCourseName ?? null);
    }
  }, [activeCourseId, activeCourseName, state.isRunning, state.linkedCourseId]);

  useEffect(() => {
    return subscribePomodoroNotifications((payload) => {
      setLastNotice(payload.title);
      onNotifyRef.current?.(payload);
    });
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      setFocusDraft(String(state.settings.focusMinutes));
      setShortDraft(String(state.settings.shortBreakMinutes));
      setLongDraft(String(state.settings.longBreakMinutes));
      setRoundsDraft(String(state.settings.roundsBeforeLongBreak));
      setNotifyDraft(state.settings.notifyOnComplete);
      setSettingsError(null);
    }
  }, [isSettingsOpen, state.settings]);

  const showFullControls = state.isRunning || isExpanded || isSettingsOpen;

  useEffect(() => {
    if (!showFullControls) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsSettingsOpen(false);
        if (!state.isRunning) {
          setIsExpanded(false);
        }
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (!state.isRunning) {
          setIsExpanded(false);
        }
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showFullControls, isSettingsOpen, state.isRunning]);

  function handleSaveSettings(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSettingsError(null);
    try {
      updatePomodoroSettings({
        focusMinutes: Number(focusDraft),
        shortBreakMinutes: Number(shortDraft),
        longBreakMinutes: Number(longDraft),
        roundsBeforeLongBreak: Number(roundsDraft),
        notifyOnComplete: notifyDraft,
      });
      setIsSettingsOpen(false);
    } catch (err) {
      setSettingsError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la configuración del Pomodoro.'
      );
    }
  }

  const formattedTime = formatPomodoroTime(state.remainingSeconds);
  const currentRoundDisplay =
    (state.completedFocusRounds % state.settings.roundsBeforeLongBreak) + 1;

  return (
    <div
      ref={containerRef}
      className={`pomodoro-widget ${state.isRunning ? 'is-running' : ''} ${
        showFullControls ? 'is-expanded' : 'is-compact'
      }`.trim()}
      role="region"
      aria-label="Temporizador Pomodoro"
    >
      {showFullControls ? (
        <>
          <div className="pomodoro-status-group">
            <span
              className={`pomodoro-phase ${state.isRunning ? 'is-running' : ''}`.trim()}
              data-testid="pomodoro-phase"
            >
              {PHASE_LABELS[state.phase]}
            </span>
            <button
              type="button"
              className="pomodoro-timer-toggle"
              aria-expanded={true}
              title={
                state.isRunning
                  ? 'Temporizador de enfoque en curso'
                  : 'Contraer controles de enfoque'
              }
              onClick={() => {
                if (!state.isRunning) {
                  setIsSettingsOpen(false);
                  setIsExpanded(false);
                }
              }}
            >
              <span
                className="pomodoro-timer"
                data-testid="pomodoro-timer"
                aria-live="off"
              >
                {formattedTime}
              </span>
            </button>
            {state.linkedCourseName ? (
              <span
                className="pomodoro-course-tag"
                title={`Vinculado a ${state.linkedCourseName}`}
              >
                {state.linkedCourseName}
              </span>
            ) : null}
          </div>

          <div className="pomodoro-controls">
            {state.isRunning ? (
              <button
                type="button"
                className="pomodoro-btn is-running"
                onClick={() => pausePomodoro()}
              >
                Pausar
              </button>
            ) : (
              <button
                type="button"
                className="pomodoro-btn"
                onClick={() => {
                  setLastNotice(null);
                  setIsExpanded(true);
                  startPomodoro();
                }}
              >
                Iniciar
              </button>
            )}
            <button
              type="button"
              className="pomodoro-btn"
              onClick={() => {
                setLastNotice(null);
                skipPomodoroPhase();
              }}
            >
              Saltar
            </button>
            <button
              type="button"
              className="pomodoro-btn"
              onClick={() => {
                setLastNotice(null);
                resetPomodoro();
              }}
            >
              Reiniciar
            </button>
            <button
              type="button"
              className={`pomodoro-btn ${isSettingsOpen ? 'is-active' : ''}`.trim()}
              aria-expanded={isSettingsOpen}
              aria-label="Configurar Pomodoro"
              onClick={() => setIsSettingsOpen((open) => !open)}
            >
              Config ▾
            </button>
          </div>
        </>
      ) : (
        <div className="pomodoro-compact-group">
          <span className="visually-hidden" data-testid="pomodoro-phase">
            {PHASE_LABELS[state.phase]}
          </span>
          {state.linkedCourseName ? (
            <span className="visually-hidden">{state.linkedCourseName}</span>
          ) : null}
          <button
            type="button"
            className="pomodoro-timer-toggle"
            aria-expanded={false}
            title="Mostrar controles de enfoque"
            onClick={() => setIsExpanded(true)}
          >
            <span
              className="pomodoro-timer"
              data-testid="pomodoro-timer"
              aria-live="off"
            >
              {formattedTime}
            </span>
          </button>
          <button
            type="button"
            className="pomodoro-btn pomodoro-play-btn"
            aria-label="Iniciar"
            title="Iniciar bloque de enfoque"
            onClick={() => {
              setLastNotice(null);
              setIsExpanded(true);
              startPomodoro();
            }}
          >
            ▶
          </button>
        </div>
      )}

      {lastNotice ? (
        <div className="pomodoro-notice" role="status" aria-live="polite">
          <span>{lastNotice}</span>
          <button
            type="button"
            className="pomodoro-notice-dismiss"
            aria-label="Cerrar aviso de Pomodoro"
            onClick={() => setLastNotice(null)}
          >
            Cerrar
          </button>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div
          className="pomodoro-popover"
          role="dialog"
          aria-label="Configuración de Pomodoro"
        >
          <form
            className="pomodoro-popover-form"
            onSubmit={handleSaveSettings}
            noValidate
          >
            <div className="pomodoro-popover-head">
              <span className="swiss-section-label">Temporizador Pomodoro</span>
              <span className="swiss-meta">
                Bloque actual: {currentRoundDisplay} de {state.settings.roundsBeforeLongBreak}
              </span>
            </div>

            {settingsError ? <SwissErrorAlert message={settingsError} /> : null}

            <div className="pomodoro-form-grid">
              <div className="pomodoro-field">
                <label htmlFor={focusInputId} className="pomodoro-field-label">
                  Enfoque (min)
                </label>
                <input
                  id={focusInputId}
                  type="number"
                  min={1}
                  max={180}
                  className="swiss-input"
                  value={focusDraft}
                  onChange={(e) => setFocusDraft(e.target.value)}
                />
              </div>

              <div className="pomodoro-field">
                <label htmlFor={shortInputId} className="pomodoro-field-label">
                  Descanso corto (min)
                </label>
                <input
                  id={shortInputId}
                  type="number"
                  min={1}
                  max={60}
                  className="swiss-input"
                  value={shortDraft}
                  onChange={(e) => setShortDraft(e.target.value)}
                />
              </div>

              <div className="pomodoro-field">
                <label htmlFor={longInputId} className="pomodoro-field-label">
                  Descanso largo (min)
                </label>
                <input
                  id={longInputId}
                  type="number"
                  min={1}
                  max={60}
                  className="swiss-input"
                  value={longDraft}
                  onChange={(e) => setLongDraft(e.target.value)}
                />
              </div>

              <div className="pomodoro-field">
                <label htmlFor={roundsInputId} className="pomodoro-field-label">
                  Rondas por ciclo
                </label>
                <input
                  id={roundsInputId}
                  type="number"
                  min={1}
                  max={12}
                  className="swiss-input"
                  value={roundsDraft}
                  onChange={(e) => setRoundsDraft(e.target.value)}
                />
              </div>
            </div>

            <div className="pomodoro-switch-row">
              <label htmlFor={notifyId} className="pomodoro-field-label">
                Notificar al completar bloque
              </label>
              <SwissSwitch
                id={notifyId}
                checked={notifyDraft}
                ariaLabel="Notificar al completar bloque"
                onChange={setNotifyDraft}
              />
            </div>

            <div className="pomodoro-popover-actions">
              <SwissButton variant="primary" type="submit">
                Guardar
              </SwissButton>
              <SwissButton
                variant="secondary"
                onClick={() => setIsSettingsOpen(false)}
              >
                Cerrar
              </SwissButton>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
