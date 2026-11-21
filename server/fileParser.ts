import zlib from 'node:zlib';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

export interface ParsedFileResult {
  fileName: string;
  fileType: 'txt' | 'pdf';
  extractedText: string;
  pdfBase64?: string;
  requiresMultimodalPdf: boolean;
}

export function sanitizeTranscriptText(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

export function parseUploadedMeetingFile(params: {
  fileName: string;
  mimeType: string;
  base64Content: string;
}): ParsedFileResult {
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const lower = safeName.toLowerCase();

  if (!lower.endsWith('.txt') && !lower.endsWith('.md') && !lower.endsWith('.pdf')) {
    throw new Error('Only .txt, .md, and .pdf meeting note files are supported.');
  }

  const cleanBase64 = params.base64Content.includes(',')
    ? params.base64Content.split(',')[1]
    : params.base64Content;

  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('File exceeds the 2 MB maximum upload limit.');
  }

  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    const text = sanitizeTranscriptText(buffer.toString('utf8'));
    if (!text) {
      throw new Error('The uploaded text file contains no readable text.');
    }
    return {
      fileName: safeName,
      fileType: 'txt',
      extractedText: text,
      requiresMultimodalPdf: false,
    };
  }

  // Validate PDF header
  const header = buffer.subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') {
    throw new Error('Invalid PDF file signature.');
  }

  const extracted = extractTextFromPdfBuffer(buffer);
  return {
    fileName: safeName,
    fileType: 'pdf',
    extractedText: extracted,
    pdfBase64: cleanBase64,
    requiresMultimodalPdf: extracted.trim().length < 25,
  };
}

/**
 * Lightweight zero-dependency PDF text extractor supporting uncompressed and FlateDecode streams.
 */
function extractTextFromPdfBuffer(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const chunks: string[] = [];

  // Extract FlateDecode streams
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw)) !== null) {
    const streamBody = match[1];
    const streamBytes = Buffer.from(streamBody, 'latin1');
    let decoded = streamBody;
    try {
      const inflated = zlib.inflateSync(streamBytes);
      decoded = inflated.toString('latin1');
    } catch {
      // Not Flate-compressed or partial stream; fall back to raw
    }
    const textOps = extractPdfTextOperators(decoded);
    if (textOps) chunks.push(textOps);
  }

  // Also check top-level operators outside stream blocks
  if (chunks.length === 0) {
    const fallbackOps = extractPdfTextOperators(raw);
    if (fallbackOps) chunks.push(fallbackOps);
  }

  return sanitizeTranscriptText(chunks.join('\n'));
}

function extractPdfTextOperators(content: string): string {
  const pieces: string[] = [];
  const tjMatches = content.match(/\((?:\\.|[^\\()])*\)\s*Tj/g) ?? [];
  for (const m of tjMatches) {
    const inner = m.replace(/\)\s*Tj$/, '').slice(1);
    pieces.push(unescapePdfString(inner));
  }

  const tjArrayMatches = content.match(/\[(?:[^\]]*)\]\s*TJ/g) ?? [];
  for (const arr of tjArrayMatches) {
    const strParts = arr.match(/\((?:\\.|[^\\()])*\)/g) ?? [];
    const joined = strParts.map((s) => unescapePdfString(s.slice(1, -1))).join('');
    if (joined.trim()) pieces.push(joined);
  }

  return pieces.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function unescapePdfString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}
