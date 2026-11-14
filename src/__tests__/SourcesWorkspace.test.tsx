import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourcesWorkspace } from '../components/sources/SourcesWorkspace';
import { resetAllMocks } from '../lib/api/mockClient';
import { buildSyntheticPdfBuffer } from '../lib/pdf';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

describe('Phase 5 Task 5.2 Frontend: SourcesWorkspace upload, paste, preview, search, reindex, and delete', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads synthetic multi-page .pdf and .txt files via file input and previews pages and chunks', async () => {
    render(
      <SourcesWorkspace
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
      />
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fuentes de estudio' })
    ).toBeInTheDocument();

    // Seeded sources load first (2 sources: 3p PDF + 1p MD)
    expect(
      await screen.findByText('Apuntes Unidad 2 — Ingeniería de Requerimientos')
    ).toBeInTheDocument();
    expect(screen.getByTestId('sources-summary')).toHaveTextContent(
      /2 fuentes · 4 páginas · 4 fragmentos indexados/i
    );

    const fileInput = screen.getByTestId('source-file-input') as HTMLInputElement;

    // 1. Upload 3-page synthetic PDF
    const pdfBytes = buildSyntheticPdfBuffer([
      'Pagina 1: definicion de requerimientos funcionales y atributos de calidad.',
      'Pagina 2: arquitectura en capas y desacoplamiento por interfaces.',
      'Pagina 3: estrategia de pruebas unitarias e integracion continua.',
    ]);
    const pdfFile = new File([toArrayBuffer(pdfBytes)], 'guia-catedra-2026.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    const pdfTitleNode = await screen.findByText('guia-catedra-2026');
    const pdfCard = pdfTitleNode.closest('li') as HTMLElement;
    expect(within(pdfCard).getByText('PDF')).toBeInTheDocument();
    expect(within(pdfCard).getByText('Indexado')).toBeInTheDocument();
    expect(within(pdfCard).getByText('3 páginas')).toBeInTheDocument();
    expect(within(pdfCard).getByText('3 fragmentos')).toBeInTheDocument();

    expect(screen.getByRole('status')).toHaveTextContent(
      /guia-catedra-2026.*3 fragmentos/i
    );

    // 2. Upload plain .txt file
    const txtBytes = new TextEncoder().encode(
      'Checklist de revision para entregas semanales y revisiones de codigo.'
    );
    const txtFile = new File([toArrayBuffer(txtBytes)], 'checklist-entregas.txt', {
      type: 'text/plain',
    });
    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    const txtTitleNode = await screen.findByText('checklist-entregas');
    const txtCard = txtTitleNode.closest('li') as HTMLElement;
    expect(within(txtCard).getByText('TXT')).toBeInTheDocument();
    expect(within(txtCard).getByText('Indexado')).toBeInTheDocument();
    expect(within(txtCard).getByText('1 página')).toBeInTheDocument();
    expect(within(txtCard).getByText('1 fragmento')).toBeInTheDocument();

    // 3. Preview uploaded PDF: check raw text <pre role="region"> and indexed chunks with page numbers
    fireEvent.click(
      within(pdfCard).getByRole('button', {
        name: /Previsualizar guia-catedra-2026/i,
      })
    );

    const previewRegion = await screen.findByRole('region', {
      name: /Contenido extraído completo/i,
    });
    expect(previewRegion).toHaveTextContent(
      /requerimientos funcionales y atributos de calidad/i
    );
    expect(previewRegion).toHaveTextContent(
      /estrategia de pruebas unitarias/i
    );

    const chunksTab = screen.getByRole('button', {
      name: /Fragmentos indexados \(3\)/i,
    });
    fireEvent.click(chunksTab);

    expect(await screen.findByText('Página 1')).toBeInTheDocument();
    expect(screen.getByText('Página 2')).toBeInTheDocument();
    expect(screen.getByText('Página 3')).toBeInTheDocument();
    expect(
      screen.getByText(/arquitectura en capas y desacoplamiento/i)
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Cerrar previsualización/i })
    );
  });

  it('validates and creates pasted text sources, searches fragments, reindexes, and deletes sources', async () => {
    render(
      <SourcesWorkspace
        courseId="ing-soft-1"
        courseName="Ingeniería de Software I"
      />
    );

    await screen.findByText('Resumen Patrones y Calidad.md');

    // 1. Open "Pegar texto directo" modal and check empty validation
    fireEvent.click(
      screen.getByRole('button', { name: /Pegar texto directo/i })
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'Pegar texto directo' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Guardar e indexar/i })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Ingresá un título/i
    );

    // Fill title and content
    fireEvent.change(screen.getByLabelText(/^Título$/i), {
      target: { value: 'Apuntes Observador y Eventos' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Guardar e indexar/i })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Pegá o escribí el contenido/i
    );

    fireEvent.change(screen.getByLabelText(/^Contenido$/i), {
      target: {
        value:
          'El patron Observador desacopla emisores de eventos y suscriptores locales mediante interfaces reactivas.',
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Guardar e indexar/i })
    );

    const pastedHeading = await screen.findByText('Apuntes Observador y Eventos');
    const pastedCard = pastedHeading.closest('li') as HTMLElement;
    expect(within(pastedCard).getByText('Texto pegado')).toBeInTheDocument();
    expect(within(pastedCard).getByText('Indexado')).toBeInTheDocument();

    // 2. Search fragments in <search>
    const searchInput = screen.getByLabelText(/Buscar en fuentes y fragmentos/i);
    fireEvent.change(searchInput, { target: { value: 'suscriptores reactivas' } });

    const fragmentResults = await screen.findByTestId(
      'sources-fragment-results'
    );
    await waitFor(() => {
      expect(
        within(fragmentResults).getByText(/Fragmentos coincidentes \(\d+\)/i)
      ).toBeInTheDocument();
      const firstHit = fragmentResults.querySelector('li') as HTMLElement;
      expect(firstHit).not.toBeNull();
      expect(
        within(firstHit).getByText('Apuntes Observador y Eventos')
      ).toBeInTheDocument();
      expect(
        within(firstHit).getByText(/desacopla emisores de eventos/i)
      ).toBeInTheDocument();
      expect(within(firstHit).getByText('Página 1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Limpiar$/i }));
    expect(
      screen.queryByTestId('sources-fragment-results')
    ).not.toBeInTheDocument();

    // 3. Reindex pasted source
    fireEvent.click(
      within(pastedCard).getByRole('button', {
        name: /Reindexar Apuntes Observador y Eventos/i,
      })
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /reindexada con 1 fragmento/i
      );
    });
    expect(within(pastedCard).getByText('Indexado')).toBeInTheDocument();

    // 4. Delete source and confirm removal + updated summary
    fireEvent.click(
      within(pastedCard).getByRole('button', {
        name: /Eliminar Apuntes Observador y Eventos/i,
      })
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Apuntes Observador y Eventos')
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('sources-summary')).toHaveTextContent(
      /2 fuentes · 4 páginas · 4 fragmentos indexados/i
    );
  });
});
