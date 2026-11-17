import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseDetailView } from '../components/courses/CourseDetailView';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockGenerateStudyReport } from '../lib/api/mockReports';
import { ReportsPage } from '../pages/ReportsPage';

describe('CourseDetailView & ReportsPage Study Reports (migrated Swiss UI)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('filters context by stage/mode, generates a report with progress + open action, and shows full report in ReportsPage', async () => {
    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });

    const generateSpy = vi
      .spyOn(cursadaClient, 'generateStudyReport')
      .mockImplementation(async (input) => {
        await gate;
        return mockGenerateStudyReport(input);
      });

    const onOpenReport = vi.fn();
    render(
      <CourseDetailView
        courseId="ing-soft-1"
        onSelectCourse={vi.fn()}
        onOpenReport={onOpenReport}
      />
    );

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );
    const filterGroup = within(assistantPane).getByRole('group', {
      name: 'Filtrar contexto de IA por instancia',
    });

    fireEvent.click(
      within(filterGroup).getByRole('button', { name: 'Solo Fuentes' })
    );
    expect(
      within(filterGroup).getByRole('button', { name: 'Solo Fuentes' })
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(filterGroup).getByRole('button', { name: 'Todo' }));

    fireEvent.click(
      within(assistantPane).getByRole('button', { name: 'Guía de estudio' })
    );

    expect(
      await within(assistantPane).findByRole('button', {
        name: 'Cancelar generación de informe',
      })
    ).toBeInTheDocument();

    resolveGate();

    await waitFor(() => {
      expect(generateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'ing-soft-1',
          reportType: 'study_guide',
        })
      );
    });

    const openReportBtn = await within(assistantPane).findByRole('button', {
      name: 'Abrir informe →',
    });
    fireEvent.click(openReportBtn);
    expect(onOpenReport).toHaveBeenCalledTimes(1);
    const createdReportId = onOpenReport.mock.calls[0][0] as string;

    // ReportsPage displays and manages the persisted report
    cleanup();
    render(<ReportsPage initialReportId={createdReportId} />);

    expect(
      await screen.findByRole('heading', { name: /Guía de estudio/i })
    ).toBeInTheDocument();
  });

  it('cancels an in-flight report generation cleanly when clicking Cancelar', async () => {
    let rejectGate!: (err: Error) => void;
    vi.spyOn(cursadaClient, 'generateStudyReport').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectGate = reject;
        })
    );
    const cancelSpy = vi
      .spyOn(cursadaClient, 'cancelStudyReport')
      .mockImplementation(async () => {
        rejectGate(new Error('Generación cancelada por el usuario.'));
      });

    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );
    fireEvent.click(
      within(assistantPane).getByRole('button', { name: 'Resumen de parcial' })
    );

    const cancelBtn = await within(assistantPane).findByRole('button', {
      name: 'Cancelar generación de informe',
    });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(
        within(assistantPane).queryByRole('button', {
          name: 'Cancelar generación de informe',
        })
      ).not.toBeInTheDocument();
    });
    expect(within(assistantPane).getByRole('alert')).toHaveTextContent(
      /cancelada/i
    );
  });
});
