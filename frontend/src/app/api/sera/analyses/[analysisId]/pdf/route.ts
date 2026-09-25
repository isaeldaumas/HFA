import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { ensurePublicUserRow } from '@/lib/server/tenant-user'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { exportSeraVNextAnalysisPdf } from '@/lib/sera-vnext-product/persistence/export-analysis-pdf'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ analysisId: string }> }) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    const { analysisId } = await ctx.params
    const publicUserId = await ensurePublicUserRow(
      getSupabaseAdmin(), user.tenantId, user.userId, user.email, user.role,
    )
    const result = await exportSeraVNextAnalysisPdf({
      analysisId,
      context: {
        tenantId: user.tenantId,
        userId: publicUserId,
        role: user.role,
        email: user.email ?? '',
        requestId,
      },
    })
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-store',
        'x-request-id': requestId,
      },
    })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[sera-analysis-pdf]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return NextResponse.json({ detail: 'Não foi possível gerar o PDF.', request_id: requestId }, { status: 500 })
  }
}
