import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import {
  ExtractionPayloadTooLarge,
  readBoundedExtractionForm,
  reserveDocumentExtractionQuota,
} from '@/lib/server/document-extraction-gate'
import {
  assertFileSize,
  cleanExtractedText,
  countWords,
  detectDocumentKind,
  DocumentExtractError,
  extractTextFromBuffer,
} from '@/lib/sera/document-extraction'

function clientError(code: DocumentExtractError['code'], message: string, status = 400) {
  return NextResponse.json({ error: code, message }, { status })
}

export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req)
    const ct = req.headers.get('content-type') ?? ''
    if (!/^multipart\/form-data\s*;/i.test(ct) || !/boundary=/i.test(ct)) {
      return NextResponse.json({ detail: 'Use multipart/form-data com campo "file"' }, { status: 400 })
    }

    // Check the full request, not just File.size; an absent Content-Length must
    // never permit unbounded server memory use.
    const form = await readBoundedExtractionForm(req)
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ detail: 'Campo "file" obrigatório' }, { status: 400 })
    }
    assertFileSize(file.size)
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.pdf') && !lower.endsWith('.docx')) {
      return clientError('INVALID_TYPE', 'Apenas arquivos PDF ou DOCX são aceitos')
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const kind = detectDocumentKind(buf)
    if (!kind || (lower.endsWith('.pdf') && kind !== 'pdf') ||
      (lower.endsWith('.docx') && kind !== 'docx')) {
      return clientError('INVALID_TYPE', 'Assinatura e extensão do documento incompatíveis.')
    }
    const expectedMime = kind === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (file.type && file.type !== expectedMime &&
        !(kind === 'docx' && file.type === 'application/octet-stream')) {
      return clientError('INVALID_TYPE', 'MIME, extensão e assinatura incompatíveis.')
    }

    let admin: ReturnType<typeof getSupabaseAdmin>
    try {
      admin = getSupabaseAdmin()
    } catch {
      return NextResponse.json(
        { error: 'RATE_LIMIT_UNAVAILABLE', message: 'Serviço de extração temporariamente indisponível.' },
        { status: 503 },
      )
    }
    const quota = await reserveDocumentExtractionQuota(admin, user.authUserId)
    if (quota === 'unavailable') {
      return NextResponse.json(
        { error: 'RATE_LIMIT_UNAVAILABLE', message: 'Serviço de extração temporariamente indisponível.' },
        { status: 503 },
      )
    }
    if (quota === 'limited') {
      return NextResponse.json(
        { error: 'RATE_LIMIT', message: 'Limite de 10 tentativas de extração por hora atingido.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      )
    }

    let raw: string
    try {
      raw = await extractTextFromBuffer(buf, kind, file.name)
    } catch (err) {
      if (err instanceof DocumentExtractError) {
        return NextResponse.json({ error: err.code, message: err.message }, { status: 400 })
      }
      throw err
    }

    const text = cleanExtractedText(raw)
    const wordCount = countWords(text)
    return NextResponse.json({ text, wordCount, fileName: file.name })
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof ExtractionPayloadTooLarge ||
      error instanceof DocumentExtractError && error.code === 'TOO_LARGE') {
      return NextResponse.json({ error: 'TOO_LARGE', message: 'O arquivo não pode ultrapassar 10MB.' },
        { status: 413 })
    }
    // Never log the raw exception: OCR/document parsers can echo source text.
    console.error('[extract-document] request failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return NextResponse.json(
      { error: 'PARSE_FAILED', message: 'Não foi possível ler o arquivo. Verifique se ele está corrompido.' },
      { status: 400 },
    )
  }
}
