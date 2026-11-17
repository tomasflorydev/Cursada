export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfExtractionResult {
  pageCount: number;
  pages: PdfPageText[];
  rawText: string;
}

interface PdfObject {
  id: string;
  dictText: string;
  rawBody: string;
  streamBytes: Uint8Array | null;
}

type ToUnicodeMap = {
  maxCodeBytes: number;
  entries: Map<string, string>;
};

type ContentToken =
  | { kind: 'string'; bytes: Uint8Array }
  | { kind: 'array'; items: ContentToken[] }
  | { kind: 'name'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: string };

const WIN_ANSI_EXTENDED: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

export const UNICODE_TO_WIN_ANSI = new Map<number, number>(
  Object.entries(WIN_ANSI_EXTENDED).map(([byteStr, codePoint]) => [
    codePoint,
    Number(byteStr),
  ])
);

function bytesToLatin1(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let result = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode(...slice);
  }
  return result;
}

export function latin1ToBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function decodeWinAnsiBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let utf16 = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code !== 0) {
        utf16 += String.fromCharCode(code);
      }
    }
    return utf16;
  }

  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x80 && b <= 0x9f && WIN_ANSI_EXTENDED[b] !== undefined) {
      out += String.fromCharCode(WIN_ANSI_EXTENDED[b]);
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

function decodeUtf16BeHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0) return '';
  const padded = clean.length % 2 === 1 ? `0${clean}` : clean;
  if (padded.length <= 2) {
    const code = Number.parseInt(padded, 16);
    return Number.isNaN(code) ? '' : String.fromCharCode(code);
  }
  let out = '';
  for (let i = 0; i + 3 < padded.length; i += 4) {
    const code = Number.parseInt(padded.slice(i, i + 4), 16);
    if (!Number.isNaN(code) && code !== 0) {
      out += String.fromCharCode(code);
    }
  }
  if (padded.length % 4 === 2 && out.length === 0) {
    const code = Number.parseInt(padded, 16);
    if (!Number.isNaN(code)) {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

function findMatchingDictEnd(raw: string, openPos: number): number {
  let depth = 0;
  let i = openPos;
  while (i < raw.length - 1) {
    if (raw[i] === '<' && raw[i + 1] === '<') {
      depth++;
      i += 2;
      continue;
    }
    if (raw[i] === '>' && raw[i + 1] === '>') {
      depth--;
      i += 2;
      if (depth <= 0) {
        return i;
      }
      continue;
    }
    if (raw[i] === '(') {
      // Skip literal strings inside dict so << or >> inside strings don't confuse depth
      i++;
      let parenDepth = 1;
      while (i < raw.length && parenDepth > 0) {
        if (raw[i] === '\\') {
          i += 2;
          continue;
        }
        if (raw[i] === '(') parenDepth++;
        else if (raw[i] === ')') parenDepth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return -1;
}

function parsePdfObjects(
  data: Uint8Array,
  raw: string,
  decompressFlate?: (compressed: Uint8Array) => Uint8Array
): Map<string, PdfObject> {
  const objects = new Map<string, PdfObject>();
  const objHeaderRegex = /(\d+)\s+(\d+)\s+obj\b/g;
  let cursor = 0;

  while (cursor < raw.length) {
    objHeaderRegex.lastIndex = cursor;
    const match = objHeaderRegex.exec(raw);
    if (!match) {
      break;
    }

    const objId = `${match[1]} ${match[2]}`;
    const bodyStart = match.index + match[0].length;
    let dictText = '';
    let searchAfterDict = bodyStart;

    // Skip whitespace/comments to inspect dictionary if present
    let pos = bodyStart;
    while (pos < raw.length && /\s/.test(raw[pos])) pos++;
    if (raw[pos] === '<' && raw[pos + 1] === '<') {
      const dictEnd = findMatchingDictEnd(raw, pos);
      if (dictEnd !== -1) {
        dictText = raw.slice(pos, dictEnd);
        searchAfterDict = dictEnd;
      }
    }

    // Check if this object contains a stream right after the dict
    let afterDictPos = searchAfterDict;
    while (afterDictPos < raw.length && /[ \t\r\n]/.test(raw[afterDictPos])) {
      afterDictPos++;
    }

    if (raw.startsWith('stream', afterDictPos)) {
      let streamDataStart = afterDictPos + 6;
      if (raw[streamDataStart] === '\r' && raw[streamDataStart + 1] === '\n') {
        streamDataStart += 2;
      } else if (raw[streamDataStart] === '\n' || raw[streamDataStart] === '\r') {
        streamDataStart += 1;
      }

      let streamEnd = -1;
      const lengthMatch = /\/Length\s+(\d+)(?!\s+\d+\s+R)\b/.exec(dictText);
      if (lengthMatch) {
        const declaredLen = Number(lengthMatch[1]);
        const candidateEnd = streamDataStart + declaredLen;
        if (candidateEnd <= data.length) {
          const tail = raw.slice(candidateEnd, candidateEnd + 20);
          if (/^\s*endstream\b/.test(tail)) {
            streamEnd = candidateEnd;
          }
        }
      }

      if (streamEnd === -1) {
        const endstreamIdx = raw.indexOf('endstream', streamDataStart);
        if (endstreamIdx !== -1) {
          streamEnd = endstreamIdx;
          if (streamEnd > streamDataStart && raw[streamEnd - 1] === '\n') streamEnd--;
          if (streamEnd > streamDataStart && raw[streamEnd - 1] === '\r') streamEnd--;
        }
      }

      if (streamEnd !== -1) {
        const streamBytes = data.subarray(streamDataStart, streamEnd);
        const afterStream = raw.indexOf('endobj', streamEnd);
        const bodyEnd = afterStream !== -1 ? afterStream : streamEnd + 9;
        objects.set(objId, {
          id: objId,
          dictText,
          rawBody: raw.slice(bodyStart, bodyEnd),
          streamBytes,
        });
        cursor = afterStream !== -1 ? afterStream + 6 : bodyEnd;
        continue;
      }
    }

    const endobjIdx = raw.indexOf('endobj', searchAfterDict);
    const bodyEnd = endobjIdx !== -1 ? endobjIdx : raw.length;
    const rawBody = raw.slice(bodyStart, bodyEnd);
    if (!dictText) {
      const inlineDictStart = rawBody.indexOf('<<');
      if (inlineDictStart !== -1) {
        const inlineDictEnd = findMatchingDictEnd(rawBody, inlineDictStart);
        if (inlineDictEnd !== -1) {
          dictText = rawBody.slice(inlineDictStart, inlineDictEnd);
        }
      }
    }

    objects.set(objId, {
      id: objId,
      dictText,
      rawBody,
      streamBytes: null,
    });
    cursor = endobjIdx !== -1 ? endobjIdx + 6 : bodyEnd;
  }

  // Unpack PDF 1.5+ Object Streams (/Type /ObjStm) if flate decompressor is provided
  if (decompressFlate) {
    const extraObjects = new Map<string, PdfObject>();
    for (const obj of objects.values()) {
      if (!/\/Type\s*\/ObjStm\b/.test(obj.dictText) || !obj.streamBytes) {
        continue;
      }
      const nMatch = /\/N\s+(\d+)/.exec(obj.dictText);
      const firstMatch = /\/First\s+(\d+)/.exec(obj.dictText);
      if (!nMatch || !firstMatch) continue;
      const count = Number(nMatch[1]);
      const firstOffset = Number(firstMatch[1]);
      const decodedBytes = maybeDecompressStream(obj, decompressFlate);
      if (!decodedBytes) continue;
      const stmText = bytesToLatin1(decodedBytes);
      const headerTokens = stmText
        .slice(0, firstOffset)
        .trim()
        .split(/\s+/)
        .map(Number);
      const entries: Array<{ num: number; offset: number }> = [];
      for (let i = 0; i < count && i * 2 + 1 < headerTokens.length; i++) {
        entries.push({
          num: headerTokens[i * 2],
          offset: firstOffset + headerTokens[i * 2 + 1],
        });
      }
      for (let i = 0; i < entries.length; i++) {
        const start = entries[i].offset;
        const end = i + 1 < entries.length ? entries[i + 1].offset : stmText.length;
        const rawBody = stmText.slice(start, end).trim();
        let dictText = '';
        const dStart = rawBody.indexOf('<<');
        if (dStart !== -1) {
          const dEnd = findMatchingDictEnd(rawBody, dStart);
          if (dEnd !== -1) dictText = rawBody.slice(dStart, dEnd);
        }
        const id = `${entries[i].num} 0`;
        if (!objects.has(id)) {
          extraObjects.set(id, { id, dictText, rawBody, streamBytes: null });
        }
      }
    }
    for (const [k, v] of extraObjects) {
      objects.set(k, v);
    }
  }

  return objects;
}

function maybeDecompressStream(
  obj: PdfObject,
  decompressFlate?: (compressed: Uint8Array) => Uint8Array
): Uint8Array | null {
  if (!obj.streamBytes) {
    return null;
  }
  const hasFlate = /\/FlateDecode\b|\/Fl\b/.test(obj.dictText);
  if (!hasFlate) {
    return obj.streamBytes;
  }
  if (!decompressFlate) {
    return null;
  }
  try {
    return decompressFlate(obj.streamBytes);
  } catch {
    return null;
  }
}

function parseToUnicodeCMap(cmapText: string): ToUnicodeMap {
  const entries = new Map<string, string>();
  let maxCodeBytes = 1;

  const bfcharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let bfcharMatch: RegExpExecArray | null;
  while ((bfcharMatch = bfcharRegex.exec(cmapText)) !== null) {
    const pairRegex = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let pair: RegExpExecArray | null;
    while ((pair = pairRegex.exec(bfcharMatch[1])) !== null) {
      const src = pair[1].toUpperCase();
      maxCodeBytes = Math.max(maxCodeBytes, Math.ceil(src.length / 2));
      entries.set(src, decodeUtf16BeHex(pair[2]));
    }
  }

  const bfrangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  let bfrangeMatch: RegExpExecArray | null;
  while ((bfrangeMatch = bfrangeRegex.exec(cmapText)) !== null) {
    const block = bfrangeMatch[1];
    const lineRegex =
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    let item: RegExpExecArray | null;
    while ((item = lineRegex.exec(block)) !== null) {
      const startHex = item[1];
      const endHex = item[2];
      const hexWidth = startHex.length;
      maxCodeBytes = Math.max(maxCodeBytes, Math.ceil(hexWidth / 2));
      const startNum = Number.parseInt(startHex, 16);
      const endNum = Number.parseInt(endHex, 16);
      if (Number.isNaN(startNum) || Number.isNaN(endNum) || endNum < startNum) {
        continue;
      }
      // Guard against malformed gigantic ranges
      const span = Math.min(endNum - startNum, 4096);
      if (item[3]) {
        const baseDst = Number.parseInt(item[3], 16);
        if (!Number.isNaN(baseDst)) {
          for (let offset = 0; offset <= span; offset++) {
            const srcKey = (startNum + offset)
              .toString(16)
              .toUpperCase()
              .padStart(hexWidth, '0');
            entries.set(srcKey, String.fromCharCode(baseDst + offset));
          }
        }
      } else if (item[4]) {
        const dstMatches = Array.from(item[4].matchAll(/<([0-9a-fA-F]+)>/g));
        for (let offset = 0; offset <= span && offset < dstMatches.length; offset++) {
          const srcKey = (startNum + offset)
            .toString(16)
            .toUpperCase()
            .padStart(hexWidth, '0');
          entries.set(srcKey, decodeUtf16BeHex(dstMatches[offset][1]));
        }
      }
    }
  }

  return { maxCodeBytes, entries };
}

function resolveResourcesDict(
  dictText: string,
  objects: Map<string, PdfObject>,
  inheritedResourcesText?: string
): string {
  const inlineMatch = /\/Resources\s*<</.exec(dictText);
  if (inlineMatch) {
    const start = inlineMatch.index + inlineMatch[0].length - 2;
    const end = findMatchingDictEnd(dictText, start);
    if (end !== -1) {
      return dictText.slice(start, end);
    }
  }

  const refMatch = /\/Resources\s+(\d+\s+\d+)\s+R\b/.exec(dictText);
  if (refMatch) {
    const resObj = objects.get(refMatch[1]);
    if (resObj) {
      return resObj.dictText || resObj.rawBody;
    }
  }

  return inheritedResourcesText ?? '';
}

function extractFontToUnicodeMaps(
  resourcesText: string,
  objects: Map<string, PdfObject>,
  decompressFlate?: (compressed: Uint8Array) => Uint8Array
): Map<string, ToUnicodeMap> {
  const fontMaps = new Map<string, ToUnicodeMap>();
  if (!resourcesText) {
    return fontMaps;
  }

  let fontDictText = '';
  const inlineFont = /\/Font\s*<</.exec(resourcesText);
  if (inlineFont) {
    const start = inlineFont.index + inlineFont[0].length - 2;
    const end = findMatchingDictEnd(resourcesText, start);
    if (end !== -1) {
      fontDictText = resourcesText.slice(start, end);
    }
  } else {
    const refFont = /\/Font\s+(\d+\s+\d+)\s+R\b/.exec(resourcesText);
    if (refFont) {
      const fontObj = objects.get(refFont[1]);
      if (fontObj) {
        fontDictText = fontObj.dictText || fontObj.rawBody;
      }
    }
  }

  if (!fontDictText) {
    return fontMaps;
  }

  const fontRefRegex = /\/([^\s/<>\[\]()]+)\s+(\d+\s+\d+)\s+R\b/g;
  let match: RegExpExecArray | null;
  while ((match = fontRefRegex.exec(fontDictText)) !== null) {
    const fontName = match[1];
    const fontObj = objects.get(match[2]);
    if (!fontObj) continue;
    const toUnicodeRef = /\/ToUnicode\s+(\d+\s+\d+)\s+R\b/.exec(
      fontObj.dictText || fontObj.rawBody
    );
    if (!toUnicodeRef) continue;
    const cmapObj = objects.get(toUnicodeRef[1]);
    if (!cmapObj) continue;
    const cmapBytes = maybeDecompressStream(cmapObj, decompressFlate);
    if (!cmapBytes) continue;
    const parsed = parseToUnicodeCMap(bytesToLatin1(cmapBytes));
    if (parsed.entries.size > 0) {
      fontMaps.set(fontName, parsed);
    }
  }

  return fontMaps;
}

function extractFormXObjects(
  resourcesText: string,
  objects: Map<string, PdfObject>
): Map<string, PdfObject> {
  const xobjects = new Map<string, PdfObject>();
  if (!resourcesText) return xobjects;

  let xobjDictText = '';
  const inlineXObj = /\/XObject\s*<</.exec(resourcesText);
  if (inlineXObj) {
    const start = inlineXObj.index + inlineXObj[0].length - 2;
    const end = findMatchingDictEnd(resourcesText, start);
    if (end !== -1) {
      xobjDictText = resourcesText.slice(start, end);
    }
  } else {
    const refXObj = /\/XObject\s+(\d+\s+\d+)\s+R\b/.exec(resourcesText);
    if (refXObj) {
      const obj = objects.get(refXObj[1]);
      if (obj) xobjDictText = obj.dictText || obj.rawBody;
    }
  }

  if (!xobjDictText) return xobjects;
  const xobjRefRegex = /\/([^\s/<>\[\]()]+)\s+(\d+\s+\d+)\s+R\b/g;
  let match: RegExpExecArray | null;
  while ((match = xobjRefRegex.exec(xobjDictText)) !== null) {
    const obj = objects.get(match[2]);
    if (obj && /\/Subtype\s*\/Form\b/.test(obj.dictText)) {
      xobjects.set(match[1], obj);
    }
  }
  return xobjects;
}

function decodePdfStringBytes(
  bytes: Uint8Array,
  cmap?: ToUnicodeMap
): string {
  if (bytes.length === 0) return '';
  if (cmap && cmap.entries.size > 0) {
    let out = '';
    const step = cmap.maxCodeBytes >= 2 && bytes.length % 2 === 0 ? 2 : 1;
    let i = 0;
    while (i < bytes.length) {
      let matched = false;
      if (step === 2 && i + 1 < bytes.length) {
        const key2 =
          bytes[i].toString(16).toUpperCase().padStart(2, '0') +
          bytes[i + 1].toString(16).toUpperCase().padStart(2, '0');
        const mapped = cmap.entries.get(key2);
        if (mapped !== undefined) {
          out += mapped;
          i += 2;
          matched = true;
        }
      }
      if (!matched) {
        const key1 = bytes[i].toString(16).toUpperCase().padStart(2, '0');
        const mapped1 = cmap.entries.get(key1);
        if (mapped1 !== undefined) {
          out += mapped1;
        } else {
          out += decodeWinAnsiBytes(bytes.subarray(i, i + 1));
        }
        i += 1;
      }
    }
    return out;
  }
  return decodeWinAnsiBytes(bytes);
}

function parseLiteralString(src: string, startIdx: number): { bytes: Uint8Array; nextIdx: number } {
  const bytes: number[] = [];
  let i = startIdx + 1;
  let depth = 1;

  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      if (i >= src.length) break;
      const esc = src[i];
      if (esc === 'n') {
        bytes.push(0x0a);
        i++;
      } else if (esc === 'r') {
        bytes.push(0x0d);
        i++;
      } else if (esc === 't') {
        bytes.push(0x09);
        i++;
      } else if (esc === 'b') {
        bytes.push(0x08);
        i++;
      } else if (esc === 'f') {
        bytes.push(0x0c);
        i++;
      } else if (esc === '(' || esc === ')' || esc === '\\') {
        bytes.push(esc.charCodeAt(0));
        i++;
      } else if (esc === '\r') {
        i++;
        if (src[i] === '\n') i++;
      } else if (esc === '\n') {
        i++;
      } else if (esc >= '0' && esc <= '7') {
        let oct = esc;
        if (i + 1 < src.length && src[i + 1] >= '0' && src[i + 1] <= '7') {
          i++;
          oct += src[i];
          if (i + 1 < src.length && src[i + 1] >= '0' && src[i + 1] <= '7') {
            i++;
            oct += src[i];
          }
        }
        bytes.push(Number.parseInt(oct, 8) & 0xff);
        i++;
      } else {
        bytes.push(esc.charCodeAt(0) & 0xff);
        i++;
      }
      continue;
    }

    if (ch === '(') {
      depth++;
      bytes.push(0x28);
      i++;
      continue;
    }

    if (ch === ')') {
      depth--;
      if (depth > 0) {
        bytes.push(0x29);
      }
      i++;
      continue;
    }

    bytes.push(src.charCodeAt(i) & 0xff);
    i++;
  }

  return { bytes: new Uint8Array(bytes), nextIdx: i };
}

function parseHexString(src: string, startIdx: number): { bytes: Uint8Array; nextIdx: number } {
  const closeIdx = src.indexOf('>', startIdx + 1);
  const endIdx = closeIdx === -1 ? src.length : closeIdx;
  const hex = src.slice(startIdx + 1, endIdx).replace(/\s+/g, '');
  const padded = hex.length % 2 === 1 ? `${hex}0` : hex;
  const bytes = new Uint8Array(Math.floor(padded.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    const val = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    bytes[i] = Number.isNaN(val) ? 0 : val;
  }
  return { bytes, nextIdx: closeIdx === -1 ? src.length : closeIdx + 1 };
}

function tokenizeContentStream(src: string): ContentToken[] {
  const tokens: ContentToken[] = [];
  const arrayStack: ContentToken[][] = [];
  let i = 0;

  const pushToken = (tok: ContentToken) => {
    if (arrayStack.length > 0) {
      arrayStack[arrayStack.length - 1].push(tok);
    } else {
      tokens.push(tok);
    }
  };

  while (i < src.length) {
    const ch = src[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\0') {
      i++;
      continue;
    }

    // Comment
    if (ch === '%') {
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }

    // Literal string
    if (ch === '(') {
      const parsed = parseLiteralString(src, i);
      pushToken({ kind: 'string', bytes: parsed.bytes });
      i = parsed.nextIdx;
      continue;
    }

    // Dictionary << >> vs Hex string < >
    if (ch === '<') {
      if (src[i + 1] === '<') {
        i += 2;
      } else {
        const parsed = parseHexString(src, i);
        pushToken({ kind: 'string', bytes: parsed.bytes });
        i = parsed.nextIdx;
      }
      continue;
    }

    if (ch === '>' && src[i + 1] === '>') {
      i += 2;
      continue;
    }

    // Array
    if (ch === '[') {
      arrayStack.push([]);
      i++;
      continue;
    }

    if (ch === ']') {
      const items = arrayStack.pop() ?? [];
      pushToken({ kind: 'array', items });
      i++;
      continue;
    }

    // Name
    if (ch === '/') {
      i++;
      const start = i;
      while (
        i < src.length &&
        !/[\s/<>\[\]()%{}]/.test(src[i])
      ) {
        i++;
      }
      pushToken({ kind: 'name', value: src.slice(start, i) });
      continue;
    }

    // Single-character quote operators ' and "
    if (ch === '\'' || ch === '"') {
      pushToken({ kind: 'op', value: ch });
      i++;
      continue;
    }

    // Number or operator keyword
    const start = i;
    while (i < src.length && !/[\s/<>\[\]()%'"{}]/.test(src[i])) {
      i++;
    }
    const word = src.slice(start, i);
    if (!word) {
      i++;
      continue;
    }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
      pushToken({ kind: 'number', value: Number(word) });
    } else {
      pushToken({ kind: 'op', value: word });
    }
  }

  return tokens;
}

function extractTextFromContentStream(
  streamText: string,
  fontMaps: Map<string, ToUnicodeMap>,
  xobjects: Map<string, PdfObject>,
  objects: Map<string, PdfObject>,
  decompressFlate?: (compressed: Uint8Array) => Uint8Array,
  visitedXObjects: Set<string> = new Set()
): string {
  const tokens = tokenizeContentStream(streamText);
  const stack: ContentToken[] = [];
  let output = '';
  let inText = false;
  let currentFont: string | null = null;
  let lastTmX: number | null = null;
  let lastTmY: number | null = null;

  const appendSpaceIfNeeded = () => {
    if (output.length > 0 && !/[\s\n]$/.test(output)) {
      output += ' ';
    }
  };

  const appendNewlineIfNeeded = () => {
    if (output.length > 0 && !output.endsWith('\n')) {
      output += '\n';
    }
  };

  for (const token of tokens) {
    if (token.kind !== 'op') {
      stack.push(token);
      continue;
    }

    const op = token.value;
    switch (op) {
      case 'BT': {
        inText = true;
        lastTmX = null;
        lastTmY = null;
        if (output.length > 0 && !output.endsWith('\n')) {
          output += '\n';
        }
        stack.length = 0;
        break;
      }
      case 'ET': {
        inText = false;
        appendNewlineIfNeeded();
        stack.length = 0;
        break;
      }
      case 'Tf': {
        const nameTok = stack.length >= 2 ? stack[stack.length - 2] : undefined;
        if (nameTok?.kind === 'name') {
          currentFont = nameTok.value;
        }
        stack.length = 0;
        break;
      }
      case 'Td':
      case 'TD': {
        const tyTok = stack.pop();
        const txTok = stack.pop();
        const tx = txTok?.kind === 'number' ? txTok.value : 0;
        const ty = tyTok?.kind === 'number' ? tyTok.value : 0;
        if (Math.abs(ty) > 0.5) {
          appendNewlineIfNeeded();
        } else if (tx > 4) {
          appendSpaceIfNeeded();
        }
        if (lastTmX !== null) lastTmX += tx;
        if (lastTmY !== null) lastTmY += ty;
        stack.length = 0;
        break;
      }
      case 'T*': {
        appendNewlineIfNeeded();
        stack.length = 0;
        break;
      }
      case 'Tm': {
        const fTok = stack.pop();
        const eTok = stack.pop();
        const e = eTok?.kind === 'number' ? eTok.value : null;
        const f = fTok?.kind === 'number' ? fTok.value : null;
        if (f !== null && lastTmY !== null && Math.abs(f - lastTmY) > 1.5) {
          appendNewlineIfNeeded();
        } else if (e !== null && lastTmX !== null && e - lastTmX > 8) {
          appendSpaceIfNeeded();
        }
        if (e !== null) lastTmX = e;
        if (f !== null) lastTmY = f;
        stack.length = 0;
        break;
      }
      case 'Tj': {
        const strTok = stack.pop();
        if (strTok?.kind === 'string' && inText) {
          const cmap = currentFont ? fontMaps.get(currentFont) : undefined;
          output += decodePdfStringBytes(strTok.bytes, cmap);
        }
        stack.length = 0;
        break;
      }
      case '\'': {
        const strTok = stack.pop();
        if (inText) {
          appendNewlineIfNeeded();
          if (strTok?.kind === 'string') {
            const cmap = currentFont ? fontMaps.get(currentFont) : undefined;
            output += decodePdfStringBytes(strTok.bytes, cmap);
          }
        }
        stack.length = 0;
        break;
      }
      case '"': {
        const strTok = stack.pop();
        if (inText) {
          appendNewlineIfNeeded();
          if (strTok?.kind === 'string') {
            const cmap = currentFont ? fontMaps.get(currentFont) : undefined;
            output += decodePdfStringBytes(strTok.bytes, cmap);
          }
        }
        stack.length = 0;
        break;
      }
      case 'TJ': {
        const arrTok = stack.pop();
        if (arrTok?.kind === 'array' && inText) {
          const cmap = currentFont ? fontMaps.get(currentFont) : undefined;
          for (const item of arrTok.items) {
            if (item.kind === 'string') {
              output += decodePdfStringBytes(item.bytes, cmap);
            } else if (item.kind === 'number' && item.value <= -140) {
              appendSpaceIfNeeded();
            }
          }
        }
        stack.length = 0;
        break;
      }
      case 'Do': {
        const nameTok = stack.pop();
        if (nameTok?.kind === 'name') {
          const xobj = xobjects.get(nameTok.value);
          if (xobj && !visitedXObjects.has(xobj.id)) {
            visitedXObjects.add(xobj.id);
            const subBytes = maybeDecompressStream(xobj, decompressFlate);
            if (subBytes) {
              const subRes = resolveResourcesDict(xobj.dictText, objects);
              const subFonts = extractFontToUnicodeMaps(subRes, objects, decompressFlate);
              const mergedFonts = new Map([...fontMaps, ...subFonts]);
              const subXObjs = extractFormXObjects(subRes, objects);
              const subText = extractTextFromContentStream(
                bytesToLatin1(subBytes),
                mergedFonts,
                subXObjs,
                objects,
                decompressFlate,
                visitedXObjects
              );
              if (subText.trim().length > 0) {
                appendNewlineIfNeeded();
                output += subText;
              }
            }
          }
        }
        stack.length = 0;
        break;
      }
      default: {
        stack.length = 0;
        break;
      }
    }
  }

  return output;
}

function collectPagesFromTree(
  nodeId: string,
  objects: Map<string, PdfObject>,
  inheritedResources: string,
  visited: Set<string>,
  result: Array<{ obj: PdfObject; resourcesText: string }>
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const node = objects.get(nodeId);
  if (!node) return;

  const nodeResources = resolveResourcesDict(
    node.dictText,
    objects,
    inheritedResources
  );
  const kidsMatch = /\/Kids\s*\[([\s\S]*?)\]/.exec(node.dictText);
  if (kidsMatch) {
    const refRegex = /(\d+\s+\d+)\s+R\b/g;
    let ref: RegExpExecArray | null;
    while ((ref = refRegex.exec(kidsMatch[1])) !== null) {
      collectPagesFromTree(ref[1], objects, nodeResources, visited, result);
    }
    return;
  }

  if (!/\/Type\s*\/Pages\b/.test(node.dictText)) {
    result.push({ obj: node, resourcesText: nodeResources });
  }
}

function normalizeExtractedPageText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackExtractPlainPages(data: Uint8Array, rawLatin1: string): PdfPageText[] {
  let decoded = '';
  try {
    decoded = new TextDecoder('utf-8', { fatal: false }).decode(data);
  } catch {
    decoded = rawLatin1;
  }

  const normalized = decoded.replace(/\r\n?/g, '\n');
  if (!rawLatin1.startsWith('%PDF-')) {
    const segments = normalized.split('\f');
    const pages = segments.map((seg, idx) => ({
      pageNumber: idx + 1,
      text: normalizeExtractedPageText(seg),
    }));
    return pages.length > 0 ? pages : [{ pageNumber: 1, text: '' }];
  }

  // Fallback for non-standard PDFs: try parenthesized readable runs or \f segments
  const literalChunks: string[] = [];
  const litRegex = /\(([^()\\]{3,})\)/g;
  let m: RegExpExecArray | null;
  while ((m = litRegex.exec(rawLatin1)) !== null) {
    const candidate = m[1].replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ').trim();
    if (candidate.length >= 3 && /[A-Za-zÀ-ÿ0-9]/.test(candidate)) {
      literalChunks.push(candidate);
    }
  }

  if (literalChunks.length > 0) {
    return [{ pageNumber: 1, text: normalizeExtractedPageText(literalChunks.join(' ')) }];
  }

  return [{ pageNumber: 1, text: '' }];
}

export function extractPagesFromPdfBuffer(
  data: Uint8Array,
  decompressFlate?: (compressed: Uint8Array) => Uint8Array
): PdfExtractionResult {
  if (!data || data.length === 0) {
    return {
      pageCount: 1,
      pages: [{ pageNumber: 1, text: '' }],
      rawText: '',
    };
  }

  const raw = bytesToLatin1(data);
  const objects = parsePdfObjects(data, raw, decompressFlate);

  // Locate pages via /Catalog -> /Pages tree first
  const pageEntries: Array<{ obj: PdfObject; resourcesText: string }> = [];
  for (const obj of objects.values()) {
    if (/\/Type\s*\/Catalog\b/.test(obj.dictText)) {
      const pagesRef = /\/Pages\s+(\d+\s+\d+)\s+R\b/.exec(obj.dictText);
      if (pagesRef) {
        collectPagesFromTree(pagesRef[1], objects, '', new Set(), pageEntries);
        break;
      }
    }
  }

  // Secondary discovery if catalog/tree is missing or partial
  if (pageEntries.length === 0) {
    for (const obj of objects.values()) {
      if (
        /\/Type\s*\/Page\b/.test(obj.dictText) &&
        !/\/Type\s*\/Pages\b/.test(obj.dictText)
      ) {
        pageEntries.push({
          obj,
          resourcesText: resolveResourcesDict(obj.dictText, objects),
        });
      }
    }
  }

  if (pageEntries.length > 0) {
    const pages: PdfPageText[] = pageEntries.map(({ obj, resourcesText }, idx) => {
      const fontMaps = extractFontToUnicodeMaps(
        resourcesText,
        objects,
        decompressFlate
      );
      const xobjects = extractFormXObjects(resourcesText, objects);

      const contentIds: string[] = [];
      const singleContent = /\/Contents\s+(\d+\s+\d+)\s+R\b/.exec(obj.dictText);
      if (singleContent) {
        contentIds.push(singleContent[1]);
      } else {
        const arrayContent = /\/Contents\s*\[([\s\S]*?)\]/.exec(obj.dictText);
        if (arrayContent) {
          const refRegex = /(\d+\s+\d+)\s+R\b/g;
          let refMatch: RegExpExecArray | null;
          while ((refMatch = refRegex.exec(arrayContent[1])) !== null) {
            contentIds.push(refMatch[1]);
          }
        }
      }

      const pageParts: string[] = [];
      for (const contentId of contentIds) {
        const contentObj = objects.get(contentId);
        if (!contentObj) continue;
        const streamBytes = maybeDecompressStream(contentObj, decompressFlate);
        if (!streamBytes) continue;
        const extracted = extractTextFromContentStream(
          bytesToLatin1(streamBytes),
          fontMaps,
          xobjects,
          objects,
          decompressFlate
        );
        if (extracted.trim().length > 0) {
          pageParts.push(extracted);
        }
      }

      return {
        pageNumber: idx + 1,
        text: normalizeExtractedPageText(pageParts.join('\n')),
      };
    });

    const rawText = pages
      .map((p) => p.text)
      .filter((t) => t.length > 0)
      .join('\n\n');

    return {
      pageCount: pages.length,
      pages,
      rawText,
    };
  }

  // Fallback when no /Page structure was found: try extracting BT..ET streams directly
  const streamPages: PdfPageText[] = [];
  for (const obj of objects.values()) {
    if (!obj.streamBytes) continue;
    const streamBytes = maybeDecompressStream(obj, decompressFlate);
    if (!streamBytes) continue;
    const text = normalizeExtractedPageText(
      extractTextFromContentStream(
        bytesToLatin1(streamBytes),
        new Map(),
        new Map(),
        objects,
        decompressFlate
      )
    );
    if (text.length > 0) {
      streamPages.push({ pageNumber: streamPages.length + 1, text });
    }
  }

  if (streamPages.length > 0) {
    return {
      pageCount: streamPages.length,
      pages: streamPages,
      rawText: streamPages.map((p) => p.text).join('\n\n'),
    };
  }

  const fallbackPages = fallbackExtractPlainPages(data, raw);
  return {
    pageCount: fallbackPages.length,
    pages: fallbackPages,
    rawText: fallbackPages
      .map((p) => p.text)
      .filter((t) => t.length > 0)
      .join('\n\n'),
  };
}

export type ExtractedPage = PdfPageText;
