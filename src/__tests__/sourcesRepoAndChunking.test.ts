import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCourse, deleteCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase } from '../../electron/db/database';
import {
  blobToFloat32,
  cosineSimilarity,
  deleteSource,
  float32ToBlob,
  getSourceById,
  getSourceWithChunks,
  listSourcesByCourse,
  searchCourseChunksHybrid,
} from '../../electron/db/sourcesRepo';
import {
  chunkDocumentPages,
  extractDocumentPages,
} from '../../electron/services/chunkingService';
import {
  createSourceFromTextService,
  importSourceFileService,
  reindexSourceService,
  searchSourceChunksService,
  type SourceEmbedder,
} from '../../electron/services/sourcesService';
import {
  buildSyntheticPdfBuffer,
  extractPagesFromPdfBuffer,
} from '../lib/pdf';

describe('Phase 5 Task 5.2 Backend: PDF extraction, chunking, embeddings, sourcesRepo, and hybrid search', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function createIsolatedTestEnv() {
    const ctx = createTestDatabase();
    tempDirs.push(ctx.dataDir);
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-src-files-'));
    tempDirs.push(workDir);
    return { ctx, workDir };
  }

  it('extracts multi-page synthetic PDFs with page numbers in both pure lib and Node chunkingService', () => {
    const pagesInput = [
      'Pagina uno: introduccion a grafos dirigidos y recorridos BFS.',
      'Pagina dos: algoritmo de Dijkstra y caminos minimos sin pesos negativos.',
      'Pagina tres: arboles generadores minimos con Kruskal y Prim.',
    ];
    const pdfBytes = buildSyntheticPdfBuffer(pagesInput);

    const browserResult = extractPagesFromPdfBuffer(pdfBytes);
    expect(browserResult.pageCount).toBe(3);
    expect(browserResult.pages).toHaveLength(3);
    expect(browserResult.pages[0].pageNumber).toBe(1);
    expect(browserResult.pages[0].text).toContain('grafos dirigidos');
    expect(browserResult.pages[1].pageNumber).toBe(2);
    expect(browserResult.pages[1].text).toContain('Dijkstra');
    expect(browserResult.pages[2].pageNumber).toBe(3);
    expect(browserResult.pages[2].text).toContain('Kruskal y Prim');

    const nodeResult = extractDocumentPages({
      fileName: 'algoritmos.pdf',
      buffer: Buffer.from(pdfBytes),
    });
    expect(nodeResult.sourceType).toBe('pdf');
    expect(nodeResult.pageCount).toBe(3);
    expect(nodeResult.pages[0].text).toContain('recorridos BFS');
    expect(nodeResult.pages[1].text).toContain('caminos minimos');
    expect(nodeResult.pages[2].text).toContain('Kruskal y Prim');
  });

  it('chunks multi-page documents preserving pageNumber, generating overlaps, and skipping blank pages', () => {
    const sentence =
      'La arquitectura hexagonal separa el dominio de los adaptadores externos para facilitar pruebas aisladas. ';
    const longPageOne = sentence.repeat(12); // > 1100 chars

    const chunks = chunkDocumentPages(
      [
        { pageNumber: 1, text: longPageOne },
        { pageNumber: 2, text: '   \n\n  ' },
        {
          pageNumber: 3,
          text: 'Resumen corto en pagina tres sobre inyeccion de dependencias.',
        },
      ],
      { maxChars: 500, overlapChars: 100 }
    );

    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(
      chunks.map((_, idx) => idx)
    );

    const pageOneChunks = chunks.filter((c) => c.pageNumber === 1);
    expect(pageOneChunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.some((c) => c.pageNumber === 2)).toBe(false);

    const pageThreeChunks = chunks.filter((c) => c.pageNumber === 3);
    expect(pageThreeChunks).toHaveLength(1);
    expect(pageThreeChunks[0].content).toContain('inyeccion de dependencias');

    // Verify consecutive chunks from page 1 share overlapping words from the boundary
    const tailWords = pageOneChunks[0].content.slice(-60).trim().split(/\s+/);
    const sharedWord = tailWords.find(
      (word) => word.length > 4 && pageOneChunks[1].content.includes(word)
    );
    expect(sharedWord).toBeDefined();
  });

  it('round-trips Float32Array embeddings cleanly through SQLite blobs even with unaligned offsets', () => {
    const original = new Float32Array([0.25, -0.5, 0.75, 0.125]);
    const blob = float32ToBlob(original);

    // Create a deliberately unaligned view (byteOffset = 1) inside a larger buffer
    const padded = new Uint8Array(blob.byteLength + 3);
    padded.set(blob, 1);
    const unalignedSlice = padded.subarray(1, 1 + blob.byteLength);

    const restored = blobToFloat32(unalignedSlice);
    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 6);
    }

    expect(cosineSimilarity(original, restored)).toBeCloseTo(1, 6);
    expect(
      cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))
    ).toBe(0);
    expect(
      cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0]))
    ).toBe(0);
    expect(
      cosineSimilarity(new Float32Array(0), new Float32Array(0))
    ).toBe(0);
  });

  it('imports .pdf, .md, .txt files and pasted text, manages error/reindex states, and deletes cascading chunks + stored file', async () => {
    const { ctx, workDir } = createIsolatedTestEnv();
    try {
      const course = createCourse(ctx.db, {
        name: 'Algoritmos y Estructuras de Datos',
        color: 'blue',
        professor: 'Martín Giménez',
        term: '2026 - 2° Cuatrimestre',
        schedules: [],
      });

      // 1. Create from pasted text
      const pasted = await createSourceFromTextService(ctx.db, {
        courseId: course.id,
        title: 'Apuntes Clase 1',
        text: 'Definición de complejidad temporal O(n log n) para Mergesort.',
        sourceType: 'pasted_text',
      });
      expect(pasted.indexingStatus).toBe('ready');
      expect(pasted.sourceType).toBe('pasted_text');
      expect(pasted.chunkCount).toBe(1);
      expect(pasted.embeddingModel).toBe('local-fnv1a-128');

      // 2. Import synthetic multi-page .pdf from disk
      const pdfFilePath = path.join(workDir, 'guia-grafos.pdf');
      fs.writeFileSync(
        pdfFilePath,
        buildSyntheticPdfBuffer([
          'Unidad 1: Representacion con matriz de adyacencia.',
          'Unidad 2: Listas de adyacencia y recorrido DFS.',
          'Unidad 3: Orden topologico en grafos aciclicos dirigidos.',
        ])
      );

      const importedPdf = await importSourceFileService(
        ctx.db,
        { courseId: course.id, filePath: pdfFilePath },
        { dataDir: ctx.dataDir }
      );
      expect(importedPdf.canceled).toBe(false);
      expect(importedPdf.source).not.toBeNull();
      const pdfSource = importedPdf.source!;
      expect(pdfSource.sourceType).toBe('pdf');
      expect(pdfSource.pageCount).toBe(3);
      expect(pdfSource.chunkCount).toBe(3);
      expect(pdfSource.storedFilename).toBeTruthy();

      const copiedFilePath = path.join(
        ctx.dataDir,
        'sources',
        pdfSource.storedFilename!
      );
      expect(fs.existsSync(copiedFilePath)).toBe(true);

      const pdfWithChunks = getSourceWithChunks(ctx.db, pdfSource.id);
      expect(pdfWithChunks).not.toBeNull();
      expect(pdfWithChunks!.chunks.map((c) => c.pageNumber)).toEqual([1, 2, 3]);
      expect(pdfWithChunks!.chunks[2].content).toContain('Orden topologico');

      // 3. Import .md from disk and .txt via Base64
      const mdFilePath = path.join(workDir, 'patrones.md');
      fs.writeFileSync(
        mdFilePath,
        '# Patrones Creacionales\n\nFactory Method encapsula la instanciación.',
        'utf8'
      );
      const importedMd = await importSourceFileService(
        ctx.db,
        { courseId: course.id, filePath: mdFilePath },
        { dataDir: ctx.dataDir }
      );
      expect(importedMd.source?.sourceType).toBe('markdown');
      expect(importedMd.source?.indexingStatus).toBe('ready');

      const txtBase64 = Buffer.from(
        'Texto plano sobre colas de prioridad y montículos binarios.',
        'utf8'
      ).toString('base64');
      const importedTxt = await importSourceFileService(
        ctx.db,
        {
          courseId: course.id,
          fileName: 'heaps.txt',
          contentBase64: txtBase64,
        },
        { dataDir: ctx.dataDir }
      );
      expect(importedTxt.source?.sourceType).toBe('txt');
      expect(importedTxt.source?.title).toBe('heaps');

      // Unsupported extension throws clearly
      await expect(
        importSourceFileService(ctx.db, {
          courseId: course.id,
          fileName: 'archivo.exe',
          contentBase64: Buffer.from('abc').toString('base64'),
        })
      ).rejects.toThrow(/Formato no soportado/i);

      expect(listSourcesByCourse(ctx.db, course.id)).toHaveLength(4);

      // 4. Failing embedder marks indexing_status = 'error', then reindex restores 'ready'
      const failingEmbedder: SourceEmbedder = async () => {
        throw new Error('Ollama timeout simulado');
      };
      await expect(
        reindexSourceService(ctx.db, pdfSource.id, {
          dataDir: ctx.dataDir,
          embedder: failingEmbedder,
        })
      ).rejects.toThrow('Ollama timeout simulado');

      const errored = getSourceById(ctx.db, pdfSource.id);
      expect(errored?.indexingStatus).toBe('error');
      expect(errored?.indexingError).toContain('Ollama timeout simulado');

      const customEmbedder: SourceEmbedder = async (texts) => ({
        embeddings: texts.map(() => new Float32Array([0.6, 0.8])),
        modelUsed: 'nomic-embed-custom',
      });
      const reindexed = await reindexSourceService(ctx.db, pdfSource.id, {
        dataDir: ctx.dataDir,
        embedder: customEmbedder,
      });
      expect(reindexed.indexingStatus).toBe('ready');
      expect(reindexed.indexingError).toBeNull();
      expect(reindexed.embeddingModel).toBe('nomic-embed-custom');
      expect(reindexed.pageCount).toBe(3);

      // Re-reading after reindex preserved all 3 PDF pages via stored copy
      const reindexedChunks = getSourceWithChunks(ctx.db, pdfSource.id);
      expect(reindexedChunks?.chunks.map((c) => c.pageNumber)).toEqual([
        1, 2, 3,
      ]);

      // 5. Delete PDF source and verify cascade cleanup + FTS cleanup + stored file deletion
      deleteSource(ctx.db, pdfSource.id, ctx.dataDir);
      expect(getSourceById(ctx.db, pdfSource.id)).toBeNull();
      expect(fs.existsSync(copiedFilePath)).toBe(false);

      const remainingChunkRows = ctx.db
        .prepare('SELECT COUNT(*) AS count FROM source_chunks WHERE source_id = ?')
        .get(pdfSource.id) as { count: number };
      expect(Number(remainingChunkRows.count)).toBe(0);

      const remainingFtsRows = ctx.db
        .prepare(
          'SELECT COUNT(*) AS count FROM source_chunks_fts WHERE source_id = ?'
        )
        .get(pdfSource.id) as { count: number };
      expect(Number(remainingFtsRows.count)).toBe(0);

      // 6. Course deletion cascades remaining sources
      deleteCourse(ctx.db, course.id);
      expect(listSourcesByCourse(ctx.db, course.id)).toHaveLength(0);
    } finally {
      ctx.close();
    }
  });

  it('performs accent-insensitive FTS5 + cosine similarity RRF hybrid search scoped by course', async () => {
    const { ctx } = createIsolatedTestEnv();
    try {
      const courseMain = createCourse(ctx.db, {
        name: 'Programación III',
        color: 'violet',
        professor: 'Laura Soto',
        term: '2026 - 2° Cuatrimestre',
        schedules: [],
      });
      const otherCourse = createCourse(ctx.db, {
        name: 'Sistemas Operativos',
        color: 'amber',
        professor: 'Carlos Ruiz',
        term: '2026 - 2° Cuatrimestre',
        schedules: [],
      });

      // Deterministic 4D embedder so vector rank favors vector-aligned chunks predictably
      const vectorEmbedder: SourceEmbedder = async (texts) => ({
        embeddings: texts.map((text) => {
          const lower = text.toLowerCase();
          if (lower.includes('memoización') || lower.includes('dinamica')) {
            return new Float32Array([0.95, 0.05, 0, 0]);
          }
          if (lower.includes('voraces') || lower.includes('greedy')) {
            return new Float32Array([0.6, 0.8, 0, 0]);
          }
          return new Float32Array([0, 0, 1, 0]);
        }),
        modelUsed: 'test-vec-4d',
      });

      await createSourceFromTextService(
        ctx.db,
        {
          courseId: courseMain.id,
          title: 'Guía Programación Dinámica',
          text: 'La programación dinámica utiliza memoización y subestructura óptima.',
          sourceType: 'markdown',
        },
        { embedder: vectorEmbedder }
      );

      await createSourceFromTextService(
        ctx.db,
        {
          courseId: courseMain.id,
          title: 'Guía Algoritmos Voraces',
          text: 'Los algoritmos voraces toman la decisión óptima local en cada paso.',
          sourceType: 'txt',
        },
        { embedder: vectorEmbedder }
      );

      await createSourceFromTextService(
        ctx.db,
        {
          courseId: otherCourse.id,
          title: 'Planificación CPU',
          text: 'Programación dinámica aplicada fuera de esta materia.',
          sourceType: 'txt',
        },
        { embedder: vectorEmbedder }
      );

      // Search without accents: "programacion dinamica"
      const hybridResults = searchCourseChunksHybrid(ctx.db, {
        courseId: courseMain.id,
        query: 'programacion dinamica',
        queryEmbedding: new Float32Array([1, 0, 0, 0]),
        limit: 5,
      });

      expect(hybridResults.length).toBe(2);
      // Chunk matching both FTS5 (accent-insensitive) AND top vector similarity ranks #1
      expect(hybridResults[0].sourceTitle).toBe('Guía Programación Dinámica');
      expect(hybridResults[0].ftsScore).toBeGreaterThan(0);
      expect(hybridResults[0].vectorScore).toBeGreaterThan(0.9);
      expect(hybridResults[0].score).toBeCloseTo(2 / 61, 6);
      // All hits must stay strictly scoped to courseMain
      expect(
        hybridResults.every((r) => r.chunk.courseId === courseMain.id)
      ).toBe(true);

      // Service-level search using fallback embedder
      const serviceHits = await searchSourceChunksService(
        ctx.db,
        { courseId: courseMain.id, query: 'memoizacion', limit: 3 },
        { embedder: vectorEmbedder }
      );
      expect(serviceHits.length).toBeGreaterThanOrEqual(1);
      expect(serviceHits[0].sourceTitle).toBe('Guía Programación Dinámica');
    } finally {
      ctx.close();
    }
  });
});
