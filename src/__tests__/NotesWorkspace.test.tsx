import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';

describe('CourseDetailView Notes Workspace (migrated Swiss UI)', () => {
  beforeEach(() => {
    resetAllMocks();
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        writable: true,
        value: vi.fn(() => 'blob:mock'),
      });
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        writable: true,
        value: vi.fn(),
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scopes notes by course, creates and auto-saves edits, toggles pin, collapses sidebar, exports, and deletes', async () => {
    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const notesPane = await screen.findByLabelText('Notas de la materia');
    expect(
      await within(notesPane).findByText(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      )
    ).toBeInTheDocument();
    expect(
      within(notesPane).queryByText(
        'Guía de estudio: Niveles de aislamiento y fenómenos de lectura'
      )
    ).not.toBeInTheDocument();

    // Create a new note inside ing-soft-1
    fireEvent.click(within(notesPane).getByRole('button', { name: '+ Nueva' }));

    const titleInput = (await screen.findByLabelText(
      'Título de la nota'
    )) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(titleInput.value).toBe('Nueva nota');
    });

    fireEvent.change(titleInput, {
      target: { value: 'Planificación de Pruebas Unitarias' },
    });

    const contentInput = await screen.findByLabelText('Contenido de la nota');
    const markdownBody = [
      '# Estrategia de Testing',
      '',
      '- [x] Configurar Vitest en memoria',
      '- [ ] Cubrir casos borde',
    ].join('\n');
    fireEvent.change(contentInput, { target: { value: markdownBody } });

    await waitFor(
      async () => {
        const persisted = await cursadaClient.listNotes({
          courseId: 'ing-soft-1',
          query: 'estrategia',
        });
        expect(persisted).toHaveLength(1);
        expect(persisted[0].title).toBe('Planificación de Pruebas Unitarias');
        expect(persisted[0].content).toContain('- [x] Configurar Vitest');
      },
      { timeout: 2500 }
    );

    // Toggle pin state on the created note
    const togglePinBtn = within(notesPane).getByRole('button', {
      name: /^(Fijar|Desfijar)$/,
    });
    const initialPinLabel = togglePinBtn.textContent;
    fireEvent.click(togglePinBtn);
    await waitFor(() => {
      const nextBtn = within(notesPane).getByRole('button', {
        name: /^(Fijar|Desfijar)$/,
      });
      expect(nextBtn.textContent).not.toBe(initialPinLabel);
    });

    // Export active note to Markdown
    const exportSpy = vi.spyOn(cursadaClient, 'exportMarkdown');
    fireEvent.click(
      within(notesPane).getByRole('button', { name: 'Exportar .md' })
    );
    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'note' })
      );
    });

    // Collapse & restore left sidebar
    fireEvent.click(
      within(notesPane).getByRole('button', { name: 'Colapsar panel izquierdo' })
    );
    expect(screen.queryByLabelText('Notas de la materia')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Mostrar panel de notas' })
    );
    const restoredPane = await screen.findByLabelText('Notas de la materia');

    // Two-step inline note deletion
    fireEvent.click(
      within(restoredPane).getByRole('button', { name: 'Eliminar nota' })
    );
    fireEvent.click(
      within(restoredPane).getByRole('button', { name: 'Confirmar' })
    );

    await waitFor(() => {
      expect(
        within(restoredPane).queryByText('Planificación de Pruebas Unitarias')
      ).not.toBeInTheDocument();
    });
  });
});
