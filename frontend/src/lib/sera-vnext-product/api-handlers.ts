import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/admin-auth'
import type { ApiUserContext } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { ensurePublicUserRow } from '@/lib/server/tenant-user'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import {
  archiveSeraVNextAnalysis,
  createSeraVNextAnalysis,
  createSeraVNextReview,
  exportSeraVNextAnalysis,
  getSeraVNextAnalysisDetail,
  isSeraVNextProductBetaEnabled,
  listSeraVNextAnalyses,
  parseListAnalysesQuery,
  reanalyzeSeraVNextAnalysis,
  restoreSeraVNextAnalysis,
  SeraVNextProductError,
  validateCreateAnalysisInput,
  validateReviewInput,
  type SeraVNextProductContext,
  type SeraVNextProductRepository,
} from '@/lib/sera-vnext-product'
import { logSeraVNextProductBetaEvent, type SeraVNextProductBetaEvent } from './observability'

export const productBetaNoStoreHeaders = {
  'Cache-Control': 'no-store',
}

type HandlerDeps = {
  requireAdminUser?: (req: Request) => Promise<ApiUserContext>
  repository?: SeraVNextProductRepository
  buildContext?: (user: ApiUserContext, requestId: string) => Promise<SeraVNextProductContext>
  isEnabled?: () => boolean
  logEvent?: (event: SeraVNextProductBetaEvent) => void
  requestId?: () => string
  now?: () => number
}

function nowFn(deps: HandlerDeps): () => number {
  return deps.now ?? (() => performance.now())
}

async function buildContext(user: ApiUserContext, requestId: string): Promise<SeraVNextProductContext> {
  const publicUserId = await ensurePublicUserRow(
    getSupabaseAdmin(),
    user.tenantId,
    user.userId,
    user.email,
    user.role,
  )
  return {
    userId: publicUserId,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    requestId,
  }
}

async function routeContext(req: Request, deps: HandlerDeps) {
  const requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  const isEnabled = deps.isEnabled ?? isSeraVNextProductBetaEnabled
  const logEvent = deps.logEvent ?? logSeraVNextProductBetaEvent
  const requireAdminUser = deps.requireAdminUser ?? requireAdmin
  const contextBuilder = deps.buildContext ?? buildContext
  if (!isEnabled()) {
    logEvent({ event: 'sera_vnext_beta_access_denied', requestId, status: 'DISABLED' })
    return { disabled: NextResponse.json({ detail: 'Not found' }, { status: 404, headers: productBetaNoStoreHeaders }), requestId, logEvent }
  }
  const user = await requireAdminUser(req)
  return { context: await contextBuilder(user, requestId), requestId, logEvent }
}

function responseError(error: unknown, requestId: string): NextResponse | Response {
  if (error instanceof Response) return error
  if (error instanceof SeraVNextProductError) {
    return NextResponse.json(
      { detail: error.message, errorCode: error.code, request_id: requestId },
      { status: error.status, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } },
    )
  }
  const stagingDiagnostics =
    process.env.HFA_TEST_ENVIRONMENT?.trim().toLowerCase() === 'staging' ||
    process.env.HFA_INTEGRATED_REGRESSION_LEVEL?.trim()
  const detail =
    stagingDiagnostics && error instanceof Error && error.message
      ? `Erro interno SERA vNext Product Beta: ${error.message}`
      : 'Erro interno SERA vNext Product Beta'
  return NextResponse.json(
    { detail, request_id: requestId },
    { status: 500, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } },
  )
}

async function parseJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_INVALID_JSON', 'Body JSON inválido.', 400)
  }
}

export async function handleCreateSeraVNextAnalysisRequest(req: Request, deps: HandlerDeps = {}) {
  const started = nowFn(deps)()
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  const logEvent = deps.logEvent ?? logSeraVNextProductBetaEvent
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const input = validateCreateAnalysisInput(await parseJson(req))
    const result = await createSeraVNextAnalysis({ input, context: routed.context, repository: deps.repository })
    routed.logEvent({
      event: 'sera_vnext_beta_analysis_created',
      requestId,
      tenantId: routed.context.tenantId,
      userRole: routed.context.role,
      analysisId: result.analysis.id,
      status: result.analysis.status,
      durationMs: Math.round(nowFn(deps)() - started),
    })
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    logEvent({ event: 'sera_vnext_beta_analysis_failed', requestId, errorCode: error instanceof SeraVNextProductError ? error.code : undefined })
    return responseError(error, requestId)
  }
}

export async function handleListSeraVNextAnalysesRequest(req: Request, deps: HandlerDeps = {}) {
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const query = parseListAnalysesQuery(new URL(req.url))
    const result = await listSeraVNextAnalyses({ query, context: routed.context, repository: deps.repository })
    return NextResponse.json(result, { status: 200, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    return responseError(error, requestId)
  }
}

export async function handleGetSeraVNextAnalysisRequest(req: Request, id: string, deps: HandlerDeps = {}) {
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const detail = await getSeraVNextAnalysisDetail({ id, context: routed.context, repository: deps.repository })
    return NextResponse.json(detail, { status: 200, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    return responseError(error, requestId)
  }
}

export async function handleReanalyzeSeraVNextAnalysisRequest(req: Request, id: string, deps: HandlerDeps = {}) {
  const started = nowFn(deps)()
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const body = await parseJson(req).catch(() => ({}))
    const reason = body && typeof body === 'object' && typeof (body as Record<string, unknown>).reason === 'string'
      ? String((body as Record<string, unknown>).reason)
      : undefined
    const result = await reanalyzeSeraVNextAnalysis({ analysisId: id, reason, context: routed.context, repository: deps.repository })
    routed.logEvent({ event: 'sera_vnext_beta_reanalysis_completed', requestId, tenantId: routed.context.tenantId, analysisId: id, status: result.analysis.status, durationMs: Math.round(nowFn(deps)() - started) })
    return NextResponse.json(result, { status: 200, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    return responseError(error, requestId)
  }
}

export async function handleCreateSeraVNextReviewRequest(req: Request, id: string, deps: HandlerDeps = {}) {
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const input = validateReviewInput(await parseJson(req))
    const result = await createSeraVNextReview({ analysisId: id, input, context: routed.context, repository: deps.repository })
    routed.logEvent({ event: 'sera_vnext_beta_review_submitted', requestId, tenantId: routed.context.tenantId, analysisId: id, status: result.status })
    return NextResponse.json(result, { status: 201, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    return responseError(error, requestId)
  }
}

export async function handleArchiveSeraVNextAnalysisRequest(req: Request, id: string, deps: HandlerDeps = {}) {
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const analysis = await archiveSeraVNextAnalysis({ analysisId: id, context: routed.context, repository: deps.repository })
    routed.logEvent({ event: 'sera_vnext_beta_analysis_archived', requestId, tenantId: routed.context.tenantId, analysisId: id, status: analysis.status })
    return NextResponse.json({ analysis }, { status: 200, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    return responseError(error, requestId)
  }
}

export async function handleRestoreSeraVNextAnalysisRequest(req: Request, id: string, deps: HandlerDeps = {}) {
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const analysis = await restoreSeraVNextAnalysis({ analysisId: id, context: routed.context, repository: deps.repository })
    routed.logEvent({ event: 'sera_vnext_beta_analysis_restored', requestId, tenantId: routed.context.tenantId, analysisId: id, status: analysis.status })
    return NextResponse.json({ analysis }, { status: 200, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    return responseError(error, requestId)
  }
}

export async function handleExportSeraVNextAnalysisRequest(req: Request, id: string, deps: HandlerDeps = {}) {
  let requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? getOrCreateRequestId(req)
  try {
    const routed = await routeContext(req, deps)
    requestId = routed.requestId
    if ('disabled' in routed) return routed.disabled
    const payload = await exportSeraVNextAnalysis({ analysisId: id, context: routed.context, repository: deps.repository })
    routed.logEvent({ event: 'sera_vnext_beta_analysis_exported', requestId, tenantId: routed.context.tenantId, analysisId: id, status: payload.analysis.status })
    return NextResponse.json(payload, { status: 200, headers: { ...productBetaNoStoreHeaders, 'x-request-id': requestId } })
  } catch (error) {
    return responseError(error, requestId)
  }
}
