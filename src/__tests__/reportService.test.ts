import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

const { handleMock, removeHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
    removeHandler: removeHandlerMock,
  },
  app: {
    getPath: vi.fn(() => '/tmp/cursada-report-test'),
  },
}));

import { createCourse } from '../../electron/db/coursesRepo';
import { createTestDatabase, type DatabaseContext } from '../../electron/db/database';
import { updateAiSettings } from '../../electron/db/aiSettingsRepo';
import { listNotes } from '../../electron/db/notesRepo';
import {
  createSourceRecord,
  getSourceWithChunks,
  saveSourceChunksAndMarkReady,
} from '../../electron/db/sourcesRepo';
import { registerReportHandlers } from '../../electron/ipc/reportHandlers';
import {
  generateStudyReportService,
  LOCAL_REPORT_FALLBACK_MODEL,
  sampleSourceContentForMap,
} from '../../electron/services/reportService';

function createReadySource(
  db: DatabaseSync,
  courseId: string,
  title: string,
  chunks: Array<{ pageNumber: number; content: string }>
) {
  const rawText = chunks.map((c) => c.content).join('\n\n');
  const maxPage = chunks.reduce((max, c) => Math.max(max, c.pageNumber), 1);
  const record = createSourceRecord(db, {
    courseId,
    title,
    sourceType: 'pdf',
    rawText,
    pageCount: maxPage,
    indexingStatus: 'pending',
  });

  return saveSourceChunksAndMarkReady(
    db,
    record.id,
    chunks.map((chunk, chunkIndex) => ({
      chunkIndex,
      pageNumber: chunk.pageNumber,
      content: chunk.content,
      embedding: new Float32Array([0.1, 0.2, 0.3]),
    })),
    'nomic-embed-text'
  );
}

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('reportService & reportHandlers (Phase 7 Map-Reduce)', () => {
  let dbCtx: DatabaseContext;
  let db: DatabaseSync;

  beforeEach(() => {
    handleMock.mockReset();
    removeHandlerMock.mockReset();
    dbCtx = createTestDatabase({ inMemory: true });
    db = dbCtx.db;
  });

  afterEach(() => {
    dbCtx.close();
    vi.restoreAllMocks();
  });

  it('calls Ollama /api/chat with keep_alive="0s" across Map + Reduce, passes customInstructions, and respects sourceIds filter', async () => {
    const course = createCourse(db, {
      name: 'Arquitectura de Software',
      color: 'amber',
      professor: 'Dra. García',
      term: '2026-2C',
    });

    updateAiSettings(db, {
      baseUrl: 'http://127.0.0.1:11434',
      chatModel: 'llama3.2:latest',
      embeddingModel: 'nomic-embed-text',
    });

    const largeChunks = Array.from({ length: 12 }, (_, index) => {
      const page = index + 1;
      const body = `Bloque de arquitectura página ${page}: `.padEnd(750, `p${page} `);
      return {
        pageNumber: page,
        content: `${body} — Principio clave ${page}.`,
      };
    });

    const sourceA = createReadySource(
      db,
      course.id,
      'Unidad 1 - Arquitectura Hexagonal.pdf',
      largeChunks
    );
    const sourceB = createReadySource(
      db,
      course.id,
      'Unidad 2 - Patrones CQRS.pdf',
      [
        {
          pageNumber: 1,
          content:
            'CQRS separa los modelos de lectura y escritura para optimizar consultas y comandos independientes.',
        },
        {
          pageNumber: 2,
          content:
            'Event Sourcing persiste cada cambio de estado como una secuencia inmutable de eventos de dominio.',
        },
      ]
    );
    const excludedReadySource = createReadySource(
      db,
      course.id,
      'Unidad 3 - Apunte Excluido.pdf',
      [{ pageNumber: 1, content: 'Contenido que NO debe entrar en este informe.' }]
    );
    createSourceRecord(db, {
      courseId: course.id,
      title: 'Pendiente sin indexar.pdf',
      sourceType: 'pdf',
      rawText: 'Texto pendiente',
      pageCount: 1,
      indexingStatus: 'pending',
    });

    const capturedCalls: Array<{
      url: string;
      body: {
        model: string;
        stream: boolean;
        keep_alive?: string;
        messages: Array<{ role: string; content: string }>;
      };
    }> = [];

    const fetchFn: typeof fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = JSON.parse(String(init?.body ?? '{}'));
      capturedCalls.push({ url, body });

      const callNumber = capturedCalls.length;
      if (callNumber <= 2) {
        return createJsonResponse({
          model: 'llama3.2:latest',
          message: {
            role: 'assistant',
            content: `MAP_EXTRACT_${callNumber}: Conceptos esenciales de la fuente ${callNumber}.`,
          },
        });
      }

      return createJsonResponse({
        model: 'llama3.2:latest',
        message: {
          role: 'assistant',
          content:
            '# Informe comparativo de Arquitectura\n\n## Ejes centrales\nSíntesis con ejemplos prácticos.',
        },
      });
    }) as unknown as typeof fetch;

    const customInstructions =
      'Redactá un informe comparativo en tono formal con ejemplos prácticos de puertos y adaptadores.';

    const result = await generateStudyReportService(
      db,
      {
        courseId: course.id,
        sourceIds: [sourceA.id, sourceB.id],
        reportType: 'report',
        customInstructions,
      },
      { fetchFn }
    );

    // 2 selected ready sources => 2 Map calls + 1 Reduce call
    expect(capturedCalls).toHaveLength(3);
    for (const call of capturedCalls) {
      expect(call.url).toBe('http://127.0.0.1:11434/api/chat');
      expect(call.body.model).toBe('llama3.2:latest');
      expect(call.body.stream).toBe(false);
      expect(call.body.keep_alive).toBe('0s');

      const combinedPrompt = call.body.messages.map((m) => m.content).join('\n');
      expect(combinedPrompt).toContain(customInstructions);
    }

    const map1Prompt = capturedCalls[0].body.messages.map((m) => m.content).join('\n');
    expect(map1Prompt).toContain('Unidad 1 - Arquitectura Hexagonal.pdf');
    expect(map1Prompt).toContain('[Pág. 1]');
    expect(map1Prompt).toContain('[Pág. 12]');
    // Prompt remains bounded rather than dumping the entire ~9,000-char source
    expect(capturedCalls[0].body.messages[1].content.length).toBeLessThan(6200);

    const mapAndReducePrompts = capturedCalls
      .map((c) => c.body.messages.map((m) => m.content).join('\n'))
      .join('\n');
    expect(mapAndReducePrompts).not.toContain(excludedReadySource.title);
    expect(mapAndReducePrompts).not.toContain('Pendiente sin indexar.pdf');

    const reducePrompt = capturedCalls[2].body.messages.map((m) => m.content).join('\n');
    expect(reducePrompt).toContain('MAP_EXTRACT_1');
    expect(reducePrompt).toContain('MAP_EXTRACT_2');

    expect(result.reportType).toBe('report');
    expect(result.modelUsed).toBe('llama3.2:latest');
    expect(result.sourcesUsed.map((s) => s.sourceId)).toEqual([sourceA.id, sourceB.id]);
    expect(result.steps).toEqual([
      expect.objectContaining({
        stepNumber: 1,
        totalSteps: 3,
        stage: 'map',
        sourceId: sourceA.id,
      }),
      expect.objectContaining({
        stepNumber: 2,
        totalSteps: 3,
        stage: 'map',
        sourceId: sourceB.id,
      }),
      expect.objectContaining({
        stepNumber: 3,
        totalSteps: 3,
        stage: 'reduce',
      }),
    ]);
    expect(result.note).not.toBeNull();
    expect(result.note?.origin).toBe('ai_summary');
    expect(listNotes(db, { courseId: course.id })).toHaveLength(1);
  });

  it('generates practice_exam (multiple_choice) with answer key, saves note with ai_practice_exam, and respects autoSaveAsNote=false', async () => {
    const course = createCourse(db, {
      name: 'Bases de Datos II',
      color: 'emerald',
      term: '2026-2C',
    });

    createReadySource(db, course.id, 'Normalización e Índices.pdf', [
      {
        pageNumber: 1,
        content:
          'Un índice B+ Tree acelera búsquedas por rango y mantiene las hojas enlazadas secuencialmente.',
      },
      {
        pageNumber: 2,
        content:
          'Las propiedades ACID garantizan Atomicidad, Consistencia, Aislamiento y Durabilidad en transacciones.',
      },
    ]);

    const seenPrompts: string[] = [];
    const fetchFn: typeof fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const prompt = (body.messages as Array<{ content: string }>)
        .map((m) => m.content)
        .join('\n');
      seenPrompts.push(prompt);

      if (seenPrompts.length === 1) {
        return createJsonResponse({
          model: 'llama3.2:latest',
          message: {
            role: 'assistant',
            content: 'Conceptos: B+ Tree, ACID, aislamiento de transacciones.',
          },
        });
      }

      return createJsonResponse({
        model: 'llama3.2:latest',
        message: {
          role: 'assistant',
          content: [
            '# Simulacro Multiple Choice — Bases de Datos II',
            '',
            '## Preguntas',
            '1. ¿Qué estructura optimiza consultas por rango en disco?',
            '   - A) Hash lineal',
            '   - B) B+ Tree',
            '   - C) Heap sin orden',
            '   - D) Grafo bipartito',
            '',
            '## Clave de respuestas / corrección',
            '- **Pregunta 1**: Respuesta correcta **B** (las hojas de un B+ Tree están enlazadas para recorridos por rango).',
          ].join('\n'),
        },
      });
    }) as unknown as typeof fetch;

    const examResult = await generateStudyReportService(
      db,
      {
        courseId: course.id,
        reportType: 'practice_exam',
        examFormat: 'multiple_choice',
        title: 'Parcial de práctica BD II',
        autoSaveAsNote: true,
      },
      { fetchFn }
    );

    expect(examResult.reportType).toBe('practice_exam');
    expect(examResult.examFormat).toBe('multiple_choice');
    expect(examResult.title).toBe('Parcial de práctica BD II');
    expect(examResult.content).toContain('## Clave de respuestas / corrección');
    expect(seenPrompts[1]).toContain('Multiple Choice');
    expect(seenPrompts[1]).toContain('Clave de respuestas / corrección');
    expect(examResult.note).not.toBeNull();
    expect(examResult.note?.origin).toBe('ai_practice_exam');
    expect(examResult.note?.title).toBe('Parcial de práctica BD II');

    // Now test study_guide with autoSaveAsNote: false
    seenPrompts.length = 0;
    const guideNoSave = await generateStudyReportService(
      db,
      {
        courseId: course.id,
        reportType: 'study_guide',
        autoSaveAsNote: false,
      },
      { fetchFn }
    );
    expect(guideNoSave.note).toBeNull();
    expect(listNotes(db, { courseId: course.id })).toHaveLength(1);

    // And study_guide with default autoSaveAsNote saves with origin 'ai_study_guide'
    seenPrompts.length = 0;
    const guideSaved = await generateStudyReportService(
      db,
      {
        courseId: course.id,
        reportType: 'study_guide',
      },
      { fetchFn }
    );
    expect(guideSaved.note?.origin).toBe('ai_study_guide');
    expect(listNotes(db, { courseId: course.id })).toHaveLength(2);
  });

  it('falls back cleanly to deterministic Spanish Map-Reduce markdown when Ollama is offline and still saves note', async () => {
    const course = createCourse(db, {
      name: 'Sistemas Operativos',
      color: 'rose',
      term: '2026-2C',
    });

    createReadySource(db, course.id, 'Planificación de CPU.pdf', [
      {
        pageNumber: 1,
        content:
          'Round Robin asigna un quantum fijo de tiempo de CPU a cada proceso listo para evitar inanición.',
      },
      {
        pageNumber: 2,
        content:
          'La planificación por prioridades puede sufrir inanición si no se aplica envejecimiento (aging).',
      },
    ]);

    const offlineFetch: typeof fetch = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
    }) as unknown as typeof fetch;

    const customInstructions =
      'Incluí foco en prevención de inanición y comparación con Round Robin.';

    const examFallback = await generateStudyReportService(
      db,
      {
        courseId: course.id,
        reportType: 'practice_exam',
        examFormat: 'mixed',
        customInstructions,
      },
      { fetchFn: offlineFetch }
    );

    expect(examFallback.modelUsed).toBe(LOCAL_REPORT_FALLBACK_MODEL);
    expect(examFallback.examFormat).toBe('mixed');
    expect(examFallback.steps).toHaveLength(2);
    expect(examFallback.steps[0].stage).toBe('map');
    expect(examFallback.steps[1].stage).toBe('reduce');
    expect(examFallback.content).toContain('Planificación de CPU.pdf');
    expect(examFallback.content).toContain(customInstructions);
    expect(examFallback.content).toContain('## Clave de respuestas / corrección');
    expect(examFallback.content).toContain('Multiple Choice');
    expect(examFallback.content).toContain('Desarrollo');
    expect(examFallback.note).not.toBeNull();
    expect(examFallback.note?.origin).toBe('ai_practice_exam');

    const reportFallback = await generateStudyReportService(
      db,
      {
        courseId: course.id,
        reportType: 'report',
        customInstructions: 'Redactá en formato informe ejecutivo.',
      },
      { fetchFn: offlineFetch }
    );
    expect(reportFallback.modelUsed).toBe(LOCAL_REPORT_FALLBACK_MODEL);
    expect(reportFallback.content).toContain('Informe');
    expect(reportFallback.content).toContain('Redactá en formato informe ejecutivo.');
    expect(reportFallback.note?.origin).toBe('ai_summary');
  });

  it('registers reports:generate IPC handler and rejects with clear Spanish errors when 0 ready sources match', async () => {
    const courseWithoutReady = createCourse(db, {
      name: 'Álgebra Lineal',
      color: 'amber',
      term: '2026-2C',
    });
    createSourceRecord(db, {
      courseId: courseWithoutReady.id,
      title: 'Guía sin procesar.pdf',
      sourceType: 'pdf',
      rawText: 'Texto aún pendiente',
      pageCount: 1,
      indexingStatus: 'pending',
    });

    const courseWithReady = createCourse(db, {
      name: 'Análisis Matemático II',
      color: 'rose',
      term: '2026-2C',
    });
    createReadySource(db, courseWithReady.id, 'Teorema de Stokes.pdf', [
      {
        pageNumber: 1,
        content:
          'El teorema de Stokes relaciona la integral de superficie del rotor con la integral de línea en la frontera.',
      },
    ]);

    const fetchFn: typeof fetch = vi.fn(async () =>
      createJsonResponse({
        model: 'llama3.2:latest',
        message: {
          role: 'assistant',
          content: '# Resumen — Análisis Matemático II\n\nContenido generado vía IPC.',
        },
      })
    ) as unknown as typeof fetch;

    registerReportHandlers({ db, fetchFn });

    const call = handleMock.mock.calls.find(
      ([channel]) => channel === 'reports:generate'
    );
    expect(call).toBeDefined();
    const handler = call?.[1] as (
      event: unknown,
      input: unknown
    ) => Promise<unknown>;

    // Case 1: course with 0 ready sources
    await expect(
      handler({}, { courseId: courseWithoutReady.id, reportType: 'summary' })
    ).rejects.toThrow(/fuentes indexadas listas/i);

    // Case 2: valid course but non-matching sourceIds filter
    await expect(
      handler(
        {},
        {
          courseId: courseWithReady.id,
          sourceIds: ['source-inexistente'],
          reportType: 'summary',
        }
      )
    ).rejects.toThrow(/coincidan con la selección/i);

    // Case 3: valid request succeeds through IPC handler
    const ipcResult = (await handler(
      {},
      { courseId: courseWithReady.id, reportType: 'summary' }
    )) as { title: string; content: string; note: { id: string } | null };

    expect(ipcResult.title).toBe('Resumen — Análisis Matemático II');
    expect(ipcResult.content).toContain('Contenido generado vía IPC.');
    expect(ipcResult.note).not.toBeNull();
  });

  it('sampleSourceContentForMap samples evenly from beginning to end and obeys maxChars cap', () => {
    const course = createCourse(db, {
      name: 'Compiladores',
      color: 'emerald',
      term: '2026-2C',
    });
    const created = createReadySource(
      db,
      course.id,
      'Manual Extenso.pdf',
      Array.from({ length: 20 }, (_, i) => ({
        pageNumber: i + 1,
        content: `Sección ${i + 1}: `.padEnd(500, 'contenido '),
      }))
    );
    const fullSource = getSourceWithChunks(db, created.id);
    expect(fullSource).not.toBeNull();

    const sampled = sampleSourceContentForMap(fullSource!, 4500);
    expect(sampled.length).toBeLessThanOrEqual(4500);
    expect(sampled).toContain('[Pág. 1]');
    expect(sampled).toContain('[Pág. 20]');
  });
});
