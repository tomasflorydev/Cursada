import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getAiSettings } from '../db/aiSettingsRepo.js';
import {
  getSourceById,
  createSourceRecord,
  markSourceIndexingStatus,
  saveSourceChunksAndMarkReady,
  searchCourseChunksHybrid,
} from '../db/sourcesRepo.js';
import type {
  CreateSourceFromTextInput,
  ImportSourceFileInput,
  ImportSourceFileResult,
  SearchSourceChunksInput,
  Source,
  SourceChunkSearchResult,
} from '../types.js';
import {
  chunkDocumentPages,
  extractDocumentPages,
  type ExtractedPage,
} from './chunkingService.js';
import { generateEmbeddings } from './ollamaClient.js';

export const FALLBACK_EMBEDDING_MODEL = 'local-fnv1a-128';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.md', '.markdown', '.txt']);

export type SourceEmbedder = (
  texts: string[]
) => Promise<{ embeddings: Float32Array[]; modelUsed: string }>;

let registeredEmbedder: ((() => SourceEmbedder) | SourceEmbedder) | null = null;

/**
 * Registers the default embedder (or lazy factory) used when callers omit `options.embedder`.
 */
export function registerDefaultSourceEmbedder(
  fn: (() => SourceEmbedder) | SourceEmbedder
): void {
  registeredEmbedder = fn;
}

function fnv1aHash(input: string, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function normalizeForEmbedding(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Computes a deterministic L2-normalized local vector using signed FNV-1a token, bigram, and char-3gram hashing.
 */
export function computeFallbackEmbedding(text: string, dim = 128): Float32Array {
  const vec = new Float32Array(dim);
  const normalized = normalizeForEmbedding(text).trim();
  if (!normalized || dim <= 0) {
    return vec;
  }

  const tokens = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);

  const addFeature = (feature: string, weight: number): void => {
    const idx = fnv1aHash(feature, 2166136261) % dim;
    const signBit = fnv1aHash(feature, 374761393) & 1;
    vec[idx] += signBit === 0 ? weight : -weight;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    addFeature(`w:${token}`, 1.0);

    if (i + 1 < tokens.length) {
      addFeature(`b:${token}_${tokens[i + 1]}`, 0.75);
    }

    if (token.length >= 4) {
      for (let j = 0; j <= token.length - 3; j++) {
        addFeature(`c3:${token.slice(j, j + 3)}`, 0.3);
      }
    }
  }

  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }

  if (sumSq > 0) {
    const norm = Math.sqrt(sumSq);
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

const defaultFallbackEmbedder: SourceEmbedder = async (texts: string[]) => ({
  embeddings: texts.map((text) => computeFallbackEmbedding(text, 128)),
  modelUsed: FALLBACK_EMBEDDING_MODEL,
});

/**
 * Builds a SourceEmbedder backed by the user's configured Ollama AI settings
 * (falling back to local deterministic embeddings if Ollama is unreachable).
 */
export function createOllamaSourceEmbedder(
  db: DatabaseSync,
  options?: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    allowLocalFallback?: boolean;
  }
): SourceEmbedder {
  return async (texts: string[]) => {
    const settings = getAiSettings(db);
    const result = await generateEmbeddings({
      baseUrl: settings.baseUrl,
      model: settings.embeddingModel,
      inputs: texts,
      keepAlive: '0s',
      fetchImpl: options?.fetchImpl,
      timeoutMs: options?.timeoutMs,
      allowLocalFallback: options?.allowLocalFallback,
    });
    return {
      embeddings: result.embeddings,
      modelUsed: result.modelUsed,
    };
  };
}

function resolveEmbedder(override?: SourceEmbedder): SourceEmbedder {
  if (override) {
    return override;
  }
  if (registeredEmbedder) {
    if (registeredEmbedder.length === 0) {
      return (registeredEmbedder as () => SourceEmbedder)();
    }
    return registeredEmbedder as SourceEmbedder;
  }
  return defaultFallbackEmbedder;
}

function sanitizeStoredFilename(fileName: string): string {
  const base = path.basename(fileName || 'documento.txt');
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'documento.txt';
}

function stripFileExtension(fileName: string): string {
  const base = path.basename(fileName);
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

function assertAllowedExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Formato no soportado "${ext || '(sin extensión)'}". Formatos permitidos: .pdf, .md, .markdown, .txt.`
    );
  }
  return ext;
}

async function embedAndSaveChunks(
  db: DatabaseSync,
  sourceId: string,
  pages: ExtractedPage[],
  embedder: SourceEmbedder
): Promise<Source> {
  const chunkItems = chunkDocumentPages(pages);
  if (chunkItems.length === 0) {
    const message = 'La fuente no contiene texto indexable.';
    markSourceIndexingStatus(db, sourceId, 'error', message);
    throw new Error(message);
  }

  try {
    const { embeddings, modelUsed } = await embedder(
      chunkItems.map((chunk) => chunk.content)
    );
    if (embeddings.length !== chunkItems.length) {
      throw new Error(
        `Cantidad de embeddings (${embeddings.length}) no coincide con chunks (${chunkItems.length}).`
      );
    }

    return saveSourceChunksAndMarkReady(
      db,
      sourceId,
      chunkItems.map((chunk, index) => ({
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        content: chunk.content,
        embedding: embeddings[index] ?? null,
      })),
      modelUsed || FALLBACK_EMBEDDING_MODEL
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al indexar fragmentos';
    markSourceIndexingStatus(db, sourceId, 'error', message);
    throw error;
  }
}

export async function createSourceFromTextService(
  db: DatabaseSync,
  input: CreateSourceFromTextInput,
  options?: { embedder?: SourceEmbedder }
): Promise<Source> {
  const title = (input.title ?? '').trim();
  if (!title) {
    throw new Error('El título de la fuente no puede estar vacío.');
  }

  const providedPages =
    input.pages && input.pages.length > 0
      ? [...input.pages]
          .map((page, index) => ({
            pageNumber:
              Number.isFinite(page.pageNumber) && page.pageNumber >= 1
                ? Math.floor(page.pageNumber)
                : index + 1,
            text: (page.text ?? '').replace(/\r\n?/g, '\n').trim(),
          }))
          .sort((a, b) => a.pageNumber - b.pageNumber)
      : null;

  const trimmedText = (input.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!trimmedText && (!providedPages || providedPages.every((p) => !p.text))) {
    throw new Error('El contenido de la fuente no puede estar vacío.');
  }

  const sourceType = input.sourceType ?? 'pasted_text';
  const extracted = providedPages
    ? {
        sourceType,
        pages: providedPages,
        pageCount: Math.max(input.pageCount ?? providedPages.length, providedPages.length),
        rawText:
          trimmedText ||
          providedPages
            .map((p) => p.text)
            .filter((t) => t.length > 0)
            .join('\n\n'),
      }
    : extractDocumentPages({
        sourceType: sourceType === 'pdf' ? 'pasted_text' : sourceType,
        text: input.text,
      });

  const preliminaryChunks = chunkDocumentPages(extracted.pages);
  if (preliminaryChunks.length === 0) {
    throw new Error('El contenido de la fuente no contiene texto indexable.');
  }

  const source = createSourceRecord(db, {
    courseId: input.courseId,
    title,
    sourceType,
    originalPath: input.originalPath ?? null,
    storedFilename: null,
    rawText: extracted.rawText,
    pageCount: extracted.pageCount,
    indexingStatus: 'indexing',
  });

  const embedder = resolveEmbedder(options?.embedder);
  return embedAndSaveChunks(db, source.id, extracted.pages, embedder);
}

export async function importSourceFileService(
  db: DatabaseSync,
  input: ImportSourceFileInput,
  options?: { dataDir?: string; embedder?: SourceEmbedder }
): Promise<ImportSourceFileResult> {
  if (!input.filePath && !input.contentBase64) {
    return { canceled: true, source: null };
  }

  let fileBuffer: Buffer;
  let originalFileName: string;
  let originalPath: string | null = input.filePath ?? null;

  if (input.contentBase64) {
    const cleanBase64 = input.contentBase64.replace(/^data:[^;]+;base64,/, '').trim();
    fileBuffer = Buffer.from(cleanBase64, 'base64');
    originalFileName =
      input.fileName?.trim() ||
      (input.filePath ? path.basename(input.filePath) : '') ||
      (input.title ? `${input.title.trim()}.txt` : 'documento.txt');
  } else if (input.filePath) {
    if (!fs.existsSync(input.filePath)) {
      throw new Error(`No se encontró el archivo: ${input.filePath}`);
    }
    const stat = fs.statSync(input.filePath);
    if (!stat.isFile()) {
      throw new Error(`La ruta no corresponde a un archivo válido: ${input.filePath}`);
    }
    fileBuffer = fs.readFileSync(input.filePath);
    originalFileName = input.fileName?.trim() || path.basename(input.filePath);
    originalPath = input.filePath;
  } else {
    return { canceled: true, source: null };
  }

  assertAllowedExtension(originalFileName);

  const extracted = extractDocumentPages({
    fileName: originalFileName,
    buffer: fileBuffer,
  });

  const preliminaryChunks = chunkDocumentPages(extracted.pages);
  if (preliminaryChunks.length === 0) {
    throw new Error(
      `No se pudo extraer texto indexable de "${path.basename(originalFileName)}".`
    );
  }

  let storedFilename: string | null = null;
  if (options?.dataDir) {
    const sourcesDir = path.resolve(options.dataDir, 'sources');
    fs.mkdirSync(sourcesDir, { recursive: true });
    storedFilename = `${randomUUID()}-${sanitizeStoredFilename(originalFileName)}`;
    const destPath = path.resolve(sourcesDir, storedFilename);
    fs.writeFileSync(destPath, fileBuffer);
  }

  const title =
    input.title?.trim() ||
    stripFileExtension(originalFileName) ||
    'Fuente sin título';

  const source = createSourceRecord(db, {
    courseId: input.courseId,
    title,
    sourceType: extracted.sourceType,
    originalPath,
    storedFilename,
    rawText: extracted.rawText,
    pageCount: extracted.pageCount,
    indexingStatus: 'indexing',
  });

  const embedder = resolveEmbedder(options?.embedder);
  const indexed = await embedAndSaveChunks(db, source.id, extracted.pages, embedder);
  return { canceled: false, source: indexed };
}

function resolveReadableStoredFile(
  source: Source,
  dataDir?: string
): Buffer | null {
  if (dataDir && source.storedFilename) {
    const safeName = path.basename(source.storedFilename);
    if (safeName === source.storedFilename && safeName !== '.' && safeName !== '..') {
      const sourcesDir = path.resolve(dataDir, 'sources');
      const candidate = path.resolve(sourcesDir, safeName);
      const rel = path.relative(sourcesDir, candidate);
      if (
        rel &&
        !rel.startsWith('..') &&
        !path.isAbsolute(rel) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        return fs.readFileSync(candidate);
      }
    }
  }

  if (
    source.originalPath &&
    fs.existsSync(source.originalPath) &&
    fs.statSync(source.originalPath).isFile()
  ) {
    return fs.readFileSync(source.originalPath);
  }

  return null;
}

export async function reindexSourceService(
  db: DatabaseSync,
  sourceId: string,
  options?: { dataDir?: string; embedder?: SourceEmbedder }
): Promise<Source> {
  const source = getSourceById(db, sourceId);
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  markSourceIndexingStatus(db, sourceId, 'indexing', null);

  const fileBuffer = resolveReadableStoredFile(source, options?.dataDir);
  const pages = fileBuffer
    ? extractDocumentPages({
        sourceType: source.sourceType,
        buffer: fileBuffer,
      }).pages
    : extractDocumentPages({
        sourceType: source.sourceType === 'pdf' ? 'txt' : source.sourceType,
        text: source.rawText,
      }).pages;

  const embedder = resolveEmbedder(options?.embedder);
  return embedAndSaveChunks(db, sourceId, pages, embedder);
}

export async function searchSourceChunksService(
  db: DatabaseSync,
  input: SearchSourceChunksInput,
  options?: { embedder?: SourceEmbedder }
): Promise<SourceChunkSearchResult[]> {
  const query = (input.query ?? '').trim();
  if (!query) {
    return [];
  }

  let queryEmbedding: Float32Array | null = null;
  try {
    const embedder = resolveEmbedder(options?.embedder);
    const result = await embedder([query]);
    queryEmbedding = result.embeddings[0] ?? null;
  } catch {
    // Allow FTS5 lexical search to continue even if the embedding backend is temporarily unavailable.
    queryEmbedding = null;
  }

  return searchCourseChunksHybrid(db, {
    courseId: input.courseId,
    query,
    queryEmbedding,
    limit: input.limit,
  });
}
