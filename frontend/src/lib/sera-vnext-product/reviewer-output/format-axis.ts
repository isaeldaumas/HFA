import type { SeraAxisCandidate } from '@/lib/sera-vnext/engine-contract'
import type { SeraReviewerAxisCard } from './types'
import { summarizeEvidence, confidenceLabel } from './format-evidence'
import { perceptionReviewerQuestion, objectiveReviewerQuestion, actionReviewerQuestion, axisReviewerMustDecide } from './format-review-prompts'

const SERA_CODE_MEANINGS: Record<string, string> = {
  'P-A': 'Nenhuma falha perceptiva independente demonstrada — a avaliação da situação era adequada para a evidência disponível no ponto de fuga',
  'P-B': 'Falha sensorial/perceptiva — o estímulo necessário estava indisponível, degradado ou não podia ser adequadamente captado pelos sentidos',
  'P-C': 'Falha de conhecimento/percepção — havia lacuna de conhecimento, familiaridade ou compreensão necessária para interpretar corretamente o estímulo',
  'P-D': 'Captura/sobrecarga atencional sob demanda crítica — pressão operacional/temporal dominante comprometeu a atenção necessária',
  'P-E': 'Falha de estimativa ou gerenciamento temporal perceptivo — o tempo, sequência ou evolução do estado foi avaliado incorretamente',
  'P-F': 'Ilusão ou distorção perceptiva — o estímulo disponível induziu uma percepção sensorial enganosa',
  'P-G': 'Falha de monitoramento/verificação — a informação necessária estava disponível e correta, mas não foi monitorada, checada, integrada ou acompanhada adequadamente',
  'P-H': 'Falha de comunicação/informação — a informação necessária estava ausente, incompleta, ambígua ou conflitante entre fontes independentes',
  'O-A': 'Nenhuma falha de objetivo — o objetivo operacional era apropriado e não há evidência de intenção desviante no ponto de fuga',
  'O-B': 'Violação rotineira/normalizada — o objetivo envolvia um desvio habitual, culturalmente tolerado ou normalizado',
  'O-C': 'Violação excepcional/consciente — há evidência de conhecimento da regra/limite e decisão consciente de prosseguir; também cobre objetivo humano/protetivo explícito quando aplicável',
  'O-D': 'Objetivo operacional inadequado apesar de compatível com regras gerais — a meta perseguida era incompatível com procedimento operacional estabelecido ou não gerenciava/limitava adequadamente o risco',
  'A-A': 'Nenhuma falha de ação independente — a ação executada foi coerente com a percepção e o objetivo do ator, sem outro mecanismo específico de falha de ação',
  'A-B': 'Deslize, lapso ou omissão procedural — falha específica de implementação distinta da falha perceptiva',
  'A-C': 'Falha de feedback da própria execução — o resultado da própria ação não foi verificado ou confirmado adequadamente',
  'A-D': 'Inabilidade para responder — limitação física, ergonômica, de alcance, força ou execução impediu a resposta apropriada',
  'A-E': 'Falha de conhecimento/habilidade para agir — faltou competência técnica necessária para selecionar ou implementar a resposta apropriada',
  'A-F': 'Falha na seleção da ação — entre alternativas disponíveis foi escolhida uma resposta inadequada, sem pressão temporal dominante',
  'A-G': 'Falha de feedback/verificação/supervisão — uma barreira formal de feedback, cross-check, delegação ou verificação esperada não funcionou, sem pressão temporal dominante',
  'A-H': 'Falha no gerenciamento do tempo da ação — a execução ocorreu com temporização inadequada',
  'A-I': 'Falha de seleção sob pressão temporal — a escolha da ação foi inadequada em contexto de pressão de tempo excessiva dominante',
  'A-J': 'Falha de feedback/comunicação sob pressão temporal — confirmação, readback, recebimento ou feedback falhou sob pressão de tempo excessiva dominante',
}

function codeMeaning(code: string | null): string | null {
  if (!code) return null
  return SERA_CODE_MEANINGS[code.toUpperCase()] ?? `Código ${code} — significado não mapeado`
}

function plainLanguageQuestion(axis: 'P' | 'O' | 'A'): string {
  if (axis === 'P') return perceptionReviewerQuestion()
  if (axis === 'O') return objectiveReviewerQuestion()
  return actionReviewerQuestion()
}

function formatCandidateStatus(status: string): string {
  const map: Record<string, string> = {
    CANDIDATE: 'Candidato — código sugerido com base na evidência disponível',
    NO_FAILURE: 'Sem falha neste eixo — evidência indica operação dentro do esperado',
    INSUFFICIENT_EVIDENCE: 'Evidência insuficiente — análise não pôde determinar código candidato',
    UNRESOLVED: 'Não resolvido — eixo permanece em revisão humana',
  }
  return map[status] ?? status
}

export function buildAxisReviewerCard(
  axis: 'P' | 'O' | 'A',
  candidate: SeraAxisCandidate,
): SeraReviewerAxisCard {
  const supporting = summarizeEvidence(candidate.supportingEvidence)
  const counter = summarizeEvidence(candidate.counterEvidence)
  const excluded = summarizeEvidence(candidate.excludedPostEscapeEvidence)

  const whySuggested: string[] =
    supporting.length > 0
      ? supporting
      : ['Nenhuma evidência explícita positiva registrada — análise baseada em ausência de contraindicicação.']

  const whyMayBeWrong: string[] =
    counter.length > 0
      ? counter
      : ['Nenhuma evidência contrária explícita registrada.']

  const alternatives =
    candidate.alternativesConsidered.length > 0
      ? candidate.alternativesConsidered
      : ['Nenhuma alternativa explicitamente registrada pelo motor neste eixo.']

  return {
    axis,
    plainLanguageQuestion: plainLanguageQuestion(axis),
    candidateStatus: formatCandidateStatus(candidate.status),
    candidateCode: candidate.proposedCode,
    candidateMeaning: codeMeaning(candidate.proposedCode),
    statementAtEscapePoint: candidate.statementAtEscapePoint,
    whyCandidateWasSuggested: whySuggested,
    whyItMayBeWrong: whyMayBeWrong,
    alternativesConsidered: alternatives,
    evidenceUsed: supporting,
    evidenceExcluded: excluded,
    confidence: confidenceLabel(candidate.confidence),
    reviewerMustDecide: axisReviewerMustDecide(axis),
  }
}
