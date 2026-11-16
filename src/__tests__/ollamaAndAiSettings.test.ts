import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  getAiSettings,
  normalizeOllamaBaseUrl,
  updateAiSettings,
} from '../../electron/db/aiSettingsRepo';
import {
  createTestDatabase,
  getAppDatabase,
} from '../../electron/db/database';
import { registerOllamaHandlers } from '../../electron/ipc/ollamaHandlers';
import {
  checkOllamaHealth,
  computeDeterministicLocalEmbedding,
  generateChatCompletion,
  generateEmbeddings,
  OllamaCancelledError,
} from '../../electron/services/ollamaClient';
import { computeFallbackEmbedding } from '../../electron/services/sourcesService';

const ipcHandleMap = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
      ipcHandleMap.set(channel, listener);
    },
  },
}));

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

describe('Phase 5 Task 5.1 Backend: aiSettingsRepo and ollamaClient', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.CURSADA_DATA_DIR;
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns defaults and normalizes/persists AI settings in SQLite app_settings', () => {
    const ctx = createTestDatabase({ inMemory: true });
    tempDirs.push(ctx.dataDir);

    const defaults = getAiSettings(ctx.db);
    expect(defaults).toEqual({
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      chatModel: DEFAULT_CHAT_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
    });

    expect(normalizeOllamaBaseUrl('  http://localhost:11434///  ')).toBe(
      'http://localhost:11434'
    );
    expect(normalizeOllamaBaseUrl('https://ollama.local:8443/api/')).toBe(
      'https://ollama.local:8443/api'
    );

    const updated = updateAiSettings(ctx.db, {
      baseUrl: '  http://127.0.0.1:11435// ',
      chatModel: '  qwen2.5:7b ',
      embeddingModel: ' mxbai-embed-large ',
    });
    expect(updated).toEqual({
      baseUrl: 'http://127.0.0.1:11435',
      chatModel: 'qwen2.5:7b',
      embeddingModel: 'mxbai-embed-large',
    });

    // Partial update preserves untouched keys
    const partial = updateAiSettings(ctx.db, { chatModel: 'llama3.2:latest' });
    expect(partial).toEqual({
      baseUrl: 'http://127.0.0.1:11435',
      chatModel: 'llama3.2:latest',
      embeddingModel: 'mxbai-embed-large',
    });

    // Empty / invalid validations never corrupt saved values
    expect(() => updateAiSettings(ctx.db, { baseUrl: '' })).toThrow(/vacía/i);
    expect(() =>
      updateAiSettings(ctx.db, { baseUrl: 'ftp://localhost:11434' })
    ).toThrow(/http/i);
    expect(() =>
      updateAiSettings(ctx.db, { baseUrl: 'localhost:11434' })
    ).toThrow(/http/i);
    expect(() =>
      updateAiSettings(ctx.db, { baseUrl: 'not a url' })
    ).toThrow(/válida/i);
    expect(() => updateAiSettings(ctx.db, { chatModel: '   ' })).toThrow(
      /chat/i
    );
    expect(() => updateAiSettings(ctx.db, { embeddingModel: '  ' })).toThrow(
      /embeddings/i
    );

    expect(getAiSettings(ctx.db)).toEqual(partial);

    ctx.close();
  });

  it('checkOllamaHealth parses models and version on 200 and handles /api/version missing', async () => {
    const fetchOk = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [
              {
                name: 'llama3.2:latest',
                size: 2019393189,
                modified_at: '2026-11-10T10:00:00.000Z',
                details: {
                  family: 'llama',
                  parameter_size: '3.2B',
                  quantization_level: 'Q4_K_M',
                },
              },
              {
                model: 'nomic-embed-text:latest',
                size: 274302450,
                modified_at: '2026-11-10T10:05:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: '0.5.7' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });

    const connected = await checkOllamaHealth({
      baseUrl: 'http://localhost:11434/',
      chatModel: 'llama3.2:latest',
      embeddingModel: 'nomic-embed-text:latest',
      fetchImpl: fetchOk,
    });

    expect(connected.status).toBe('connected');
    expect(connected.baseUrl).toBe('http://localhost:11434');
    expect(connected.version).toBe('0.5.7');
    expect(connected.errorMessage).toBeNull();
    expect(connected.models).toEqual([
      {
        name: 'llama3.2:latest',
        sizeBytes: 2019393189,
        modifiedAt: '2026-11-10T10:00:00.000Z',
        family: 'llama',
        parameterSize: '3.2B',
        quantizationLevel: 'Q4_K_M',
      },
      {
        name: 'nomic-embed-text:latest',
        sizeBytes: 274302450,
        modifiedAt: '2026-11-10T10:05:00.000Z',
      },
    ]);

    // Missing /api/version does not fail health check
    const fetchWithoutVersion = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });

    const withoutVersion = await checkOllamaHealth({
      fetchImpl: fetchWithoutVersion,
    });
    expect(withoutVersion.status).toBe('connected');
    expect(withoutVersion.version).toBeNull();
    expect(withoutVersion.models).toEqual([]);
  });

  it('checkOllamaHealth never throws on ECONNREFUSED, timeout, HTTP 500, invalid JSON, or invalid URL', async () => {
    // 1. ECONNREFUSED
    const fetchRefused = vi.fn<typeof fetch>(async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:11434');
      Object.assign(err, { code: 'ECONNREFUSED' });
      throw err;
    });
    const refusedResult = await checkOllamaHealth({ fetchImpl: fetchRefused });
    expect(refusedResult.status).toBe('disconnected');
    expect(refusedResult.models).toEqual([]);
    expect(refusedResult.version).toBeNull();
    expect(refusedResult.errorMessage).toMatch(/ollama serve/i);

    // 2. Timeout / AbortController
    const fetchSlow = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        })
    );
    const timeoutResult = await checkOllamaHealth({
      fetchImpl: fetchSlow,
      timeoutMs: 25,
    });
    expect(timeoutResult.status).toBe('disconnected');
    expect(timeoutResult.errorMessage).toMatch(/tiempo de espera|ollama serve/i);

    // 3. HTTP 500
    const fetch500 = vi.fn<typeof fetch>(
      async () => new Response('Internal Server Error', { status: 500 })
    );
    const err500Result = await checkOllamaHealth({ fetchImpl: fetch500 });
    expect(err500Result.status).toBe('disconnected');
    expect(err500Result.errorMessage).toMatch(/HTTP 500/i);

    // 4. Invalid JSON
    const fetchBadJson = vi.fn<typeof fetch>(
      async () => new Response('not-json{{{', { status: 200 })
    );
    const badJsonResult = await checkOllamaHealth({ fetchImpl: fetchBadJson });
    expect(badJsonResult.status).toBe('disconnected');
    expect(badJsonResult.errorMessage).toMatch(/JSON/i);

    // 5. Invalid URL
    const invalidUrlResult = await checkOllamaHealth({ baseUrl: 'not-a-url' });
    expect(invalidUrlResult.status).toBe('disconnected');
    expect(invalidUrlResult.errorMessage).toMatch(/válida|http/i);
  });

  it('computes deterministic local embeddings and calls /api/embed with fallback support', async () => {
    // Deterministic local embeddings
    const v1 = computeDeterministicLocalEmbedding('Álgebra Lineal y Matrices');
    const v2 = computeDeterministicLocalEmbedding('algebra lineal y matrices');
    const v3 = computeDeterministicLocalEmbedding('Base de Datos Relacionales SQL');

    expect(v1).toBeInstanceOf(Float32Array);
    expect(v1).toHaveLength(128);
    expect(Array.from(v1)).toEqual(Array.from(v2));

    let normSq = 0;
    for (const x of v1) normSq += x * x;
    expect(Math.sqrt(normSq)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(v1, v3)).toBeLessThan(0.5);

    const zeroVec = computeDeterministicLocalEmbedding('   ...   ');
    expect(Array.from(zeroVec).every((n) => n === 0)).toBe(true);

    // Empty inputs
    const emptyFetch = vi.fn<typeof fetch>();
    const emptyRes = await generateEmbeddings({
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      model: 'nomic-embed-text',
      inputs: [],
      fetchImpl: emptyFetch,
    });
    expect(emptyRes).toEqual({
      embeddings: [],
      modelUsed: 'nomic-embed-text',
      usedFallback: false,
    });
    expect(emptyFetch).not.toHaveBeenCalled();

    // Successful /api/embed
    const fetchEmbedOk = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        input: string[];
      };
      expect(body).toEqual({
        model: 'nomic-embed-text',
        input: ['Hola mundo', 'Segundo texto'],
      });
      return new Response(
        JSON.stringify({
          embeddings: [
            [0.5, 0.5, 0.5, 0.5],
            [0.1, 0.2, 0.3, 0.4],
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const embedOk = await generateEmbeddings({
      baseUrl: 'http://localhost:11434/',
      model: 'nomic-embed-text',
      inputs: ['Hola mundo', 'Segundo texto'],
      fetchImpl: fetchEmbedOk,
    });
    expect(embedOk.usedFallback).toBe(false);
    expect(embedOk.modelUsed).toBe('nomic-embed-text');
    expect(embedOk.embeddings).toHaveLength(2);
    expect(embedOk.embeddings[0]).toBeInstanceOf(Float32Array);
    expect(Array.from(embedOk.embeddings[0])).toEqual([0.5, 0.5, 0.5, 0.5]);

    // Fallback when Ollama is down
    const fetchDown = vi.fn<typeof fetch>(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const fallbackRes = await generateEmbeddings({
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      model: 'nomic-embed-text',
      inputs: ['Normalización en SQL'],
      fetchImpl: fetchDown,
    });
    expect(fallbackRes.usedFallback).toBe(true);
    expect(fallbackRes.modelUsed).toBe('local-hash-v1');
    expect(fallbackRes.embeddings).toHaveLength(1);
    expect(fallbackRes.embeddings[0]).toHaveLength(128);

    // Throws when allowLocalFallback === false
    await expect(
      generateEmbeddings({
        baseUrl: DEFAULT_OLLAMA_BASE_URL,
        model: 'nomic-embed-text',
        inputs: ['Normalización en SQL'],
        fetchImpl: fetchDown,
        allowLocalFallback: false,
      })
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('registers ai:* IPC handlers and delegates to aiSettingsRepo and ollamaClient', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-ipc-test-'));
    tempDirs.push(tempDir);
    process.env.CURSADA_DATA_DIR = tempDir;
    ipcHandleMap.clear();

    const fetchStub = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'llama3.2:latest', size: 1234 }],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: '0.5.8' }), {
          status: 200,
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchStub);

    registerOllamaHandlers();

    const getHandler = ipcHandleMap.get('ai:getSettings');
    const updateHandler = ipcHandleMap.get('ai:updateSettings');
    const checkHandler = ipcHandleMap.get('ai:checkStatus');

    expect(getHandler).toBeDefined();
    expect(updateHandler).toBeDefined();
    expect(checkHandler).toBeDefined();

    try {
      const initial = getHandler?.({});
      expect(initial).toEqual({
        baseUrl: DEFAULT_OLLAMA_BASE_URL,
        chatModel: DEFAULT_CHAT_MODEL,
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
      });

      const updated = updateHandler?.(
        {},
        {
          baseUrl: 'http://127.0.0.1:11434/',
          chatModel: 'qwen2.5:7b',
        }
      );
      expect(updated).toEqual({
        baseUrl: 'http://127.0.0.1:11434',
        chatModel: 'qwen2.5:7b',
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
      });

      const status = await checkHandler?.({}, undefined);
      expect(status).toMatchObject({
        status: 'connected',
        baseUrl: 'http://127.0.0.1:11434',
        version: '0.5.8',
        chatModel: 'qwen2.5:7b',
        embeddingModel: DEFAULT_EMBEDDING_MODEL,
      });
    } finally {
      getAppDatabase().close();
    }
  });

  it('unifies fallback embeddings across ollamaClient and sourcesService and supports NDJSON streaming + cancellation', async () => {
    const sample = 'Árboles Balanceados AVL y Rotaciones Dobles';
    const vecA = computeDeterministicLocalEmbedding(sample, 128);
    const vecB = computeFallbackEmbedding(sample, 128);
    expect(Array.from(vecA)).toEqual(Array.from(vecB));

    // NDJSON streaming split across chunk boundaries
    const encoder = new TextEncoder();
    const ndjsonParts = [
      '{"model":"llama3.2","message":{"role":"assistant","content":"Hola "},"done":false}\n{"model":"llama3.2",',
      '"message":{"role":"assistant","content":"Cursada!"},"done":false}\n{"model":"llama3.2","message":{"role":"assistant","content":""},"done":true}\n',
    ];
    let idx = 0;
    const streamBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (idx < ndjsonParts.length) {
          controller.enqueue(encoder.encode(ndjsonParts[idx++]));
        } else {
          controller.close();
        }
      },
    });

    const receivedTokens: string[] = [];
    const streamed = await generateChatCompletion({
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      model: 'llama3.2',
      messages: [{ role: 'user', content: 'Saludá' }],
      stream: true,
      onToken: (delta) => receivedTokens.push(delta),
      fetchImpl: async () =>
        new Response(streamBody, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
    });
    expect(receivedTokens).toEqual(['Hola ', 'Cursada!']);
    expect(streamed.content).toBe('Hola Cursada!');

    // Cancellation throws OllamaCancelledError
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateChatCompletion({
        baseUrl: DEFAULT_OLLAMA_BASE_URL,
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'Saludá' }],
        signal: controller.signal,
      })
    ).rejects.toThrow(OllamaCancelledError);
  });
});
