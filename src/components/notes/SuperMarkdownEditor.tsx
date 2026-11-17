import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import {
  CURSADA_CODE_LANGUAGES,
  computeMinimalTextDiff,
} from '../../lib/editor/codeMirrorLanguages';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  EditorShortcutActionId,
  EditorShortcutsMap,
} from '../../types/domain';
import { SwissButton, SwissSegmented } from '../../ui';
import {
  applyEditorCommandToText,
  EDITOR_SHORTCUTS_CHANGED_EVENT,
  formatShortcutBindingForDisplay,
  getStoredEditorShortcuts,
  matchEditorShortcutEvent,
} from '../../lib/editor/editorShortcuts';
import {
  createLivePreviewExtension,
  parseLivePreviewLines,
  toggleTaskLineInMarkdown,
  type CalloutKind,
  type LivePreviewInlineToken,
  type LivePreviewLineDescriptor,
} from '../../lib/editor/livePreviewExtension';
import { renderMathReact } from '../../lib/math/latexRenderer';

export type SuperEditorViewMode = 'live' | 'source';

export interface SuperMarkdownNoteOption {
  id: string;
  title: string;
  courseId: string;
}

export interface SuperMarkdownEditorProps {
  noteId: string;
  courseId: string;
  content: string;
  onChangeContent: (nextContent: string) => void;
  onSaveShortcut?: () => void;
  availableNotes?: SuperMarkdownNoteOption[];
  onOpenWikiLink?: (targetTitle: string) => void;
  onFocusTitle?: () => void;
  placeholder?: string;
  ariaLabel?: string;
}

interface WikiLinkTriggerMatch {
  triggerStart: number;
  replaceEnd: number;
  query: string;
}

const CALLOUT_TITLES_ES: Record<CalloutKind, string> = {
  NOTE: 'Nota',
  WARNING: 'Atención',
  TIP: 'Consejo',
  IMPORTANT: 'Importante',
};

const VIEW_MODE_OPTIONS: ReadonlyArray<{
  value: SuperEditorViewMode;
  label: string;
}> = [
  { value: 'live', label: 'Live Preview' },
  { value: 'source', label: 'Fuente' },
];

const TOOLBAR_ACTIONS: ReadonlyArray<{
  id: EditorShortcutActionId;
  label: string;
  description: string;
}> = [
  { id: 'insert_table', label: 'Tabla', description: 'Insertar tabla' },
  {
    id: 'insert_callout_note',
    label: 'Callout',
    description: 'Insertar callout',
  },
  {
    id: 'insert_math_block',
    label: 'Fórmula $$',
    description: 'Insertar bloque matemático',
  },
  {
    id: 'insert_code_block',
    label: 'Código',
    description: 'Insertar bloque de código',
  },
  {
    id: 'toggle_task',
    label: 'Tarea - [ ]',
    description: 'Alternar casilla de tarea',
  },
  {
    id: 'insert_wikilink',
    label: '[[Enlace]]',
    description: 'Insertar enlace a nota',
  },
];

const swissCodeMirrorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg)',
    color: 'var(--soft)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--note-body-size)',
    borderRadius: '0',
    boxShadow: 'none',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.6',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--acc)',
    padding: '8px 0 32px',
    minHeight: '320px',
  },
  '.cm-line': {
    padding: '1px 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftWidth: '2px',
    borderLeftColor: 'var(--acc)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--grid)',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-placeholder': {
    color: 'var(--mut)',
  },
});

function canMountCodeMirror(): boolean {
  if (typeof document === 'undefined' || typeof Range === 'undefined') {
    return false;
  }
  return typeof Range.prototype?.getClientRects === 'function';
}

function normalizeForSearch(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getLineIndexFromOffset(text: string, offset: number): number {
  const safeOffset = Math.max(0, Math.min(text.length, offset));
  let line = 0;
  for (let i = 0; i < safeOffset; i += 1) {
    if (text[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

function detectWikiLinkTrigger(
  text: string,
  cursorPos: number
): WikiLinkTriggerMatch | null {
  const safePos = Math.max(0, Math.min(text.length, cursorPos));
  const lineStart = text.lastIndexOf('\n', Math.max(0, safePos - 1)) + 1;
  const linePrefix = text.slice(lineStart, safePos);
  const openInLine = linePrefix.lastIndexOf('[[');
  if (openInLine === -1) {
    return null;
  }

  const triggerStart = lineStart + openInLine;
  const between = text.slice(triggerStart + 2, safePos);
  if (between.includes(']]') || between.includes('|') || between.includes('\n')) {
    return null;
  }

  const hasAutoClose = text.slice(safePos, safePos + 2) === ']]';
  return {
    triggerStart,
    replaceEnd: hasAutoClose ? safePos + 2 : safePos,
    query: between,
  };
}

function renderInlineTokens(
  tokens: LivePreviewInlineToken[],
  keyPrefix: string,
  onOpenWikiLink?: (targetTitle: string) => void
): ReactNode {
  return tokens.map((tok, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (tok.type) {
      case 'text':
        return <Fragment key={key}>{tok.text}</Fragment>;
      case 'bold':
        return (
          <strong key={key} className="cm-live-preview-bold">
            {tok.text}
          </strong>
        );
      case 'italic':
        return (
          <em key={key} className="cm-live-preview-italic">
            {tok.text}
          </em>
        );
      case 'code':
        return (
          <code key={key} className="cm-live-preview-code">
            {tok.text}
          </code>
        );
      case 'math_inline':
        return (
          <Fragment key={key}>{renderMathReact(tok.latex, false)}</Fragment>
        );
      case 'math_display':
        return (
          <Fragment key={key}>{renderMathReact(tok.latex, true)}</Fragment>
        );
      case 'wikilink':
        return (
          <button
            key={key}
            type="button"
            className="cm-live-preview-wikilink"
            data-wikilink-target={tok.target}
            onClick={() => onOpenWikiLink?.(tok.target)}
          >
            {tok.displayText}
          </button>
        );
    }
  });
}

/**
 * Super-Editor Markdown component with CodeMirror 6 Live Preview,
 * offline KaTeX-compatible LaTeX math, configurable shortcuts, and [[WikiLink]] autocomplete.
 */
export function SuperMarkdownEditor({
  noteId,
  courseId,
  content,
  onChangeContent,
  onSaveShortcut,
  availableNotes = [],
  onOpenWikiLink,
  onFocusTitle,
  placeholder = 'Escribí tus apuntes en Markdown…',
  ariaLabel = 'Contenido de la nota',
}: SuperMarkdownEditorProps) {
  const [editorMode, setEditorMode] = useState<SuperEditorViewMode>('live');
  const [shortcuts, setShortcuts] = useState<EditorShortcutsMap>(() =>
    getStoredEditorShortcuts()
  );
  const [useFallbackEditor, setUseFallbackEditor] = useState<boolean>(
    () => !canMountCodeMirror()
  );
  const [cursorOffset, setCursorOffset] = useState<number>(0);
  const [wikiTrigger, setWikiTrigger] = useState<WikiLinkTriggerMatch | null>(
    null
  );
  const [activeWikiIndex, setActiveWikiIndex] = useState<number>(0);
  const [dismissedTriggerPos, setDismissedTriggerPos] = useState<number | null>(
    null
  );

  const cmHostRef = useRef<HTMLDivElement | null>(null);
  const cmViewRef = useRef<EditorView | null>(null);
  const liveCompartmentRef = useRef<Compartment>(new Compartment());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Latest refs so CodeMirror event handlers always observe fresh props/callbacks
  const contentRef = useRef(content);
  contentRef.current = content;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const onChangeContentRef = useRef(onChangeContent);
  onChangeContentRef.current = onChangeContent;
  const onSaveShortcutRef = useRef(onSaveShortcut);
  onSaveShortcutRef.current = onSaveShortcut;
  const onOpenWikiLinkRef = useRef(onOpenWikiLink);
  onOpenWikiLinkRef.current = onOpenWikiLink;
  const onFocusTitleRef = useRef(onFocusTitle);
  onFocusTitleRef.current = onFocusTitle;

  useEffect(() => {
    const syncShortcuts = () => {
      setShortcuts(getStoredEditorShortcuts());
    };
    window.addEventListener(EDITOR_SHORTCUTS_CHANGED_EVENT, syncShortcuts);
    window.addEventListener('storage', syncShortcuts);
    return () => {
      window.removeEventListener(EDITOR_SHORTCUTS_CHANGED_EVENT, syncShortcuts);
      window.removeEventListener('storage', syncShortcuts);
    };
  }, []);

  const dismissedTriggerPosRef = useRef(dismissedTriggerPos);
  dismissedTriggerPosRef.current = dismissedTriggerPos;

  // Reset transient cursor/popup state when switching notes
  useEffect(() => {
    setCursorOffset(0);
    setWikiTrigger(null);
    setActiveWikiIndex(0);
    setDismissedTriggerPos(null);
  }, [noteId]);

  const clearWikiTriggerIfNeeded = useCallback(() => {
    if (wikiTriggerRef.current !== null) {
      setWikiTrigger(null);
    }
    if (dismissedTriggerPosRef.current !== null) {
      setDismissedTriggerPos(null);
    }
  }, []);

  const updateWikiTriggerFromCursor = useCallback(
    (nextText: string, nextCursorPos: number) => {
      const match = detectWikiLinkTrigger(nextText, nextCursorPos);
      if (!match) {
        clearWikiTriggerIfNeeded();
        return;
      }
      if (
        dismissedTriggerPosRef.current !== null &&
        dismissedTriggerPosRef.current !== match.triggerStart
      ) {
        setDismissedTriggerPos(null);
      }
      setWikiTrigger(match);
      setActiveWikiIndex(0);
    },
    [clearWikiTriggerIfNeeded]
  );

  const updateWikiTriggerFromCodeMirror = useCallback(
    (doc: EditorView['state']['doc'], head: number) => {
      const line = doc.lineAt(head);
      if (!line.text.includes('[[')) {
        clearWikiTriggerIfNeeded();
        return;
      }
      const linePos = head - line.from;
      const lineMatch = detectWikiLinkTrigger(line.text, linePos);
      if (!lineMatch) {
        clearWikiTriggerIfNeeded();
        return;
      }
      const globalMatch: WikiLinkTriggerMatch = {
        triggerStart: line.from + lineMatch.triggerStart,
        replaceEnd: line.from + lineMatch.replaceEnd,
        query: lineMatch.query,
      };
      if (
        dismissedTriggerPosRef.current !== null &&
        dismissedTriggerPosRef.current !== globalMatch.triggerStart
      ) {
        setDismissedTriggerPos(null);
      }
      setWikiTrigger(globalMatch);
      setActiveWikiIndex(0);
    },
    [clearWikiTriggerIfNeeded]
  );

  const filteredWikiNotes = useMemo(() => {
    if (!wikiTrigger) return [];
    const normQuery = normalizeForSearch(wikiTrigger.query);
    const matching = availableNotes.filter((item) =>
      normQuery ? normalizeForSearch(item.title).includes(normQuery) : true
    );
    return [...matching]
      .sort((a, b) => {
        const aSameCourse = a.courseId === courseId ? 0 : 1;
        const bSameCourse = b.courseId === courseId ? 0 : 1;
        if (aSameCourse !== bSameCourse) return aSameCourse - bSameCourse;

        const aIsSelf = a.id === noteId ? 1 : 0;
        const bIsSelf = b.id === noteId ? 1 : 0;
        if (aIsSelf !== bIsSelf) return aIsSelf - bIsSelf;

        if (normQuery) {
          const aStarts = normalizeForSearch(a.title).startsWith(normQuery)
            ? 0
            : 1;
          const bStarts = normalizeForSearch(b.title).startsWith(normQuery)
            ? 0
            : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
        }
        return a.title.localeCompare(b.title, 'es');
      })
      .slice(0, 8);
  }, [wikiTrigger, availableNotes, courseId, noteId]);

  const isWikiPopupOpen =
    Boolean(wikiTrigger) &&
    dismissedTriggerPos !== wikiTrigger?.triggerStart &&
    filteredWikiNotes.length > 0;

  const isWikiPopupOpenRef = useRef(isWikiPopupOpen);
  isWikiPopupOpenRef.current = isWikiPopupOpen;
  const filteredWikiNotesRef = useRef(filteredWikiNotes);
  filteredWikiNotesRef.current = filteredWikiNotes;
  const activeWikiIndexRef = useRef(activeWikiIndex);
  activeWikiIndexRef.current = activeWikiIndex;
  const wikiTriggerRef = useRef(wikiTrigger);
  wikiTriggerRef.current = wikiTrigger;

  const executeCommand = useCallback((actionId: EditorShortcutActionId) => {
    const view = cmViewRef.current;
    if (view) {
      const currentDoc = view.state.doc.toString();
      const sel = view.state.selection.main;
      const result = applyEditorCommandToText(
        currentDoc,
        sel.from,
        sel.to,
        actionId
      );
      const diff = computeMinimalTextDiff(currentDoc, result.nextContent);
      view.dispatch({
        ...(diff ? { changes: diff } : {}),
        selection: {
          anchor: result.selectionStart,
          head: result.selectionEnd,
        },
      });
      view.focus();
      updateWikiTriggerFromCodeMirror(view.state.doc, result.selectionEnd);
      return;
    }

    const textarea = textareaRef.current;
    const currentDoc = contentRef.current;
    const selStart = textarea?.selectionStart ?? cursorOffset;
    const selEnd = textarea?.selectionEnd ?? selStart;
    const result = applyEditorCommandToText(
      currentDoc,
      selStart,
      selEnd,
      actionId
    );
    onChangeContentRef.current(result.nextContent);
    setCursorOffset(result.selectionStart);
    updateWikiTriggerFromCursor(result.nextContent, result.selectionEnd);

    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(result.selectionStart, result.selectionEnd);
      }
    });
  }, [cursorOffset, updateWikiTriggerFromCursor]);

  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  const insertWikiLinkChoice = useCallback((targetTitle: string) => {
    const trigger = wikiTriggerRef.current;
    if (!trigger) return;

    const inserted = `[[${targetTitle}]]`;
    const view = cmViewRef.current;
    if (view) {
      const currentDoc = view.state.doc.toString();
      const nextCursor = trigger.triggerStart + inserted.length;
      const nextDoc =
        currentDoc.slice(0, trigger.triggerStart) +
        inserted +
        currentDoc.slice(trigger.replaceEnd);
      view.dispatch({
        changes: {
          from: trigger.triggerStart,
          to: trigger.replaceEnd,
          insert: inserted,
        },
        selection: { anchor: nextCursor, head: nextCursor },
      });
      view.focus();
      setWikiTrigger(null);
      setDismissedTriggerPos(null);
      setCursorOffset(nextCursor);
      if (nextDoc !== contentRef.current) {
        onChangeContentRef.current(nextDoc);
      }
      return;
    }

    const currentDoc = contentRef.current;
    const nextDoc =
      currentDoc.slice(0, trigger.triggerStart) +
      inserted +
      currentDoc.slice(trigger.replaceEnd);
    const nextCursor = trigger.triggerStart + inserted.length;
    onChangeContentRef.current(nextDoc);
    setCursorOffset(nextCursor);
    setWikiTrigger(null);
    setDismissedTriggerPos(null);

    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      }
    });
  }, []);

  const insertWikiLinkChoiceRef = useRef(insertWikiLinkChoice);
  insertWikiLinkChoiceRef.current = insertWikiLinkChoice;

  // Mount CodeMirror 6 when DOM Range layout APIs are available
  useEffect(() => {
    if (useFallbackEditor) {
      if (cmViewRef.current) {
        cmViewRef.current.destroy();
        cmViewRef.current = null;
      }
      return;
    }

    const host = cmHostRef.current;
    if (!host) return;

    try {
      const liveComp = liveCompartmentRef.current;
      const initialLiveExt =
        editorMode === 'live'
          ? createLivePreviewExtension({
              onWikiLinkClick: (target) => onOpenWikiLinkRef.current?.(target),
            })
          : [];

      const keyboardHandlerExt = Prec.highest(
        EditorView.domEventHandlers({
          keydown: (event, view) => {
            if (isWikiPopupOpenRef.current) {
              const options = filteredWikiNotesRef.current;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveWikiIndex((prev) => (prev + 1) % options.length);
                return true;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveWikiIndex(
                  (prev) => (prev - 1 + options.length) % options.length
                );
                return true;
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const chosen = options[activeWikiIndexRef.current];
                if (chosen) {
                  event.preventDefault();
                  insertWikiLinkChoiceRef.current(chosen.title);
                  return true;
                }
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDismissedTriggerPos(
                  wikiTriggerRef.current?.triggerStart ?? null
                );
                return true;
              }
            }

            if (
              (event.metaKey || event.ctrlKey) &&
              !event.altKey &&
              !event.shiftKey &&
              event.key.toLowerCase() === 's'
            ) {
              event.preventDefault();
              onSaveShortcutRef.current?.();
              return true;
            }

            if (
              event.key === 'ArrowUp' &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey &&
              view.state.selection.main.head === 0
            ) {
              onFocusTitleRef.current?.();
            }

            const matchedAction = matchEditorShortcutEvent(
              event,
              shortcutsRef.current
            );
            if (matchedAction) {
              event.preventDefault();
              executeCommandRef.current(matchedAction);
              return true;
            }

            return false;
          },
        })
      );

      const state = EditorState.create({
        doc: contentRef.current,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({
            base: markdownLanguage,
            codeLanguages: CURSADA_CODE_LANGUAGES,
          }),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': ariaLabel,
          }),
          cmPlaceholder(placeholder),
          swissCodeMirrorTheme,
          liveComp.of(initialLiveExt),
          keyboardHandlerExt,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isSyncingRef.current) {
              const nextDoc = update.state.doc.toString();
              onChangeContentRef.current(nextDoc);
            }
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              updateWikiTriggerFromCodeMirror(update.state.doc, head);
            }
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: host,
      });
      cmViewRef.current = view;

      return () => {
        view.destroy();
        if (cmViewRef.current === view) {
          cmViewRef.current = null;
        }
      };
    } catch {
      setUseFallbackEditor(true);
    }
    // Re-create only when switching note or fallback status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, useFallbackEditor, ariaLabel, placeholder]);

  // Reconfigure Live Preview extension dynamically when toggling Live Preview / Fuente
  useEffect(() => {
    const view = cmViewRef.current;
    if (!view) return;
    const ext =
      editorMode === 'live'
        ? createLivePreviewExtension({
            onWikiLinkClick: (target) => onOpenWikiLinkRef.current?.(target),
          })
        : [];
    view.dispatch({
      effects: liveCompartmentRef.current.reconfigure(ext),
    });
  }, [editorMode]);

  // Synchronize external content updates into CodeMirror using minimal incremental diffs
  useEffect(() => {
    const view = cmViewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    const diff = computeMinimalTextDiff(currentDoc, content);
    if (diff) {
      isSyncingRef.current = true;
      view.dispatch({
        changes: diff,
      });
      isSyncingRef.current = false;
    }
  }, [content]);

  function handleFallbackKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>
  ): void {
    if (isWikiPopupOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveWikiIndex((prev) => (prev + 1) % filteredWikiNotes.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveWikiIndex(
          (prev) =>
            (prev - 1 + filteredWikiNotes.length) % filteredWikiNotes.length
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const chosen = filteredWikiNotes[activeWikiIndex];
        if (chosen) {
          event.preventDefault();
          insertWikiLinkChoice(chosen.title);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissedTriggerPos(wikiTrigger?.triggerStart ?? null);
        return;
      }
    }

    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 's'
    ) {
      event.preventDefault();
      onSaveShortcut?.();
      return;
    }

    if (
      event.key === 'ArrowUp' &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      (event.currentTarget.selectionStart ?? 0) === 0
    ) {
      onFocusTitle?.();
      return;
    }

    const matchedAction = matchEditorShortcutEvent(event, shortcuts);
    if (matchedAction) {
      event.preventDefault();
      executeCommand(matchedAction);
    }
  }

  function syncTextareaCursor(target: HTMLTextAreaElement): void {
    const nextPos = target.selectionStart ?? target.value.length;
    setCursorOffset(nextPos);
    updateWikiTriggerFromCursor(target.value, nextPos);
  }

  const activeLineIndex = useMemo(
    () =>
      useFallbackEditor && editorMode === 'live'
        ? getLineIndexFromOffset(content, cursorOffset)
        : 0,
    [useFallbackEditor, editorMode, content, cursorOffset]
  );

  const previewLines = useMemo(
    () =>
      useFallbackEditor && editorMode === 'live'
        ? parseLivePreviewLines(content, activeLineIndex)
        : [],
    [useFallbackEditor, editorMode, content, activeLineIndex]
  );

  function renderFallbackLivePreview(): ReactNode {
    const nodes: ReactNode[] = [];
    let i = 0;

    while (i < previewLines.length) {
      const line = previewLines[i];

      // Active line ALWAYS reveals raw Markdown syntax
      if (line.isActiveLine) {
        nodes.push(
          <div
            key={`line-${line.lineIndex}`}
            className="live-preview-line is-active-line"
            data-line-index={line.lineIndex}
            data-active-line="true"
          >
            {line.rawText || '\u00A0'}
          </div>
        );
        i += 1;
        continue;
      }

      // Multi-line inactive math block: render once as display math
      if (
        line.kind === 'math_block' &&
        line.mathBlockStartLine !== undefined &&
        line.mathBlockEndLine !== undefined &&
        line.mathBlockEndLine > line.mathBlockStartLine
      ) {
        if (!line.isBlockActive) {
          nodes.push(
            <div
              key={`math-block-${line.mathBlockId ?? line.lineIndex}`}
              className="live-preview-line live-preview-block-math"
              data-line-index={line.lineIndex}
            >
              {renderMathReact(line.mathLatex ?? '', true)}
            </div>
          );
          i = line.mathBlockEndLine + 1;
          continue;
        }
        nodes.push(
          <div
            key={`line-${line.lineIndex}`}
            className="live-preview-line live-preview-math-source"
            data-line-index={line.lineIndex}
          >
            {line.rawText || '\u00A0'}
          </div>
        );
        i += 1;
        continue;
      }

      // Single-line display math
      if (line.kind === 'math_block') {
        nodes.push(
          <div
            key={`line-${line.lineIndex}`}
            className="live-preview-line live-preview-block-math"
            data-line-index={line.lineIndex}
          >
            {renderMathReact(line.mathLatex ?? '', true)}
          </div>
        );
        i += 1;
        continue;
      }

      // Inactive Callout group (stop if a line inside callout is active)
      if (line.kind === 'callout' && line.calloutBlockId !== undefined) {
        const blockId = line.calloutBlockId;
        const calloutType = line.calloutType ?? 'NOTE';
        const groupLines: LivePreviewLineDescriptor[] = [line];
        let j = i + 1;
        while (
          j < previewLines.length &&
          previewLines[j].kind === 'callout' &&
          previewLines[j].calloutBlockId === blockId &&
          !previewLines[j].isActiveLine
        ) {
          groupLines.push(previewLines[j]);
          j += 1;
        }

        const headerLine = groupLines[0];
        const bodyLines = groupLines.slice(1);
        nodes.push(
          <div
            key={`callout-${blockId}-${line.lineIndex}`}
            className={`cm-callout-block is-${calloutType.toLowerCase()}`}
            data-callout-type={calloutType}
            data-line-index={line.lineIndex}
          >
            <div className="cm-callout-header">
              <span
                className={`cm-callout-badge is-${calloutType.toLowerCase()}`}
              >
                {CALLOUT_TITLES_ES[calloutType]}
              </span>
              {headerLine.isCalloutHeader && headerLine.inlineTokens.length > 0 ? (
                <span className="cm-callout-title">
                  {renderInlineTokens(
                    headerLine.inlineTokens,
                    `co-h-${line.lineIndex}`,
                    onOpenWikiLink
                  )}
                </span>
              ) : !headerLine.isCalloutHeader ? (
                <span className="cm-callout-body-text">
                  {renderInlineTokens(
                    headerLine.inlineTokens,
                    `co-b-${headerLine.lineIndex}`,
                    onOpenWikiLink
                  )}
                </span>
              ) : null}
            </div>
            {bodyLines.length > 0 ? (
              <div className="cm-callout-body">
                {bodyLines.map((bLine) => (
                  <p key={`co-p-${bLine.lineIndex}`}>
                    {renderInlineTokens(
                      bLine.inlineTokens,
                      `co-b-${bLine.lineIndex}`,
                      onOpenWikiLink
                    )}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        );
        i = j;
        continue;
      }

      // Inactive Table group
      if (line.kind === 'table_row' && line.tableBlockId !== undefined) {
        const blockId = line.tableBlockId;
        const tableLines: LivePreviewLineDescriptor[] = [line];
        let j = i + 1;
        while (
          j < previewLines.length &&
          previewLines[j].kind === 'table_row' &&
          previewLines[j].tableBlockId === blockId &&
          !previewLines[j].isActiveLine
        ) {
          tableLines.push(previewLines[j]);
          j += 1;
        }

        const headerRow = tableLines.find((r) => r.isTableHeader);
        const dataRows = tableLines.filter(
          (r) => !r.isTableHeader && !r.isTableSeparator
        );

        if (headerRow || dataRows.length > 0) {
          nodes.push(
            <table
              key={`table-${blockId}-${line.lineIndex}`}
              className="cm-live-preview-table"
            >
              {headerRow && headerRow.tableCells ? (
                <thead>
                  <tr>
                    {headerRow.tableCells.map((cell, cIdx) => (
                      <th key={`th-${line.lineIndex}-${cIdx}`}>{cell}</th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              {dataRows.length > 0 ? (
                <tbody>
                  {dataRows.map((dRow) => (
                    <tr key={`tr-${dRow.lineIndex}`}>
                      {(dRow.tableCells ?? []).map((cell, cIdx) => (
                        <td key={`td-${dRow.lineIndex}-${cIdx}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ) : null}
            </table>
          );
          i = j;
          continue;
        }
      }

      // Code fence block (inactive lines)
      if (line.kind === 'code_fence') {
        if (line.isCodeFenceDelimiter) {
          i += 1;
          continue;
        }
        nodes.push(
          <pre
            key={`code-${line.lineIndex}`}
            className="live-preview-code-line"
            data-line-index={line.lineIndex}
          >
            <code>{line.rawText || '\u00A0'}</code>
          </pre>
        );
        i += 1;
        continue;
      }

      // Single-line rendered elements
      switch (line.kind) {
        case 'heading': {
          const level = line.headingLevel ?? 1;
          const inner = renderInlineTokens(
            line.inlineTokens,
            `h-${line.lineIndex}`,
            onOpenWikiLink
          );
          if (level === 1) {
            nodes.push(
              <h1
                key={`line-${line.lineIndex}`}
                className="live-preview-line cm-live-preview-heading cm-live-preview-h1"
                data-line-index={line.lineIndex}
              >
                {inner}
              </h1>
            );
          } else if (level === 2) {
            nodes.push(
              <h2
                key={`line-${line.lineIndex}`}
                className="live-preview-line cm-live-preview-heading cm-live-preview-h2"
                data-line-index={line.lineIndex}
              >
                {inner}
              </h2>
            );
          } else {
            nodes.push(
              <h3
                key={`line-${line.lineIndex}`}
                className="live-preview-line cm-live-preview-heading cm-live-preview-h3"
                data-line-index={line.lineIndex}
              >
                {inner}
              </h3>
            );
          }
          break;
        }

        case 'task': {
          const checked = Boolean(line.taskChecked);
          nodes.push(
            <div
              key={`line-${line.lineIndex}`}
              className={`live-preview-line cm-live-preview-task ${
                checked ? 'is-checked' : ''
              }`.trim()}
              data-line-index={line.lineIndex}
            >
              <input
                type="checkbox"
                className="cm-live-preview-task-checkbox"
                checked={checked}
                aria-label={`Tarea: ${line.displayText || 'elemento'}`}
                onChange={() =>
                  onChangeContent(
                    toggleTaskLineInMarkdown(content, line.lineIndex)
                  )
                }
              />
              <span className="cm-live-preview-task-text">
                {renderInlineTokens(
                  line.inlineTokens,
                  `t-${line.lineIndex}`,
                  onOpenWikiLink
                )}
              </span>
            </div>
          );
          break;
        }

        case 'list_item':
          nodes.push(
            <div
              key={`line-${line.lineIndex}`}
              className="live-preview-line cm-live-preview-list-item"
              data-line-index={line.lineIndex}
            >
              <span className="cm-live-preview-list-bullet" aria-hidden="true">
                {line.listMarker && /^\d+\.$/.test(line.listMarker)
                  ? line.listMarker
                  : '•'}
              </span>
              <span>
                {renderInlineTokens(
                  line.inlineTokens,
                  `li-${line.lineIndex}`,
                  onOpenWikiLink
                )}
              </span>
            </div>
          );
          break;

        case 'blockquote':
          nodes.push(
            <blockquote
              key={`line-${line.lineIndex}`}
              className="live-preview-line cm-live-preview-blockquote"
              data-line-index={line.lineIndex}
            >
              {renderInlineTokens(
                line.inlineTokens,
                `bq-${line.lineIndex}`,
                onOpenWikiLink
              )}
            </blockquote>
          );
          break;

        case 'hr':
          nodes.push(
            <hr
              key={`line-${line.lineIndex}`}
              className="cm-live-preview-hr"
            />
          );
          break;

        case 'blank':
          nodes.push(
            <div
              key={`line-${line.lineIndex}`}
              className="live-preview-line is-blank"
              data-line-index={line.lineIndex}
              aria-hidden="true"
            >
              {'\u00A0'}
            </div>
          );
          break;

        case 'paragraph':
        default:
          nodes.push(
            <p
              key={`line-${line.lineIndex}`}
              className="live-preview-line"
              data-line-index={line.lineIndex}
            >
              {renderInlineTokens(
                line.inlineTokens,
                `p-${line.lineIndex}`,
                onOpenWikiLink
              )}
            </p>
          );
          break;
      }

      i += 1;
    }

    return nodes;
  }

  return (
    <div className="super-editor-shell" data-testid={`super-editor-${noteId}`}>
      <div className="super-editor-toolbar" role="toolbar" aria-label="Herramientas de formato">
        <div className="super-editor-toolbar-actions">
          {TOOLBAR_ACTIONS.map((action) => {
            const shortcutLabel = formatShortcutBindingForDisplay(
              shortcuts[action.id]
            );
            return (
              <SwissButton
                key={action.id}
                variant="secondary"
                className="super-editor-toolbar-btn"
                title={`${action.description} (${shortcutLabel})`}
                onClick={() => executeCommand(action.id)}
              >
                {action.label}
              </SwissButton>
            );
          })}
        </div>

        <SwissSegmented<SuperEditorViewMode>
          ariaLabel="Modo del editor"
          value={editorMode}
          onChange={setEditorMode}
          options={VIEW_MODE_OPTIONS}
        />
      </div>

      <div className="super-editor-stage">
        {useFallbackEditor ? (
          <div className="super-editor-fallback-wrap">
            <textarea
              ref={textareaRef}
              className="super-editor-fallback-textarea"
              aria-label={ariaLabel}
              placeholder={placeholder}
              value={content}
              onChange={(e) => {
                const nextVal = e.target.value;
                onChangeContent(nextVal);
                syncTextareaCursor(e.target);
              }}
              onClick={(e) => syncTextareaCursor(e.currentTarget)}
              onKeyUp={(e) => syncTextareaCursor(e.currentTarget)}
              onSelect={(e) => syncTextareaCursor(e.currentTarget)}
              onFocus={(e) => syncTextareaCursor(e.currentTarget)}
              onKeyDown={handleFallbackKeyDown}
            />

            {editorMode === 'live' ? (
              <div
                className={`live-preview-surface ${content.length === 0 ? 'is-empty' : ''}`.trim()}
                data-testid="live-preview-surface"
                aria-label="Vista previa en vivo"
              >
                {content.length > 0 ? (
                  renderFallbackLivePreview()
                ) : (
                  <p className="live-preview-empty-hint">{placeholder}</p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            ref={cmHostRef}
            className="super-editor-codemirror-host"
            data-testid="super-editor-codemirror-host"
          />
        )}

        {isWikiPopupOpen ? (
          <div
            className="wikilink-autocomplete-popup"
            role="listbox"
            aria-label="Notas disponibles para enlazar"
          >
            {filteredWikiNotes.map((option, index) => {
              const isActive = index === activeWikiIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`wikilink-autocomplete-option ${
                    isActive ? 'is-active' : ''
                  }`.trim()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertWikiLinkChoice(option.title);
                  }}
                  onClick={() => insertWikiLinkChoice(option.title)}
                >
                  <span className="wikilink-option-title">{option.title}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
