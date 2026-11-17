import zlib from 'node:zlib';
import {
  extractPagesFromPdfBuffer,
  type ExtractedPage,
} from '../../shared/pdfExtractor.js';
import type { SourceType } from '../types.js';

export type { ExtractedPage };

export interface ExtractDocumentPagesInput {
  fileName?: string;
  sourceType?: SourceType;
  buffer?: Buffer;
  text?: string;
}

export interface ExtractDocumentPagesResult {
  sourceType: SourceType;
  rawText: string;
  pageCount: number;
  pages: ExtractedPage[];
}

export interface ChunkDocumentPagesOptions {
  maxChars?: number;
  overlapChars?: number;
}

export interface DocumentChunkItem {
  chunkIndex: number;
  pageNumber: number;
  content: string;
}

function decompressPdfFlate(compressed: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(zlib.inflateSync(compressed));
  } catch {
    return new Uint8Array(zlib.inflateRawSync(compressed));
  }
}

export function detectSourceTypeFromFilename(fileName?: string): SourceType {
  const lower = (fileName ?? '').trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.txt')) return 'txt';
  return 'pasted_text';
}

export function extractDocumentPages(
  input: ExtractDocumentPagesInput
): ExtractDocumentPagesResult {
  const sourceType =
    input.sourceType ?? detectSourceTypeFromFilename(input.fileName);

  if (sourceType === 'pdf') {
    const bufferData =
      input.buffer !== undefined
        ? new Uint8Array(
            input.buffer.buffer,
            input.buffer.byteOffset,
            input.buffer.byteLength
          )
        : Buffer.from(input.text ?? '', 'utf8');
    const extracted = extractPagesFromPdfBuffer(bufferData, decompressPdfFlate);
    return {
      sourceType: 'pdf',
      rawText: extracted.rawText,
      pageCount: extracted.pages.length,
      pages: extracted.pages,
    };
  }

  let decodedText = '';
  if (input.text !== undefined) {
    decodedText = input.text;
  } else if (input.buffer !== undefined) {
    decodedText = input.buffer.toString('utf8');
  }

  // Strip UTF-8 BOM if present and normalize line endings
  const clean = decodedText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rawSegments = clean.includes('\f') ? clean.split('\f') : [clean];
  const pages: ExtractedPage[] = rawSegments.map((segment, idx) => ({
    pageNumber: idx + 1,
    text: segment.trim(),
  }));

  const safePages = pages.length > 0 ? pages : [{ pageNumber: 1, text: '' }];
  const rawText = safePages
    .map((p) => p.text)
    .filter((t) => t.length > 0)
    .join('\n\n');

  return {
    sourceType,
    rawText,
    pageCount: safePages.length,
    pages: safePages,
  };
}

function findPreferredSplit(text: string, minSplit: number, hardEnd: number): number {
  const paraIdx = text.lastIndexOf('\n\n', hardEnd);
  if (paraIdx >= minSplit) {
    return paraIdx;
  }

  const nlIdx = text.lastIndexOf('\n', hardEnd);
  if (nlIdx >= minSplit) {
    return nlIdx;
  }

  for (let i = hardEnd - 1; i >= minSplit; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === '!' || ch === '?') && i + 1 < text.length && /\s/.test(text[i + 1])) {
      return i + 1;
    }
  }

  for (let i = hardEnd - 1; i >= minSplit; i--) {
    if (/\s/.test(text[i])) {
      return i;
    }
  }

  return hardEnd;
}

export function chunkDocumentPages(
  pages: ExtractedPage[],
  options?: ChunkDocumentPagesOptions
): DocumentChunkItem[] {
  const maxChars = Math.max(1, Math.floor(options?.maxChars ?? 800));
  const overlapChars = Math.max(
    0,
    Math.min(maxChars - 1, Math.floor(options?.overlapChars ?? 120))
  );

  const chunks: DocumentChunkItem[] = [];
  let nextChunkIndex = 0;

  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  for (const page of sortedPages) {
    const normalizedText = (page.text ?? '').replace(/\r\n?/g, '\n').trim();
    if (!normalizedText) {
      continue;
    }

    if (normalizedText.length <= maxChars) {
      chunks.push({
        chunkIndex: nextChunkIndex++,
        pageNumber: page.pageNumber,
        content: normalizedText,
      });
      continue;
    }

    let start = 0;
    while (start < normalizedText.length) {
      const hardEnd = Math.min(normalizedText.length, start + maxChars);
      let splitPos = hardEnd;

      if (hardEnd < normalizedText.length) {
        const minSplit = start + Math.max(1, Math.floor(maxChars * 0.4));
        splitPos = findPreferredSplit(normalizedText, minSplit, hardEnd);
      }

      const piece = normalizedText.slice(start, splitPos).trim();
      if (piece.length > 0) {
        chunks.push({
          chunkIndex: nextChunkIndex++,
          pageNumber: page.pageNumber,
          content: piece,
        });
      }

      if (splitPos >= normalizedText.length) {
        break;
      }

      let nextStart = Math.max(start + 1, splitPos - overlapChars);
      if (
        nextStart > start &&
        nextStart < splitPos &&
        !/\s/.test(normalizedText[nextStart - 1])
      ) {
        const relSpace = normalizedText.slice(nextStart, splitPos).search(/\s/);
        if (relSpace !== -1 && nextStart + relSpace + 1 < splitPos) {
          nextStart = nextStart + relSpace + 1;
        }
      }

      while (nextStart < normalizedText.length && /\s/.test(normalizedText[nextStart])) {
        nextStart++;
      }

      start = nextStart > start ? nextStart : splitPos;
    }
  }

  return chunks;
}
