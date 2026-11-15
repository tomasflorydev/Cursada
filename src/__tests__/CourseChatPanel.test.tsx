import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseChatPanel } from '../components/assistant/CourseChatPanel';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockListNotes } from '../lib/api/mockNotes';

beforeAll(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
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

describe('CourseChatPanel', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it('sends message with customInstructions, renders assistant reply, model pill, and citation chip', async () => {
    const { container } = render(
      <CourseChatPanel
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
      />
    );

    expect(
      await screen.findByText(/Consultá tus apuntes, PDFs y notas de Ingeniería de Software I/i)
    ).toBeInTheDocument();

    const instructionsInput = screen.getByLabelText(/Instrucciones personalizadas/i);
    const promptInput = screen.getByLabelText(/Tu consulta sobre Ingeniería de Software I/i);

    fireEvent.change(instructionsInput, {
      target: { value: 'Usá puntos concisos para estudiar' },
    });
    fireEvent.change(promptInput, {
      target: { value: '¿Qué cubre el programa sobre ciclo de vida y requisitos?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('¿Qué cubre el programa sobre ciclo de vida y requisitos?')
    ).toBeInTheDocument();

    await waitFor(() => {
      const messagesRegion = container.querySelector('.assistant-messages');
      expect(messagesRegion).not.toBeNull();
      expect(
        within(messagesRegion as HTMLElement).getByText(/Usá puntos concisos para estudiar/i)
      ).toBeInTheDocument();
    });
    expect(await screen.findByText(/llama3\.2/i)).toBeInTheDocument();

    const citationButtons = await screen.findAllByRole('button', { name: /^\[1\]/i });
    expect(citationButtons.length).toBeGreaterThan(0);
  });

  it('opens native dialog with full citation excerpt and closes cleanly resetting returnValue', async () => {
    render(
      <CourseChatPanel
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
      />
    );

    const quickPrompt = await screen.findByRole('button', {
      name: /Resumime los temas principales de las fuentes/i,
    });
    fireEvent.click(quickPrompt);

    const citationChip = await screen.findByRole('button', { name: /^\[1\]/i });
    fireEvent.click(citationChip);

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog).not.toHaveAttribute('role');
    expect(dialog).not.toHaveAttribute('aria-modal');

    const dialogScope = within(dialog);
    expect(dialogScope.getByRole('heading')).toHaveTextContent(/^\[1\]/);
    expect(dialogScope.getByText(/Relevancia:/i)).toBeInTheDocument();

    const excerptEl = dialog.querySelector('.citation-dialog-excerpt');
    expect(excerptEl?.textContent?.trim().length).toBeGreaterThan(20);

    fireEvent.click(dialogScope.getByRole('button', { name: 'Cerrar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(dialog.open).toBe(false);
    expect(dialog.returnValue).toBe('');
  });

  it('saves assistant response as a note with citations and opens Notes tab on demand', async () => {
    const onNoteCreated = vi.fn();
    const onOpenNotesTab = vi.fn();

    render(
      <CourseChatPanel
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
        onNoteCreated={onNoteCreated}
        onOpenNotesTab={onOpenNotesTab}
      />
    );

    const promptInput = await screen.findByLabelText(/Tu consulta sobre Ingeniería de Software I/i);
    fireEvent.change(promptInput, {
      target: { value: 'Explicame modelos iterativos y requisitos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    const saveButton = await screen.findByRole('button', { name: 'Guardar como Nota' });
    fireEvent.click(saveButton);

    const openNotesButton = await screen.findByRole('button', { name: 'Abrir en Notas' });
    expect(screen.getByText('Nota guardada')).toBeInTheDocument();
    expect(onNoteCreated).toHaveBeenCalledTimes(1);

    const createdNoteId = onNoteCreated.mock.calls[0][0] as string;
    const courseNotes = await mockListNotes({ courseId: 'ing-soft-1' });
    const createdNote = courseNotes.find((note) => note.id === createdNoteId);
    expect(createdNote).toBeDefined();
    expect(createdNote!.origin).toBe('ai_summary');
    expect(createdNote!.content).toContain('## Fuentes citadas');

    fireEvent.click(openNotesButton);
    expect(onOpenNotesTab).toHaveBeenCalledTimes(1);
  });

  it('guards against IME Enter submit and supports creating and deleting threads', async () => {
    render(
      <CourseChatPanel
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
      />
    );

    const promptInput = await screen.findByLabelText(/Tu consulta sobre Ingeniería de Software I/i);
    fireEvent.change(promptInput, {
      target: { value: 'Consulta en composición IME' },
    });

    // IME Enter must NOT submit
    fireEvent.keyDown(promptInput, {
      key: 'Enter',
      isComposing: true,
      keyCode: 229,
    });

    expect(screen.queryByRole('button', { name: 'Guardar como Nota' })).not.toBeInTheDocument();
    expect((promptInput as HTMLTextAreaElement).value).toBe('Consulta en composición IME');

    // Real Enter submits the message
    fireEvent.keyDown(promptInput, {
      key: 'Enter',
      shiftKey: false,
      isComposing: false,
      keyCode: 13,
    });

    expect(await screen.findByRole('button', { name: 'Guardar como Nota' })).toBeInTheDocument();

    // Create a second thread and verify empty state returns
    fireEvent.click(screen.getByRole('button', { name: '+ Nueva consulta' }));
    expect(
      await screen.findByText(/Consultá tus apuntes, PDFs y notas de Ingeniería de Software I/i)
    ).toBeInTheDocument();

    // Delete current thread cleanly
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar conversación' }));
    expect(await screen.findByRole('button', { name: 'Guardar como Nota' })).toBeInTheDocument();
  });
});
