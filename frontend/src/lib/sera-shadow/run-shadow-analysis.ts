import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { analyzeSeraVNext } from '@/lib/sera-vnext/engine'
import { SERA_VNEXT_ENGINE_VERSION } from '@/lib/sera-vnext/constants'
import type { PoaAxis } from '@/lib/sera-vnext/types'
import { isShadowExecutionEnabled, isShadowPersistenceEnabled } from './feature-flags'
import { findExistingShadowResult, insertShadowResult } from './repository'
import type { ShadowAxisDivergence, ShadowRunContext, ShadowRunOutcome, ShadowRunSummary } from './types'

const SERA_VNEXT_METHODOLOGY_VERSION = 'SERA_PT_V1_FROZEN'

function buildShadowRunId(tenantId: string, legacyAnalysisId: string | null, engineVersion: string): string {
  return createHash('sha256')
    .update(`${tenantId}:${legacyAnalysisId ?? 'no-analysis'}:${engineVersion}`)
    .digest('hex')
    .slice(0, 32)
}

function computeAxisDivergence(
  axis: PoaAxis,
  legacyCode: string | null,
  vnextSelectedCode: string,
  vnextStatus: string
): ShadowAxisDivergence {
  const vnextCandidateCode = vnextStatus === 'CLASSIFIED' ? vnextSelectedCode : null
  const diverges = legacyCode !== null && vnextCandidateCode !== null && legacyCode !== vnextCandidateCode
  let note: string
  if (vnextStatus !== 'CLASSIFIED') {
    note = `vNext requer revisão humana (${vnextStatus}); legado fechou em '${legacyCode ?? 'null'}' sem gate humano — ver F-03.`
  } else if (diverges) {
    note = `Divergência: legado='${legacyCode}' vNext='${vnextCandidateCode}'.`
  } else {
    note = 'Sem divergência detectável nesta comparação.'
  }
  return { axis, legacyCode, vnextCandidateCode, vnextStatus, diverges, note }
}

/**
 * Roda o motor vNext em shadow mode ao lado do motor legado, sem nunca afetar o fluxo de
 * produção. Restrições (docs/auditoria-hfa/terceira-etapa/05-arquitetura-shadow-mode.md):
 *   - Nunca lança para o chamador — falha do vNext não pode derrubar o fluxo legado.
 *   - Nunca substitui o resultado de produção.
 *   - Nunca dispara ação corretiva.
 *   - Reprocessamento idempotente (shadow_run_id determinístico + check-then-insert).
 *   - Isolado por tenant (mesma ressalva de RLS registrada em F-01).
 */
export async function runShadowVNextIfEnabled(args: {
  admin: SupabaseClient
  narrative: string
  context: ShadowRunContext
}): Promise<ShadowRunOutcome> {
  if (!isShadowExecutionEnabled()) return { status: 'SKIPPED_DISABLED' }

  const shadowRunId = buildShadowRunId(
    args.context.tenantId,
    args.context.legacyAnalysisId,
    SERA_VNEXT_ENGINE_VERSION
  )

  try {
    if (isShadowPersistenceEnabled()) {
      const existing = await findExistingShadowResult(args.admin, args.context.tenantId, shadowRunId)
      if (existing) return { status: 'SKIPPED_ALREADY_RUN', shadowRunId }
    }

    const engineOutput = await analyzeSeraVNext({
      inputId: shadowRunId,
      narrative: args.narrative,
      sourceType: 'user_event',
      locale: 'pt-BR',
      options: { allowLlm: false, requireHumanReview: true },
    })

    const legacyCodes = args.context.legacyCodes ?? { perception: null, objective: null, action: null }
    const axisDivergences: ShadowAxisDivergence[] = [
      computeAxisDivergence(
        'perception',
        legacyCodes.perception,
        engineOutput.poaClassification.perception.selectedCode,
        engineOutput.poaClassification.perception.status
      ),
      computeAxisDivergence(
        'objective',
        legacyCodes.objective,
        engineOutput.poaClassification.objective.selectedCode,
        engineOutput.poaClassification.objective.status
      ),
      computeAxisDivergence(
        'action',
        legacyCodes.action,
        engineOutput.poaClassification.action.selectedCode,
        engineOutput.poaClassification.action.status
      ),
    ]

    const summary: ShadowRunSummary = {
      shadowRunId,
      humanReviewRequired: engineOutput.humanReviewRequired,
      axisDivergences,
    }

    if (isShadowPersistenceEnabled()) {
      await insertShadowResult(args.admin, {
        tenant_id: args.context.tenantId,
        legacy_analysis_id: args.context.legacyAnalysisId,
        legacy_event_id: args.context.legacyEventId,
        shadow_run_id: shadowRunId,
        legacy_engine_version: args.context.legacyEngineVersion,
        vnext_engine_version: SERA_VNEXT_ENGINE_VERSION,
        vnext_methodology_version: SERA_VNEXT_METHODOLOGY_VERSION,
        vnext_engine_output: engineOutput as unknown as Record<string, unknown>,
        divergence_summary: summary as unknown as Record<string, unknown>,
        human_review_required: true,
        generated_by_type: 'deterministic_engine',
        validation_status: 'not_validated',
      })
    }

    return { status: 'RECORDED', summary, engineOutput }
  } catch (error) {
    // Fail-safe absoluto: shadow mode nunca pode impedir o fluxo legado (requisito §7.1).
    return { status: 'FAILED_SAFE', error: error instanceof Error ? error.message : String(error) }
  }
}
