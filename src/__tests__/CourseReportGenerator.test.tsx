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
import { resetStoredReports } from '../lib/reportsStore';
import { ReportsPage } from '../pages/ReportsPage';

describe('CourseDetailView & ReportsPage Study Reports (migrated Swiss UI)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllMocks();
    resetStoredReports();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetStoredReports();
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

  it('groups AI context chips into Alcance and Origen and verifies empty, generating, result (copy/export/regenerate) and error (retry) states', async () => {
    const clipboardWriteSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteSpy },
    });
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        writable: true,
        value: vi.fn(() => 'blob:report-md'),
      });
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        writable: true,
        value: vi.fn(),
      });
    }
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL');

    let rejectFirstAttempt!: (err: Error) => void;
    vi.spyOn(cursadaClient, 'listStudyReports').mockResolvedValueOnce([]);
    const generateSpy = vi
      .spyOn(cursadaClient, 'generateStudyReport')
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstAttempt = reject;
          })
      )
      .mockImplementation(async (input) => mockGenerateStudyReport(input));

    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );

    // 1. Two labeled chip groups: Alcance and Origen
    const filterGroup = within(assistantPane).getByRole('group', {
      name: 'Filtrar contexto de IA por instancia',
    });
    expect(within(filterGroup).getByText('Alcance')).toBeInTheDocument();
    expect(within(filterGroup).getByText('Origen')).toBeInTheDocument();
    expect(
      within(filterGroup).getByRole('button', { name: '1° Parcial' })
    ).toBeInTheDocument();
    expect(
      within(filterGroup).getByRole('button', { name: '2° Parcial' })
    ).toBeInTheDocument();
    expect(
      within(filterGroup).getByRole('button', { name: 'Final' })
    ).toBeInTheDocument();

    // 2. Empty state initially
    expect(
      within(assistantPane).getByTestId('assistant-report-empty')
    ).toHaveTextContent(/Sin informe generado todavía/i);

    // 3. Generating state + failure -> Error state with Reintentar
    fireEvent.click(
      within(assistantPane).getByRole('button', { name: 'Guía de estudio' })
    );
    expect(
      await within(assistantPane).findByTestId('assistant-report-generating')
    ).toBeInTheDocument();

    rejectFirstAttempt(new Error('No se pudo conectar con Ollama local.'));

    const errorState = await within(assistantPane).findByTestId(
      'assistant-report-error'
    );
    expect(within(errorState).getByRole('alert')).toHaveTextContent(
      /No se pudo conectar con Ollama local\./i
    );

    // 4. Retry button retries the same reportType ('study_guide') and transitions to Result state
    fireEvent.click(
      within(errorState).getByRole('button', {
        name: 'Reintentar generación de informe',
      })
    );

    const resultState = await within(assistantPane).findByTestId(
      'assistant-report-result'
    );
    expect(generateSpy).toHaveBeenCalledTimes(2);
    expect(generateSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        courseId: 'ing-soft-1',
        reportType: 'study_guide',
      })
    );

    // Copy action
    fireEvent.click(
      within(resultState).getByRole('button', { name: 'Copiar informe' })
    );
    await waitFor(() => {
      expect(clipboardWriteSpy).toHaveBeenCalledTimes(1);
    });
    expect(
      await within(resultState).findByText(/Copiado al portapapeles\./i)
    ).toBeInTheDocument();

    // Export action
    fireEvent.click(
      within(resultState).getByRole('button', { name: 'Exportar informe' })
    );
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(
      await within(resultState).findByText(/Exportado en Markdown\./i)
    ).toBeInTheDocument();

    // Regenerate action
    fireEvent.click(
      within(resultState).getByRole('button', { name: 'Regenerar informe' })
    );
    await waitFor(() => {
      expect(generateSpy).toHaveBeenCalledTimes(3);
    });
  });
});
