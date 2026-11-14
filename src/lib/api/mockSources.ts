import type {
  CreateSourceFromTextInput,
  ImportSourceFileInput,
  ImportSourceFileResult,
  SearchSourceChunksInput,
  Source,
  SourceChunk,
  SourceChunkSearchResult,
  SourceType,
  SourceWithChunks,
} from '../../types/domain';
import {
  buildSyntheticPdfBuffer,
  extractPagesFromPdfBuffer,
  type PdfPageText,
} from '../pdf';

const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt'] as const;
const RRF_K = 60;
const MOCK_EMBEDDING_MODEL = 'local-fnv1a-128';

interface StoredMockSource extends SourceWithChunks {
  embeddings: Float32Array[];
}

let sourcesStore: StoredMockSource[] = [];
let nextSourceSeq = 1;

function fnv1aHash(input: string, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function tokenizeNormalized(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

function computeMockEmbedding(text: string, dim = 128): Float32Array {
  const vec = new Float32Array(dim);
  const tokens = tokenizeNormalized(text);
  if (tokens.length === 0) {
    return vec;
  }

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
        addFeature(`c3:${token.slice(j, j + 3)}`, 0.15);
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

function mockCosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function detectSourceType(fileName?: string): SourceType {
  const lower = (fileName ?? '').trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.txt')) return 'txt';
  return 'pasted_text';
}

function extractBaseName(filePathOrName: string): string {
  const parts = filePathOrName.split(/[/\\]/);
  return parts[parts.length - 1] || filePathOrName;
}

function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

function decodeBase64ToBytes(base64Input: string): Uint8Array {
  const clean = base64Input.replace(/^data:[^;]+;base64,/, '').trim();
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function findSplitPoint(text: string, minSplit: number, hardEnd: number): number {
  const paraIdx = text.lastIndexOf('\n\n', hardEnd);
  if (paraIdx >= minSplit) return paraIdx;

  const lineIdx = text.lastIndexOf('\n', hardEnd);
  if (lineIdx >= minSplit) return lineIdx;

  for (let i = hardEnd - 1; i >= minSplit; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === '!' || ch === '?') && i + 1 < text.length && /\s/.test(text[i + 1])) {
      return i + 1;
    }
  }

  for (let i = hardEnd - 1; i >= minSplit; i--) {
    if (/\s/.test(text[i])) return i;
  }

  return hardEnd;
}

function chunkMockPages(
  pages: PdfPageText[],
  maxChars = 800,
  overlapChars = 120
): Array<{ chunkIndex: number; pageNumber: number; content: string }> {
  const chunks: Array<{ chunkIndex: number; pageNumber: number; content: string }> = [];
  let nextIndex = 0;
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  for (const page of sorted) {
    const text = page.text.replace(/\r\n?/g, '\n').trim();
    if (!text) continue;

    if (text.length <= maxChars) {
      chunks.push({
        chunkIndex: nextIndex++,
        pageNumber: page.pageNumber,
        content: text,
      });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      const hardEnd = Math.min(text.length, start + maxChars);
      let splitPos = hardEnd;
      if (hardEnd < text.length) {
        const minSplit = start + Math.max(1, Math.floor(maxChars * 0.4));
        splitPos = findSplitPoint(text, minSplit, hardEnd);
      }

      const piece = text.slice(start, splitPos).trim();
      if (piece) {
        chunks.push({
          chunkIndex: nextIndex++,
          pageNumber: page.pageNumber,
          content: piece,
        });
      }

      if (splitPos >= text.length) break;

      let nextStart = Math.max(start + 1, splitPos - overlapChars);
      while (nextStart < text.length && /\s/.test(text[nextStart])) {
        nextStart++;
      }
      start = nextStart > start ? nextStart : splitPos;
    }
  }

  return chunks;
}

function createStoredSourceFromPages(params: {
  id?: string;
  courseId: string;
  title: string;
  sourceType: SourceType;
  originalPath?: string | null;
  storedFilename?: string | null;
  rawText: string;
  pageCount: number;
  pages: PdfPageText[];
  createdAt?: string;
}): StoredMockSource {
  const id = params.id ?? `src-${nextSourceSeq++}`;
  const chunkItems = chunkMockPages(params.pages);
  if (chunkItems.length === 0) {
    throw new Error('La fuente no contiene texto indexable.');
  }

  const now = params.createdAt ?? new Date().toISOString();
  const chunks: SourceChunk[] = [];
  const embeddings: Float32Array[] = [];

  for (const item of chunkItems) {
    const embedding = computeMockEmbedding(item.content);
    chunks.push({
      id: `${id}-chunk-${item.chunkIndex}`,
      sourceId: id,
      courseId: params.courseId,
      chunkIndex: item.chunkIndex,
      pageNumber: item.pageNumber,
      content: item.content,
      embeddingDim: embedding.length,
    });
    embeddings.push(embedding);
  }

  return {
    id,
    courseId: params.courseId,
    title: params.title,
    sourceType: params.sourceType,
    originalPath: params.originalPath ?? null,
    storedFilename: params.storedFilename ?? null,
    rawText: params.rawText,
    pageCount: Math.max(1, params.pageCount),
    charCount: params.rawText.length,
    chunkCount: chunks.length,
    indexingStatus: 'ready',
    indexingError: null,
    embeddingModel: MOCK_EMBEDDING_MODEL,
    createdAt: now,
    updatedAt: now,
    chunks,
    embeddings,
  };
}

function toPublicSource(record: StoredMockSource): Source {
  const { chunks: _chunks, embeddings: _embeddings, ...source } = record;
  return structuredClone(source);
}

function toPublicSourceWithChunks(record: StoredMockSource): SourceWithChunks {
  const { embeddings: _embeddings, ...sourceWithChunks } = record;
  return structuredClone(sourceWithChunks);
}

function seedDefaultMockSources(): void {
  nextSourceSeq = 1;
  const pdfBytes = buildSyntheticPdfBuffer([
    'Ingenieria de Requerimientos: definicion del alcance, actores e historias de usuario con criterios de aceptacion verificables.',
    'Elicitacion y validacion: entrevistas, talleres JAD y prototipado temprano para reducir ambiguedad funcional.',
    'Trazabilidad de requerimientos: matriz de impacto entre objetivos de negocio, casos de uso y pruebas automatizadas.',
  ]);
  const pdfExtracted = extractPagesFromPdfBuffer(pdfBytes);

  const seededPdf = createStoredSourceFromPages({
    id: 'src-seed-1',
    courseId: 'ing-soft-1',
    title: 'Apuntes Unidad 2 — Ingeniería de Requerimientos',
    sourceType: 'pdf',
    originalPath: null,
    storedFilename: 'seed-unidad2-requerimientos.pdf',
    rawText: pdfExtracted.rawText,
    pageCount: pdfExtracted.pageCount,
    pages: pdfExtracted.pages,
    createdAt: '2026-11-10T10:00:00.000Z',
  });

  const mdText = [
    '# Arquitectura y Calidad de Software',
    '',
    'La cohesión alta y el acoplamiento bajo facilitan el mantenimiento evolutivo y las pruebas unitarias aisladas.',
    '',
    'Patrones frecuentes en cursada: Strategy para intercambiar algoritmos, Observer para propagar eventos de dominio y Repository para desacoplar persistencia SQL.',
  ].join('\n');

  const seededMd = createStoredSourceFromPages({
    id: 'src-seed-2',
    courseId: 'ing-soft-1',
    title: 'Resumen Patrones y Calidad.md',
    sourceType: 'markdown',
    originalPath: null,
    storedFilename: 'seed-patrones-calidad.md',
    rawText: mdText,
    pageCount: 1,
    pages: [{ pageNumber: 1, text: mdText }],
    createdAt: '2026-11-11T14:30:00.000Z',
  });

  sourcesStore = [seededMd, seededPdf];
}

seedDefaultMockSources();

export function resetMockSources(): void {
  seedDefaultMockSources();
}

export function mockCountSourcesByCourse(courseId: string): number {
  return sourcesStore.filter((item) => item.courseId === courseId).length;
}

export function mockDeleteSourcesByCourse(courseId: string): void {
  sourcesStore = sourcesStore.filter((item) => item.courseId !== courseId);
}

export async function mockListSources(courseId: string): Promise<Source[]> {
  return sourcesStore
    .filter((item) => item.courseId === courseId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPublicSource);
}

export async function mockGetSourceWithChunks(
  sourceId: string
): Promise<SourceWithChunks | null> {
  const found = sourcesStore.find((item) => item.id === sourceId);
  return found ? toPublicSourceWithChunks(found) : null;
}

export async function mockCreateSourceFromText(
  input: CreateSourceFromTextInput
): Promise<Source> {
  const title = (input.title ?? '').trim();
  if (!title) {
    throw new Error('El título de la fuente no puede estar vacío.');
  }

  const providedPages =
    input.pages && input.pages.length > 0
      ? input.pages.map((p, idx) => ({
          pageNumber: p.pageNumber >= 1 ? Math.floor(p.pageNumber) : idx + 1,
          text: p.text.replace(/\r\n?/g, '\n').trim(),
        }))
      : null;

  const normalizedText = (input.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalizedText && (!providedPages || providedPages.every((p) => !p.text))) {
    throw new Error('El contenido de la fuente no puede estar vacío.');
  }

  const pages: PdfPageText[] =
    providedPages ??
    (normalizedText.includes('\f')
      ? normalizedText.split('\f').map((segment, idx) => ({
          pageNumber: idx + 1,
          text: segment.trim(),
        }))
      : [{ pageNumber: 1, text: normalizedText }]);

  const rawText =
    normalizedText ||
    pages
      .map((p) => p.text)
      .filter((t) => t.length > 0)
      .join('\n\n');

  const record = createStoredSourceFromPages({
    courseId: input.courseId,
    title,
    sourceType: input.sourceType ?? 'pasted_text',
    originalPath: input.originalPath ?? null,
    storedFilename: null,
    rawText,
    pageCount: input.pageCount ?? pages.length,
    pages,
  });

  sourcesStore.unshift(record);
  return toPublicSource(record);
}

export async function mockImportSourceFile(
  input: ImportSourceFileInput
): Promise<ImportSourceFileResult> {
  if (!input.filePath && !input.contentBase64) {
    return { canceled: true, source: null };
  }

  const rawName =
    input.fileName?.trim() ||
    (input.filePath ? extractBaseName(input.filePath) : '') ||
    (input.title ? `${input.title.trim()}.txt` : 'documento.txt');

  const lower = rawName.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new Error(
      'Formato no soportado. Formatos permitidos: .pdf, .md, .markdown, .txt.'
    );
  }

  const sourceType = detectSourceType(rawName);
  const title = input.title?.trim() || stripExtension(rawName) || 'Fuente sin título';

  let pages: PdfPageText[];
  let rawText: string;
  let pageCount: number;

  if (input.contentBase64) {
    const bytes = decodeBase64ToBytes(input.contentBase64);
    if (sourceType === 'pdf') {
      const extracted = extractPagesFromPdfBuffer(bytes);
      pages = extracted.pages;
      rawText = extracted.rawText;
      pageCount = extracted.pageCount;
    } else {
      const text = new TextDecoder('utf-8')
        .decode(bytes)
        .replace(/^\uFEFF/, '')
        .replace(/\r\n?/g, '\n');
      const segments = text.includes('\f') ? text.split('\f') : [text];
      pages = segments.map((seg, idx) => ({
        pageNumber: idx + 1,
        text: seg.trim(),
      }));
      rawText = pages
        .map((p) => p.text)
        .filter((t) => t.length > 0)
        .join('\n\n');
      pageCount = pages.length;
    }
  } else {
    const fallbackText = `Contenido importado desde ${rawName}`;
    pages = [{ pageNumber: 1, text: fallbackText }];
    rawText = fallbackText;
    pageCount = 1;
  }

  const record = createStoredSourceFromPages({
    courseId: input.courseId,
    title,
    sourceType,
    originalPath: input.filePath ?? null,
    storedFilename: `mock-${rawName}`,
    rawText,
    pageCount,
    pages,
  });

  sourcesStore.unshift(record);
  return { canceled: false, source: toPublicSource(record) };
}

export async function mockReindexSource(sourceId: string): Promise<Source> {
  const idx = sourcesStore.findIndex((item) => item.id === sourceId);
  if (idx === -1) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const current = sourcesStore[idx];
  const pagesByNum = new Map<number, string[]>();
  for (const chunk of current.chunks) {
    const pageNo = chunk.pageNumber ?? 1;
    const list = pagesByNum.get(pageNo) ?? [];
    list.push(chunk.content);
    pagesByNum.set(pageNo, list);
  }

  const pages: PdfPageText[] =
    pagesByNum.size > 0 && current.pageCount > 1
      ? Array.from(pagesByNum.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([pageNumber, parts]) => ({
            pageNumber,
            text: parts.join('\n\n'),
          }))
      : [{ pageNumber: 1, text: current.rawText }];

  const rebuilt = createStoredSourceFromPages({
    id: current.id,
    courseId: current.courseId,
    title: current.title,
    sourceType: current.sourceType,
    originalPath: current.originalPath,
    storedFilename: current.storedFilename,
    rawText: current.rawText,
    pageCount: current.pageCount,
    pages,
    createdAt: current.createdAt,
  });

  rebuilt.updatedAt = new Date().toISOString();
  sourcesStore[idx] = rebuilt;
  return toPublicSource(rebuilt);
}

export async function mockDeleteSource(sourceId: string): Promise<void> {
  sourcesStore = sourcesStore.filter((item) => item.id !== sourceId);
}

export async function mockSearchSourceChunks(
  input: SearchSourceChunksInput
): Promise<SourceChunkSearchResult[]> {
  const query = (input.query ?? '').trim();
  if (!query) {
    return [];
  }

  const limit = Math.max(1, Math.floor(input.limit ?? 8));
  const queryTokens = tokenizeNormalized(query);
  const queryEmbedding = computeMockEmbedding(query);

  const courseSources = sourcesStore.filter(
    (src) => src.courseId === input.courseId
  );

  interface Candidate {
    chunk: SourceChunk;
    sourceTitle: string;
    sourceType: SourceType;
    vectorScore: number;
    ftsScore: number;
    vectorRank: number | null;
    ftsRank: number | null;
  }

  const allCandidates: Candidate[] = [];

  for (const src of courseSources) {
    for (let i = 0; i < src.chunks.length; i++) {
      const chunk = src.chunks[i];
      const emb = src.embeddings[i];
      const normalizedContent = normalizeSearchText(chunk.content);

      const matchedTokens = queryTokens.filter((token) =>
        normalizedContent.includes(token)
      );
      const allMatched =
        queryTokens.length > 0 && matchedTokens.length === queryTokens.length;
      const ftsScore = allMatched
        ? 1
        : queryTokens.length >= 3 && matchedTokens.length > 0
          ? matchedTokens.length / queryTokens.length
          : 0;

      const rawVectorScore = emb
        ? Math.max(0, mockCosineSimilarity(queryEmbedding, emb))
        : 0;
      const vectorScore = ftsScore > 0 || rawVectorScore >= 0.3 ? rawVectorScore : 0;

      if (ftsScore > 0 || vectorScore > 0) {
        allCandidates.push({
          chunk,
          sourceTitle: src.title,
          sourceType: src.sourceType,
          vectorScore,
          ftsScore,
          vectorRank: null,
          ftsRank: null,
        });
      }
    }
  }

  const ftsSorted = allCandidates
    .filter((c) => c.ftsScore > 0)
    .sort((a, b) => b.ftsScore - a.ftsScore || a.chunk.chunkIndex - b.chunk.chunkIndex);
  ftsSorted.forEach((entry, index) => {
    entry.ftsRank = index + 1;
  });

  const vectorSorted = allCandidates
    .filter((c) => c.vectorScore > 0)
    .sort((a, b) => b.vectorScore - a.vectorScore || a.chunk.chunkIndex - b.chunk.chunkIndex);
  vectorSorted.forEach((entry, index) => {
    entry.vectorRank = index + 1;
  });

  const ranked = allCandidates
    .map((entry) => {
      const score =
        (entry.vectorRank !== null ? 1 / (RRF_K + entry.vectorRank) : 0) +
        (entry.ftsRank !== null ? 1 / (RRF_K + entry.ftsRank) : 0);
      return {
        chunk: structuredClone(entry.chunk),
        sourceTitle: entry.sourceTitle,
        sourceType: entry.sourceType,
        score,
        vectorScore: entry.vectorScore,
        ftsScore: entry.ftsScore,
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.vectorScore + b.ftsScore - (a.vectorScore + a.ftsScore)
    );

  return ranked.slice(0, limit);
}
