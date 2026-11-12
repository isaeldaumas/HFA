import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import {
  DocumentAccessError,
  downloadAuthorizedEventDocument,
  safeDocumentContentDisposition,
} from '@/lib/server/event-document-access'

export async function GET(
  req: Request,
  ctx: {params: Promise<{eventId: string; documentId: string}>},
) {
  try {
    const user = await requireBearerUser(req)
    const { eventId, documentId } = await ctx.params
    const file = await downloadAuthorizedEventDocument(
      getSupabaseAdmin(), user.tenantId, eventId, documentId,
    )
    return new NextResponse(file.bytes, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': safeDocumentContentDisposition(file.fileName),
        'Content-Length': String(file.bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-HFA-Provenance': file.hashVerified ? 'SHA256-VERIFIED' : 'LEGACY-UNVERIFIED',
      },
    })
  } catch (error) {
    if (error instanceof Response) return error
    const status = error instanceof DocumentAccessError ?
      error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_ID' ? 400 :
      error.code === 'INTEGRITY_MISMATCH' ? 409 : 503 : 503
    return NextResponse.json(
      { detail: status === 404 ? 'Documento não encontrado.' : status === 400 ?
        'Identificador inválido.' : status === 409 ?
        'Integridade do documento não confirmada. Contate o suporte.' :
        'Documento temporariamente indisponível.' },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
