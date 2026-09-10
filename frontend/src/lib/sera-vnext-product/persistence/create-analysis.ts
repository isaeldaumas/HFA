import { runSeraVNextEngineV0 } from '@/lib/sera-vnext/engine-v0/run-engine'
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

function buildEngineInput(input: SeraVNextCreateAnalysisInput, context: SeraVNextProductContext): SeraVNextEngineInput {
  return {
    inputId: input.clientRequestId,
    narrative: input.narrative,
    locale: 'pt-BR',
    sourceType: input.sourceType === 'TRAINING' ? 'neutral_trial' : 'real_event',
    sourceReference: input.sourceReference ?? undefined,
    requestId: context.requestId,
    mode: 'CANDIDATE_ONLY',
    options: {
      allowLlm: false,
      includeDebugTrace: false,
      requireHumanReview: true,
    },
  }
}

function collectWarnings(output: SeraVNextEngineOutput, inputWarnings: string[]): string[] {
  const warnings = new Set<string>(['NON_FINAL_OUTPUT_ONLY', 'HUMAN_REVIEW_REQUIRED', ...inputWarnings])
  if (output.canonicalTraversal.status !== 'COMPLETED_CANDIDATE_ONLY') warnings.add('CANONICAL_TRAVERSAL_REVIEW_REQUIRED')
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
  const engineInput = buildEngineInput(args.input, args.context)
  const engineOutput = runSeraVNextEngineV0(engineInput)
  assertNonFinalOutput(engineOutput)
  const outputHash = hashJson(engineOutput)
  const warnings = collectWarnings(engineOutput, args.input.warnings ?? [])

  const analysis = await repository.insertAnalysis({
    tenant_id: args.context.tenantId,
    created_by: args.context.userId,
    deleted_at: null,
    status: 'CANDIDATE_ANALYSIS_CREATED',
    review_status: 'NOT_REVIEWED',
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
    },
    // Proveniência metodológica (auditoria HFA, 3ª etapa). engine-v0 roda com allowLlm:false
    // (buildEngineInput acima) — é puramente determinístico, nunca sugestão de LLM.
    engine_id: 'SERA_VNEXT_ENGINE',
    taxonomy_version: versions.canonicalTreeVersion,
    risk_method_id: null, // risco permanece locked no vNext (canonical method question lock).
    risk_method_version: null,
    generated_by_type: 'deterministic_engine',
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
      warningsCount: warnings.length,
      guardrailViolations: Object.entries(engineOutput.guardrails)
        .filter(([, violated]) => violated)
        .map(([name]) => name),
    },
  })

  return { analysis, revision, idempotent: false }
}
