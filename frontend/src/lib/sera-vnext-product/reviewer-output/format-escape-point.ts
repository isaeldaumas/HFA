import type { SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import type { SeraReviewerOutput } from './types'
import { summarizeEvidence, confidenceLabel } from './format-evidence'
import { escapePointReviewerQuestion, escapePointReviewerOptions } from './format-review-prompts'

type EscapePointOutput = SeraVNextEngineOutput['escapePoint']

function boundaryWarnings(status: string): string[] {
  if (status === 'PROGRESSIVE_ZONE') {
    return [
      'Zona progressiva — o ponto de fuga não é discreto, ocorre em um intervalo de tempo.',
      'O revisor deve confirmar que o intervalo está delimitado corretamente no relato.',
    ]
  }
  if (status === 'INSUFFICIENT_EVIDENCE') {
    return [
      'Evidência insuficiente para delimitar o ponto de fuga com precisão.',
      'O revisor deve avaliar se o relato contém informação suficiente para análise causal.',
    ]
  }
  if (status === 'NO_HUMAN_ESCAPE_POINT') {
    return [
      'Motor não identificou ponto de fuga humano — a análise pode não ser aplicável a este caso.',
      'O revisor deve confirmar se há ator humano com capacidade de intervenção no relato.',
    ]
  }
  return []
}

export function buildEscapePointReview(escapePoint: EscapePointOutput): SeraReviewerOutput['escapePointReview'] {
  const supporting = summarizeEvidence(escapePoint.supportingEvidence)
  const counter = summarizeEvidence(escapePoint.counterEvidence)

  return {
    candidateStatement: escapePoint.statement,
    reviewerQuestion: escapePointReviewerQuestion(),
    whyThisMatters: 'Hendy distingue a primeira saída da operação segura do ato/condição insegura crítica. Quando os marcos diferem, o primeiro delimita a transição seguro→inseguro e ancora P/O/A; o ato crítico posterior permanece registrado como marco downstream. Se essa fronteira estiver incorreta, toda a análise downstream fica comprometida.',
    supportingEvidence: supporting.length > 0 ? supporting : ['Nenhuma evidência explícita de suporte registrada.'],
    counterEvidence: counter.length > 0 ? counter : ['Nenhuma evidência contrária explícita registrada.'],
    boundaryWarnings: [
      ...boundaryWarnings(escapePoint.status),
      ...(escapePoint.anchorBasis === 'FIRST_DEPARTURE_PRIMARY' ? ['Hendy boundary split — primeira saída e ato crítico são marcos distintos; P/O/A permanece ancorado na primeira saída e o ato crítico posterior deve ser revisado separadamente.'] : []),
    ],
    confidence: confidenceLabel(escapePoint.confidence),
    reviewerOptions: escapePointReviewerOptions(),
  }
}
