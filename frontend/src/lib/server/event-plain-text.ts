/**
 * Strict UTF-8 text-only evidence. Binary formats and disguised files fail
 * closed. This function never alters original bytes or the SHA-256 chain.
 *
 * Text has no portable signature (unlike PDF/DOCX); validate its entire
 * encoding and prohibit control characters that can disguise extracted
 * evidence. Never render the text as HTML.
 */
export const PLAIN_TEXT_MIME = 'text/plain'
export class PlainTextOriginalError extends Error {
  constructor() {
    super('INVALID_UTF8_TEXT')
    this.name = 'PlainTextOriginalError'
  }
}

export function decodeStrictUtf8TextOriginal(bytes: Uint8Array): string {
  if (bytes.byteLength < 1 || bytes.byteLength > 10 * 1024 * 1024) {
    throw new PlainTextOriginalError()
  }
  // A text/plain label is not evidence that PDF/ZIP/image bytes are text.
  // Fail closed for known binary container signatures even when header
  // fragments happen to be valid ASCII.
  const prefix = Buffer.from(bytes.subarray(0, 12)).toString('latin1')
  if (prefix.startsWith('%PDF-') || prefix.startsWith('PK\x03\x04') ||
      prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a') ||
      prefix.startsWith('\x89PNG') || prefix.startsWith('\xff\xd8') ||
      (prefix.startsWith('RIFF') && prefix.slice(8,12) === 'WEBP')) {
    throw new PlainTextOriginalError()
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    throw new PlainTextOriginalError()
  }

  // C0/C1, DEL, bidirectional override/isolate and embedded BOM can hide
  // misleading provenance. Preserve tabs and CR/LF for ordinary reports.
  if (!text.trim() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufeff]/u.test(text)) {
    throw new PlainTextOriginalError()
  }
  return text
}
