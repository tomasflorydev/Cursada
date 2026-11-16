import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SuperMarkdownEditor } from '../components/notes/SuperMarkdownEditor';
import { EditorShortcutsSettingsSection } from '../components/settings/EditorShortcutsSettingsSection';
import {
  applyEditorCommandToText,
  DEFAULT_EDITOR_SHORTCUTS,
  detectEditorShortcutCollisions,
  EDITOR_SHORTCUT_DEFINITIONS,
  EDITOR_SHORTCUTS_STORAGE_KEY,
  eventToShortcutBinding,
  getStoredEditorShortcuts,
  normalizeShortcutBinding,
  resetEditorShortcuts,
  saveEditorShortcuts,
} from '../lib/editor/editorShortcuts';
import { parseLivePreviewLines } from '../lib/editor/livePreviewExtension';
import {
  renderMathHtml,
  renderMathReact,
  renderTextWithMathAndCitations,
} from '../lib/math/latexRenderer';

function ControlledSuperEditor({
  initialContent,
  onSaveShortcut,
  onOpenWikiLink,
  availableNotes,
}: {
  initialContent: string;
  onSaveShortcut?: () => void;
  onOpenWikiLink?: (target: string) => void;
  availableNotes?: Array<{ id: string; title: string; courseId: string }>;
}) {
  const [content, setContent] = useState(initialContent);
  return (
    <div>
      <SuperMarkdownEditor
        noteId="note-p11"
        courseId="course-alg"
        content={content}
        onChangeContent={setContent}
        onSaveShortcut={onSaveShortcut}
        onOpenWikiLink={onOpenWikiLink}
        availableNotes={availableNotes}
      />
      <pre data-testid="controlled-raw-content">{content}</pre>
    </div>
  );
}

describe('Phase 11: Offline LaTeX Math, CodeMirror 6 Live Preview & Configurable Shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('11.1 Offline LaTeX / KaTeX math renderer', () => {
    it('renders inline $O(n \\log n)$, fractions, sub/superscripts, Greek symbols, and matrices offline', () => {
      const htmlComplexity = renderMathHtml('O(n \\log n)');
      expect(htmlComplexity).toContain('class="katex-math"');
      expect(htmlComplexity).toContain('role="math"');
      expect(htmlComplexity).toContain('data-latex="O(n \\log n)"');
      expect(htmlComplexity).toContain('log');

      const { container } = render(
        <div>
          {renderMathReact('\\frac{a_i^2 + \\alpha}{2\\Omega}', false)}
          {renderMathReact('\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}', false)}
        </div>
      );

      const mathEls = container.querySelectorAll('.katex-math');
      expect(mathEls).toHaveLength(2);
      expect(mathEls[0].querySelector('.katex-frac-num')).not.toBeNull();
      expect(mathEls[0].querySelector('.katex-frac-den')).not.toBeNull();
      expect(mathEls[0].textContent).toContain('α');
      expect(mathEls[0].textContent).toContain('Ω');
      expect(mathEls[0].querySelector('.katex-supsub')).not.toBeNull();
      expect(mathEls[1].querySelector('.katex-matrix')).not.toBeNull();
      expect(mathEls[1].querySelectorAll('.katex-matrix-cell')).toHaveLength(4);
    });

    it('renders block display equations with stacked limits cleanly', () => {
      const htmlBlock = renderMathHtml('\\sum_{i=1}^n x_i', true);
      expect(htmlBlock).toContain('class="katex-display"');
      expect(htmlBlock).toContain('∑');
      expect(htmlBlock).toContain('katex-mathop-limits');

      const { container } = render(
        <div>{renderMathReact('\\sum_{i=1}^n x_i', true)}</div>
      );
      const displayEl = container.querySelector('.katex-display');
      expect(displayEl).not.toBeNull();
      expect(displayEl).toHaveAttribute('data-latex', '\\sum_{i=1}^n x_i');
      expect(displayEl?.textContent).toContain('∑');
      expect(displayEl?.textContent).toContain('i=1');
    });

    it('renders mixed prose with inline/block math and clickable [N] citation badges', () => {
      const onCitationClick = vi.fn();
      const { container } = render(
        <div>
          {renderTextWithMathAndCitations(
            'El orden es $O(n \\log n)$ según [1], la matriz $\\begin{bmatrix} 1 \\end{bmatrix}$ cumple \\[\\int_0^1 x^2 dx\\] en [2], y el costo de $100 a $200 no es fórmula.',
            onCitationClick
          )}
        </div>
      );

      expect(container.querySelectorAll('.katex-math')).toHaveLength(2);
      expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
      expect(container.textContent).toContain('$100 a $200');

      const cite1 = screen.getByRole('button', { name: 'Fuente [1]' });
      const cite2 = screen.getByRole('button', { name: 'Fuente [2]' });
      expect(screen.getAllByRole('button', { name: /Fuente \[\d+\]/ })).toHaveLength(2);

      fireEvent.click(cite1);
      fireEvent.click(cite2);
      expect(onCitationClick).toHaveBeenNthCalledWith(1, 1);
      expect(onCitationClick).toHaveBeenNthCalledWith(2, 2);
    });

    it('renders integrals, limits, nth roots, calligraphic/blackboard, and \\text{} cleanly', () => {
      const html = renderMathHtml(
        '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1, \\sqrt[3]{27}, \\mathcal{O}(n), \\forall x \\in \\mathbb{R} \\text{ si } x \\ge 0',
        true
      );
      expect(html).toContain('lim');
      expect(html).toContain('→');
      expect(html).toContain('sin');
      expect(html).toContain('√');
      expect(html).toContain('katex-sqrt-index');
      expect(html).toContain('katex-cal');
      expect(html).toContain('∀');
      expect(html).toContain('∈');
      expect(html).toContain('ℝ');
      expect(html).toContain('si ');
      expect(html).toContain('≥');
    });
  });

  describe('11.2 Live Preview parsing & SuperMarkdownEditor', () => {
    it('parseLivePreviewLines hides raw syntax on inactive lines and reveals it on the active cursor line', () => {
      const md = [
        '# Teorema Central',
        'Texto con **negrita**, *cursiva* y $x_i^2$.',
        '> [!NOTE] Recordatorio',
        '> Repasar [[Álgebra Lineal]]',
        '- [ ] Resolver guía',
      ].join('\n');

      const cursorOnLine1 = parseLivePreviewLines(md, 1);
      expect(cursorOnLine1[0].isActiveLine).toBe(false);
      expect(cursorOnLine1[0].kind).toBe('heading');
      expect(cursorOnLine1[0].headingLevel).toBe(1);
      expect(cursorOnLine1[0].displayText).toBe('Teorema Central');

      expect(cursorOnLine1[1].isActiveLine).toBe(true);
      expect(cursorOnLine1[1].displayText).toBe(
        'Texto con **negrita**, *cursiva* y $x_i^2$.'
      );

      expect(cursorOnLine1[2].kind).toBe('callout');
      expect(cursorOnLine1[2].calloutType).toBe('NOTE');
      expect(cursorOnLine1[2].displayText).toBe('Recordatorio');

      expect(cursorOnLine1[3].displayText).toBe('Repasar Álgebra Lineal');
      expect(cursorOnLine1[4].kind).toBe('task');
      expect(cursorOnLine1[4].taskChecked).toBe(false);
      expect(cursorOnLine1[4].displayText).toBe('Resolver guía');
    });

    it('renders live formatted headings, math, callouts, and reveals raw syntax only on the active cursor line', () => {
      const sample = [
        '# Análisis de Algoritmos',
        'Complejidad **cuadrática** con $O(n^2)$',
        '',
        '> [!WARNING] Cota ajustada',
        '> Revisar caso peor',
        '',
        '$$ \\sum_{i=1}^n x_i $$',
      ].join('\n');

      render(<ControlledSuperEditor initialContent={sample} />);

      const textarea = screen.getByLabelText(
        'Contenido de la nota'
      ) as HTMLTextAreaElement;
      const preview = screen.getByTestId('live-preview-surface');

      // Move cursor to line 0 -> line 0 reveals raw '#', line 1 formats '**' and '$'
      textarea.setSelectionRange(0, 0);
      fireEvent.select(textarea);

      const activeLineZero = preview.querySelector('[data-line-index="0"]');
      expect(activeLineZero).toHaveAttribute('data-active-line', 'true');
      expect(activeLineZero?.textContent).toBe('# Análisis de Algoritmos');

      const lineOne = preview.querySelector('[data-line-index="1"]');
      expect(lineOne?.querySelector('strong')?.textContent).toBe('cuadrática');
      expect(lineOne?.textContent).not.toContain('**');
      expect(lineOne?.querySelector('.katex-math')).not.toBeNull();

      // Callout and block math rendered cleanly when inactive
      const callout = preview.querySelector('.cm-callout-block[data-callout-type="WARNING"]');
      expect(callout).not.toBeNull();
      expect(callout?.textContent).toContain('Cota ajustada');
      expect(callout?.textContent).not.toContain('[!WARNING]');
      expect(preview.querySelector('.katex-display')).not.toBeNull();

      // Move cursor onto line 1 -> line 0 becomes formatted <h1> without '#', line 1 reveals raw '**' and '$'
      const line1Offset = '# Análisis de Algoritmos\n'.length + 2;
      textarea.setSelectionRange(line1Offset, line1Offset);
      fireEvent.select(textarea);

      expect(
        within(preview).getByRole('heading', {
          level: 1,
          name: 'Análisis de Algoritmos',
        })
      ).toBeInTheDocument();
      const activeLineOne = preview.querySelector('[data-line-index="1"]');
      expect(activeLineOne).toHaveAttribute('data-active-line', 'true');
      expect(activeLineOne?.textContent).toContain('**cuadrática**');
      expect(activeLineOne?.textContent).toContain('$O(n^2)$');
    });

    it('toggles task checkboxes interactively in live preview and switches Live Preview / Fuente modes', () => {
      const md = [
        '# Pendientes',
        '- [ ] Leer capítulo 3',
        '- [x] Subir resumen',
      ].join('\n');

      render(<ControlledSuperEditor initialContent={md} />);

      const textarea = screen.getByLabelText(
        'Contenido de la nota'
      ) as HTMLTextAreaElement;
      textarea.setSelectionRange(0, 0);
      fireEvent.select(textarea);

      const preview = screen.getByTestId('live-preview-surface');
      const checkboxes = within(preview).getAllByRole(
        'checkbox'
      ) as HTMLInputElement[];
      expect(checkboxes).toHaveLength(2);
      expect(checkboxes[0].checked).toBe(false);
      expect(checkboxes[1].checked).toBe(true);

      fireEvent.click(checkboxes[0]);
      expect(screen.getByTestId('controlled-raw-content').textContent).toContain(
        '- [x] Leer capítulo 3'
      );

      // Toggle to Fuente mode hides live preview surface; returning restores it
      fireEvent.click(screen.getByRole('button', { name: 'Fuente' }));
      expect(
        screen.queryByTestId('live-preview-surface')
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Live Preview' }));
      expect(screen.getByTestId('live-preview-surface')).toBeInTheDocument();
    });

    it('shows accessible [[WikiLink]] autocomplete popup, inserts selection, and invokes onOpenWikiLink', () => {
      const onOpenWikiLink = vi.fn();
      const notes = [
        { id: 'n1', title: 'Álgebra Lineal', courseId: 'course-alg' },
        { id: 'n2', title: 'Grafos y Árboles', courseId: 'course-alg' },
        { id: 'n3', title: 'Sistemas Operativos', courseId: 'course-so' },
      ];

      render(
        <ControlledSuperEditor
          initialContent=""
          availableNotes={notes}
          onOpenWikiLink={onOpenWikiLink}
        />
      );

      const textarea = screen.getByLabelText(
        'Contenido de la nota'
      ) as HTMLTextAreaElement;

      fireEvent.change(textarea, { target: { value: 'Ver [[alg' } });

      const listbox = screen.getByRole('listbox', {
        name: 'Notas disponibles para enlazar',
      });
      const options = within(listbox).getAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('Álgebra Lineal');

      fireEvent.keyDown(textarea, { key: 'Enter' });

      expect(screen.getByTestId('controlled-raw-content').textContent).toBe(
        'Ver [[Álgebra Lineal]]'
      );
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      // Add another line so the WikiLink line becomes inactive and clickable
      fireEvent.change(textarea, {
        target: { value: 'Ver [[Álgebra Lineal]]\nOtra línea' },
      });

      const linkBtn = screen.getByRole('button', { name: 'Álgebra Lineal' });
      fireEvent.click(linkBtn);
      expect(onOpenWikiLink).toHaveBeenCalledWith('Álgebra Lineal');

      // Toolbar [[Enlace]] inserts [[]] with cursor inside and avoids duplicate ]]]]
      fireEvent.change(textarea, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: '[[Enlace]]' }));
      const popupAfterBtn = screen.getByRole('listbox', {
        name: 'Notas disponibles para enlazar',
      });
      fireEvent.click(within(popupAfterBtn).getByRole('option', { name: 'Grafos y Árboles' }));
      expect(screen.getByTestId('controlled-raw-content').textContent).toBe(
        '[[Grafos y Árboles]]'
      );
    });

    it('renders tables and all callout variants cleanly in Live Preview', () => {
      const md = [
        'Línea activa',
        '| Estructura | Complejidad |',
        '| --- | --- |',
        '| HashMap | O(1) |',
        '',
        '> [!NOTE] Definición',
        '> Cuerpo nota',
        '',
        '> [!TIP] Consejo',
        '> Cuerpo tip',
        '',
        '> [!IMPORTANT] Clave',
        '> Cuerpo importante',
      ].join('\n');

      render(<ControlledSuperEditor initialContent={md} />);
      const textarea = screen.getByLabelText(
        'Contenido de la nota'
      ) as HTMLTextAreaElement;
      textarea.setSelectionRange(0, 0);
      fireEvent.select(textarea);

      const preview = screen.getByTestId('live-preview-surface');
      const table = within(preview).getByRole('table');
      expect(within(table).getByText('Estructura')).toBeInTheDocument();
      expect(within(table).getByText('HashMap')).toBeInTheDocument();

      expect(
        preview.querySelector('.cm-callout-block[data-callout-type="NOTE"]')
      ).not.toBeNull();
      expect(
        preview.querySelector('.cm-callout-block[data-callout-type="TIP"]')
      ).not.toBeNull();
      expect(
        preview.querySelector('.cm-callout-block[data-callout-type="IMPORTANT"]')
      ).not.toBeNull();
    });

    it('mounts real CodeMirror 6 with Live Preview decorations when Range layout APIs are present', async () => {
      const originalGetClientRects = Range.prototype.getClientRects;
      const originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;

      Range.prototype.getClientRects = function () {
        return {
          length: 0,
          item: () => null,
          [Symbol.iterator]: function* () {},
        } as unknown as DOMRectList;
      };
      Range.prototype.getBoundingClientRect = function () {
        return {
          x: 0,
          y: 0,
          width: 0,
          height: 16,
          top: 0,
          right: 0,
          bottom: 16,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      };

      try {
        const md = [
          'Línea activa inicial',
          '# Título CM6',
          '- [ ] Tarea CM6',
          'Fórmula $x^2 + y^2$',
          '$$',
          '\\sum_{i=1}^n x_i',
          '$$',
        ].join('\n');

        render(<ControlledSuperEditor initialContent={md} />);

        const cmHost = await screen.findByTestId('super-editor-codemirror-host');
        await waitFor(() => {
          expect(cmHost.querySelector('.cm-editor')).not.toBeNull();
          expect(
            cmHost.querySelector('.cm-content[aria-label="Contenido de la nota"]')
          ).not.toBeNull();
          expect(
            cmHost.querySelector('.cm-live-preview-heading.cm-live-preview-h1')
          ).not.toBeNull();
          expect(cmHost.querySelector('.katex-math')).not.toBeNull();
          expect(cmHost.querySelector('.katex-display')).not.toBeNull();
          expect(
            cmHost.querySelector('.cm-live-preview-task-checkbox')
          ).not.toBeNull();
        });

        const cmCheckbox = cmHost.querySelector(
          '.cm-live-preview-task-checkbox'
        ) as HTMLInputElement;
        fireEvent.click(cmCheckbox);

        await waitFor(() => {
          expect(
            screen.getByTestId('controlled-raw-content').textContent
          ).toContain('- [x] Tarea CM6');
        });
      } finally {
        Range.prototype.getClientRects = originalGetClientRects;
        Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      }
    });
  });

  describe('11.3 Configurable Editor Shortcuts & Settings UI', () => {
    it('executes all 13 editor commands cleanly via applyEditorCommandToText', () => {
      const tableRes = applyEditorCommandToText('Intro', 5, 5, 'insert_table');
      expect(tableRes.nextContent).toContain('| Columna 1 | Columna 2 |');
      expect(tableRes.nextContent).toContain('| --- | --- |');

      const noteCallout = applyEditorCommandToText('', 0, 0, 'insert_callout_note');
      expect(noteCallout.nextContent).toContain('> [!NOTE] Nota');

      const warnCallout = applyEditorCommandToText('', 0, 0, 'insert_callout_warning');
      expect(warnCallout.nextContent).toContain('> [!WARNING] Atención');

      const tipCallout = applyEditorCommandToText('', 0, 0, 'insert_callout_tip');
      expect(tipCallout.nextContent).toContain('> [!TIP] Consejo');

      const mathRes = applyEditorCommandToText('x = y', 0, 5, 'insert_math_block');
      expect(mathRes.nextContent).toBe('$$\nx = y\n$$');

      const codeRes = applyEditorCommandToText('', 0, 0, 'insert_code_block');
      expect(codeRes.nextContent).toBe('```\n\n```');
      expect(codeRes.selectionStart).toBe(4);

      const h1 = applyEditorCommandToText('Tema', 4, 4, 'heading_1');
      expect(h1.nextContent).toBe('# Tema');
      const h2 = applyEditorCommandToText(h1.nextContent, 6, 6, 'heading_2');
      expect(h2.nextContent).toBe('## Tema');
      const h3 = applyEditorCommandToText(h2.nextContent, 7, 7, 'heading_3');
      expect(h3.nextContent).toBe('### Tema');

      const bold = applyEditorCommandToText('hola mundo', 5, 10, 'bold');
      expect(bold.nextContent).toBe('hola **mundo**');
      const italic = applyEditorCommandToText('hola mundo', 0, 4, 'italic');
      expect(italic.nextContent).toBe('*hola* mundo');

      const task1 = applyEditorCommandToText('Estudiar', 0, 0, 'toggle_task');
      expect(task1.nextContent).toBe('- [ ] Estudiar');
      const task2 = applyEditorCommandToText(task1.nextContent, 0, 0, 'toggle_task');
      expect(task2.nextContent).toBe('- [x] Estudiar');

      const wiki = applyEditorCommandToText('', 0, 0, 'insert_wikilink');
      expect(wiki.nextContent).toBe('[[]]');
      expect(wiki.selectionStart).toBe(2);
    });

    it('normalizes bindings, converts keyboard events, detects collisions, and persists in localStorage', () => {
      expect(detectEditorShortcutCollisions(DEFAULT_EDITOR_SHORTCUTS)).toEqual([]);
      const reservedGlobalBindings = new Set([
        'Mod+K',
        'Mod+N',
        'Mod+S',
        'Mod+1',
        'Mod+2',
        'Mod+3',
        'Mod+4',
        'Mod+5',
        'Mod+6',
        'Mod+,',
      ]);
      for (const binding of Object.values(DEFAULT_EDITOR_SHORTCUTS)) {
        expect(reservedGlobalBindings.has(binding)).toBe(false);
      }

      expect(normalizeShortcutBinding('cmd+shift+t')).toBe('Mod+Shift+T');
      expect(normalizeShortcutBinding('⌘⌥1')).toBe('Mod+Alt+1');
      expect(normalizeShortcutBinding('Ctrl+b')).toBe('Mod+B');

      expect(
        eventToShortcutBinding({
          key: '¡',
          code: 'Digit1',
          metaKey: true,
          ctrlKey: false,
          altKey: true,
          shiftKey: false,
        })
      ).toBe('Mod+Alt+1');

      const collisions = detectEditorShortcutCollisions({
        ...DEFAULT_EDITOR_SHORTCUTS,
        insert_table: 'Mod+B',
      });
      expect(collisions).toHaveLength(1);
      expect(collisions[0].binding).toBe('Mod+B');
      expect(collisions[0].actionIds).toEqual(
        expect.arrayContaining(['bold', 'insert_table'])
      );

      saveEditorShortcuts({
        ...DEFAULT_EDITOR_SHORTCUTS,
        insert_math_block: 'Mod+Alt+M',
      });
      expect(localStorage.getItem(EDITOR_SHORTCUTS_STORAGE_KEY)).toContain(
        'Mod+Alt+M'
      );
      expect(getStoredEditorShortcuts().insert_math_block).toBe('Mod+Alt+M');

      const reset = resetEditorShortcuts();
      expect(reset.insert_math_block).toBe(
        DEFAULT_EDITOR_SHORTCUTS.insert_math_block
      );
    });

    it('triggers toolbar buttons and custom keyboard shortcuts inside SuperMarkdownEditor', () => {
      const onSaveShortcut = vi.fn();
      saveEditorShortcuts({
        ...DEFAULT_EDITOR_SHORTCUTS,
        insert_math_block: 'Mod+Alt+M',
      });

      render(
        <ControlledSuperEditor
          initialContent=""
          onSaveShortcut={onSaveShortcut}
        />
      );

      const textarea = screen.getByLabelText('Contenido de la nota');
      fireEvent.click(screen.getByRole('button', { name: 'Tabla' }));
      expect(screen.getByTestId('controlled-raw-content').textContent).toContain(
        '| Columna 1 | Columna 2 |'
      );

      fireEvent.keyDown(textarea, { key: 's', metaKey: true });
      expect(onSaveShortcut).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(textarea, { key: 'm', metaKey: true, altKey: true });
      expect(screen.getByTestId('controlled-raw-content').textContent).toContain(
        '$$\n\n$$'
      );
    });

    it('renders EditorShortcutsSettingsSection, detects collisions, persists custom shortcuts, and resets defaults', () => {
      render(<EditorShortcutsSettingsSection />);

      for (const def of EDITOR_SHORTCUT_DEFINITIONS) {
        expect(screen.getByText(def.title)).toBeInTheDocument();
      }

      const tableInput = screen.getByLabelText('Atajo para Insertar tabla');
      fireEvent.change(tableInput, { target: { value: 'Mod+B' } });

      const warning = screen.getByTestId('editor-shortcuts-collision-warning');
      expect(warning).toHaveTextContent(/Colisión detectada/i);
      expect(
        screen.getByTestId('editor-shortcut-row-insert_table')
      ).toHaveAttribute('data-collision', 'true');
      expect(screen.getByTestId('editor-shortcut-row-bold')).toHaveAttribute(
        'data-collision',
        'true'
      );

      // Capture via button keypress
      const captureMathBtn = screen.getByRole('button', {
        name: 'Capturar atajo para Insertar bloque matemático',
      });
      fireEvent.click(captureMathBtn);
      fireEvent.keyDown(captureMathBtn, {
        key: 'e',
        metaKey: true,
        shiftKey: true,
      });

      expect(
        screen.getByTestId('editor-shortcut-kbd-insert_math_block')
      ).toHaveTextContent('⌘⇧E');
      expect(getStoredEditorShortcuts().insert_math_block).toBe('Mod+Shift+E');

      // Reset to defaults
      fireEvent.click(
        screen.getByRole('button', { name: 'Restaurar valores por defecto' })
      );
      expect(
        screen.queryByTestId('editor-shortcuts-collision-warning')
      ).not.toBeInTheDocument();
      expect(getStoredEditorShortcuts().insert_table).toBe(
        DEFAULT_EDITOR_SHORTCUTS.insert_table
      );
      expect(getStoredEditorShortcuts().insert_math_block).toBe(
        DEFAULT_EDITOR_SHORTCUTS.insert_math_block
      );
    });
  });
});
