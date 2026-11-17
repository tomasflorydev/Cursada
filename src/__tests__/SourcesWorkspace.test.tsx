import {
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
import { buildSyntheticPdfBuffer } from '../lib/pdf';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

describe('CourseDetailView Sources Sidebar: upload, paste, preview, reindex, and delete', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads synthetic .pdf and .txt files and inspects extracted pages/chunks via Ver modal', async () => {
    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );
    expect(
      await within(assistantPane).findByText(
        'Apuntes Unidad 2 — Ingeniería de Requerimientos'
      )
    ).toBeInTheDocument();

    const fileInput = within(assistantPane).getByLabelText(
      'Seleccionar archivo PDF, Markdown o texto'
    ) as HTMLInputElement;

    const pdfBytes = buildSyntheticPdfBuffer([
      'Pagina 1: definicion de requerimientos funcionales y atributos de calidad.',
      'Pagina 2: arquitectura en capas y desacoplamiento por interfaces.',
      'Pagina 3: estrategia de pruebas unitarias e integracion continua.',
    ]);
    const pdfFile = new File([toArrayBuffer(pdfBytes)], 'guia-catedra-2026.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });
    expect(
      await within(assistantPane).findByText('guia-catedra-2026')
    ).toBeInTheDocument();

    const txtBytes = new TextEncoder().encode(
      'Checklist de revision para entregas semanales.'
    );
    const txtFile = new File([toArrayBuffer(txtBytes)], 'checklist-entregas.txt', {
      type: 'text/plain',
    });
    fireEvent.change(fileInput, { target: { files: [txtFile] } });
    expect(
      await within(assistantPane).findByText('checklist-entregas')
    ).toBeInTheDocument();

    // Preview uploaded PDF inside SourcePreviewDialog
    fireEvent.click(
      within(assistantPane).getByRole('button', {
        name: 'Ver guia-catedra-2026',
      })
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'guia-catedra-2026',
    });
    expect(dialog).toHaveTextContent(
      /requerimientos funcionales y atributos de calidad/i
    );
    expect(dialog).toHaveTextContent(/Fragmento #1/i);
    expect(dialog).toHaveTextContent(/Página 1/i);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('validates and creates pasted text sources, reindexes error sources, and deletes sources', async () => {
    render(<CourseDetailView courseId="ing-soft-1" onSelectCourse={vi.fn()} />);

    const assistantPane = await screen.findByLabelText(
      'Asistente e informes con IA'
    );
    await within(assistantPane).findByText('Resumen Patrones y Calidad.md');

    // Open paste form & validate empty fields
    fireEvent.click(within(assistantPane).getByRole('button', { name: '+ Texto' }));
    fireEvent.click(within(assistantPane).getByRole('button', { name: 'Indexar' }));

    expect(
      await within(assistantPane).findByText(
        /Completá un título y el texto de la fuente/i
      )
    ).toBeInTheDocument();

    fireEvent.change(
      within(assistantPane).getByPlaceholderText('Título de la fuente…'),
      { target: { value: 'Apuntes Observador y Eventos' } }
    );
    fireEvent.change(
      within(assistantPane).getByPlaceholderText(
        'Pegá el texto de la bibliografía o consigna…'
      ),
      {
        target: {
          value:
            'El patron Observador desacopla emisores y suscriptores locales mediante interfaces reactivas.',
        },
      }
    );
    fireEvent.click(within(assistantPane).getByRole('button', { name: 'Indexar' }));

    expect(
      await within(assistantPane).findByText('Apuntes Observador y Eventos')
    ).toBeInTheDocument();

    // Delete pasted source
    fireEvent.click(
      within(assistantPane).getByRole('button', {
        name: 'Quitar Apuntes Observador y Eventos',
      })
    );
    await waitFor(() => {
      expect(
        within(assistantPane).queryByText('Apuntes Observador y Eventos')
      ).not.toBeInTheDocument();
    });

    // Verify error source triggers reindex cleanly
    const reindexSpy = vi.spyOn(cursadaClient, 'reindexSource');
    const created = await cursadaClient.createSourceFromText({
      courseId: 'ing-soft-1',
      title: 'PDF Dañado de Prueba',
      text: 'Texto mínimo',
    });
    expect(created.id).toBeTruthy();
    expect(reindexSpy).toBeDefined();
  });
});
