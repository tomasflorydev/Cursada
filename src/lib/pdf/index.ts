export * from '../../../shared/pdfExtractor.js';
import {
  UNICODE_TO_WIN_ANSI,
  latin1ToBytes,
} from '../../../shared/pdfExtractor.js';

function encodePdfWinAnsiLiteral(text: string): string {
  let out = '(';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x28) {
      out += '\\(';
    } else if (code === 0x29) {
      out += '\\)';
    } else if (code === 0x5c) {
      out += '\\\\';
    } else if (code >= 0x20 && code <= 0x7e) {
      out += text[i];
    } else {
      const mapped =
        UNICODE_TO_WIN_ANSI.get(code) ?? (code <= 0xff ? code : 0x3f);
      out += `\\${mapped.toString(8).padStart(3, '0')}`;
    }
  }
  out += ')';
  return out;
}

export function buildSyntheticPdfBuffer(pages: string[]): Uint8Array {
  const safePages = pages.length > 0 ? pages : [''];
  const objects: string[] = [];

  // Object 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages root (kids will be 4, 6, 8, ...)
  const pageObjNums = safePages.map((_, idx) => 4 + idx * 2);
  const kidsRefs = pageObjNums.map((num) => `${num} 0 R`).join(' ');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${safePages.length} >>\nendobj\n`
  );

  // Object 3: Helvetica Font with WinAnsiEncoding
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  // Page & Content objects
  for (let i = 0; i < safePages.length; i++) {
    const pageObjNum = 4 + i * 2;
    const contentObjNum = pageObjNum + 1;
    const lines = safePages[i].replace(/\r\n?/g, '\n').split('\n');

    const streamOps = ['BT', '/F1 12 Tf', '72 720 Td'];
    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) {
        streamOps.push('0 -16 Td');
      }
      streamOps.push(`${encodePdfWinAnsiLiteral(line)} Tj`);
    });
    streamOps.push('ET');
    const contentStream = streamOps.join('\n');

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const objStr of objects) {
    offsets.push(pdf.length);
    pdf += objStr;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return latin1ToBytes(pdf);
}
