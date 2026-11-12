import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import {
  DocumentAccessError, listEventDocumentManifest,
} from '@/lib/server/event-document-access'

export async function GET(req: Request, ctx: {params: Promise<{eventId:string}>}) {
  try {
    const user = await requireBearerUser(req)
    const { eventId } = await ctx.params
    const items = await listEventDocumentManifest(getSupabaseAdmin(), user.tenantId, eventId)
    return NextResponse.json({ documents: items }, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    if (error instanceof Response) return error
    const status = error instanceof DocumentAccessError ?
      error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_ID' ? 400 : 503 : 503
    return NextResponse.json(
      { detail: status === 404 ? 'Evento não encontrado.' : status === 400 ?
        'Identificador inválido.' : 'Não foi possível consultar os anexos.' },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
