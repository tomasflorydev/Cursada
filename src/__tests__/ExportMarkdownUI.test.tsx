import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportMarkdownButton } from '../components/export/ExportMarkdownButton';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockExportMarkdown } from '../lib/api/mockExport';
import { SettingsPage } from '../pages/SettingsPage';

describe('Phase 4 Task 4.2 UI: ExportMarkdownButton, SettingsPage, and mockExport', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Exportar a Markdown section in SettingsPage and handles filesystem export confirmation', async () => {
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
      screen.getByRole('heading', { level: 2, name: 'Exportar a Markdown' })
    ).toBeInTheDocument();

    const exportButton = screen.getByRole('button', {
      name: 'Exportar toda la cursada (.md)',
    });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({
        scope: 'all',
        courseId: undefined,
        noteId: undefined,
      });
    });

    expect(
      await screen.findByText(/Exportación completada \(8 archivos\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText('/Users/toms/Desktop/cursada-export')
    ).toBeInTheDocument();
  });

  it('handles canceled: true gracefully in SettingsPage without showing errors', async () => {
    vi.spyOn(cursadaClient, 'exportMarkdown').mockResolvedValueOnce({
      canceled: true,
      targetDir: null,
      filesCreated: [],
      fileCount: 0,
      mode: 'filesystem',
    });

    render(<SettingsPage themeMode="light" onChangeThemeMode={() => {}} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Exportar toda la cursada (.md)' })
    );

    expect(await screen.findByText('Exportación cancelada.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('supports ExportMarkdownButton for course scope in download mode and surfaces errors', async () => {
    const exportSpy = vi
      .spyOn(cursadaClient, 'exportMarkdown')
      .mockResolvedValueOnce({
        canceled: false,
        targetDir: 'Descargas del navegador',
        filesCreated: ['ingenieria-de-software-i-completo.md'],
        fileCount: 1,
        mode: 'download',
      })
      .mockRejectedValueOnce(new Error('Permiso denegado en carpeta'));

    render(<ExportMarkdownButton scope="course" courseId="ing-soft-1" />);

    const btn = screen.getByRole('button', { name: 'Exportar materia (.md)' });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({
        scope: 'course',
        courseId: 'ing-soft-1',
        noteId: undefined,
      });
    });

    expect(
      await screen.findByText(/Descarga iniciada \(1 archivo\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText('ingenieria-de-software-i-completo.md')
    ).toBeInTheDocument();

    // Second click triggers rejected promise -> error alert
    fireEvent.click(btn);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Permiso denegado en carpeta'
    );
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
