import { syntaxTree } from '@codemirror/language';
import {
  RangeSetBuilder,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { renderMathHtml } from '../math/latexRenderer';

export type CalloutKind = 'NOTE' | 'WARNING' | 'TIP' | 'IMPORTANT';

export type LivePreviewLineKind =
  | 'heading'
  | 'callout'
  | 'task'
  | 'list_item'
  | 'blockquote'
  | 'hr'
  | 'code_fence'
  | 'math_block'
  | 'table_row'
  | 'paragraph'
  | 'blank';

export type LivePreviewInlineToken =
  | {
      type: 'text';
      text: string;
      from: number;
      to: number;
    }
  | {
      type: 'bold';
      text: string;
      markerFrom: number;
      contentFrom: number;
      contentTo: number;
      markerTo: number;
    }
  | {
      type: 'italic';
      text: string;
      markerFrom: number;
      contentFrom: number;
      contentTo: number;
      markerTo: number;
    }
  | {
      type: 'code';
      text: string;
      markerFrom: number;
      contentFrom: number;
      contentTo: number;
      markerTo: number;
    }
  | {
      type: 'math_inline';
      latex: string;
      from: number;
      to: number;
    }
  | {
      type: 'math_display';
      latex: string;
      from: number;
      to: number;
    }
  | {
      type: 'wikilink';
      target: string;
      displayText: string;
      from: number;
      to: number;
    };

export interface LivePreviewLineDescriptor {
  lineIndex: number;
  rawText: string;
  from: number;
  to: number;
  isActiveLine: boolean;
  isBlockActive: boolean;
  kind: LivePreviewLineKind;
  prefixLength: number;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  calloutType?: CalloutKind;
  calloutTitle?: string;
  isCalloutHeader?: boolean;
  calloutBlockId?: number;
  taskChecked?: boolean;
  taskCheckOffset?: number;
  listMarker?: string;
  tableCells?: string[];
  isTableHeader?: boolean;
  isTableSeparator?: boolean;
  tableBlockId?: number;
  mathLatex?: string;
  mathBlockId?: number;
  mathBlockStartLine?: number;
  mathBlockEndLine?: number;
  isMathDelimiter?: boolean;
  codeLanguage?: string;
  isCodeFenceDelimiter?: boolean;
  displayText: string;
  inlineTokens: LivePreviewInlineToken[];
}

export interface LivePreviewExtensionOptions {
  onToggleTaskLine?: (lineIndex: number) => void;
  onWikiLinkClick?: (targetTitle: string) => void;
}

const CALLOUT_LABELS: Record<CalloutKind, string> = {
  NOTE: 'Nota',
  WARNING: 'Atención',
  TIP: 'Consejo',
  IMPORTANT: 'Importante',
};

function isLikelyInlineMathInner(inner: string): boolean {
  if (!inner || inner.includes('\n')) return false;
  const trimmed = inner.trim();
  if (!trimmed) return false;
  const hasEdgeSpaces = inner !== trimmed;
  if (!hasEdgeSpaces) {
    return true;
  }
  return /[\\^_{}=+\-*/()[\]<>|]/.test(trimmed);
}

/** Parses non-overlapping inline Markdown, math, and WikiLink tokens within a single line slice. */
export function parseInlineMarkdownTokens(
  text: string,
  baseOffset = 0
): LivePreviewInlineToken[] {
  const tokens: LivePreviewInlineToken[] = [];
  let i = 0;
  let plainStart = 0;

  const pushPlain = (end: number) => {
    if (end > plainStart) {
      tokens.push({
        type: 'text',
        text: text.slice(plainStart, end),
        from: baseOffset + plainStart,
        to: baseOffset + end,
      });
    }
  };

  while (i < text.length) {
    // 1. Escaped characters or \(...\) / \[...\] math
    if (text[i] === '\\' && i + 1 < text.length) {
      const nextCh = text[i + 1];
      if (nextCh === '(') {
        const closeIdx = text.indexOf('\\)', i + 2);
        if (closeIdx !== -1) {
          pushPlain(i);
          tokens.push({
            type: 'math_inline',
            latex: text.slice(i + 2, closeIdx),
            from: baseOffset + i,
            to: baseOffset + closeIdx + 2,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
      }
      if (nextCh === '[') {
        const closeIdx = text.indexOf('\\]', i + 2);
        if (closeIdx !== -1) {
          pushPlain(i);
          tokens.push({
            type: 'math_display',
            latex: text.slice(i + 2, closeIdx),
            from: baseOffset + i,
            to: baseOffset + closeIdx + 2,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
      }
      i += 2;
      continue;
    }

    // 2. Inline code `...`
    if (text[i] === '`') {
      const closeIdx = text.indexOf('`', i + 1);
      if (closeIdx !== -1 && closeIdx > i + 1) {
        pushPlain(i);
        tokens.push({
          type: 'code',
          text: text.slice(i + 1, closeIdx),
          markerFrom: baseOffset + i,
          contentFrom: baseOffset + i + 1,
          contentTo: baseOffset + closeIdx,
          markerTo: baseOffset + closeIdx + 1,
        });
        i = closeIdx + 1;
        plainStart = i;
        continue;
      }
    }

    // 3. Math $$...$$ or $...$
    if (text[i] === '$') {
      if (text[i + 1] === '$') {
        const closeIdx = text.indexOf('$$', i + 2);
        if (closeIdx !== -1 && closeIdx > i + 2) {
          pushPlain(i);
          tokens.push({
            type: 'math_display',
            latex: text.slice(i + 2, closeIdx),
            from: baseOffset + i,
            to: baseOffset + closeIdx + 2,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
        i += 2;
        continue;
      }

      let j = i + 1;
      let closeIdx = -1;
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          j += 2;
          continue;
        }
        if (text[j] === '$') {
          if (text[j + 1] === '$') break;
          closeIdx = j;
          break;
        }
        j += 1;
      }
      if (closeIdx !== -1) {
        const inner = text.slice(i + 1, closeIdx);
        if (isLikelyInlineMathInner(inner)) {
          pushPlain(i);
          tokens.push({
            type: 'math_inline',
            latex: inner,
            from: baseOffset + i,
            to: baseOffset + closeIdx + 1,
          });
          i = closeIdx + 1;
          plainStart = i;
          continue;
        }
      }
    }

    // 4. WikiLinks [[Target]] or [[Target|Alias]]
    if (text[i] === '[' && text[i + 1] === '[') {
      const closeIdx = text.indexOf(']]', i + 2);
      const nestedOpen = text.indexOf('[[', i + 2);
      if (
        closeIdx !== -1 &&
        closeIdx > i + 2 &&
        (nestedOpen === -1 || nestedOpen > closeIdx)
      ) {
        const rawInner = text.slice(i + 2, closeIdx);
        const pipeIdx = rawInner.indexOf('|');
        const target = (pipeIdx === -1 ? rawInner : rawInner.slice(0, pipeIdx)).trim();
        const displayText = (
          pipeIdx === -1 ? rawInner : rawInner.slice(pipeIdx + 1)
        ).trim();
        if (target) {
          pushPlain(i);
          tokens.push({
            type: 'wikilink',
            target,
            displayText: displayText || target,
            from: baseOffset + i,
            to: baseOffset + closeIdx + 2,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
      }
    }

    // 5. Bold **...** or __...__
    if (
      (text[i] === '*' && text[i + 1] === '*') ||
      (text[i] === '_' && text[i + 1] === '_')
    ) {
      const marker = text.slice(i, i + 2);
      const closeIdx = text.indexOf(marker, i + 2);
      if (closeIdx !== -1 && closeIdx > i + 2) {
        const inner = text.slice(i + 2, closeIdx);
        if (inner.trim().length > 0) {
          pushPlain(i);
          tokens.push({
            type: 'bold',
            text: inner,
            markerFrom: baseOffset + i,
            contentFrom: baseOffset + i + 2,
            contentTo: baseOffset + closeIdx,
            markerTo: baseOffset + closeIdx + 2,
          });
          i = closeIdx + 2;
          plainStart = i;
          continue;
        }
      }
    }

    // 6. Italic *...* (single asterisk)
    if (text[i] === '*' && text[i + 1] !== '*') {
      const nextChar = text[i + 1];
      if (nextChar && !/\s/.test(nextChar)) {
        let j = i + 1;
        let closeIdx = -1;
        while (j < text.length) {
          if (text[j] === '\\' && j + 1 < text.length) {
            j += 2;
            continue;
          }
          if (text[j] === '*') {
            if (text[j + 1] === '*') {
              j += 2;
              continue;
            }
            if (!/\s/.test(text[j - 1])) {
              closeIdx = j;
              break;
            }
          }
          j += 1;
        }
        if (closeIdx !== -1 && closeIdx > i + 1) {
          const inner = text.slice(i + 1, closeIdx);
          pushPlain(i);
          tokens.push({
            type: 'italic',
            text: inner,
            markerFrom: baseOffset + i,
            contentFrom: baseOffset + i + 1,
            contentTo: baseOffset + closeIdx,
            markerTo: baseOffset + closeIdx + 1,
          });
          i = closeIdx + 1;
          plainStart = i;
          continue;
        }
      }
    }

    i += 1;
  }

  pushPlain(text.length);
  return tokens;
}

function tokensToDisplayText(tokens: LivePreviewInlineToken[]): string {
  return tokens
    .map((tok) => {
      switch (tok.type) {
        case 'text':
        case 'bold':
        case 'italic':
        case 'code':
          return tok.text;
        case 'math_inline':
        case 'math_display':
          return tok.latex;
        case 'wikilink':
          return tok.displayText;
      }
    })
    .join('');
}

function isTableSeparatorLine(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRowCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

/**
 * Parses a Markdown document line-by-line for Live Preview formatting.
 * Lines matching `activeLineIndex` preserve raw Markdown markers; inactive lines strip syntax cleanly.
 */
export function parseLivePreviewLines(
  content: string,
  activeLineIndex: number | ReadonlySet<number>
): LivePreviewLineDescriptor[] {
  const activeLines: ReadonlySet<number> =
    typeof activeLineIndex === 'number'
      ? new Set([activeLineIndex])
      : activeLineIndex;

  const rawLines = (content ?? '').split('\n');
  const descriptors: LivePreviewLineDescriptor[] = [];

  // Precompute offsets for each line
  const lineStarts: number[] = [];
  let cursor = 0;
  for (let idx = 0; idx < rawLines.length; idx += 1) {
    lineStarts.push(cursor);
    cursor += rawLines[idx].length + 1;
  }

  // Track multi-line block states
  let inCodeFence = false;
  let codeFenceMarker = '```';
  let codeLanguage = '';
  let activeCallout: { type: CalloutKind; blockId: number } | null = null;
  let calloutSeq = 0;
  let activeTableBlockId: number | null = null;
  let tableSeq = 0;
  let mathSeq = 0;

  let i = 0;
  while (i < rawLines.length) {
    const rawText = rawLines[i];
    const from = lineStarts[i];
    const to = from + rawText.length;
    const isActiveLine = activeLines.has(i);
    const trimmed = rawText.trim();

    // 1. Inside or toggling code fence
    const fenceMatch = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(rawText);
    if (fenceMatch) {
      activeCallout = null;
      activeTableBlockId = null;
      const markerChar = fenceMatch[2][0];
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceMarker = fenceMatch[2];
        codeLanguage = fenceMatch[3].trim();
        descriptors.push({
          lineIndex: i,
          rawText,
          from,
          to,
          isActiveLine,
          isBlockActive: isActiveLine,
          kind: 'code_fence',
          prefixLength: 0,
          codeLanguage,
          isCodeFenceDelimiter: true,
          displayText: isActiveLine ? rawText : codeLanguage,
          inlineTokens: [{ type: 'text', text: rawText, from, to }],
        });
        i += 1;
        continue;
      } else if (
        markerChar === codeFenceMarker[0] &&
        fenceMatch[2].length >= codeFenceMarker.length &&
        fenceMatch[3].trim() === ''
      ) {
        inCodeFence = false;
        const lang = codeLanguage;
        codeLanguage = '';
        descriptors.push({
          lineIndex: i,
          rawText,
          from,
          to,
          isActiveLine,
          isBlockActive: isActiveLine,
          kind: 'code_fence',
          prefixLength: 0,
          codeLanguage: lang,
          isCodeFenceDelimiter: true,
          displayText: isActiveLine ? rawText : '',
          inlineTokens: [{ type: 'text', text: rawText, from, to }],
        });
        i += 1;
        continue;
      }
    }

    if (inCodeFence) {
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'code_fence',
        prefixLength: 0,
        codeLanguage,
        isCodeFenceDelimiter: false,
        displayText: rawText,
        inlineTokens: [{ type: 'text', text: rawText, from, to }],
      });
      i += 1;
      continue;
    }

    // 2. Single-line display math $$...$$
    if (
      trimmed.startsWith('$$') &&
      trimmed.endsWith('$$') &&
      trimmed.length > 4
    ) {
      activeCallout = null;
      activeTableBlockId = null;
      mathSeq += 1;
      const latex = trimmed.slice(2, -2).trim();
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'math_block',
        prefixLength: 0,
        mathLatex: latex,
        mathBlockId: mathSeq,
        mathBlockStartLine: i,
        mathBlockEndLine: i,
        isMathDelimiter: false,
        displayText: isActiveLine ? rawText : latex,
        inlineTokens: [
          {
            type: 'math_display',
            latex,
            from,
            to,
          },
        ],
      });
      i += 1;
      continue;
    }

    // 3. Multi-line display math block $$ ... $$
    if (/^\s*\$\$\s*$/.test(rawText)) {
      let closeLineIdx = -1;
      for (let j = i + 1; j < rawLines.length; j += 1) {
        if (/^\s*\$\$\s*$/.test(rawLines[j])) {
          closeLineIdx = j;
          break;
        }
      }
      if (closeLineIdx !== -1) {
        activeCallout = null;
        activeTableBlockId = null;
        mathSeq += 1;
        const blockId = mathSeq;
        const latex = rawLines
          .slice(i + 1, closeLineIdx)
          .join('\n')
          .trim();

        let blockActive = false;
        for (let k = i; k <= closeLineIdx; k += 1) {
          if (activeLines.has(k)) {
            blockActive = true;
            break;
          }
        }

        for (let k = i; k <= closeLineIdx; k += 1) {
          const lineTxt = rawLines[k];
          const lFrom = lineStarts[k];
          const lTo = lFrom + lineTxt.length;
          const lineActive = activeLines.has(k);
          const isDelimiter = k === i || k === closeLineIdx;
          descriptors.push({
            lineIndex: k,
            rawText: lineTxt,
            from: lFrom,
            to: lTo,
            isActiveLine: lineActive,
            isBlockActive: blockActive,
            kind: 'math_block',
            prefixLength: 0,
            mathLatex: latex,
            mathBlockId: blockId,
            mathBlockStartLine: i,
            mathBlockEndLine: closeLineIdx,
            isMathDelimiter: isDelimiter,
            displayText: lineActive ? lineTxt : isDelimiter ? '' : lineTxt,
            inlineTokens: [{ type: 'text', text: lineTxt, from: lFrom, to: lTo }],
          });
        }
        i = closeLineIdx + 1;
        continue;
      }
    }

    // 4. Callout block header: > [!NOTE|WARNING|TIP|IMPORTANT] ...
    const calloutHeaderMatch =
      /^(>\s*\[!(NOTE|WARNING|TIP|IMPORTANT)\]\s*)(.*)$/i.exec(rawText);
    if (calloutHeaderMatch) {
      activeTableBlockId = null;
      calloutSeq += 1;
      const calloutType = calloutHeaderMatch[2].toUpperCase() as CalloutKind;
      const prefixLength = calloutHeaderMatch[1].length;
      const titleRaw = calloutHeaderMatch[3].trim();
      const title = titleRaw || CALLOUT_LABELS[calloutType];
      activeCallout = { type: calloutType, blockId: calloutSeq };
      const inlineTokens = titleRaw
        ? parseInlineMarkdownTokens(calloutHeaderMatch[3], from + prefixLength)
        : [];
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'callout',
        prefixLength,
        calloutType,
        calloutTitle: title,
        isCalloutHeader: true,
        calloutBlockId: calloutSeq,
        displayText: isActiveLine ? rawText : title,
        inlineTokens,
      });
      i += 1;
      continue;
    }

    // 5. Callout continuation line (> ...)
    if (activeCallout && /^(>\s?)(.*)$/.test(rawText)) {
      const quoteMatch = /^(>\s?)(.*)$/.exec(rawText)!;
      const prefixLength = quoteMatch[1].length;
      const body = quoteMatch[2];
      const inlineTokens = parseInlineMarkdownTokens(body, from + prefixLength);
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'callout',
        prefixLength,
        calloutType: activeCallout.type,
        isCalloutHeader: false,
        calloutBlockId: activeCallout.blockId,
        displayText: isActiveLine ? rawText : tokensToDisplayText(inlineTokens),
        inlineTokens,
      });
      i += 1;
      continue;
    }

    activeCallout = null;

    // 6. Tables (header + separator + rows)
    const nextLine = rawLines[i + 1];
    if (
      activeTableBlockId === null &&
      rawText.includes('|') &&
      typeof nextLine === 'string' &&
      isTableSeparatorLine(nextLine)
    ) {
      tableSeq += 1;
      activeTableBlockId = tableSeq;
      const cells = splitTableRowCells(rawText);
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'table_row',
        prefixLength: 0,
        tableCells: cells,
        isTableHeader: true,
        isTableSeparator: false,
        tableBlockId: activeTableBlockId,
        displayText: isActiveLine ? rawText : cells.join(' | '),
        inlineTokens: parseInlineMarkdownTokens(rawText, from),
      });
      i += 1;
      continue;
    }

    if (activeTableBlockId !== null && rawText.includes('|')) {
      const isSep = isTableSeparatorLine(rawText);
      const cells = isSep ? [] : splitTableRowCells(rawText);
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'table_row',
        prefixLength: 0,
        tableCells: cells,
        isTableHeader: false,
        isTableSeparator: isSep,
        tableBlockId: activeTableBlockId,
        displayText: isActiveLine ? rawText : isSep ? '' : cells.join(' | '),
        inlineTokens: isSep ? [] : parseInlineMarkdownTokens(rawText, from),
      });
      i += 1;
      continue;
    }

    activeTableBlockId = null;

    // 7. Blank line
    if (trimmed === '') {
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'blank',
        prefixLength: 0,
        displayText: rawText,
        inlineTokens: [],
      });
      i += 1;
      continue;
    }

    // 8. Headings (# to ######)
    const headingMatch = /^(#{1,6})(\s+)(.*)$/.exec(rawText);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const prefixLength = headingMatch[1].length + headingMatch[2].length;
      const body = headingMatch[3];
      const inlineTokens = parseInlineMarkdownTokens(body, from + prefixLength);
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'heading',
        prefixLength,
        headingLevel: level,
        displayText: isActiveLine ? rawText : tokensToDisplayText(inlineTokens),
        inlineTokens,
      });
      i += 1;
      continue;
    }

    // 9. Horizontal rule
    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(rawText)) {
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'hr',
        prefixLength: 0,
        displayText: isActiveLine ? rawText : '',
        inlineTokens: [],
      });
      i += 1;
      continue;
    }

    // 10. Task checklist item (- [ ] / - [x])
    const taskMatch = /^(\s*[-*+]\s+\[([ xX ])\]\s*)(.*)$/.exec(rawText);
    if (taskMatch) {
      const prefix = taskMatch[1];
      const checked = taskMatch[2].toLowerCase() === 'x';
      const body = taskMatch[3];
      const bracketPos = rawText.indexOf('[');
      const inlineTokens = parseInlineMarkdownTokens(body, from + prefix.length);
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'task',
        prefixLength: prefix.length,
        taskChecked: checked,
        taskCheckOffset: bracketPos + 1,
        displayText: isActiveLine ? rawText : tokensToDisplayText(inlineTokens),
        inlineTokens,
      });
      i += 1;
      continue;
    }

    // 11. Unordered / ordered list item
    const listMatch = /^(\s*)([-*+]|\d+\.)(\s+)(.*)$/.exec(rawText);
    if (listMatch) {
      const prefixLength =
        listMatch[1].length + listMatch[2].length + listMatch[3].length;
      const body = listMatch[4];
      const inlineTokens = parseInlineMarkdownTokens(body, from + prefixLength);
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'list_item',
        prefixLength,
        listMarker: listMatch[2],
        displayText: isActiveLine ? rawText : tokensToDisplayText(inlineTokens),
        inlineTokens,
      });
      i += 1;
      continue;
    }

    // 12. Standard blockquote
    const quoteMatch = /^(>\s?)(.*)$/.exec(rawText);
    if (quoteMatch) {
      const prefixLength = quoteMatch[1].length;
      const body = quoteMatch[2];
      const inlineTokens = parseInlineMarkdownTokens(body, from + prefixLength);
      descriptors.push({
        lineIndex: i,
        rawText,
        from,
        to,
        isActiveLine,
        isBlockActive: isActiveLine,
        kind: 'blockquote',
        prefixLength,
        displayText: isActiveLine ? rawText : tokensToDisplayText(inlineTokens),
        inlineTokens,
      });
      i += 1;
      continue;
    }

    // 13. Paragraph
    const inlineTokens = parseInlineMarkdownTokens(rawText, from);
    descriptors.push({
      lineIndex: i,
      rawText,
      from,
      to,
      isActiveLine,
      isBlockActive: isActiveLine,
      kind: 'paragraph',
      prefixLength: 0,
      displayText: isActiveLine ? rawText : tokensToDisplayText(inlineTokens),
      inlineTokens,
    });
    i += 1;
  }

  return descriptors;
}

/** Toggles a Markdown checklist line `- [ ]` <-> `- [x]` at `lineIndex`. */
export function toggleTaskLineInMarkdown(
  content: string,
  lineIndex: number
): string {
  const lines = (content ?? '').split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) {
    return content;
  }
  const line = lines[lineIndex];
  const match = /^(\s*[-*+]\s+\[)([ xX ])(\].*)$/.exec(line);
  if (!match) {
    return content;
  }
  const nextMark = match[2].toLowerCase() === 'x' ? ' ' : 'x';
  lines[lineIndex] = `${match[1]}${nextMark}${match[3]}`;
  return lines.join('\n');
}

class MathWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly displayMode: boolean,
    readonly sourcePos: number
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MathWidget &&
      other.latex === this.latex &&
      other.displayMode === this.displayMode
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement(this.displayMode ? 'div' : 'span');
    wrapper.className = this.displayMode
      ? 'cm-live-preview-math-block'
      : 'cm-live-preview-math-inline';
    wrapper.innerHTML = renderMathHtml(this.latex, this.displayMode);
    wrapper.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.focus();
      view.dispatch({
        selection: { anchor: Math.min(this.sourcePos, view.state.doc.length) },
      });
    });
    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly lineIndex: number,
    readonly checkCharOffset: number,
    readonly onToggleTaskLine?: (lineIndex: number) => void
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TaskCheckboxWidget &&
      other.checked === this.checked &&
      other.lineIndex === this.lineIndex
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.checked;
    checkbox.className = 'cm-live-preview-task-checkbox';
    checkbox.setAttribute(
      'aria-label',
      this.checked ? 'Desmarcar tarea' : 'Marcar tarea como completada'
    );

    checkbox.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      const pos = this.checkCharOffset;
      if (pos >= 0 && pos < view.state.doc.length) {
        const current = view.state.doc.sliceString(pos, pos + 1);
        const nextChar = current.toLowerCase() === 'x' ? ' ' : 'x';
        view.dispatch({
          changes: { from: pos, to: pos + 1, insert: nextChar },
        });
      }
      this.onToggleTaskLine?.(this.lineIndex);
    });

    return checkbox;
  }

  ignoreEvent(event: Event): boolean {
    return (
      event.type === 'mousedown' ||
      event.type === 'click' ||
      event.type === 'change'
    );
  }
}

class CalloutBadgeWidget extends WidgetType {
  constructor(readonly calloutType: CalloutKind) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof CalloutBadgeWidget &&
      other.calloutType === this.calloutType
    );
  }

  toDOM(): HTMLElement {
    const badge = document.createElement('span');
    badge.className = `cm-callout-badge is-${this.calloutType.toLowerCase()}`;
    badge.textContent = CALLOUT_LABELS[this.calloutType];
    return badge;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class WikiLinkWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly displayText: string,
    readonly sourcePos: number,
    readonly onWikiLinkClick?: (targetTitle: string) => void
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof WikiLinkWidget &&
      other.target === this.target &&
      other.displayText === this.displayText
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-live-preview-wikilink';
    btn.setAttribute('data-wikilink-target', this.target);
    btn.textContent = this.displayText;

    btn.addEventListener('mousedown', (event) => {
      if (this.onWikiLinkClick && !event.altKey) {
        event.preventDefault();
      }
    });

    btn.addEventListener('click', (event) => {
      if (this.onWikiLinkClick && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        this.onWikiLinkClick(this.target);
        return;
      }
      view.focus();
      view.dispatch({
        selection: { anchor: Math.min(this.sourcePos, view.state.doc.length) },
      });
    });

    return btn;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'click' || event.type === 'mousedown';
  }
}

class HorizontalRuleWidget extends WidgetType {
  constructor(readonly className: string) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof HorizontalRuleWidget &&
      other.className === this.className
    );
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('span');
    rule.className = this.className;
    rule.setAttribute('aria-hidden', 'true');
    return rule;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function getActiveLineSet(state: {
  doc: { lineAt: (pos: number) => { number: number } };
  selection: { ranges: ReadonlyArray<{ from: number; to: number }> };
}): Set<number> {
  const active = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number - 1;
    const endLine = state.doc.lineAt(range.to).number - 1;
    for (let ln = startLine; ln <= endLine; ln += 1) {
      active.add(ln);
    }
  }
  return active;
}

function addInlineTokenDecorations(
  ranges: Range<Decoration>[],
  tokens: LivePreviewInlineToken[],
  onWikiLinkClick?: (targetTitle: string) => void
): void {
  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        break;
      case 'bold':
        ranges.push(
          Decoration.replace({}).range(tok.markerFrom, tok.contentFrom),
          Decoration.mark({ class: 'cm-live-preview-bold' }).range(
            tok.contentFrom,
            tok.contentTo
          ),
          Decoration.replace({}).range(tok.contentTo, tok.markerTo)
        );
        break;
      case 'italic':
        ranges.push(
          Decoration.replace({}).range(tok.markerFrom, tok.contentFrom),
          Decoration.mark({ class: 'cm-live-preview-italic' }).range(
            tok.contentFrom,
            tok.contentTo
          ),
          Decoration.replace({}).range(tok.contentTo, tok.markerTo)
        );
        break;
      case 'code':
        ranges.push(
          Decoration.replace({}).range(tok.markerFrom, tok.contentFrom),
          Decoration.mark({ class: 'cm-live-preview-code' }).range(
            tok.contentFrom,
            tok.contentTo
          ),
          Decoration.replace({}).range(tok.contentTo, tok.markerTo)
        );
        break;
      case 'math_inline':
        ranges.push(
          Decoration.replace({
            widget: new MathWidget(tok.latex, false, tok.from),
          }).range(tok.from, tok.to)
        );
        break;
      case 'math_display':
        ranges.push(
          Decoration.replace({
            widget: new MathWidget(tok.latex, true, tok.from),
          }).range(tok.from, tok.to)
        );
        break;
      case 'wikilink':
        ranges.push(
          Decoration.replace({
            widget: new WikiLinkWidget(
              tok.target,
              tok.displayText,
              tok.from,
              onWikiLinkClick
            ),
          }).range(tok.from, tok.to)
        );
        break;
    }
  }
}

function buildMultiLineMathDecorations(
  state: EditorView['state']
): DecorationSet {
  const docText = state.doc.toString();
  const activeLines = getActiveLineSet(state);
  const lines = parseLivePreviewLines(docText, activeLines);
  const builder = new RangeSetBuilder<Decoration>();

  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx];
    if (
      line.kind === 'math_block' &&
      line.mathBlockStartLine !== undefined &&
      line.mathBlockEndLine !== undefined &&
      line.mathBlockEndLine > line.mathBlockStartLine &&
      !line.isBlockActive
    ) {
      const startLineObj = state.doc.line(line.mathBlockStartLine + 1);
      const endLineObj = state.doc.line(line.mathBlockEndLine + 1);
      builder.add(
        startLineObj.from,
        endLineObj.to,
        Decoration.replace({
          widget: new MathWidget(
            line.mathLatex ?? '',
            true,
            startLineObj.from
          ),
          block: true,
        })
      );
      idx = line.mathBlockEndLine + 1;
      continue;
    }
    idx += 1;
  }

  return builder.finish();
}

function buildViewPluginDecorations(
  view: EditorView,
  opts: LivePreviewExtensionOptions
): DecorationSet {
  const docText = view.state.doc.toString();
  const activeLines = getActiveLineSet(view.state);
  const lines = parseLivePreviewLines(docText, activeLines);
  const tree = syntaxTree(view.state);
  const ranges: Range<Decoration>[] = [];

  for (const line of lines) {
    // Check syntax tree for fenced code context as a secondary guard
    const nodeAtLine = tree.resolveInner(line.from, 1);
    const inTreeCodeBlock =
      nodeAtLine.name === 'FencedCode' || nodeAtLine.name === 'CodeText';

    if (
      line.kind === 'math_block' &&
      line.mathBlockStartLine !== undefined &&
      line.mathBlockEndLine !== undefined &&
      line.mathBlockEndLine > line.mathBlockStartLine
    ) {
      // Multi-line inactive math blocks are replaced by multiLineMathField
      if (!line.isBlockActive) {
        continue;
      }
      ranges.push(
        Decoration.line({ class: 'cm-live-preview-math-source' }).range(line.from)
      );
      continue;
    }

    if (line.isActiveLine) {
      if (line.kind === 'heading' && line.headingLevel) {
        ranges.push(
          Decoration.line({
            class: `cm-live-preview-heading cm-live-preview-h${Math.min(
              3,
              line.headingLevel
            )} is-active-line`,
          }).range(line.from)
        );
      } else if (line.kind === 'callout' && line.calloutType) {
        ranges.push(
          Decoration.line({
            class: `cm-live-preview-callout cm-live-preview-callout-${line.calloutType.toLowerCase()} is-active-line`,
          }).range(line.from)
        );
      } else {
        ranges.push(
          Decoration.line({ class: 'cm-live-preview-active-line' }).range(
            line.from
          )
        );
      }
      continue;
    }

    if (line.kind === 'code_fence' || inTreeCodeBlock) {
      ranges.push(
        Decoration.line({
          class: line.isCodeFenceDelimiter
            ? 'cm-live-preview-code-fence-delim'
            : 'cm-live-preview-code-block',
        }).range(line.from)
      );
      continue;
    }

    switch (line.kind) {
      case 'heading': {
        const lvl = Math.min(3, line.headingLevel ?? 1);
        ranges.push(
          Decoration.line({
            class: `cm-live-preview-heading cm-live-preview-h${lvl}`,
          }).range(line.from)
        );
        if (line.prefixLength > 0) {
          ranges.push(
            Decoration.replace({}).range(
              line.from,
              line.from + line.prefixLength
            )
          );
        }
        addInlineTokenDecorations(
          ranges,
          line.inlineTokens,
          opts.onWikiLinkClick
        );
        break;
      }

      case 'callout': {
        const kindLower = (line.calloutType ?? 'NOTE').toLowerCase();
        ranges.push(
          Decoration.line({
            class: `cm-live-preview-callout cm-live-preview-callout-${kindLower} ${
              line.isCalloutHeader ? 'is-header' : 'is-body'
            }`,
          }).range(line.from)
        );
        if (line.isCalloutHeader && line.calloutType) {
          const badgeMatch = /^>\s*\[![A-Z]+\]/i.exec(line.rawText);
          const badgeEnd = badgeMatch
            ? line.from + badgeMatch[0].length
            : line.from + line.prefixLength;
          ranges.push(
            Decoration.replace({
              widget: new CalloutBadgeWidget(line.calloutType),
            }).range(line.from, badgeEnd)
          );
          if (line.inlineTokens.length > 0) {
            addInlineTokenDecorations(
              ranges,
              line.inlineTokens,
              opts.onWikiLinkClick
            );
          }
        } else if (line.prefixLength > 0) {
          ranges.push(
            Decoration.replace({}).range(
              line.from,
              line.from + line.prefixLength
            )
          );
          addInlineTokenDecorations(
            ranges,
            line.inlineTokens,
            opts.onWikiLinkClick
          );
        }
        break;
      }

      case 'task': {
        ranges.push(
          Decoration.line({
            class: `cm-live-preview-task ${
              line.taskChecked ? 'is-checked' : ''
            }`.trim(),
          }).range(line.from)
        );
        const markerMatch = /^(\s*)([-*+]\s+\[[ xX ]\])/.exec(line.rawText);
        if (markerMatch && line.taskCheckOffset !== undefined) {
          const replaceFrom = line.from + markerMatch[1].length;
          const replaceTo = replaceFrom + markerMatch[2].length;
          ranges.push(
            Decoration.replace({
              widget: new TaskCheckboxWidget(
                Boolean(line.taskChecked),
                line.lineIndex,
                line.from + line.taskCheckOffset,
                opts.onToggleTaskLine
              ),
            }).range(replaceFrom, replaceTo)
          );
        }
        addInlineTokenDecorations(
          ranges,
          line.inlineTokens,
          opts.onWikiLinkClick
        );
        break;
      }

      case 'list_item': {
        ranges.push(
          Decoration.line({ class: 'cm-live-preview-list-item' }).range(
            line.from
          )
        );
        addInlineTokenDecorations(
          ranges,
          line.inlineTokens,
          opts.onWikiLinkClick
        );
        break;
      }

      case 'blockquote': {
        ranges.push(
          Decoration.line({ class: 'cm-live-preview-blockquote' }).range(
            line.from
          )
        );
        if (line.prefixLength > 0) {
          ranges.push(
            Decoration.replace({}).range(
              line.from,
              line.from + line.prefixLength
            )
          );
        }
        addInlineTokenDecorations(
          ranges,
          line.inlineTokens,
          opts.onWikiLinkClick
        );
        break;
      }

      case 'hr': {
        ranges.push(
          Decoration.line({ class: 'cm-live-preview-hr-line' }).range(line.from)
        );
        if (line.to > line.from) {
          ranges.push(
            Decoration.replace({
              widget: new HorizontalRuleWidget('cm-live-preview-hr'),
            }).range(line.from, line.to)
          );
        }
        break;
      }

      case 'math_block': {
        ranges.push(
          Decoration.line({ class: 'cm-live-preview-math-line' }).range(
            line.from
          )
        );
        if (line.to > line.from) {
          ranges.push(
            Decoration.replace({
              widget: new MathWidget(line.mathLatex ?? '', true, line.from),
            }).range(line.from, line.to)
          );
        }
        break;
      }

      case 'table_row': {
        if (line.isTableSeparator) {
          ranges.push(
            Decoration.line({
              class: 'cm-live-preview-table-row is-separator',
            }).range(line.from)
          );
          if (line.to > line.from) {
            ranges.push(
              Decoration.replace({
                widget: new HorizontalRuleWidget('cm-live-preview-table-sep'),
              }).range(line.from, line.to)
            );
          }
        } else {
          ranges.push(
            Decoration.line({
              class: `cm-live-preview-table-row ${
                line.isTableHeader ? 'is-header' : ''
              }`.trim(),
            }).range(line.from)
          );
          for (let pos = 0; pos < line.rawText.length; pos += 1) {
            if (line.rawText[pos] === '|') {
              ranges.push(
                Decoration.mark({ class: 'cm-live-preview-table-pipe' }).range(
                  line.from + pos,
                  line.from + pos + 1
                )
              );
            }
          }
          addInlineTokenDecorations(
            ranges,
            line.inlineTokens,
            opts.onWikiLinkClick
          );
        }
        break;
      }

      case 'paragraph': {
        addInlineTokenDecorations(
          ranges,
          line.inlineTokens,
          opts.onWikiLinkClick
        );
        break;
      }

      case 'blank':
        break;
    }
  }

  return Decoration.set(ranges, true);
}

/**
 * Creates the CodeMirror 6 Live Preview extension with real-time WYSIWYM styling,
 * cursor-scoped raw syntax reveal, clickable checklists, callouts, tables, math, and WikiLinks.
 */
export function createLivePreviewExtension(
  opts: LivePreviewExtensionOptions = {}
): Extension {
  const multiLineMathField = StateField.define<DecorationSet>({
    create(state) {
      return buildMultiLineMathDecorations(state);
    },
    update(value, tr) {
      if (tr.docChanged || tr.selection) {
        return buildMultiLineMathDecorations(tr.state);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  const livePreviewPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildViewPluginDecorations(view, opts);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = buildViewPluginDecorations(update.view, opts);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    }
  );

  return [multiLineMathField, livePreviewPlugin];
}
