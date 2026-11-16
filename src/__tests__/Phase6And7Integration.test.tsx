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

  it('navigates into CourseDetailView 3-pane notebook, runs RAG Chat with citations, generates AI report into Informes, and saves as note', async () => {
    render(<App />);

    // 1. Navigate to "Materias" and open "Ingeniería de Software I"
    const primaryNav = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });
    fireEvent.click(within(primaryNav).getByRole('button', { name: 'Materias' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ingeniería de Software I' })
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    const aiPane = screen.getByRole('complementary', {
      name: 'Asistente e informes con IA',
    });
    const notesPane = screen.getByRole('complementary', {
      name: 'Notas de la materia',
    });

    // 2. Wait for ready sources to load in the 3rd pane
    const mdSourceCheckbox = await within(aiPane).findByRole('checkbox', {
      name: 'Incluir Resumen Patrones y Calidad.md',
    });
    expect(mdSourceCheckbox).toHaveAttribute('aria-checked', 'true');

    // 3. Ask RAG Chat a question and inspect citation [1]
    const askInput = within(aiPane).getByLabelText('Preguntale a tus fuentes');
    fireEvent.change(askInput, {
      target: { value: '¿Qué define la ingeniería de requerimientos?' },
    });
    fireEvent.click(
      within(aiPane).getByRole('button', { name: 'Enviar consulta' })
    );

    const questionEl = await within(aiPane).findByText(
      '¿Qué define la ingeniería de requerimientos?'
    );
    const chatReplyContainer = questionEl.parentElement as HTMLElement;
    const chatCitations = within(chatReplyContainer).getAllByRole('button', {
      name: 'Fuente [1]',
    });
    fireEvent.click(chatCitations[0]);

    expect(
      await within(notesPane).findByText(/Fuente \[1\]:/i)
    ).toBeInTheDocument();

    // 4. Generate an AI study report from selected sources + notes
    const generateGuideBtn = within(aiPane).getByRole('button', {
      name: 'Guía de estudio',
    });
    fireEvent.click(generateGuideBtn);

    expect(
      await within(aiPane).findByRole('heading', {
        level: 3,
        name: 'Guía de estudio — Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    // Open the generated report in Informes
    fireEvent.click(
      within(aiPane).getByRole('button', { name: 'Abrir informe →' })
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Informes' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Guía de estudio — Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    const citationsAside = screen.getByRole('complementary', {
      name: 'Fuentes citadas',
    });
    expect(
      within(citationsAside).getByText(
        /Resumen de Métricas Ágiles, Velocidad y Deuda Técnica/i
      )
    ).toBeInTheDocument();

    // 5. Save report as a note and jump back to the course editor with that note open
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar como nota' })
    );
    expect(
      await screen.findByText('Informe guardado como nota.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir nota →' }));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Ingeniería de Software I',
      })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nota')).toHaveValue(
        'Guía de estudio — Ingeniería de Software I'
      );
    });
  });
});
