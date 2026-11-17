import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockExportMarkdown } from '../lib/api/mockExport';
import { SettingsPage } from '../pages/SettingsPage';

describe('Phase 4 Task 4.2 UI: SettingsPage, CourseDetailView Markdown Export, and mockExport', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Portabilidad en Markdown in SettingsPage Datos section and handles export confirmation', async () => {
    const exportSpy = vi
      .spyOn(cursadaClient, 'exportMarkdown')
      .mockResolvedValueOnce({
        canceled: false,
        targetDir: '/Users/toms/Desktop/cursada-export',
        filesCreated: ['/Users/toms/Desktop/cursada-export/README.md'],
        fileCount: 8,
        mode: 'filesystem',
      });

    render(<SettingsPage themeMode="system" onChangeThemeMode={() => {}} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Datos' })
    ).toBeInTheDocument();
    expect(screen.getByText('Portabilidad en Markdown')).toBeInTheDocument();

    const exportButton = screen.getByTestId('settings-export-all-button');
    expect(exportButton).toHaveTextContent('Exportar Markdown');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({
        scope: 'all',
      });
    });

    expect(
      await screen.findByText(/Exportación Markdown completada \(8 archivos\)\./i)
    ).toBeInTheDocument();
  });

  it('handles canceled: true gracefully in SettingsPage without showing errors', async () => {
    const exportSpy = vi
      .spyOn(cursadaClient, 'exportMarkdown')
      .mockResolvedValueOnce({
        canceled: true,
        targetDir: null,
        filesCreated: [],
        fileCount: 0,
        mode: 'filesystem',
      });

    render(<SettingsPage themeMode="light" onChangeThemeMode={() => {}} />);

    const exportButton = screen.getByTestId('settings-export-all-button');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({ scope: 'all' });
    });
    await waitFor(() => {
      expect(exportButton).toBeEnabled();
    });
    expect(
      screen.queryByText(/Exportación Markdown completada/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('supports Exportar materia .md and Exportar .md inside CourseDetailView', async () => {
    const exportSpy = vi
      .spyOn(cursadaClient, 'exportMarkdown')
      .mockResolvedValue({
        canceled: false,
        targetDir: 'Descargas del navegador',
        filesCreated: ['ingenieria-de-software-i-completo.md'],
        fileCount: 1,
        mode: 'download',
      });

    render(
      <CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />
    );

    const exportCourseBtn = await screen.findByRole('button', {
      name: 'Exportar materia .md',
    });
    fireEvent.click(exportCourseBtn);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({
        scope: 'course',
        courseId: 'ing-soft-1',
      });
    });
    expect(
      await screen.findByText(/Materia exportada en Markdown\./i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar .md' }));
    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'note',
          noteId: 'note-1',
        })
      );
    });
    expect(
      await screen.findByText(/Nota exportada en Markdown\./i)
    ).toBeInTheDocument();
  });

  it('mockExportMarkdown generates real Markdown downloads for course and all scopes', async () => {
    const courseResult = await mockExportMarkdown({
      scope: 'course',
      courseId: 'ing-soft-1',
    });
    expect(courseResult).toEqual({
      canceled: false,
      targetDir: 'Descargas del navegador',
      filesCreated: ['ingenieria-de-software-i-completo.md'],
      fileCount: 1,
      mode: 'download',
    });

    const allResult = await mockExportMarkdown({ scope: 'all' });
    expect(allResult).toEqual({
      canceled: false,
      targetDir: 'Descargas del navegador',
      filesCreated: ['cursada-export-completo.md'],
      fileCount: 1,
      mode: 'download',
    });
  });
});
