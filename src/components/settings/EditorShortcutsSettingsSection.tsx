import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type {
  EditorShortcutActionId,
  EditorShortcutsMap,
} from '../../types/domain';
import { SwissButton, SwissErrorAlert, SwissSectionHeader } from '../../ui';
import {
  DEFAULT_EDITOR_SHORTCUTS,
  detectEditorShortcutCollisions,
  EDITOR_SHORTCUT_DEFINITIONS,
  eventToShortcutBinding,
  formatShortcutBindingForDisplay,
  getStoredEditorShortcuts,
  normalizeShortcutBinding,
  resetEditorShortcuts,
  saveEditorShortcuts,
} from '../../lib/editor/editorShortcuts';

const ACTION_TITLE_BY_ID: Record<EditorShortcutActionId, string> =
  EDITOR_SHORTCUT_DEFINITIONS.reduce((acc, def) => {
    acc[def.id] = def.title;
    return acc;
  }, {} as Record<EditorShortcutActionId, string>);

function isCompleteBindingCandidate(raw: string, normalized: string): boolean {
  if (!normalized) return false;
  const trimmed = raw.trim();
  return (
    trimmed.includes('+') ||
    trimmed.includes('-') ||
    /[⌘⌃⌥⇧]/.test(trimmed) ||
    /^F\d{1,2}$/i.test(trimmed)
  );
}

/**
 * Swiss settings panel for viewing, customizing, collision-checking,
 * and resetting configurable Markdown editor keyboard shortcuts.
 */
export function EditorShortcutsSettingsSection() {
  const [shortcuts, setShortcuts] = useState<EditorShortcutsMap>(() =>
    getStoredEditorShortcuts()
  );
  const [draftInputs, setDraftInputs] = useState<EditorShortcutsMap>(() =>
    getStoredEditorShortcuts()
  );
  const [capturingActionId, setCapturingActionId] =
    useState<EditorShortcutActionId | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const collisions = useMemo(
    () => detectEditorShortcutCollisions(shortcuts),
    [shortcuts]
  );

  const collidingActionIds = useMemo(() => {
    const set = new Set<EditorShortcutActionId>();
    for (const collision of collisions) {
      for (const actionId of collision.actionIds) {
        set.add(actionId);
      }
    }
    return set;
  }, [collisions]);

  function commitShortcut(
    actionId: EditorShortcutActionId,
    nextBinding: string
  ): void {
    const normalized = normalizeShortcutBinding(nextBinding);
    if (!normalized) {
      setDraftInputs((prev) => ({
        ...prev,
        [actionId]: shortcuts[actionId],
      }));
      return;
    }

    const nextMap: EditorShortcutsMap = {
      ...shortcuts,
      [actionId]: normalized,
    };
    const saved = saveEditorShortcuts(nextMap);
    setShortcuts(saved);
    setDraftInputs(saved);
    setStatusMessage(
      `Atajo actualizado para «${ACTION_TITLE_BY_ID[actionId]}»: ${formatShortcutBindingForDisplay(
        saved[actionId]
      )}`
    );
  }

  function handleInputChange(
    actionId: EditorShortcutActionId,
    rawValue: string
  ): void {
    setDraftInputs((prev) => ({
      ...prev,
      [actionId]: rawValue,
    }));

    const normalized = normalizeShortcutBinding(rawValue);
    if (isCompleteBindingCandidate(rawValue, normalized)) {
      const nextMap: EditorShortcutsMap = {
        ...shortcuts,
        [actionId]: normalized,
      };
      const saved = saveEditorShortcuts(nextMap);
      setShortcuts(saved);
      setStatusMessage(null);
    }
  }

  function handleInputBlur(actionId: EditorShortcutActionId): void {
    const draft = draftInputs[actionId];
    const normalized = normalizeShortcutBinding(draft);
    if (isCompleteBindingCandidate(draft, normalized)) {
      commitShortcut(actionId, normalized);
    } else {
      setDraftInputs((prev) => ({
        ...prev,
        [actionId]: shortcuts[actionId],
      }));
    }
  }

  function handleInputKeyDown(
    actionId: EditorShortcutActionId,
    event: ReactKeyboardEvent<HTMLInputElement>
  ): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleInputBlur(actionId);
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraftInputs((prev) => ({
        ...prev,
        [actionId]: shortcuts[actionId],
      }));
      event.currentTarget.blur();
    }
  }

  function handleCaptureKeyDown(
    actionId: EditorShortcutActionId,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void {
    if (capturingActionId !== actionId) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setCapturingActionId(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const captured = eventToShortcutBinding(event);
    if (!captured) {
      return;
    }

    commitShortcut(actionId, captured);
    setCapturingActionId(null);
  }

  function handleResetDefaults(): void {
    const defaults = resetEditorShortcuts();
    setShortcuts(defaults);
    setDraftInputs({ ...DEFAULT_EDITOR_SHORTCUTS });
    setCapturingActionId(null);
    setStatusMessage('Atajos restaurados a los valores por defecto.');
  }

  return (
    <section
      id="settings-editor-shortcuts"
      className="settings-section-block editor-shortcuts-section"
      aria-labelledby="settings-editor-shortcuts-heading"
    >
      <SwissSectionHeader
        title="Atajos del editor Markdown"
        right={
          <SwissButton variant="secondary" onClick={handleResetDefaults}>
            Restaurar valores por defecto
          </SwissButton>
        }
      />

      <h3 id="settings-editor-shortcuts-heading" className="visually-hidden">
        Atajos del editor Markdown
      </h3>

      {collisions.length > 0 ? (
        <div
          className="editor-shortcuts-collision-banner"
          data-testid="editor-shortcuts-collision-warning"
        >
          <SwissErrorAlert
            message={collisions
              .map((col) => {
                const names = col.actionIds
                  .map((id) => ACTION_TITLE_BY_ID[id])
                  .join(' y ');
                return `Colisión detectada en ${formatShortcutBindingForDisplay(
                  col.binding
                )} (${col.binding}): asignado a ${names}.`;
              })
              .join(' ')}
          />
        </div>
      ) : null}

      {statusMessage ? (
        <p className="swiss-meta-md editor-shortcuts-status" role="status">
          {statusMessage}
        </p>
      ) : null}

      <div className="editor-shortcuts-list">
        {EDITOR_SHORTCUT_DEFINITIONS.map((def) => {
          const isColliding = collidingActionIds.has(def.id);
          const isCapturing = capturingActionId === def.id;
          const activeBinding = shortcuts[def.id];
          const displayBadge = formatShortcutBindingForDisplay(activeBinding);

          return (
            <div
              key={def.id}
              data-testid={`editor-shortcut-row-${def.id}`}
              data-collision={isColliding ? 'true' : 'false'}
              className={`settings-row editor-shortcut-row ${
                isColliding ? 'is-collision' : ''
              }`.trim()}
            >
              <div className="settings-row-info">
                <div className="settings-row-title">{def.title}</div>
                <div className="settings-row-desc">{def.description}</div>
              </div>

              <div className="settings-row-control editor-shortcut-controls">
                <kbd
                  className="editor-shortcut-kbd"
                  title={activeBinding}
                  data-testid={`editor-shortcut-kbd-${def.id}`}
                >
                  {displayBadge}
                </kbd>

                <input
                  type="text"
                  className="swiss-input editor-shortcut-input"
                  aria-label={`Atajo para ${def.title}`}
                  value={draftInputs[def.id]}
                  onChange={(e) => handleInputChange(def.id, e.target.value)}
                  onBlur={() => handleInputBlur(def.id)}
                  onKeyDown={(e) => handleInputKeyDown(def.id, e)}
                  placeholder={def.defaultBinding}
                />

                <SwissButton
                  variant={isCapturing ? 'primary' : 'secondary'}
                  className="editor-shortcut-capture-btn"
                  aria-label={`Capturar atajo para ${def.title}`}
                  aria-pressed={isCapturing}
                  onClick={() =>
                    setCapturingActionId((prev) =>
                      prev === def.id ? null : def.id
                    )
                  }
                  onKeyDown={(e) => handleCaptureKeyDown(def.id, e)}
                >
                  {isCapturing ? 'Presioná teclas…' : 'Capturar'}
                </SwissButton>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
