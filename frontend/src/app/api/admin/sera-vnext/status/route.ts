import { NextResponse } from 'next/server'
import { requireAdmin, jsonError } from '@/lib/server/admin-auth'
import type { ApiUserContext } from '@/lib/server/api-auth'
import { isSeraVNextInternalPilotEnabled, isSeraVNextReadOnlyEnabled } from '@/lib/sera-vnext-runtime/feature-flags'
import { logSeraVNextRuntimeEvent } from '@/lib/sera-vnext-runtime/runtime-observability'
import { getSeraVNextRuntimeStatus } from '@/lib/sera-vnext-runtime/runtime-service'
import type { SeraVNextRuntimeStatus } from '@/lib/sera-vnext-runtime/types'

export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-store',
}

type SeraVNextStatusRouteDeps = {
  requireAdminUser?: (req: Request) => Promise<ApiUserContext>
  getRuntimeStatus?: () => SeraVNextRuntimeStatus
  isReadOnlyEnabled?: () => boolean
  isInternalPilotEnabled?: () => boolean
  logEvent?: typeof logSeraVNextRuntimeEvent
  now?: () => number
  requestId?: () => string
}

function responseStatus(error: Response): number {
  return error.status || 500
}

export async function handleSeraVNextStatusRequest(req: Request, deps: SeraVNextStatusRouteDeps = {}) {
  const requireAdminUser = deps.requireAdminUser ?? requireAdmin
  const getRuntimeStatus = deps.getRuntimeStatus ?? getSeraVNextRuntimeStatus
  const isReadOnlyEnabled = deps.isReadOnlyEnabled ?? isSeraVNextReadOnlyEnabled
  const isInternalPilotEnabled = deps.isInternalPilotEnabled ?? isSeraVNextInternalPilotEnabled
  const logEvent = deps.logEvent ?? logSeraVNextRuntimeEvent
  const now = deps.now ?? (() => performance.now())
  const requestId = req.headers.get('x-request-id') ?? deps.requestId?.() ?? crypto.randomUUID()
  const started = now()

  if (!isReadOnlyEnabled() || !isInternalPilotEnabled()) {
    logEvent({
      event: 'sera_vnext_runtime_status_disabled',
      requestId,
      status: 'DISABLED',
      durationMs: Math.round(now() - started),
    })
    return NextResponse.json({ detail: 'Not found' }, { status: 404, headers: noStoreHeaders })
  }

  try {
    const user = await requireAdminUser(req)
    logEvent({
      event: 'sera_vnext_runtime_status_requested',
      requestId,
      tenantId: user.tenantId,
      userRole: user.role,
    })

    const status = getRuntimeStatus()
    const httpStatus = status.status === 'ERROR' ? 503 : 200
    logEvent({
      event: status.status === 'AVAILABLE' ? 'sera_vnext_runtime_status_available' : 'sera_vnext_runtime_status_failed',
      requestId,
      tenantId: user.tenantId,
      userRole: user.role,
      baselineId: status.status === 'AVAILABLE' ? status.baselineId : undefined,
      namespace: status.status === 'AVAILABLE' ? status.namespace : undefined,
      fixtureCount: status.status === 'AVAILABLE' ? status.fixtureCount : undefined,
      expectedOutputCount: status.status === 'AVAILABLE' ? status.expectedOutputCount : undefined,
      status: status.status,
      errorCode: status.status === 'ERROR' ? status.errorCode : undefined,
      durationMs: Math.round(now() - started),
    })
    return NextResponse.json(status, { status: httpStatus, headers: noStoreHeaders })
  } catch (error) {
    if (error instanceof Response) {
      logEvent({
        event: 'sera_vnext_runtime_status_denied',
        requestId,
        status: String(responseStatus(error)),
        durationMs: Math.round(now() - started),
      })
      return error
    }
    logEvent({
      event: 'sera_vnext_runtime_status_failed',
      requestId,
      status: 'ERROR',
      errorCode: 'SERA_VNEXT_ROUTE_UNEXPECTED_ERROR',
      durationMs: Math.round(now() - started),
    })
    return jsonError('Erro ao consultar diagnóstico SERA 0.3', 500)
  }
}

export async function GET(req: Request) {
  return handleSeraVNextStatusRequest(req)
}
