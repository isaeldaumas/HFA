// @ts-expect-error pdf-parse-fork has no published types.
import PDFParse from 'pdf-parse-fork'

export const MAX_PDF_PAGES_FOR_PREVIEW = 80
export const MAX_PREVIEW_TOTAL_CHARS = 60_000

export class PdfPageProvenanceError extends Error {
  constructor(public readonly code: 'PAGE_LIMIT' | 'PAGE_EXTRACTION_INCOMPLETE' | 'INVALID_PDF') {
    super(code)
    this.name = 'PdfPageProvenanceError'
  }
}

export type PdfTextPage = {
  pageNumber: number
  text: string
  extractedChars: number
  truncated: boolean
  hasText: boolean
}

type PdfTextItem = { str?: unknown; transform?: unknown }
type PdfPage = {
  pageNumber: number
  getTextContent(opts: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }): Promise<{
    items: PdfTextItem[]
  }>
}

/**
 * A page label is only assigned inside the PDF parser callback with
 * page.pageNumber: no guessing from form-feed characters or LLM output.
 * Every page must be successfully visited, otherwise fail closed.
 */
export async function extractPdfPageProvenance(
  buffer: Buffer,
): Promise<{pages: PdfTextPage[]; totalPages: number; truncated: boolean}> {
  if (buffer.byteLength < 5 || buffer.byteLength > 10 * 1024 * 1024 ||
      buffer.subarray(0,4).toString('ascii') !== '%PDF') {
    throw new PdfPageProvenanceError('INVALID_PDF')
  }

  const collected: PdfTextPage[] = []
  let remaining = MAX_PREVIEW_TOTAL_CHARS
  let truncated = false
  let callbackError = false

  let parsed: { numpages: number; numrender: number }
  try {
    parsed = await PDFParse(new Uint8Array(buffer), {
      version: 'v1.10.100',
      max: 0,
      pagerender: async (page: PdfPage) => {
        // The fork catches page callback errors, silently substitutes empty
        // text and continues. Track ANY such failure independently.
        try {
          if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1 ||
              page.pageNumber > MAX_PDF_PAGES_FOR_PREVIEW) {
            throw new Error('invalid page number')
          }
          const content = await page.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false,
          })
          if (!Array.isArray(content.items)) throw new Error('invalid page items')
          const parts: string[] = []
          for (const item of content.items) {
            if (typeof item.str !== 'string') throw new Error('invalid text item')
            parts.push(item.str)
          }
          const allText = parts.join(' ').replace(/\u0000/g,'').trim()
          const cut = allText.length > remaining
          const text = allText.slice(0, remaining)
          remaining -= text.length
          if (cut) truncated = true
          collected.push({
            pageNumber: page.pageNumber,
            text,
            extractedChars: text.length,
            truncated: cut,
            hasText: allText.length > 0,
          })
          // Return only a bounded placeholder; never echo source through
          // the fork's accumulated result.text property.
          return ''
        } catch {
          callbackError = true
          return ''
        }
      },
    })
  } catch {
    throw new PdfPageProvenanceError('INVALID_PDF')
  }

  if (!Number.isInteger(parsed.numpages) || parsed.numpages < 1 ||
      parsed.numpages > MAX_PDF_PAGES_FOR_PREVIEW) {
    throw new PdfPageProvenanceError('PAGE_LIMIT')
  }

  // Important: pdf-parse-fork catches per-page parser errors. A "successful"
  // PDFParse promise does NOT establish complete extraction.
  const ordered = collected.slice().sort((a,b) => a.pageNumber - b.pageNumber)
  if (callbackError || parsed.numrender !== parsed.numpages ||
      ordered.length !== parsed.numpages ||
      ordered.some((page,index) => page.pageNumber !== index+1)) {
    throw new PdfPageProvenanceError('PAGE_EXTRACTION_INCOMPLETE')
  }

  return {pages: ordered,totalPages:parsed.numpages,truncated}
}
