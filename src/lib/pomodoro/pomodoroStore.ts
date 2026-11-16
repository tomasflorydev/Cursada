import type { PomodoroSettings } from '../../types/domain';

export type PomodoroPhase = 'focus' | 'short_break' | 'long_break';

export interface PomodoroNotificationPayload {
  completedPhase: PomodoroPhase;
  nextPhase: PomodoroPhase;
  completedFocusRounds: number;
  title: string;
  body: string;
  linkedCourseId: string | null;
  linkedCourseName: string | null;
}

export interface PomodoroState {
  settings: PomodoroSettings;
  phase: PomodoroPhase;
  remainingSeconds: number;
  isRunning: boolean;
  completedFocusRounds: number;
  linkedCourseId: string | null;
  linkedCourseName: string | null;
}

export const POMODORO_STORAGE_KEY = 'cursada-pomodoro-v1';

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  notifyOnComplete: true,
};

interface PersistedPomodoroPayload {
  settings: PomodoroSettings;
  phase: PomodoroPhase;
  remainingSeconds: number;
  completedFocusRounds: number;
  linkedCourseId: string | null;
  linkedCourseName: string | null;
}

type PomodoroListener = () => void;
type PomodoroNotificationHook = (payload: PomodoroNotificationPayload) => void;

const stateListeners = new Set<PomodoroListener>();
const notificationHooks = new Set<PomodoroNotificationHook>();

let initialized = false;
let currentState: PomodoroState = createDefaultState();
let intervalId: number | null = null;

function isValidPhase(value: unknown): value is PomodoroPhase {
  return value === 'focus' || value === 'short_break' || value === 'long_break';
}

function validateIntRange(
  value: unknown,
  min: number,
  max: number,
  label: string
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${label} debe ser un número entero entre ${min} y ${max}.`);
  }
  return value;
}

export function validatePomodoroSettings(
  candidate: Partial<PomodoroSettings>,
  base: PomodoroSettings = DEFAULT_POMODORO_SETTINGS
): PomodoroSettings {
  const focusMinutes =
    candidate.focusMinutes !== undefined
      ? validateIntRange(candidate.focusMinutes, 1, 180, 'Los minutos de enfoque')
      : base.focusMinutes;
  const shortBreakMinutes =
    candidate.shortBreakMinutes !== undefined
      ? validateIntRange(
          candidate.shortBreakMinutes,
          1,
          60,
          'Los minutos de descanso corto'
        )
      : base.shortBreakMinutes;
  const longBreakMinutes =
    candidate.longBreakMinutes !== undefined
      ? validateIntRange(
          candidate.longBreakMinutes,
          1,
          60,
          'Los minutos de descanso largo'
        )
      : base.longBreakMinutes;
  const roundsBeforeLongBreak =
    candidate.roundsBeforeLongBreak !== undefined
      ? validateIntRange(
          candidate.roundsBeforeLongBreak,
          1,
          12,
          'Las rondas antes del descanso largo'
        )
      : base.roundsBeforeLongBreak;
  const notifyOnComplete =
    candidate.notifyOnComplete !== undefined
      ? Boolean(candidate.notifyOnComplete)
      : base.notifyOnComplete;

  return {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    roundsBeforeLongBreak,
    notifyOnComplete,
  };
}

export function getPhaseDurationSeconds(
  settings: PomodoroSettings,
  phase: PomodoroPhase
): number {
  switch (phase) {
    case 'focus':
      return settings.focusMinutes * 60;
    case 'short_break':
      return settings.shortBreakMinutes * 60;
    case 'long_break':
      return settings.longBreakMinutes * 60;
  }
}

function createDefaultState(): PomodoroState {
  const settings = { ...DEFAULT_POMODORO_SETTINGS };
  return {
    settings,
    phase: 'focus',
    remainingSeconds: getPhaseDurationSeconds(settings, 'focus'),
    isRunning: false,
    completedFocusRounds: 0,
    linkedCourseId: null,
    linkedCourseName: null,
  };
}

function readFromStorage(): PomodoroState {
  const fallback = createDefaultState();
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback;
    }
    const raw = window.localStorage.getItem(POMODORO_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedPomodoroPayload>;
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }

    let settings = fallback.settings;
    if (parsed.settings && typeof parsed.settings === 'object') {
      try {
        settings = validatePomodoroSettings(parsed.settings, fallback.settings);
      } catch {
        settings = fallback.settings;
      }
    }

    const phase: PomodoroPhase = isValidPhase(parsed.phase) ? parsed.phase : 'focus';
    const maxDuration = getPhaseDurationSeconds(settings, phase);
    const remainingSeconds =
      typeof parsed.remainingSeconds === 'number' &&
      Number.isInteger(parsed.remainingSeconds) &&
      parsed.remainingSeconds >= 1 &&
      parsed.remainingSeconds <= maxDuration
        ? parsed.remainingSeconds
        : maxDuration;

    const completedFocusRounds =
      typeof parsed.completedFocusRounds === 'number' &&
      Number.isInteger(parsed.completedFocusRounds) &&
      parsed.completedFocusRounds >= 0
        ? parsed.completedFocusRounds
        : 0;

    const linkedCourseId =
      typeof parsed.linkedCourseId === 'string' && parsed.linkedCourseId.trim()
        ? parsed.linkedCourseId.trim()
        : null;
    const linkedCourseName =
      linkedCourseId &&
      typeof parsed.linkedCourseName === 'string' &&
      parsed.linkedCourseName.trim()
        ? parsed.linkedCourseName.trim()
        : null;

    return {
      settings,
      phase,
      remainingSeconds,
      isRunning: false,
      completedFocusRounds,
      linkedCourseId,
      linkedCourseName,
    };
  } catch {
    return fallback;
  }
}

function writeToStorage(state: PomodoroState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const payload: PersistedPomodoroPayload = {
      settings: { ...state.settings },
      phase: state.phase,
      remainingSeconds: state.remainingSeconds,
      completedFocusRounds: state.completedFocusRounds,
      linkedCourseId: state.linkedCourseId,
      linkedCourseName: state.linkedCourseName,
    };
    window.localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function ensureInitialized(): void {
  if (!initialized) {
    currentState = readFromStorage();
    initialized = true;
  }
}

function clearTicker(): void {
  if (intervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(intervalId);
  }
  intervalId = null;
}

function startTicker(): void {
  clearTicker();
  if (typeof window === 'undefined') {
    return;
  }
  intervalId = window.setInterval(() => {
    if (currentState.isRunning) {
      tickPomodoro(1);
    }
  }, 1000);
}

function commitState(next: PomodoroState, options?: { persist?: boolean }): PomodoroState {
  currentState = next;
  if (options?.persist !== false) {
    writeToStorage(next);
  }
  for (const listener of stateListeners) {
    listener();
  }
  return currentState;
}

function dispatchCompletionNotification(
  payload: PomodoroNotificationPayload
): void {
  for (const hook of notificationHooks) {
    try {
      hook(payload);
    } catch {
      // Isolate hook errors
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent<PomodoroNotificationPayload>('cursada:pomodoro-complete', {
        detail: payload,
      })
    );
  }

  try {
    const NotificationCtor =
      typeof globalThis !== 'undefined'
        ? (globalThis as { Notification?: typeof Notification }).Notification
        : undefined;
    if (typeof NotificationCtor === 'function') {
      const permission = (NotificationCtor as { permission?: string }).permission;
      if (permission !== 'denied') {
        new NotificationCtor(payload.title, { body: payload.body });
      }
    }
  } catch {
    // Ignore browser notification restrictions when headless/ungranted
  }
}

function buildNotificationPayload(
  completedPhase: PomodoroPhase,
  nextPhase: PomodoroPhase,
  completedFocusRounds: number,
  state: PomodoroState
): PomodoroNotificationPayload {
  const courseTag = state.linkedCourseName ? ` · ${state.linkedCourseName}` : '';

  if (completedPhase === 'focus') {
    const breakMinutes =
      nextPhase === 'long_break'
        ? state.settings.longBreakMinutes
        : state.settings.shortBreakMinutes;
    const breakKind = nextPhase === 'long_break' ? 'descanso largo' : 'descanso corto';
    return {
      completedPhase,
      nextPhase,
      completedFocusRounds,
      title: `Bloque de enfoque finalizado${courseTag}`,
      body: `Completaste ${completedFocusRounds} ${
        completedFocusRounds === 1 ? 'ronda' : 'rondas'
      }. Tomate un ${breakKind} de ${breakMinutes} min.`,
      linkedCourseId: state.linkedCourseId,
      linkedCourseName: state.linkedCourseName,
    };
  }

  return {
    completedPhase,
    nextPhase,
    completedFocusRounds,
    title: `Descanso finalizado${courseTag}`,
    body: state.linkedCourseName
      ? `Volvé al enfoque en ${state.linkedCourseName} (${state.settings.focusMinutes} min).`
      : `Hora de iniciar un nuevo bloque de enfoque (${state.settings.focusMinutes} min).`,
    linkedCourseId: state.linkedCourseId,
    linkedCourseName: state.linkedCourseName,
  };
}

function completeCurrentPhase(state: PomodoroState): PomodoroState {
  clearTicker();
  const completedPhase = state.phase;
  let nextCompletedRounds = state.completedFocusRounds;
  let nextPhase: PomodoroPhase;

  if (completedPhase === 'focus') {
    nextCompletedRounds += 1;
    nextPhase =
      nextCompletedRounds % state.settings.roundsBeforeLongBreak === 0
        ? 'long_break'
        : 'short_break';
  } else {
    nextPhase = 'focus';
  }

  const nextState: PomodoroState = {
    ...state,
    phase: nextPhase,
    remainingSeconds: getPhaseDurationSeconds(state.settings, nextPhase),
    isRunning: false,
    completedFocusRounds: nextCompletedRounds,
  };

  commitState(nextState);

  if (state.settings.notifyOnComplete) {
    dispatchCompletionNotification(
      buildNotificationPayload(
        completedPhase,
        nextPhase,
        nextCompletedRounds,
        nextState
      )
    );
  }

  return nextState;
}

export function getPomodoroState(): PomodoroState {
  ensureInitialized();
  return currentState;
}

export function subscribePomodoro(listener: PomodoroListener): () => void {
  ensureInitialized();
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function subscribePomodoroNotifications(
  hook: PomodoroNotificationHook
): () => void {
  notificationHooks.add(hook);
  return () => {
    notificationHooks.delete(hook);
  };
}

export function startPomodoro(): PomodoroState {
  ensureInitialized();
  if (currentState.isRunning) {
    return currentState;
  }
  const next: PomodoroState = {
    ...currentState,
    isRunning: true,
    remainingSeconds:
      currentState.remainingSeconds > 0
        ? currentState.remainingSeconds
        : getPhaseDurationSeconds(currentState.settings, currentState.phase),
  };
  commitState(next);
  startTicker();
  return next;
}

export function pausePomodoro(): PomodoroState {
  ensureInitialized();
  clearTicker();
  if (!currentState.isRunning) {
    return currentState;
  }
  return commitState({
    ...currentState,
    isRunning: false,
  });
}

export function resetPomodoro(): PomodoroState {
  ensureInitialized();
  clearTicker();
  return commitState({
    ...currentState,
    isRunning: false,
    remainingSeconds: getPhaseDurationSeconds(
      currentState.settings,
      currentState.phase
    ),
  });
}

export function skipPomodoroPhase(): PomodoroState {
  ensureInitialized();
  clearTicker();
  const nextPhase: PomodoroPhase =
    currentState.phase === 'focus' ? 'short_break' : 'focus';
  return commitState({
    ...currentState,
    phase: nextPhase,
    remainingSeconds: getPhaseDurationSeconds(currentState.settings, nextPhase),
    isRunning: false,
  });
}

export function updatePomodoroSettings(
  partial: Partial<PomodoroSettings>
): PomodoroState {
  ensureInitialized();
  const oldSettings = currentState.settings;
  const nextSettings = validatePomodoroSettings(partial, oldSettings);
  const oldPhaseDuration = getPhaseDurationSeconds(oldSettings, currentState.phase);
  const newPhaseDuration = getPhaseDurationSeconds(nextSettings, currentState.phase);

  const shouldResetRemaining =
    !currentState.isRunning && currentState.remainingSeconds === oldPhaseDuration;

  const nextRemaining = shouldResetRemaining
    ? newPhaseDuration
    : Math.min(currentState.remainingSeconds, newPhaseDuration);

  return commitState({
    ...currentState,
    settings: nextSettings,
    remainingSeconds: Math.max(1, nextRemaining),
  });
}

export function linkPomodoroCourse(
  courseId: string | null,
  courseName?: string | null
): PomodoroState {
  ensureInitialized();
  const normalizedId = courseId?.trim() || null;
  const normalizedName = normalizedId ? courseName?.trim() || null : null;

  if (
    currentState.linkedCourseId === normalizedId &&
    currentState.linkedCourseName === normalizedName
  ) {
    return currentState;
  }

  return commitState({
    ...currentState,
    linkedCourseId: normalizedId,
    linkedCourseName: normalizedName,
  });
}

export function tickPomodoro(seconds = 1): PomodoroState {
  ensureInitialized();
  const step = Math.floor(Number(seconds));
  if (!Number.isFinite(step) || step <= 0) {
    return currentState;
  }

  if (currentState.remainingSeconds <= step) {
    return completeCurrentPhase(currentState);
  }

  return commitState({
    ...currentState,
    remainingSeconds: currentState.remainingSeconds - step,
  });
}

export function resetPomodoroStore(): PomodoroState {
  clearTicker();
  initialized = true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(POMODORO_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  return commitState(createDefaultState(), { persist: false });
}

export function formatPomodoroTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
