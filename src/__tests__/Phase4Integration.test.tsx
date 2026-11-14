import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('does not display global Notes in Sidebar and notes are scoped to courses', async () => {
    render(<App />);

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).queryByRole('button', { name: 'Notas' })).not.toBeInTheDocument();
  });

  it('mounts contextual NotesWorkspace and course export button inside CourseDetailView', async () => {
    const onSelectCourse = vi.fn();
    render(
      <CoursesPage selectedCourseId="ing-soft-1" onSelectCourse={onSelectCourse} />
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ingeniería de Software I' })
    ).toBeInTheDocument();

    // Default Resumen tab has Exportar materia (.md)
    const exportBtn = screen.getByTestId('export-course-markdown-btn');
    fireEvent.click(exportBtn);
    expect(await screen.findByText(/Descarga iniciada/i)).toBeInTheDocument();

    // Switch to Notas tab and confirm contextual workspace mounts
    const tablist = screen.getByRole('tablist');
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Notas' }));

    const notesPanel = screen.getByTestId('course-notes-tab-panel');
    expect(notesPanel).toBeInTheDocument();
    expect(
      await within(notesPanel).findByPlaceholderText(/Buscar en apuntes/i)
    ).toBeInTheDocument();
  });
});
