import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAllMocks } from '../lib/api/mockClient';
import { App } from '../App';
import { CoursesPage } from '../pages/CoursesPage';

describe('Phase 4 Integration: NotesPage in App and CourseDetailView Notas + Export', () => {
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

  it('does not display global Notes in SwissHeader and notes are scoped to courses', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).queryByRole('button', { name: 'Notas' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Materias' })).toBeInTheDocument();
  });

  it('mounts contextual inline notes workspace and Markdown export buttons inside CourseDetailView', async () => {
    const onSelectCourse = vi.fn();
    render(
      <CoursesPage selectedCourseId="ing-soft-1" onSelectCourse={onSelectCourse} />
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ingeniería de Software I' })
    ).toBeInTheDocument();

    // Left panel displays scoped notes for ing-soft-1 and export actions
    const notesPane = screen.getByLabelText('Notas de la materia');
    expect(
      within(notesPane).getByRole('heading', { name: 'Notas · 1' })
    ).toBeInTheDocument();
    expect(
      within(notesPane).getByText(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      )
    ).toBeInTheDocument();
    expect(
      within(notesPane).queryByText(/Comparativa práctica: Strategy vs\. State/i)
    ).not.toBeInTheDocument();

    // Center editor shows selected note inline
    await waitFor(() => {
      expect(screen.getByLabelText('Título de la nota')).toHaveValue(
        'Resumen de Métricas Ágiles, Velocidad y Deuda Técnica'
      );
    });
    expect(screen.getByLabelText('Contenido de la nota')).toBeInTheDocument();

    // Course Markdown export action inside CourseDetailView
    fireEvent.click(
      within(notesPane).getByRole('button', { name: 'Exportar materia .md' })
    );
    expect(
      await screen.findByText(/Materia exportada en Markdown\./i)
    ).toBeInTheDocument();

    // Single-note Markdown export action
    fireEvent.click(within(notesPane).getByRole('button', { name: 'Exportar .md' }));
    expect(
      await screen.findByText(/Nota exportada en Markdown\./i)
    ).toBeInTheDocument();
  });
});
