import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  Source,
  SourceChunk,
  SourceChunkSearchResult,
  SourceIndexingStatus,
  SourceType,
  SourceWithChunks,
} from '../types.js';
import { buildSafeFtsQuery } from './notesRepo.js';

const RRF_K = 60;

const VALID_SOURCE_TYPES = new Set<SourceType>([
  'pdf',
  'markdown',
  'txt',
  'pasted_text',
]);

const VALID_INDEXING_STATUSES = new Set<SourceIndexingStatus>([
  'pending',
  'indexing',
  'ready',
  'error',
]);

interface SourceRow {
  id: string;
  course_id: string;
  title: string;
  source_type: SourceType;
  original_path: string | null;
  stored_filename: string | null;
  raw_text: string;
  page_count: number | bigint;
  char_count: number | bigint;
  chunk_count?: number | bigint;
  indexing_status: SourceIndexingStatus;
  indexing_error: string | null;
  embedding_model: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceChunkRow {
  id: string;
  source_id: string;
  course_id: string;
  chunk_index: number | bigint;
  page_number: number | bigint | null;
  content: string;
  embedding_dim: number | bigint | null;
}

interface SourceChunkWithEmbeddingRow extends SourceChunkRow {
  embedding: Uint8Array | null;
  source_title: string;
  source_type: SourceType;
}

interface FtsChunkMatchRow extends SourceChunkRow {
  source_title: string;
  source_type: SourceType;
  raw_bm25: number;
}

export interface CreateSourceRecordInput {
  id?: string;
  courseId: string;
  title: string;
  sourceType: SourceType;
  originalPath?: string | null;
  storedFilename?: string | null;
  rawText: string;
  pageCount: number;
  indexingStatus?: SourceIndexingStatus;
  embeddingModel?: string | null;
}

export interface SaveSourceChunkInput {
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
  embedding: Float32Array | null;
}

export interface HybridChunkSearchInput {
  courseId: string;
  query: string;
  queryEmbedding?: Float32Array | null;
  limit?: number;
}

/**
 * Serializes a Float32Array into a tightly sliced Uint8Array copy suitable for SQLite BLOB storage.
 */
export function float32ToBlob(vec: Float32Array): Uint8Array {
  const view = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

/**
 * Deserializes a SQLite BLOB (Uint8Array or Node Buffer) into an aligned Float32Array copy.
 */
export function blobToFloat32(blob: Uint8Array | Buffer): Float32Array {
  const alignedBytes = blob.byteLength - (blob.byteLength % 4);
  if (alignedBytes <= 0) {
    return new Float32Array(0);
  }
  const copy = new Uint8Array(alignedBytes);
  copy.set(new Uint8Array(blob.buffer, blob.byteOffset, alignedBytes));
  return new Float32Array(copy.buffer);
}

/**
 * Computes cosine similarity between two vectors, returning 0 on dimension mismatch, emptiness, or zero norm.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0 || !Number.isFinite(denom)) {
    return 0;
  }

  const similarity = dot / denom;
  return Number.isFinite(similarity) ? similarity : 0;
}

function assertCourseExists(db: DatabaseSync, rawCourseId: string): string {
  const courseId = (rawCourseId ?? '').trim();
  if (!courseId) {
    throw new Error('Course ID is required');
  }
  const row = db
    .prepare('SELECT id FROM courses WHERE id = ?')
    .get(courseId) as { id: string } | undefined;
  if (!row) {
    throw new Error(`Course not found: ${courseId}`);
  }
  return courseId;
}

function validateSourceTitle(rawTitle: string): string {
  const title = (rawTitle ?? '').trim();
  if (!title) {
    throw new Error('Source title cannot be empty');
  }
  return title;
}

function validateSourceType(rawType: SourceType): SourceType {
  if (!VALID_SOURCE_TYPES.has(rawType)) {
    throw new Error(
      `Invalid source type "${String(rawType)}". Expected 'pdf', 'markdown', 'txt', or 'pasted_text'.`
    );
  }
  return rawType;
}

function validateIndexingStatus(
  status: SourceIndexingStatus | undefined,
  fallback: SourceIndexingStatus
): SourceIndexingStatus {
  const resolved = status ?? fallback;
  if (!VALID_INDEXING_STATUSES.has(resolved)) {
    throw new Error(
      `Invalid indexing status "${String(status)}". Expected 'pending', 'indexing', 'ready', or 'error'.`
    );
  }
  return resolved;
}

function mapSourceRow(row: SourceRow): Source {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    sourceType: row.source_type,
    originalPath: row.original_path ?? null,
    storedFilename: row.stored_filename ?? null,
    rawText: row.raw_text ?? '',
    pageCount: Number(row.page_count ?? 1),
    charCount: Number(row.char_count ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    indexingStatus: row.indexing_status,
    indexingError: row.indexing_error ?? null,
    embeddingModel: row.embedding_model ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChunkRow(row: SourceChunkRow): SourceChunk {
  return {
    id: row.id,
    sourceId: row.source_id,
    courseId: row.course_id,
    chunkIndex: Number(row.chunk_index),
    pageNumber: row.page_number !== null && row.page_number !== undefined
      ? Number(row.page_number)
      : null,
    content: row.content,
    embeddingDim:
      row.embedding_dim !== null && row.embedding_dim !== undefined
        ? Number(row.embedding_dim)
        : null,
  };
}

export function listSourcesByCourse(db: DatabaseSync, courseId: string): Source[] {
  const rows = db
    .prepare(
      `SELECT
         s.*,
         COUNT(sc.id) AS chunk_count
       FROM sources s
       LEFT JOIN source_chunks sc ON sc.source_id = s.id
       WHERE s.course_id = ?
       GROUP BY s.id
       ORDER BY s.created_at DESC, s.rowid DESC`
    )
    .all(courseId) as unknown as SourceRow[];

  return rows.map(mapSourceRow);
}

export function getSourceById(db: DatabaseSync, sourceId: string): Source | null {
  const row = db
    .prepare(
      `SELECT
         s.*,
         COUNT(sc.id) AS chunk_count
       FROM sources s
       LEFT JOIN source_chunks sc ON sc.source_id = s.id
       WHERE s.id = ?
       GROUP BY s.id`
    )
    .get(sourceId) as SourceRow | undefined;

  return row ? mapSourceRow(row) : null;
}

export function getSourceWithChunks(
  db: DatabaseSync,
  sourceId: string
): SourceWithChunks | null {
  const source = getSourceById(db, sourceId);
  if (!source) {
    return null;
  }

  const chunkRows = db
    .prepare(
      `SELECT id, source_id, course_id, chunk_index, page_number, content, embedding_dim
       FROM source_chunks
       WHERE source_id = ?
       ORDER BY chunk_index ASC`
    )
    .all(sourceId) as unknown as SourceChunkRow[];

  const chunks = chunkRows.map(mapChunkRow);
  return {
    ...source,
    chunkCount: chunks.length,
    chunks,
  };
}

export function createSourceRecord(
  db: DatabaseSync,
  input: CreateSourceRecordInput
): Source {
  const courseId = assertCourseExists(db, input.courseId);
  const title = validateSourceTitle(input.title);
  const sourceType = validateSourceType(input.sourceType);
  const indexingStatus = validateIndexingStatus(input.indexingStatus, 'pending');
  const id = input.id?.trim() || randomUUID();
  const rawText = typeof input.rawText === 'string' ? input.rawText : '';
  const charCount = rawText.length;
  const pageCount = Math.max(1, Math.floor(Number(input.pageCount || 1)));
  const originalPath = input.originalPath ?? null;
  const storedFilename = input.storedFilename ?? null;
  const embeddingModel = input.embeddingModel ?? null;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sources (
       id,
       course_id,
       title,
       source_type,
       original_path,
       stored_filename,
       raw_text,
       page_count,
       char_count,
       indexing_status,
       indexing_error,
       embedding_model,
       created_at,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(
    id,
    courseId,
    title,
    sourceType,
    originalPath,
    storedFilename,
    rawText,
    pageCount,
    charCount,
    indexingStatus,
    embeddingModel,
    now,
    now
  );

  const created = getSourceById(db, id);
  if (!created) {
    throw new Error('Failed to load created source');
  }
  return created;
}

export function saveSourceChunksAndMarkReady(
  db: DatabaseSync,
  sourceId: string,
  chunks: SaveSourceChunkInput[],
  embeddingModel: string
): Source {
  const existing = getSourceById(db, sourceId);
  if (!existing) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare('DELETE FROM source_chunks WHERE source_id = ?').run(sourceId);

    const insertChunkStmt = db.prepare(
      `INSERT INTO source_chunks (
         id,
         source_id,
         course_id,
         chunk_index,
         page_number,
         content,
         embedding,
         embedding_dim
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const chunk of chunks) {
      const chunkId = randomUUID();
      const embeddingBlob = chunk.embedding ? float32ToBlob(chunk.embedding) : null;
      const embeddingDim = chunk.embedding ? chunk.embedding.length : null;
      insertChunkStmt.run(
        chunkId,
        sourceId,
        existing.courseId,
        Math.floor(chunk.chunkIndex),
        chunk.pageNumber !== null && chunk.pageNumber !== undefined
          ? Math.floor(chunk.pageNumber)
          : null,
        chunk.content,
        embeddingBlob,
        embeddingDim
      );
    }

    db.prepare(
      `UPDATE sources
       SET indexing_status = 'ready',
           indexing_error = NULL,
           embedding_model = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(embeddingModel, now, sourceId);

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  const updated = getSourceById(db, sourceId);
  if (!updated) {
    throw new Error(`Source not found after saving chunks: ${sourceId}`);
  }
  return updated;
}

export function markSourceIndexingStatus(
  db: DatabaseSync,
  sourceId: string,
  status: SourceIndexingStatus,
  errorMessage?: string | null
): void {
  const validStatus = validateIndexingStatus(status, 'pending');
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE sources
     SET indexing_status = ?,
         indexing_error = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(validStatus, errorMessage ?? null, now, sourceId);
}

function removeStoredSourceFile(dataDir: string, storedFilename: string): void {
  const safeBaseName = path.basename(storedFilename);
  if (
    !storedFilename ||
    safeBaseName !== storedFilename ||
    safeBaseName === '.' ||
    safeBaseName === '..'
  ) {
    return;
  }

  const sourcesDir = path.resolve(dataDir, 'sources');
  const candidatePath = path.resolve(sourcesDir, safeBaseName);
  const rel = path.relative(sourcesDir, candidatePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return;
  }

  if (fs.existsSync(candidatePath)) {
    fs.unlinkSync(candidatePath);
  }
}

export function deleteSource(
  db: DatabaseSync,
  sourceId: string,
  dataDir?: string
): void {
  const row = db
    .prepare('SELECT stored_filename FROM sources WHERE id = ?')
    .get(sourceId) as { stored_filename: string | null } | undefined;

  db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);

  if (dataDir && row?.stored_filename) {
    removeStoredSourceFile(dataDir, row.stored_filename);
  }
}

function buildOrFallbackFtsQuery(rawQuery: string): string | null {
  const tokens = rawQuery
    .trim()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  if (tokens.length < 3) {
    return null;
  }

  return tokens
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' OR ');
}

function runFtsChunkQuery(
  db: DatabaseSync,
  courseId: string,
  ftsQuery: string,
  limit: number
): FtsChunkMatchRow[] {
  return db
    .prepare(
      `SELECT
         sc.id,
         sc.source_id,
         sc.course_id,
         sc.chunk_index,
         sc.page_number,
         sc.content,
         sc.embedding_dim,
         s.title AS source_title,
         s.source_type,
         bm25(source_chunks_fts) AS raw_bm25
       FROM source_chunks_fts
       INNER JOIN source_chunks sc ON sc.id = source_chunks_fts.chunk_id
       INNER JOIN sources s ON s.id = sc.source_id
       WHERE source_chunks_fts MATCH ?
         AND sc.course_id = ?
       ORDER BY raw_bm25 ASC, sc.chunk_index ASC
       LIMIT ?`
    )
    .all(ftsQuery, courseId, limit) as unknown as FtsChunkMatchRow[];
}

export function searchCourseChunksHybrid(
  db: DatabaseSync,
  input: HybridChunkSearchInput
): SourceChunkSearchResult[] {
  const courseId = (input.courseId ?? '').trim();
  if (!courseId) {
    return [];
  }

  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 8)));
  const rawQuery = (input.query ?? '').trim();
  const queryEmbedding = input.queryEmbedding ?? null;
  const hasVectorQuery = Boolean(queryEmbedding && queryEmbedding.length > 0);

  if (!rawQuery && !hasVectorQuery) {
    return [];
  }

  interface CandidateEntry {
    chunk: SourceChunk;
    sourceTitle: string;
    sourceType: SourceType;
    vectorScore: number;
    ftsScore: number;
    vectorRank: number | null;
    ftsRank: number | null;
  }

  const candidates = new Map<string, CandidateEntry>();
  const ftsLimit = Math.max(limit * 4, 40);

  const ftsQuery = buildSafeFtsQuery(rawQuery);
  if (ftsQuery) {
    let ftsRows = runFtsChunkQuery(db, courseId, ftsQuery, ftsLimit);
    if (ftsRows.length === 0) {
      const orQuery = buildOrFallbackFtsQuery(rawQuery);
      if (orQuery) {
        ftsRows = runFtsChunkQuery(db, courseId, orQuery, ftsLimit);
      }
    }

    for (let i = 0; i < ftsRows.length; i++) {
      const row = ftsRows[i];
      const rank = i + 1;
      const rawBm25 = Number(row.raw_bm25 ?? 0);
      const normalizedFtsScore =
        rawBm25 < 0 ? -rawBm25 / (1 + -rawBm25) : 1 / rank;

      candidates.set(row.id, {
        chunk: mapChunkRow(row),
        sourceTitle: row.source_title,
        sourceType: row.source_type,
        vectorScore: 0,
        ftsScore: normalizedFtsScore,
        vectorRank: null,
        ftsRank: rank,
      });
    }
  }

  if (queryEmbedding && queryEmbedding.length > 0) {
    const chunkRows = db
      .prepare(
        `SELECT
           sc.id,
           sc.source_id,
           sc.course_id,
           sc.chunk_index,
           sc.page_number,
           sc.content,
           sc.embedding,
           sc.embedding_dim,
           s.title AS source_title,
           s.source_type
         FROM source_chunks sc
         INNER JOIN sources s ON s.id = sc.source_id
         WHERE sc.course_id = ?
           AND sc.embedding IS NOT NULL
           AND sc.embedding_dim = ?`
      )
      .all(courseId, queryEmbedding.length) as unknown as SourceChunkWithEmbeddingRow[];

    const scoredVectorRows: Array<{
      row: SourceChunkWithEmbeddingRow;
      similarity: number;
    }> = [];

    for (const row of chunkRows) {
      if (!row.embedding) {
        continue;
      }
      const vec = blobToFloat32(row.embedding);
      if (vec.length !== queryEmbedding.length) {
        continue;
      }
      const similarity = cosineSimilarity(queryEmbedding, vec);
      if (similarity > 0) {
        scoredVectorRows.push({ row, similarity });
      }
    }

    scoredVectorRows.sort((a, b) => {
      if (b.similarity !== a.similarity) {
        return b.similarity - a.similarity;
      }
      return Number(a.row.chunk_index) - Number(b.row.chunk_index);
    });

    for (let i = 0; i < scoredVectorRows.length; i++) {
      const { row, similarity } = scoredVectorRows[i];
      const rank = i + 1;
      const existing = candidates.get(row.id);
      if (existing) {
        existing.vectorScore = similarity;
        existing.vectorRank = rank;
      } else {
        candidates.set(row.id, {
          chunk: mapChunkRow(row),
          sourceTitle: row.source_title,
          sourceType: row.source_type,
          vectorScore: similarity,
          ftsScore: 0,
          vectorRank: rank,
          ftsRank: null,
        });
      }
    }
  }

  const results: SourceChunkSearchResult[] = [];
  for (const entry of candidates.values()) {
    const score =
      (entry.vectorRank !== null ? 1 / (RRF_K + entry.vectorRank) : 0) +
      (entry.ftsRank !== null ? 1 / (RRF_K + entry.ftsRank) : 0);

    if (score > 0) {
      results.push({
        chunk: entry.chunk,
        sourceTitle: entry.sourceTitle,
        sourceType: entry.sourceType,
        score,
        vectorScore: entry.vectorScore,
        ftsScore: entry.ftsScore,
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const signalDiff = b.vectorScore + b.ftsScore - (a.vectorScore + a.ftsScore);
    if (signalDiff !== 0) {
      return signalDiff;
    }
    return a.chunk.chunkIndex - b.chunk.chunkIndex;
  });

  return results.slice(0, limit);
}
