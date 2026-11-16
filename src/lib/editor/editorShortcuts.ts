import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type {
  EditorShortcutActionId,
  EditorShortcutDefinition,
  EditorShortcutsMap,
} from '../../types/domain';

export const EDITOR_SHORTCUTS_STORAGE_KEY = 'cursada-editor-shortcuts-v1';
export const EDITOR_SHORTCUTS_CHANGED_EVENT = 'cursada-editor-shortcuts-changed';

export const EDITOR_SHORTCUT_DEFINITIONS: readonly EditorShortcutDefinition[] = [
  {
    id: 'bold',
    title: 'Negrita',
    description: 'Envolver o quitar formato de negrita (**texto**).',
    defaultBinding: 'Mod+B',
  },
  {
    id: 'italic',
    title: 'Cursiva',
    description: 'Envolver o quitar formato de cursiva (*texto*).',
    defaultBinding: 'Mod+I',
  },
  {
    id: 'heading_1',
    title: 'Encabezado 1',
    description: 'Convertir o alternar la línea actual como título H1 (# ).',
    defaultBinding: 'Mod+Alt+1',
  },
  {
    id: 'heading_2',
    title: 'Encabezado 2',
    description: 'Convertir o alternar la línea actual como título H2 (## ).',
    defaultBinding: 'Mod+Alt+2',
  },
  {
    id: 'heading_3',
    title: 'Encabezado 3',
    description: 'Convertir o alternar la línea actual como título H3 (### ).',
    defaultBinding: 'Mod+Alt+3',
  },
  {
    id: 'toggle_task',
    title: 'Alternar tarea',
    description: 'Crear o marcar/desmarcar una casilla de tarea (- [ ] / - [x]).',
    defaultBinding: 'Mod+Shift+X',
  },
  {
    id: 'insert_table',
    title: 'Insertar tabla',
    description: 'Insertar una plantilla de tabla Markdown de dos columnas.',
    defaultBinding: 'Mod+Shift+T',
  },
  {
    id: 'insert_callout_note',
    title: 'Insertar callout de nota',
    description: 'Insertar un bloque destacado > [!NOTE].',
    defaultBinding: 'Mod+Shift+N',
  },
  {
    id: 'insert_callout_warning',
    title: 'Insertar callout de advertencia',
    description: 'Insertar un bloque de alerta > [!WARNING].',
    defaultBinding: 'Mod+Shift+W',
  },
  {
    id: 'insert_callout_tip',
    title: 'Insertar callout de consejo',
    description: 'Insertar un bloque de recomendación > [!TIP].',
    defaultBinding: 'Mod+Shift+P',
  },
  {
    id: 'insert_math_block',
    title: 'Insertar bloque matemático',
    description: 'Insertar o envolver una ecuación LaTeX en bloque ($$ ... $$).',
    defaultBinding: 'Mod+Shift+M',
  },
  {
    id: 'insert_code_block',
    title: 'Insertar bloque de código',
    description: 'Insertar o envolver un bloque de código cercado (```).',
    defaultBinding: 'Mod+Shift+C',
  },
  {
    id: 'insert_wikilink',
    title: 'Insertar enlace a nota',
    description: 'Insertar un enlace bidireccional [[WikiLink]] con autocompletado.',
    defaultBinding: 'Mod+Shift+L',
  },
] as const;

export const DEFAULT_EDITOR_SHORTCUTS: EditorShortcutsMap =
  EDITOR_SHORTCUT_DEFINITIONS.reduce((acc, def) => {
    acc[def.id] = def.defaultBinding;
    return acc;
  }, {} as EditorShortcutsMap);

const VALID_ACTION_IDS = new Set<EditorShortcutActionId>(
  EDITOR_SHORTCUT_DEFINITIONS.map((def) => def.id)
);

const MODIFIER_ALIASES: Record<string, 'Mod' | 'Alt' | 'Shift'> = {
  mod: 'Mod',
  cmd: 'Mod',
  command: 'Mod',
  meta: 'Mod',
  super: 'Mod',
  ctrl: 'Mod',
  control: 'Mod',
  '⌘': 'Mod',
  '⌃': 'Mod',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  '⌥': 'Alt',
  shift: 'Shift',
  '⇧': 'Shift',
};

const KEY_ALIASES: Record<string, string> = {
  ' ': 'Space',
  space: 'Space',
  spacebar: 'Space',
  enter: 'Enter',
  return: 'Enter',
  '↵': 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
};

function normalizeKeyToken(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower in KEY_ALIASES) {
    return KEY_ALIASES[lower];
  }
  if (/^f\d{1,2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  if (trimmed.length === 1) {
    return /^[a-z]$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
  }
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function expandSymbolPrefix(raw: string): string {
  return raw
    .replace(/⌘/g, 'Mod+')
    .replace(/⌃/g, 'Mod+')
    .replace(/⌥/g, 'Alt+')
    .replace(/⇧/g, 'Shift+');
}

/** Normalizes any shortcut string (e.g. "cmd+shift+t", "⌘⌥1") into canonical "Mod+Alt+Shift+Key" form. */
export function normalizeShortcutBinding(raw: string): string {
  const expanded = expandSymbolPrefix((raw ?? '').trim());
  if (!expanded) return '';

  // Support both '+' and '-' delimiters while preserving a trailing literal '-' key
  const tokens: string[] = [];
  let buffer = '';
  for (let i = 0; i < expanded.length; i += 1) {
    const ch = expanded[i];
    if (ch === '+' || (ch === '-' && buffer.length > 0)) {
      if (buffer.trim()) {
        tokens.push(buffer.trim());
      }
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  if (buffer.trim()) {
    tokens.push(buffer.trim());
  }

  let hasMod = false;
  let hasAlt = false;
  let hasShift = false;
  let keyToken = '';

  for (const token of tokens) {
    const mod = MODIFIER_ALIASES[token.toLowerCase()];
    if (mod === 'Mod') {
      hasMod = true;
    } else if (mod === 'Alt') {
      hasAlt = true;
    } else if (mod === 'Shift') {
      hasShift = true;
    } else {
      keyToken = normalizeKeyToken(token);
    }
  }

  if (!keyToken) {
    return '';
  }

  const parts: string[] = [];
  if (hasMod) parts.push('Mod');
  if (hasAlt) parts.push('Alt');
  if (hasShift) parts.push('Shift');
  parts.push(keyToken);
  return parts.join('+');
}

const PURE_MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'OS',
  'Fn',
  'Dead',
]);

/** Converts a DOM/React KeyboardEvent into a canonical shortcut binding or null if invalid/modifier-only. */
export function eventToShortcutBinding(
  e: Pick<
    KeyboardEvent | ReactKeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
  > & { code?: string }
): string | null {
  const rawKey = e.key ?? '';
  if (!rawKey || PURE_MODIFIER_KEYS.has(rawKey)) {
    return null;
  }

  const hasMod = Boolean(e.metaKey || e.ctrlKey);
  const hasAlt = Boolean(e.altKey);
  const hasShift = Boolean(e.shiftKey);
  const isFunctionKey = /^F\d{1,2}$/i.test(rawKey);

  if (!hasMod && !hasAlt && !isFunctionKey) {
    return null;
  }

  let resolvedKey = rawKey;
  // On macOS, Option/Alt modifies e.key into non-ASCII characters (e.g. Option+1 -> "¡")
  if (hasAlt && e.code) {
    const digitMatch = /^Digit(\d)$/.exec(e.code);
    if (digitMatch) {
      resolvedKey = digitMatch[1];
    } else {
      const letterMatch = /^Key([A-Za-z])$/.exec(e.code);
      if (letterMatch) {
        resolvedKey = letterMatch[1];
      }
    }
  }

  const normalizedKey = normalizeKeyToken(resolvedKey);
  if (!normalizedKey) {
    return null;
  }

  const parts: string[] = [];
  if (hasMod) parts.push('Mod');
  if (hasAlt) parts.push('Alt');
  if (hasShift) parts.push('Shift');
  parts.push(normalizedKey);
  return parts.join('+');
}

/** Formats canonical shortcut binding into compact macOS symbols (e.g. "Mod+Shift+T" -> "⌘⇧T"). */
export function formatShortcutBindingForDisplay(binding: string): string {
  const normalized = normalizeShortcutBinding(binding);
  if (!normalized) return 'Sin asignar';
  const parts = normalized.split('+');
  return parts
    .map((part) => {
      if (part === 'Mod') return '⌘';
      if (part === 'Alt') return '⌥';
      if (part === 'Shift') return '⇧';
      if (part === 'Space') return 'Espacio';
      return part;
    })
    .join('');
}

function dispatchShortcutsChangedEvent(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(EDITOR_SHORTCUTS_CHANGED_EVENT));
    } catch {
      // Ignore event dispatch failures in restricted environments
    }
  }
}

function sanitizeShortcutsMap(
  candidate: Partial<Record<string, unknown>> | null | undefined
): EditorShortcutsMap {
  const result: EditorShortcutsMap = { ...DEFAULT_EDITOR_SHORTCUTS };
  if (!candidate || typeof candidate !== 'object') {
    return result;
  }

  for (const def of EDITOR_SHORTCUT_DEFINITIONS) {
    const rawVal = candidate[def.id];
    if (typeof rawVal === 'string') {
      const normalized = normalizeShortcutBinding(rawVal);
      if (normalized) {
        result[def.id] = normalized;
      }
    }
  }
  return result;
}

/** Reads configurable editor shortcuts from localStorage with safe fallback to defaults. */
export function getStoredEditorShortcuts(): EditorShortcutsMap {
  try {
    const storage =
      typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage
        : typeof window !== 'undefined'
          ? window.localStorage
          : undefined;
    if (!storage) {
      return { ...DEFAULT_EDITOR_SHORTCUTS };
    }
    const raw = storage.getItem(EDITOR_SHORTCUTS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_EDITOR_SHORTCUTS };
    }
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    return sanitizeShortcutsMap(parsed);
  } catch {
    return { ...DEFAULT_EDITOR_SHORTCUTS };
  }
}

/** Normalizes and persists editor shortcuts to localStorage, notifying open editors. */
export function saveEditorShortcuts(map: EditorShortcutsMap): EditorShortcutsMap {
  const sanitized = sanitizeShortcutsMap(map);
  try {
    const storage =
      typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage
        : typeof window !== 'undefined'
          ? window.localStorage
          : undefined;
    storage?.setItem(EDITOR_SHORTCUTS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore storage quota or restricted context errors
  }
  dispatchShortcutsChangedEvent();
  return sanitized;
}

/** Restores default editor shortcuts in localStorage and returns a fresh defaults map. */
export function resetEditorShortcuts(): EditorShortcutsMap {
  const defaults = { ...DEFAULT_EDITOR_SHORTCUTS };
  try {
    const storage =
      typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage
        : typeof window !== 'undefined'
          ? window.localStorage
          : undefined;
    storage?.removeItem(EDITOR_SHORTCUTS_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
  dispatchShortcutsChangedEvent();
  return defaults;
}

/** Detects duplicate bindings across all editor shortcut actions. */
export function detectEditorShortcutCollisions(
  map: EditorShortcutsMap
): Array<{ binding: string; actionIds: EditorShortcutActionId[] }> {
  const grouped = new Map<string, EditorShortcutActionId[]>();

  for (const def of EDITOR_SHORTCUT_DEFINITIONS) {
    const raw = map[def.id];
    const normalized = normalizeShortcutBinding(raw ?? '');
    if (!normalized) continue;
    const list = grouped.get(normalized) ?? [];
    list.push(def.id);
    grouped.set(normalized, list);
  }

  const collisions: Array<{ binding: string; actionIds: EditorShortcutActionId[] }> =
    [];
  for (const [binding, actionIds] of grouped.entries()) {
    if (actionIds.length > 1) {
      collisions.push({ binding, actionIds });
    }
  }
  return collisions;
}

/** Matches a keyboard event against a shortcuts map and returns the action ID if matched. */
export function matchEditorShortcutEvent(
  event: Pick<
    KeyboardEvent | ReactKeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
  > & { code?: string },
  map: EditorShortcutsMap
): EditorShortcutActionId | null {
  const pressed = eventToShortcutBinding(event);
  if (!pressed) return null;

  for (const def of EDITOR_SHORTCUT_DEFINITIONS) {
    const binding = normalizeShortcutBinding(map[def.id] ?? '');
    if (binding && binding === pressed) {
      return def.id;
    }
  }
  return null;
}

function getLineBounds(content: string, offset: number): {
  lineStart: number;
  lineEnd: number;
} {
  const prevNewline = content.lastIndexOf('\n', Math.max(0, offset - 1));
  const lineStart = prevNewline === -1 ? 0 : prevNewline + 1;
  const nextNewline = content.indexOf('\n', offset);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;
  return { lineStart, lineEnd };
}

function insertBlockTemplate(
  content: string,
  start: number,
  end: number,
  template: string,
  innerSelStart: number,
  innerSelEnd: number
): { nextContent: string; selectionStart: number; selectionEnd: number } {
  const before = content.slice(0, start);
  const after = content.slice(end);
  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');

  const prefix = needsLeadingNewline ? '\n' : '';
  const suffix = needsTrailingNewline ? '\n' : '';
  const nextContent = `${before}${prefix}${template}${suffix}${after}`;
  const baseOffset = before.length + prefix.length;

  return {
    nextContent,
    selectionStart: baseOffset + innerSelStart,
    selectionEnd: baseOffset + innerSelEnd,
  };
}

function toggleHeadingLine(
  content: string,
  start: number,
  end: number,
  level: 1 | 2 | 3
): { nextContent: string; selectionStart: number; selectionEnd: number } {
  const { lineStart, lineEnd } = getLineBounds(content, start);
  const line = content.slice(lineStart, lineEnd);
  const targetPrefix = `${'#'.repeat(level)} `;
  const match = /^(#{1,6})\s+(.*)$/.exec(line);

  let nextLine: string;
  let delta = 0;

  if (match) {
    const existingHashes = match[1];
    const body = match[2];
    const existingPrefixLen = line.length - body.length;
    if (existingHashes.length === level) {
      nextLine = body;
      delta = -existingPrefixLen;
    } else {
      nextLine = `${targetPrefix}${body}`;
      delta = targetPrefix.length - existingPrefixLen;
    }
  } else {
    nextLine = `${targetPrefix}${line}`;
    delta = targetPrefix.length;
  }

  const nextContent =
    content.slice(0, lineStart) + nextLine + content.slice(lineEnd);
  const newLineEnd = lineStart + nextLine.length;

  return {
    nextContent,
    selectionStart: Math.max(lineStart, Math.min(newLineEnd, start + delta)),
    selectionEnd: Math.max(lineStart, Math.min(newLineEnd, end + delta)),
  };
}

function toggleTaskLine(
  content: string,
  start: number,
  end: number
): { nextContent: string; selectionStart: number; selectionEnd: number } {
  const { lineStart, lineEnd } = getLineBounds(content, start);
  const line = content.slice(lineStart, lineEnd);

  let nextLine: string;
  let delta = 0;

  const uncheckedMatch = /^(\s*)[-*+]\s+\[ \]\s*(.*)$/.exec(line);
  const checkedMatch = /^(\s*)[-*+]\s+\[[xX]\]\s*(.*)$/.exec(line);
  const bulletMatch = /^(\s*)[-*+]\s+(.*)$/.exec(line);

  if (uncheckedMatch) {
    nextLine = `${uncheckedMatch[1]}- [x] ${uncheckedMatch[2]}`;
    delta = nextLine.length - line.length;
  } else if (checkedMatch) {
    nextLine = `${checkedMatch[1]}- [ ] ${checkedMatch[2]}`;
    delta = nextLine.length - line.length;
  } else if (bulletMatch) {
    nextLine = `${bulletMatch[1]}- [ ] ${bulletMatch[2]}`;
    delta = nextLine.length - line.length;
  } else {
    const indentMatch = /^(\s*)(.*)$/.exec(line);
    const indent = indentMatch?.[1] ?? '';
    const body = indentMatch?.[2] ?? line;
    nextLine = `${indent}- [ ] ${body}`;
    delta = nextLine.length - line.length;
  }

  const nextContent =
    content.slice(0, lineStart) + nextLine + content.slice(lineEnd);
  const newLineEnd = lineStart + nextLine.length;

  return {
    nextContent,
    selectionStart: Math.max(lineStart, Math.min(newLineEnd, start + delta)),
    selectionEnd: Math.max(lineStart, Math.min(newLineEnd, end + delta)),
  };
}

function toggleInlineWrap(
  content: string,
  start: number,
  end: number,
  marker: '**' | '*',
  placeholder: string
): { nextContent: string; selectionStart: number; selectionEnd: number } {
  const mLen = marker.length;
  if (start === end) {
    const inserted = `${marker}${placeholder}${marker}`;
    const nextContent = content.slice(0, start) + inserted + content.slice(end);
    return {
      nextContent,
      selectionStart: start + mLen,
      selectionEnd: start + mLen + placeholder.length,
    };
  }

  const selected = content.slice(start, end);
  const before = content.slice(Math.max(0, start - mLen), start);
  const after = content.slice(end, end + mLen);

  const isSingleStarConflict =
    marker === '*' &&
    ((before === '*' && content[start - 2] === '*') ||
      (after === '*' && content[end + 1] === '*'));

  if (!isSingleStarConflict && before === marker && after === marker) {
    const nextContent =
      content.slice(0, start - mLen) + selected + content.slice(end + mLen);
    return {
      nextContent,
      selectionStart: start - mLen,
      selectionEnd: end - mLen,
    };
  }

  const hasInternalMarkers =
    marker === '**'
      ? selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4
      : selected.startsWith('*') &&
        !selected.startsWith('**') &&
        selected.endsWith('*') &&
        !selected.endsWith('**') &&
        selected.length >= 2;

  if (hasInternalMarkers) {
    const unwrapped = selected.slice(mLen, selected.length - mLen);
    const nextContent = content.slice(0, start) + unwrapped + content.slice(end);
    return {
      nextContent,
      selectionStart: start,
      selectionEnd: start + unwrapped.length,
    };
  }

  const nextContent =
    content.slice(0, start) + marker + selected + marker + content.slice(end);
  return {
    nextContent,
    selectionStart: start + mLen,
    selectionEnd: end + mLen,
  };
}

/**
 * Applies any of the 13 configurable Markdown editor commands to a text buffer + selection range,
 * returning the updated content and next cursor/selection coordinates.
 */
export function applyEditorCommandToText(
  content: string,
  selectionStart: number,
  selectionEnd: number,
  actionId: EditorShortcutActionId
): { nextContent: string; selectionStart: number; selectionEnd: number } {
  const safeContent = content ?? '';
  const clampedA = Math.max(0, Math.min(safeContent.length, selectionStart));
  const clampedB = Math.max(0, Math.min(safeContent.length, selectionEnd));
  const start = Math.min(clampedA, clampedB);
  const end = Math.max(clampedA, clampedB);

  if (!VALID_ACTION_IDS.has(actionId)) {
    return { nextContent: safeContent, selectionStart: start, selectionEnd: end };
  }

  switch (actionId) {
    case 'bold':
      return toggleInlineWrap(safeContent, start, end, '**', 'texto');
    case 'italic':
      return toggleInlineWrap(safeContent, start, end, '*', 'texto');
    case 'heading_1':
      return toggleHeadingLine(safeContent, start, end, 1);
    case 'heading_2':
      return toggleHeadingLine(safeContent, start, end, 2);
    case 'heading_3':
      return toggleHeadingLine(safeContent, start, end, 3);
    case 'toggle_task':
      return toggleTaskLine(safeContent, start, end);
    case 'insert_table': {
      const table = [
        '| Columna 1 | Columna 2 |',
        '| --- | --- |',
        '| Dato 1 | Dato 2 |',
      ].join('\n');
      return insertBlockTemplate(safeContent, start, end, table, 2, 11);
    }
    case 'insert_callout_note': {
      const header = '> [!NOTE] Nota\n> ';
      const body = 'Contenido de la nota';
      return insertBlockTemplate(
        safeContent,
        start,
        end,
        `${header}${body}`,
        header.length,
        header.length + body.length
      );
    }
    case 'insert_callout_warning': {
      const header = '> [!WARNING] Atención\n> ';
      const body = 'Contenido de la advertencia';
      return insertBlockTemplate(
        safeContent,
        start,
        end,
        `${header}${body}`,
        header.length,
        header.length + body.length
      );
    }
    case 'insert_callout_tip': {
      const header = '> [!TIP] Consejo\n> ';
      const body = 'Contenido del consejo';
      return insertBlockTemplate(
        safeContent,
        start,
        end,
        `${header}${body}`,
        header.length,
        header.length + body.length
      );
    }
    case 'insert_math_block': {
      if (start < end) {
        const selected = safeContent.slice(start, end);
        const template = `$$\n${selected}\n$$`;
        return insertBlockTemplate(
          safeContent,
          start,
          end,
          template,
          3,
          3 + selected.length
        );
      }
      const template = '$$\n\n$$';
      return insertBlockTemplate(safeContent, start, end, template, 3, 3);
    }
    case 'insert_code_block': {
      if (start < end) {
        const selected = safeContent.slice(start, end);
        const template = `\`\`\`\n${selected}\n\`\`\``;
        return insertBlockTemplate(
          safeContent,
          start,
          end,
          template,
          4,
          4 + selected.length
        );
      }
      const template = '```\n\n```';
      return insertBlockTemplate(safeContent, start, end, template, 4, 4);
    }
    case 'insert_wikilink': {
      if (start < end) {
        const selected = safeContent.slice(start, end);
        const wrapped = `[[${selected}]]`;
        const nextContent =
          safeContent.slice(0, start) + wrapped + safeContent.slice(end);
        return {
          nextContent,
          selectionStart: start + wrapped.length,
          selectionEnd: start + wrapped.length,
        };
      }
      const nextContent =
        safeContent.slice(0, start) + '[[]]' + safeContent.slice(end);
      return {
        nextContent,
        selectionStart: start + 2,
        selectionEnd: start + 2,
      };
    }
  }
}
