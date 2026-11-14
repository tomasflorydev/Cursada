import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesWorkspace } from '../components/notes/NotesWorkspace';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { NotesPage } from '../pages/NotesPage';

describe('Phase 4 Task 4.1 Frontend: NotesPage, NotesWorkspace, and NoteEditor', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders global NotesPage with header, course filter, and navigates to course on click', async () => {
    const onSelectCourse = vi.fn();
    render(<NotesPage onSelectCourse={onSelectCourse} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Notas' })
    ).toBeInTheDocument();
    expect(screen.getByText('Apuntes y documentación')).toBeInTheDocument();

    const sidebar = screen.getByLabelText('Listado de notas');
    expect(
      await within(sidebar).findByText(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      )
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByText(
        'Programación Funcional en Haskell: Orden Superior y Composición'
      )
    ).toBeInTheDocument();

    // Filter by course dropdown
    const courseFilter = within(sidebar).getByLabelText('Filtrar por materia');
    fireEvent.change(courseFilter, { target: { value: 'bd-2' } });

    await waitFor(() => {
      expect(
        within(sidebar).getByText(
          'Guía de estudio: Niveles de aislamiento y fenómenos de lectura'
        )
      ).toBeInTheDocument();
      expect(
        within(sidebar).queryByText(
          'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
        )
      ).not.toBeInTheDocument();
    });

    // Click "Ir a materia" on the selected BD2 note
    fireEvent.click(screen.getByRole('button', { name: 'Ir a materia' }));
    expect(onSelectCourse).toHaveBeenCalledWith('bd-2');
  });

  it('supports accent-insensitive search and Solo fijadas toggle', async () => {
    render(<NotesPage onSelectCourse={vi.fn()} />);

    const sidebar = screen.getByLabelText('Listado de notas');
    await within(sidebar).findByText(
      'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
    );

    const searchInput = within(sidebar).getByPlaceholderText(
      'Buscar en apuntes (sin tildes)...'
    );

    // Search without accents for "Programación"
    fireEvent.change(searchInput, { target: { value: 'programacion' } });

    await waitFor(() => {
      expect(
        within(sidebar).getByText(
          'Programación Funcional en Haskell: Orden Superior y Composición'
        )
      ).toBeInTheDocument();
      expect(
        within(sidebar).queryByText(
          'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
        )
      ).not.toBeInTheDocument();
    });

    // Clear search and test Solo fijadas toggle
    fireEvent.change(searchInput, { target: { value: '' } });
    await within(sidebar).findByText(
      'Variables Aleatorias, Esperanza y Teorema de Bayes'
    );

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Solo fijadas' }));
    await waitFor(() => {
      expect(
        within(sidebar).getByText(
          'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
        )
      ).toBeInTheDocument();
      expect(
        within(sidebar).queryByText(
          'Variables Aleatorias, Esperanza y Teorema de Bayes'
        )
      ).not.toBeInTheDocument();
    });
  });

  it('creates a note in contextual course mode, switches view modes with GFM preview, auto-saves edits, and pins/deletes', async () => {
    render(<NotesWorkspace courseId="ing-soft-1" />);

    const workspace = screen.getByTestId('notes-workspace-ing-soft-1');
    const sidebar = within(workspace).getByLabelText('Listado de notas');

    // Only ing-soft-1 notes appear in contextual mode, and no course dropdown is shown
    expect(
      await within(sidebar).findByText(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      )
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByText(
        'Guía de estudio: Niveles de aislamiento y fenómenos de lectura'
      )
    ).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByLabelText('Filtrar por materia')
    ).not.toBeInTheDocument();

    // Create a new note scoped to ing-soft-1
    fireEvent.click(within(sidebar).getByRole('button', { name: '+ Nueva nota' }));

    const titleInput = (await within(workspace).findByLabelText(
      'Título de la nota'
    )) as HTMLInputElement;
    expect(titleInput.value).toBe('Nuevo apunte');

    // Edit title and GFM Markdown content
    fireEvent.change(titleInput, {
      target: { value: 'Planificación de Pruebas Unitarias' },
    });

    const markdownTextarea = within(workspace).getByLabelText(
      'Contenido en Markdown'
    );
    const gfmContent = [
      '# Estrategia de Testing',
      '',
      '- [x] Configurar Vitest en memoria',
      '- [ ] Cubrir casos borde',
      '',
      '| Módulo | Cobertura |',
      '| :--- | :--- |',
      '| notesRepo | 100% |',
    ].join('\n');

    fireEvent.change(markdownTextarea, { target: { value: gfmContent } });

    // Wait for auto-save debounce (450ms) to complete
    await waitFor(
      () => {
        expect(screen.getByTestId('note-save-status')).toHaveTextContent(
          'Guardado'
        );
      },
      { timeout: 2500 }
    );

    // Verify saved in backend/mockClient
    const persisted = await cursadaClient.listNotes({
      courseId: 'ing-soft-1',
      query: 'estrategia',
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].title).toBe('Planificación de Pruebas Unitarias');
    expect(persisted[0].content).toContain('| notesRepo | 100% |');

    // Mode: Editar (default) shows editor only, no preview
    expect(
      within(workspace).getByLabelText('Contenido en Markdown')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('note-markdown-preview')
    ).not.toBeInTheDocument();

    // Switch to Lectura mode: hides editor, shows GFM preview
    fireEvent.click(screen.getByRole('button', { name: 'Lectura' }));
    expect(
      within(workspace).queryByLabelText('Contenido en Markdown')
    ).not.toBeInTheDocument();
    const preview = screen.getByTestId('note-markdown-preview');
    expect(
      within(preview).getByRole('heading', {
        level: 1,
        name: 'Estrategia de Testing',
      })
    ).toBeInTheDocument();
    expect(within(preview).getByRole('table')).toBeInTheDocument();
    expect(
      within(preview).getAllByRole('checkbox').length
    ).toBeGreaterThanOrEqual(2);

    // Switch to Editar mode: shows editor, hides preview
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(
      within(workspace).getByLabelText('Contenido en Markdown')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('note-markdown-preview')
    ).not.toBeInTheDocument();

    // Toggle note list visibility
    expect(workspace).toHaveClass('is-list-hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar lista de notas' }));
    expect(workspace).not.toHaveClass('is-list-hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar lista de notas' }));
    expect(workspace).toHaveClass('is-list-hidden');

    // Toggle pin on the created note
    fireEvent.click(screen.getByRole('button', { name: 'Fijar nota' }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Desfijar nota' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    // Delete the note
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar nota' }));
    await waitFor(() => {
      expect(
        within(sidebar).queryByText('Planificación de Pruebas Unitarias')
      ).not.toBeInTheDocument();
    });
  });

  it('calls exportMarkdown for the active note when clicking Exportar .md', async () => {
    const exportSpy = vi
      .spyOn(cursadaClient, 'exportMarkdown')
      .mockResolvedValue({
        canceled: false,
        targetDir: '/tmp/cursada-export',
        filesCreated: ['/tmp/cursada-export/nota.md'],
        fileCount: 1,
        mode: 'filesystem',
      });

    render(<NotesWorkspace courseId="ing-soft-1" />);

    await screen.findByLabelText('Título de la nota');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar .md' }));

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({
        scope: 'note',
        noteId: 'note-1',
      });
    });

    expect(
      await screen.findByText(/Exportada en \/tmp\/cursada-export/i)
    ).toBeInTheDocument();
  });

  it('mounts real CodeMirror 6 when browser Range layout APIs are present', async () => {
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
      render(<NotesWorkspace courseId="ing-soft-1" />);
      const cmHost = await screen.findByTestId('note-codemirror-host');
      await waitFor(() => {
        expect(cmHost.querySelector('.cm-editor')).not.toBeNull();
        expect(
          cmHost.querySelector('.cm-content[aria-label="Contenido en Markdown"]')
        ).not.toBeNull();
      });
    } finally {
      Range.prototype.getClientRects = originalGetClientRects;
      Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });
});
