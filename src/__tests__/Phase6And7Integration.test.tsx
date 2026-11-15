import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { App } from '../App';
import { resetAllMocks } from '../lib/api/mockClient';

beforeAll(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal(
        this: HTMLDialogElement
      ) {
        this.setAttribute('open', '');
        this.returnValue = '';
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close(
        this: HTMLDialogElement,
        returnValue?: string
      ) {
        this.returnValue = returnValue ?? '';
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close', { bubbles: false }));
      };
    }
  }
});

describe('Phase 6 & 7 Integration: CourseDetailView Asistente IA (Map-Reduce Generator + RAG Chat with Citations)', () => {
  beforeEach(() => {
    resetAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('navigates into CourseDetailView Asistente IA, generates custom Map-Reduce report into Notas, and runs RAG Chat with citation inspection + note save', async () => {
    render(<App />);

    // 1. Open "Ingeniería de Software I" from the sidebar
    const coursesNav = screen.getByRole('navigation', {
      name: 'Materias en curso',
    });
    const courseBtn = await within(coursesNav).findByRole('button', {
      name: /Ingeniería de Software I/i,
    });
    fireEvent.click(courseBtn);

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    // 2. Switch to "Asistente IA" tab
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Asistente IA' }));

    const assistantTabPanel = screen.getByTestId('course-assistant-tab-panel');
    expect(assistantTabPanel).toBeInTheDocument();
    expect(
      within(assistantTabPanel).getByTestId('assistant-ondemand-badge')
    ).toHaveTextContent(
      /IA local bajo demanda \(Ollama se activa solo al generar y libera memoria al terminar\)/i
    );

    // 3. Phase 7: Wait for ready sources to load, then generate custom "Informe" via Map-Reduce
    await within(assistantTabPanel).findByRole('checkbox', {
      name: /Resumen Patrones y Calidad\.md/i,
    });
    const generateBtn = within(assistantTabPanel).getByRole('button', {
      name: 'Generar material',
    });
    await waitFor(() => {
      expect(generateBtn).toBeEnabled();
    });

    fireEvent.click(within(assistantTabPanel).getByLabelText('Informe'));
    fireEvent.change(
      within(assistantTabPanel).getByLabelText(
        /Instrucciones \/ Prompt para la IA/i
      ),
      {
        target: {
          value: 'Elaborá un informe técnico con ejemplos de trazabilidad',
        },
      }
    );
    fireEvent.change(
      within(assistantTabPanel).getByLabelText(/Título del material/i),
      { target: { value: 'Informe Trazabilidad IS1' } }
    );
    fireEvent.click(generateBtn);

    const resultCard = await within(assistantTabPanel).findByTestId(
      'report-result-card'
    );
    expect(resultCard).toHaveTextContent('Informe Trazabilidad IS1');
    expect(
      within(resultCard).getByTestId('report-steps-list')
    ).toHaveTextContent(/Reduce/i);
    expect(
      within(resultCard).getByTestId('report-markdown-preview')
    ).toHaveTextContent(/Elaborá un informe técnico con ejemplos de trazabilidad/i);

    // Jump to Notas via "Abrir en Notas" and confirm the auto-saved note appears
    fireEvent.click(
      within(resultCard).getByRole('button', { name: 'Abrir en Notas' })
    );

    await waitFor(() => {
      expect(
        within(tablist).getByRole('tab', { name: 'Notas' })
      ).toHaveAttribute('aria-selected', 'true');
    });

    const toggleListBtn = await screen.findByRole('button', {
      name: /Mostrar lista|Ocultar lista/i,
    });
    if (/Mostrar lista/i.test(toggleListBtn.textContent ?? '')) {
      fireEvent.click(toggleListBtn);
    }

    expect(
      await screen.findByText('Informe Trazabilidad IS1')
    ).toBeInTheDocument();

    // 4. Switch back to "Asistente IA" and test Phase 6 RAG Chat
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Asistente IA' }));

    const assistantWorkspace = await screen.findByTestId(
      'course-assistant-workspace'
    );
    fireEvent.click(
      within(assistantWorkspace).getByRole('button', {
        name: 'Chat con Fuentes (RAG)',
      })
    );

    const instructionsInput = await within(assistantWorkspace).findByLabelText(
      /Instrucciones personalizadas/i
    );
    const promptInput = within(assistantWorkspace).getByLabelText(
      /Tu consulta sobre Ingeniería de Software I/i
    );

    fireEvent.change(instructionsInput, {
      target: { value: 'Respondé con bullets concretos para repasar' },
    });
    fireEvent.change(promptInput, {
      target: { value: '¿Qué define la ingeniería de requerimientos?' },
    });
    fireEvent.click(
      within(assistantWorkspace).getByRole('button', { name: 'Enviar' })
    );

    expect(
      await within(assistantWorkspace).findByText(
        '¿Qué define la ingeniería de requerimientos?'
      )
    ).toBeInTheDocument();

    const citationButtons = await within(assistantWorkspace).findAllByRole(
      'button',
      { name: /^\[1\]/i }
    );
    fireEvent.click(citationButtons[0]);

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog).not.toHaveAttribute('role');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog.querySelector('.citation-dialog-excerpt')?.textContent?.trim().length).toBeGreaterThan(15);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Save chat reply as a note and navigate back to Notas
    fireEvent.click(
      within(assistantWorkspace).getByRole('button', {
        name: 'Guardar como Nota',
      })
    );

    expect(
      await within(assistantWorkspace).findByText('Nota guardada')
    ).toBeInTheDocument();

    fireEvent.click(
      within(assistantWorkspace).getByRole('button', { name: 'Abrir en Notas' })
    );

    await waitFor(() => {
      expect(
        within(tablist).getByRole('tab', { name: 'Notas' })
      ).toHaveAttribute('aria-selected', 'true');
    });
  });
});
