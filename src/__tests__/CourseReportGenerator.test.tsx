import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseReportGenerator } from '../components/assistant/CourseReportGenerator';
import { cursadaClient } from '../lib/api/client';
import { resetAllMocks } from '../lib/api/mockClient';
import { mockGenerateStudyReport } from '../lib/api/mockReports';
import type { Source } from '../types/domain';

describe('CourseReportGenerator (Phase 7 Map-Reduce UI)', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders ready source checkboxes, type fieldset, and conditionally shows/hides exam format radios only for Examen de práctica', async () => {
    render(
      <CourseReportGenerator
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
      />
    );

    const sourceCb1 = await screen.findByRole('checkbox', {
      name: 'Resumen Patrones y Calidad.md',
    });
    const sourceCb2 = screen.getByRole('checkbox', {
      name: 'Apuntes Unidad 2 — Ingeniería de Requerimientos',
    });

    expect(sourceCb1).toBeChecked();
    expect(sourceCb2).toBeChecked();
    expect(screen.getByText(/1 página · 1 fragmento/)).toBeInTheDocument();
    expect(screen.getByText(/3 páginas · 3 fragmentos/)).toBeInTheDocument();

    // Quick selection actions ("Ninguna" / "Todas")
    fireEvent.click(screen.getByRole('button', { name: 'Ninguna' }));
    expect(sourceCb1).not.toBeChecked();
    expect(sourceCb2).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Generar material' })
    ).toBeDisabled();
    expect(
      screen.getByText(/Seleccioná al menos una fuente para habilitar/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(sourceCb1).toBeChecked();
    expect(sourceCb2).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Generar material' })
    ).toBeEnabled();

    // Tipo de material fieldset
    const typeFieldset = screen.getByRole('group', {
      name: 'Tipo de material',
    });
    expect(
      within(typeFieldset).getByRole('radio', { name: 'Resumen' })
    ).toBeChecked();
    expect(
      within(typeFieldset).getByRole('radio', { name: 'Informe' })
    ).toBeInTheDocument();
    expect(
      within(typeFieldset).getByRole('radio', { name: 'Guía de estudio' })
    ).toBeInTheDocument();
    const examRadio = within(typeFieldset).getByRole('radio', {
      name: 'Examen de práctica',
    });
    expect(examRadio).toBeInTheDocument();

    // Exam format fieldset is hidden initially
    expect(
      screen.queryByRole('group', { name: 'Formato del examen' })
    ).not.toBeInTheDocument();

    // Selecting Examen de práctica reveals Formato del examen
    fireEvent.click(examRadio);
    const examFormatFieldset = screen.getByRole('group', {
      name: 'Formato del examen',
    });
    expect(
      within(examFormatFieldset).getByRole('radio', { name: 'Desarrollo' })
    ).toBeInTheDocument();
    expect(
      within(examFormatFieldset).getByRole('radio', { name: 'Multiple Choice' })
    ).toBeInTheDocument();
    expect(
      within(examFormatFieldset).getByRole('radio', { name: 'Mixto' })
    ).toBeInTheDocument();

    // Switching back to Informe hides Formato del examen again
    fireEvent.click(
      within(typeFieldset).getByRole('radio', { name: 'Informe' })
    );
    expect(
      screen.queryByRole('group', { name: 'Formato del examen' })
    ).not.toBeInTheDocument();
  });

  it('shows indeterminate progress while generating, renders Map-Reduce steps + markdown preview, exports .md, and triggers Abrir en Notas', async () => {
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

    const exportSpy = vi.spyOn(cursadaClient, 'exportMarkdown');

    const onNoteCreated = vi.fn();
    const onOpenNotesTab = vi.fn();

    render(
      <CourseReportGenerator
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
        onNoteCreated={onNoteCreated}
        onOpenNotesTab={onOpenNotesTab}
      />
    );

    await screen.findByRole('checkbox', {
      name: 'Resumen Patrones y Calidad.md',
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Informe' }));

    const promptInput = screen.getByLabelText(
      'Instrucciones / Prompt para la IA'
    );
    fireEvent.change(promptInput, {
      target: {
        value: 'Redactá un informe comparativo con ejemplos prácticos.',
      },
    });

    const titleInput = screen.getByLabelText('Título del material (opcional)');
    fireEvent.change(titleInput, {
      target: { value: 'Informe comparativo IS1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generar material' }));

    // Indeterminate progress indicator shown while pending
    const progress = await screen.findByRole('progressbar', {
      name: 'Generando material de estudio...',
    });
    expect(progress).not.toHaveAttribute('value');
    expect(
      screen.getByText('Procesando Map-Reduce bajo demanda...')
    ).toBeInTheDocument();

    resolveGate();

    const resultCard = await screen.findByTestId('report-result-card');
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: 'ing-soft-1',
        reportType: 'report',
        customInstructions:
          'Redactá un informe comparativo con ejemplos prácticos.',
        title: 'Informe comparativo IS1',
        autoSaveAsNote: true,
      })
    );

    // Map-Reduce step pills & model pill
    const stepsList = within(resultCard).getByTestId('report-steps-list');
    expect(within(stepsList).getByText(/Map 1\/3:/)).toBeInTheDocument();
    expect(within(stepsList).getByText(/Map 2\/3:/)).toBeInTheDocument();
    expect(within(stepsList).getByText(/Reduce 3\/3:/)).toBeInTheDocument();
    expect(
      within(resultCard).getByTestId('report-model-pill')
    ).toHaveTextContent(/^Modelo: /);

    // Rendered Markdown preview preserves prompt instructions and content
    const preview = within(resultCard).getByTestId('report-markdown-preview');
    expect(preview).toHaveTextContent(
      'Redactá un informe comparativo con ejemplos prácticos.'
    );
    expect(
      within(resultCard).getByRole('heading', {
        level: 3,
        name: 'Informe comparativo IS1',
      })
    ).toBeInTheDocument();
    expect(
      within(preview).getByRole('heading', {
        level: 1,
        name: 'Informe comparativo IS1',
      })
    ).toBeInTheDocument();

    expect(onNoteCreated).toHaveBeenCalledTimes(1);
    const createdNoteId = onNoteCreated.mock.calls[0][0] as string;
    expect(typeof createdNoteId).toBe('string');

    // Abrir en Notas callback
    fireEvent.click(
      within(resultCard).getByRole('button', { name: 'Abrir en Notas' })
    );
    expect(onOpenNotesTab).toHaveBeenCalledTimes(1);

    // Exportar .md invokes cursadaClient.exportMarkdown
    fireEvent.click(
      within(resultCard).getByRole('button', { name: 'Exportar .md' })
    );
    await waitFor(() => {
      expect(exportSpy).toHaveBeenCalledWith({
        scope: 'note',
        noteId: createdNoteId,
      });
    });
    expect(
      await within(resultCard).findByText(/Descarga iniciada/i)
    ).toBeInTheDocument();
  });

  it('supports manual saving to Notas when auto-save is unchecked and renders exam answer key', async () => {
    const onNoteCreated = vi.fn();

    render(
      <CourseReportGenerator
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
        onNoteCreated={onNoteCreated}
      />
    );

    await screen.findByRole('checkbox', {
      name: 'Resumen Patrones y Calidad.md',
    });

    const autoSaveCheckbox = screen.getByRole('checkbox', {
      name: 'Guardar automáticamente en Notas',
    });
    expect(autoSaveCheckbox).toBeChecked();
    fireEvent.click(autoSaveCheckbox);
    expect(autoSaveCheckbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Examen de práctica' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Multiple Choice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar material' }));

    const resultCard = await screen.findByTestId('report-result-card');
    expect(
      within(resultCard).getByTestId('report-markdown-preview')
    ).toHaveTextContent(/Clave de respuestas \/ corrección/i);

    expect(onNoteCreated).not.toHaveBeenCalled();

    const saveBtn = within(resultCard).getByRole('button', {
      name: 'Guardar en Notas',
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onNoteCreated).toHaveBeenCalledTimes(1);
    });
    expect(
      within(resultCard).getByRole('button', { name: 'Abrir en Notas' })
    ).toBeInTheDocument();
  });

  it('disables submit and shows clear Spanish guidance when 0 ready sources exist', async () => {
    const pendingOnlySources: Source[] = [
      {
        id: 'src-pending-only',
        courseId: 'bd-2',
        title: 'Archivo sin indexar.pdf',
        sourceType: 'pdf',
        originalPath: null,
        storedFilename: null,
        rawText: 'Contenido pendiente',
        charCount: 19,
        pageCount: 2,
        chunkCount: 0,
        indexingStatus: 'pending',
        indexingError: null,
        embeddingModel: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    vi.spyOn(cursadaClient, 'listSources').mockResolvedValue(
      pendingOnlySources
    );

    render(
      <CourseReportGenerator
        courseId="bd-2"
        courseName="Bases de Datos II"
      />
    );

    const emptyNotice = await screen.findByTestId('report-no-ready-sources');
    expect(emptyNotice).toHaveTextContent(
      'No hay fuentes indexadas listas en Bases de Datos II'
    );
    expect(
      screen.queryByRole('checkbox', { name: 'Archivo sin indexar.pdf' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generar material' })
    ).toBeDisabled();
  });
});
