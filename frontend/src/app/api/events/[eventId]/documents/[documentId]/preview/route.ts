import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import {
  extractVerifiedEventSourcePreview,
  mapSourcePreviewError,
} from '@/lib/server/event-source-preview'

/**
 * Explicit read-only text preview. The output is NOT persisted, is not OCR,
 * contains document-level only provenance and cannot update SERA P/O/A.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ eventId: string; documentId: string }> },
) {
  const requestId = getOrCreateRequestId(req)
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Authorization',
    'x-request-id': requestId,
  }
  try {
    const user = await requireBearerUser(req)
    if (!['admin', 'analyst'].includes(String(user.role).toLowerCase())) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Apenas analistas e administradores podem pré-visualizar extrações.' },
        { status: 403, headers },
      )
    }
    // No body or caller-provided tenant, storage path, extracted text or
    // sampling metadata is accepted. Source identity is resolved server-side.
    if (req.body !== null ||
        req.headers.get('content-length') !== null &&
        req.headers.get('content-length') !== '0') {
      return NextResponse.json(
        { code: 'BODY_NOT_ALLOWED', message: 'Esta operação não aceita conteúdo de requisição.' },
        { status: 400, headers },
      )
    }
    const { eventId, documentId } = await ctx.params
    const preview = await extractVerifiedEventSourcePreview({
      admin: getSupabaseAdmin(),
      tenantId: user.tenantId,
      eventId,
      documentId,
      authUserId: user.authUserId,
    })
    return NextResponse.json(preview, { status: 200, headers })
  } catch (error) {
    if (error instanceof Response) return error
    const mapped = mapSourcePreviewError(error)
    if (mapped.status >= 500) {
      // Parsers may echo confidential report text in error.message.
      console.error('[event source preview] server failure', {
        requestId, errorType: error instanceof Error ? error.name : typeof error,
      })
    }
    return NextResponse.json(
      { code: mapped.code, message: mapped.message },
      {
        status: mapped.status,
        headers: {
          ...headers,
          ...(mapped.status === 429 ? { 'Retry-After': '3600' } : {}),
        },
      },
    )
  }
}
