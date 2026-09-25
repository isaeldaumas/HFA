import { handleExportSeraVNextAnalysisPdfRequest } from '@/lib/sera-vnext-product/api-handlers'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  return handleExportSeraVNextAnalysisPdfRequest(req, id)
}
