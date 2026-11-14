import type {
  CreateSourceFromTextInput,
  ImportSourceFileInput,
  ImportSourceFileResult,
  SearchSourceChunksInput,
  Source,
  SourceChunkSearchResult,
  SourceWithChunks,
} from '../../types/domain';

let sourcesStore: SourceWithChunks[] = [];
let nextSourceSeq = 1;

export function resetMockSources(): void {
  sourcesStore = [];
  nextSourceSeq = 1;
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
    .map(({ chunks: _chunks, ...source }) => structuredClone(source));
}

export async function mockGetSourceWithChunks(
  sourceId: string
): Promise<SourceWithChunks | null> {
  const found = sourcesStore.find((item) => item.id === sourceId);
  return found ? structuredClone(found) : null;
}

export async function mockCreateSourceFromText(
  input: CreateSourceFromTextInput
): Promise<Source> {
  const now = new Date().toISOString();
  const id = `src-${nextSourceSeq++}`;
  const content = input.text.trim();
  const chunkId = `${id}-chunk-0`;
  const record: SourceWithChunks = {
    id,
    courseId: input.courseId,
    title: input.title.trim() || 'Fuente sin título',
    sourceType: input.sourceType ?? 'pasted_text',
    originalPath: input.originalPath ?? null,
    storedFilename: null,
    rawText: content,
    pageCount: input.pageCount ?? 1,
    charCount: content.length,
    chunkCount: 1,
    indexingStatus: 'ready',
    indexingError: null,
    embeddingModel: 'local-hash-v1',
    createdAt: now,
    updatedAt: now,
    chunks: [
      {
        id: chunkId,
        sourceId: id,
        courseId: input.courseId,
        chunkIndex: 0,
        pageNumber: 1,
        content,
        embeddingDim: 128,
      },
    ],
  };
  sourcesStore.unshift(record);
  const { chunks: _chunks, ...source } = record;
  return structuredClone(source);
}

export async function mockImportSourceFile(
  input: ImportSourceFileInput
): Promise<ImportSourceFileResult> {
  if (!input.filePath && !input.contentBase64) {
    return { canceled: true, source: null };
  }
  const source = await mockCreateSourceFromText({
    courseId: input.courseId,
    title: input.title ?? input.fileName ?? 'Documento',
    text: input.fileName ?? input.filePath ?? '',
    sourceType: 'txt',
    originalPath: input.filePath ?? null,
  });
  return { canceled: false, source };
}

export async function mockReindexSource(sourceId: string): Promise<Source> {
  const found = sourcesStore.find((item) => item.id === sourceId);
  if (!found) {
    throw new Error(`Source not found: ${sourceId}`);
  }
  found.indexingStatus = 'ready';
  found.updatedAt = new Date().toISOString();
  const { chunks: _chunks, ...source } = found;
  return structuredClone(source);
}

export async function mockDeleteSource(sourceId: string): Promise<void> {
  sourcesStore = sourcesStore.filter((item) => item.id !== sourceId);
}

export async function mockSearchSourceChunks(
  input: SearchSourceChunksInput
): Promise<SourceChunkSearchResult[]> {
  const query = input.query.trim().toLowerCase();
  if (!query) {
    return [];
  }
  const results: SourceChunkSearchResult[] = [];
  for (const src of sourcesStore) {
    if (src.courseId !== input.courseId) continue;
    for (const chunk of src.chunks) {
      if (chunk.content.toLowerCase().includes(query)) {
        results.push({
          chunk: structuredClone(chunk),
          sourceTitle: src.title,
          sourceType: src.sourceType,
          score: 1,
          vectorScore: 1,
          ftsScore: 1,
        });
      }
    }
  }
  return results.slice(0, input.limit ?? 8);
}
