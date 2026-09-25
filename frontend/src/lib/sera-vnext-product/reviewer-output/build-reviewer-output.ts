import type { SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import type { SeraReviewerOutput, SeraReviewerRecommendedNextStep } from './types'
import { buildAxisReviewerCard } from './format-axis'
import { buildEscapePointReview } from './format-escape-point'
import { buildPreconditionReview } from './format-preconditions'
import { summarizeEvidence } from './format-evidence'
import { reviewDecisionChecklist } from './format-review-prompts'

function inferRecommendedNextStep(output: SeraVNextEngineOutput): SeraReviewerRecommendedNextStep {
  const { escapePoint, axes } = output
  if (
    escapePoint.status === 'INSUFFICIENT_EVIDENCE' ||
    escapePoint.status === 'NO_HUMAN_ESCAPE_POINT'
  ) {
    return 'REQUIRES_MORE_EVIDENCE'
  }
  if (escapePoint.status === 'PROGRESSIVE_ZONE') {
    return 'RETURN_FOR_REANALYSIS'
  }
  const allInsufficientEvidence =
    axes.perception.status === 'INSUFFICIENT_EVIDENCE' &&
    axes.objective.status === 'INSUFFICIENT_EVIDENCE' &&
    axes.action.status === 'INSUFFICIENT_EVIDENCE'
  if (allInsufficientEvidence) return 'REQUIRES_MORE_EVIDENCE'
  const anyUnresolved =
    axes.perception.status === 'UNRESOLVED' ||
    axes.objective.status === 'UNRESOLVED' ||
    axes.action.status === 'UNRESOLVED'
  if (anyUnresolved) return 'RETURN_FOR_REANALYSIS'
  return 'ACCEPT_AS_WORKING_HYPOTHESIS'
}

function inferRationale(output: SeraVNextEngineOutput): string {
  const step = inferRecommendedNextStep(output)
  if (step === 'REQUIRES_MORE_EVIDENCE') {
    return 'A evidência disponível não é suficiente para sustentar uma hipótese de trabalho com razoável confiança. Solicite evidência adicional antes de decidir.'
  }
  if (step === 'RETURN_FOR_REANALYSIS') {
    return 'Um ou mais eixos permanecem não resolvidos, ou o ponto de fuga é progressivo. Retorne para reanálise com escopo ou evidência refinada.'
  }
  if (step === 'REJECT_WORKING_HYPOTHESIS') {
    return 'A evidência contrária supera a evidência de suporte para os eixos candidatos. Rejeite a hipótese de trabalho.'
  }
  return 'Os eixos candidatos são sustentados pela evidência disponível. Esta análise pode ser aceita como hipótese de trabalho não final para fins de revisão interna.'
}

function buildUncertaintyReview(output: SeraVNextEngineOutput): SeraReviewerOutput['uncertaintyReview'] {
  const uncertainties = summarizeEvidence(output.uncertainties)
  const pkg = output.humanReviewPackage
  const unanswered = summarizeEvidence(pkg?.unansweredQuestions ?? [])
  const warnings = summarizeEvidence(pkg?.criticalWarnings ?? [])

  const evidenceNeeded: string[] = [...warnings]
  if (uncertainties.length === 0 && unanswered.length === 0) {
    evidenceNeeded.push('Nenhuma incerteza crítica registrada. Avalie se isso reflete disponibilidade real de evidência.')
  }

  return {
    uncertainties: uncertainties.length > 0 ? uncertainties : ['Nenhuma incerteza registrada explicitamente.'],
    unansweredQuestions: unanswered.length > 0 ? unanswered : ['Nenhuma pergunta aberta registrada.'],
    evidenceNeeded,
  }
}

export function buildReviewerOutput(engineOutput: SeraVNextEngineOutput): SeraReviewerOutput {
  const escapePointStatus = engineOutput.escapePoint.status
  const hasWorkableCandidate =
    escapePointStatus === 'CANDIDATE' || escapePointStatus === 'PROGRESSIVE_ZONE'

  let overallUsefulnessWarning: string | undefined
  if (!hasWorkableCandidate) {
    overallUsefulnessWarning =
      'Atenção: o ponto de fuga não está classificado como candidato viável. A análise de eixos abaixo pode ter utilidade limitada.'
  }

  return {
    summary: {
      headline: `Análise SERA 0.3 — ponto de fuga: ${engineOutput.escapePoint.statement ?? 'não determinado'}`,
      nonFinalNotice:
        'Esta análise SERA 0.3 é não final até a revisão humana. Os campos finais e downstream permanecem bloqueados até essa revisão.',
      overallUsefulnessWarning,
    },

    escapePointReview: buildEscapePointReview(engineOutput.escapePoint),

    axisReviews: {
      perception: buildAxisReviewerCard('P', engineOutput.axes.perception),
      objective: buildAxisReviewerCard('O', engineOutput.axes.objective),
      action: buildAxisReviewerCard('A', engineOutput.axes.action),
    },

    preconditionReview: buildPreconditionReview(engineOutput.preconditions),

    uncertaintyReview: buildUncertaintyReview(engineOutput),

    humanDecisionGuide: {
      recommendedNextStep: inferRecommendedNextStep(engineOutput),
      rationale: inferRationale(engineOutput),
      decisionChecklist: reviewDecisionChecklist(),
    },
  }
}
