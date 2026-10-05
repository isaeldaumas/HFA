import { runSeraVNextEngineV0 } from '@/lib/sera-vnext/engine-v0/run-engine'
import { enrichSeraNarrativeSemantically, enrichSeraPoaSemantically } from '@/lib/sera-vnext/ai/semantic-enrichment'
import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { conflict } from '../errors'
import { hashJson, sha256Hex, stableJson } from '../hashing'
import type { SeraVNextCreateAnalysisInput, SeraVNextCreateAnalysisResult, SeraVNextProductContext } from '../types'
import { getSeraVNextProductVersionSet } from '../versioning'
import { createAuditEvent } from './create-audit-event'
import { createSeraVNextProductRepository, type SeraVNextProductRepository } from './repositories'

function assertNonFinalOutput(output: SeraVNextEngineOutput): void {
  if (
    output.selectedCode !== null ||
    output.releasedCode !== null ||
    output.finalConclusion !== null ||
    output.classifiedOutput !== false ||
    output.readyPromotion !== false ||
    output.downstreamAllowed !== false
  ) {
    throw new Error('SERA_VNEXT_PRODUCT_BETA_FINAL_OUTPUT_LOCK_VIOLATED')
  }
}

function buildEngineInput(
  input: SeraVNextCreateAnalysisInput,
  context: SeraVNextProductContext,
  semantic?: Awaited<ReturnType<typeof enrichSeraNarrativeSemantically>> | null,
): SeraVNextEngineInput {
  return {
    inputId: input.clientRequestId,
    narrative: input.narrative,
    locale: input.locale ?? 'pt-BR',
    sourceType: input.sourceType === 'TRAINING' ? 'neutral_trial' : 'real_event',
    sourceReference: input.sourceReference ?? undefined,
    requestId: context.requestId,
    mode: 'CANDIDATE_ONLY',
    supplementalEvidence: input.supplementalEvidence,
    semanticEvidence: semantic?.annotations,
    semanticSafeOperationModel: semantic?.safeOperationModel ?? undefined,
    semanticEnrichmentMeta: semantic?.meta,
    options: {
      allowLlm: Boolean(semantic),
      includeDebugTrace: false,
      requireHumanReview: true,
    },
  }
}

function collectWarnings(output: SeraVNextEngineOutput, inputWarnings: string[]): string[] {
  const warnings = new Set<string>(['NON_FINAL_OUTPUT_ONLY', 'HUMAN_REVIEW_REQUIRED', ...inputWarnings])
  if (output.canonicalTraversal.status !== 'COMPLETED_CANDIDATE_ONLY') warnings.add('CANONICAL_TRAVERSAL_REVIEW_REQUIRED')
  if (output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION') warnings.add('ADDITIONAL_EVIDENCE_REQUIRED')
  if (output.directActor.status !== 'IDENTIFIED') warnings.add('DIRECT_ACTOR_REVIEW_REQUIRED')
  if (output.preconditions.length === 0) warnings.add('NO_PRECONDITION_CANDIDATE')
  for (const [name, violated] of Object.entries(output.guardrails)) {
    if (violated) warnings.add(`GUARDRAIL_VIOLATED_${name.toUpperCase()}`)
  }
  return [...warnings]
}

export async function createSeraVNextAnalysis(args: {
  input: SeraVNextCreateAnalysisInput & { warnings?: string[]; sourceFlowOverride?: 'VNEXT_CANONICAL' | 'VNEXT_PRODUCT_BETA' }
  context: SeraVNextProductContext
  repository?: SeraVNextProductRepository
}): Promise<SeraVNextCreateAnalysisResult> {
  const repository = args.repository ?? createSeraVNextProductRepository()
  const narrativeHash = sha256Hex(args.input.narrative)
  const existing = await repository.findAnalysisByClientRequest(args.context.tenantId, args.input.clientRequestId)
  if (existing) {
    if (
      existing.narrative_hash !== narrativeHash ||
      existing.title !== args.input.title ||
      existing.source_type !== args.input.sourceType
    ) {
      throw conflict('clientRequestId já foi usado com payload divergente neste tenant.')
    }
    const revisions = await repository.listRevisions(args.context.tenantId, existing.id)
    return { analysis: existing, revision: revisions[0], idempotent: true }
  }

  const versions = getSeraVNextProductVersionSet()
  const effectiveSourceFlow = args.input.sourceFlowOverride ?? versions.sourceFlow
  const semanticAiRequired = args.input.metadata?.semanticAiRequired === true
  let semantic = semanticAiRequired
    ? await enrichSeraNarrativeSemantically({ narrative: args.input.narrative, locale: args.input.locale ?? 'pt-BR' })
    : null
  let engineInput = buildEngineInput(args.input, args.context, semantic)
  let engineOutput = runSeraVNextEngineV0(engineInput)

  const escapePoint = engineOutput.escapePoint.firstDepartureCandidate ?? engineOutput.escapePoint.poaAnchorCandidate
  const needsFocusedPoa = semantic
    && engineOutput.directActor.status === 'IDENTIFIED'
    && Boolean(engineOutput.directActor.actor)
    && Boolean(escapePoint)
    && engineOutput.evidenceSufficiency.questions.some((question) => ['PERCEPTION', 'OBJECTIVE', 'ACTION'].includes(question.stage))
  if (needsFocusedPoa && semantic && escapePoint && engineOutput.directActor.actor) {
    try {
      const focused = await enrichSeraPoaSemantically({
        narrative: args.input.narrative,
        locale: args.input.locale ?? 'pt-BR',
        escapePoint,
        directActor: engineOutput.directActor.actor,
      })
      if (focused.annotations.length > 0) {
        const merged = [...semantic.annotations]
        const seen = new Set(merged.map((item) => `${item.sourceSentenceIndex}:${item.sourceQuote}:${item.roles.join(',')}:${item.actor ?? ''}:${item.preconditionCategory ?? ''}:${item.preconditionCausalStatus ?? ''}:${item.preconditionCausalTargetQuote ?? ''}:${item.actionFailureMechanism ?? ''}:${item.actionMechanismEvidenceQuote ?? ''}:${item.displayInterpretation ?? ''}:${item.concepts?.join(',') ?? ''}`))
        for (const item of focused.annotations) {
          const key = `${item.sourceSentenceIndex}:${item.sourceQuote}:${item.roles.join(',')}:${item.actor ?? ''}:${item.preconditionCategory ?? ''}:${item.preconditionCausalStatus ?? ''}:${item.preconditionCausalTargetQuote ?? ''}:${item.actionFailureMechanism ?? ''}:${item.actionMechanismEvidenceQuote ?? ''}:${item.displayInterpretation ?? ''}:${item.concepts?.join(',') ?? ''}`
          if (!seen.has(key)) { seen.add(key); merged.push(item) }
        }
        semantic = {
          ...semantic,
          annotations: merged,
          meta: {
            ...semantic.meta,
            provider: focused.meta.provider,
            model: focused.meta.model,
            acceptedAnnotations: merged.length,
            rejectedAnnotations: semantic.meta.rejectedAnnotations + focused.meta.rejectedAnnotations,
          },
        }
        engineInput = buildEngineInput(args.input, args.context, semantic)
        engineOutput = runSeraVNextEngineV0(engineInput)
      }
    } catch (error) {
      console.warn('[SERA semantic P/O/A focus] falling back to primary semantic pass', error instanceof Error ? error.message : String(error))
    }
  }
  assertNonFinalOutput(engineOutput)
  const outputHash = hashJson(engineOutput)
  const warnings = collectWarnings(engineOutput, args.input.warnings ?? [])
  const initialStatus = engineOutput.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
    ? 'REQUIRES_MORE_EVIDENCE' as const
    : 'CANDIDATE_ANALYSIS_CREATED' as const
  const initialReviewStatus = engineOutput.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
    ? 'MORE_EVIDENCE_REQUIRED' as const
    : 'NOT_REVIEWED' as const

  const analysis = await repository.insertAnalysis({
    tenant_id: args.context.tenantId,
    created_by: args.context.userId,
    deleted_at: null,
    status: initialStatus,
    review_status: initialReviewStatus,
    title: args.input.title,
    narrative: args.input.narrative,
    narrative_hash: narrativeHash,
    source_type: args.input.sourceType,
    source_reference: args.input.sourceReference ?? null,
    client_request_id: args.input.clientRequestId,
    request_id: args.context.requestId,
    engine_version: versions.engineVersion,
    engine_runtime_version: versions.engineRuntimeVersion,
    methodology_version: versions.methodologyVersion,
    baseline_id: versions.baselineId,
    fixture_set_id: versions.fixtureSetId,
    input_schema_version: versions.inputSchemaVersion,
    output_schema_version: versions.outputSchemaVersion,
    code_commit: versions.codeCommit,
    source_flow: effectiveSourceFlow,
    canonical_tree_version: versions.canonicalTreeVersion,
    engine_input: engineInput,
    engine_output: engineOutput,
    engine_output_hash: outputHash,
    escape_point_status: engineOutput.escapePoint.status,
    escape_point_statement: engineOutput.escapePoint.statement,
    direct_actor: engineOutput.directActor.actor,
    perception_candidate_code: engineOutput.axes.perception.proposedCode,
    objective_candidate_code: engineOutput.axes.objective.proposedCode,
    action_candidate_code: engineOutput.axes.action.proposedCode,
    warnings,
    uncertainties: engineOutput.uncertainties,
    limitations: engineOutput.limitations,
    current_revision: 1,
    metadata: {
      ...(args.input.metadata ?? {}),
      inputPayloadHash: hashJson({ title: args.input.title, narrativeHash, sourceType: args.input.sourceType }),
      stableEngineOutput: stableJson(engineOutput).length,
      provenance: {
        codeCommit: versions.codeCommit,
        codeCommitSource: versions.codeCommitSource,
        deploymentId: versions.deploymentId,
        semanticEnrichment: semantic?.meta ?? null,
        semanticLayer: semantic ? 'AI_EXTRACTION_DETERMINISTIC_SERA_TRAVERSAL' : 'DETERMINISTIC_FALLBACK',
      },
    },
    // Proveniência metodológica: a IA faz extração semântica ancorada em citações verificadas;
    // a travessia Hendy/SERA e os guardrails continuam determinísticos e candidate-only.
    engine_id: 'SERA_VNEXT_ENGINE',
    taxonomy_version: versions.canonicalTreeVersion,
    risk_method_id: null, // risco permanece locked no vNext (canonical method question lock).
    risk_method_version: null,
    generated_by_type: semantic ? 'llm_suggestion' : 'deterministic_engine',
    validation_status: 'not_validated',
  })

  const revision = await repository.insertRevision({
    analysis_id: analysis.id,
    tenant_id: args.context.tenantId,
    revision_number: 1,
    created_by: args.context.userId,
    request_id: args.context.requestId,
    engine_version: versions.engineVersion,
    engine_runtime_version: versions.engineRuntimeVersion,
    source_flow: effectiveSourceFlow,
    engine_input: engineInput,
    engine_output: engineOutput,
    engine_output_hash: outputHash,
    reason: 'initial_analysis',
    metadata: { source: 'product_beta_create' },
  })

  await createAuditEvent({
    repository,
    context: args.context,
    analysisId: analysis.id,
    eventType: 'analysis.created',
    toStatus: analysis.status,
    payload: {
      title: analysis.title,
      sourceType: analysis.source_type,
      engineVersion: versions.engineVersion,
      engineRuntimeVersion: versions.engineRuntimeVersion,
      sourceFlow: effectiveSourceFlow,
      codeCommit: versions.codeCommit,
      codeCommitSource: versions.codeCommitSource,
      deploymentId: versions.deploymentId,
      warningsCount: warnings.length,
      evidenceSufficiencyStatus: engineOutput.evidenceSufficiency.status,
      clarificationQuestionIds: engineOutput.evidenceSufficiency.questions.map((item) => item.id),
      guardrailViolations: Object.entries(engineOutput.guardrails)
        .filter(([, violated]) => violated)
        .map(([name]) => name),
    },
  })

  return { analysis, revision, idempotent: false }
}
