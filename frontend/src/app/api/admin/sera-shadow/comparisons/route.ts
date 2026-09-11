import { NextResponse } from 'next/server'
import { requireAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { isShadowAdminViewEnabled } from '@/lib/sera-shadow/feature-flags'
import {
  aggregateShadowDivergenceV1,
  compareShadowTripletV1,
  type ShadowDivergenceV1Result,
} from '@/lib/sera-shadow/divergence-v1'
import { listShadowResultsForTenant } from '@/lib/sera-shadow/repository'

/**
 * GET /api/admin/sera-shadow/comparisons
 *
 * Read-only tenant-scoped shadow comparison view.
 * Fail-closed when SERA_SHADOW_ADMIN_VIEW_ENABLED is not true.
 * Never enables execution/persistence. ERC is not returned as a compared field.
 */
export async function GET(req: Request) {
  try {
    if (!isShadowAdminViewEnabled()) {
      return NextResponse.json({ detail: 'Not found' }, { status: 404 })
    }

    const user = await requireAdmin(req)
    const admin = getSupabaseAdmin()
    const url = new URL(req.url)
    const limitRaw = Number(url.searchParams.get('limit') ?? '50')
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50

    const rows = await listShadowResultsForTenant(admin, user.tenantId, limit)
    const comparisons: ShadowDivergenceV1Result[] = rows.map((row) => {
      const stored = row.divergence_summary as {
        divergenceContract?: ShadowDivergenceV1Result
        axisDivergences?: Array<{
          axis?: string
          legacyCode?: string | null
        }>
      } | null
      if (stored?.divergenceContract?.contractId === 'SERA_SHADOW_DIVERGENCE_V1') {
        return stored.divergenceContract
      }

      // Pre-V1 / partial summaries: rebuild mechanically. Prefer stored legacy
      // axis codes when present; never invent codes. Absent legacy → excluded
      // from denominator (fail-closed), not reinterpreted as a new contract.
      const legacyByAxis = new Map<string, string | null>()
      for (const axis of stored?.axisDivergences ?? []) {
        if (axis?.axis) legacyByAxis.set(axis.axis, axis.legacyCode ?? null)
      }

      const output = row.vnext_engine_output as {
        poaClassification?: {
          perception?: { selectedCode?: string; status?: string }
          objective?: { selectedCode?: string; status?: string }
          action?: { selectedCode?: string; status?: string }
        }
      }

      return compareShadowTripletV1({
        perception: {
          legacyCode: legacyByAxis.get('perception') ?? null,
          vnextCode: output.poaClassification?.perception?.selectedCode ?? null,
          vnextStatus: output.poaClassification?.perception?.status ?? null,
        },
        objective: {
          legacyCode: legacyByAxis.get('objective') ?? null,
          vnextCode: output.poaClassification?.objective?.selectedCode ?? null,
          vnextStatus: output.poaClassification?.objective?.status ?? null,
        },
        action: {
          legacyCode: legacyByAxis.get('action') ?? null,
          vnextCode: output.poaClassification?.action?.selectedCode ?? null,
          vnextStatus: output.poaClassification?.action?.status ?? null,
        },
      })
    })

    const metrics = aggregateShadowDivergenceV1(comparisons)

    return NextResponse.json({
      contractId: 'SERA_SHADOW_DIVERGENCE_V1',
      tenantScoped: true,
      readOnly: true,
      shadowFlagsNote: 'SERA_SHADOW_ADMIN_VIEW_ENABLED must be true for this route; all other shadow flags remain independent.',
      ercExcluded: true,
      count: rows.length,
      metrics,
      rows: rows.map((row, index) => ({
        id: row.id,
        shadowRunId: row.shadow_run_id,
        legacyAnalysisId: row.legacy_analysis_id,
        legacyEventId: row.legacy_event_id,
        createdAt: row.created_at,
        validationStatus: row.validation_status,
        comparison: comparisons[index],
      })),
    })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError(String(error), 500)
  }
}
