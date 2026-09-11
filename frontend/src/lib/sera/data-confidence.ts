// frontend/src/lib/sera/data-confidence.ts
//
// Pure helper — no Supabase, no React, no browser APIs.
// Computes a data confidence indicator for the organizational risk profile.
//
// This is NOT a risk score. It communicates the robustness of the analytical
// base, not the level of risk. Low confidence does not mean low risk or high
// risk — it means the available base is still limited.
//
// RISK v0.9-E

export type DataConfidenceLevel = 'insufficient' | 'limited' | 'moderate' | 'strong'

export type DataConfidenceInput = {
  totalAnalyses: number
  validErcCount: number
  safetyIssueCandidateCount?: number
  minimumRecommended?: number
  /**
   * D3-b: when false, deliberate absence of numeric ERC (vNext-only / mixed suppression)
   * must not alone downgrade level via validErcShare.
   * Default true preserves legacy behavior for pure-legacy profiles.
   */
  ercShareAffectsLevel?: boolean
}

export type DataConfidence = {
  level: DataConfidenceLevel
  total_analyses: number
  minimum_recommended: number
  valid_erc_count: number
  valid_erc_share: number
  has_safety_issue_candidates: boolean
  messages: string[]
  caveat: string
  erc_share_affects_level: boolean
}

const CAVEAT =
  'Este indicador comunica confiança dos dados, não nível de risco. Baixa confiança não significa risco baixo ou alto; significa que a base ainda é limitada para conclusões organizacionais robustas.'

export function buildDataConfidence(input: DataConfidenceInput): DataConfidence {
  const minimumRecommended = Math.max(0, input.minimumRecommended ?? 10)
  const totalAnalyses = Math.max(0, input.totalAnalyses ?? 0)
  // validErcCount cannot exceed totalAnalyses
  const validErcCount = Math.min(
    Math.max(0, input.validErcCount ?? 0),
    totalAnalyses,
  )
  const safetyIssueCandidateCount = Math.max(0, input.safetyIssueCandidateCount ?? 0)
  const hasCandidates = safetyIssueCandidateCount > 0
  const ercShareAffectsLevel = input.ercShareAffectsLevel !== false

  const validErcShare = totalAnalyses > 0 ? validErcCount / totalAnalyses : 0

  // --- Level ---
  let level: DataConfidenceLevel
  if (totalAnalyses === 0) {
    level = 'insufficient'
  } else if (totalAnalyses < minimumRecommended) {
    level = 'limited'
  } else if (ercShareAffectsLevel && validErcShare < 0.8) {
    level = 'moderate'
  } else {
    level = 'strong'
  }

  // --- Messages ---
  const messages: string[] = []

  if (totalAnalyses === 0) {
    messages.push('Ainda não há análises suficientes para formar um perfil organizacional.')
  } else if (totalAnalyses < minimumRecommended) {
    messages.push(
      `Perfil em formação: recomenda-se pelo menos ${minimumRecommended} análises para leitura inicial.`,
    )
  }

  if (ercShareAffectsLevel && totalAnalyses > 0 && validErcShare < 0.8) {
    messages.push(
      'Parte das análises ainda não possui ERC válido; interpretações por risco devem ser cautelosas.',
    )
  } else if (!ercShareAffectsLevel && totalAnalyses > 0) {
    messages.push(
      'D3-b: ausência deliberada de ERC numérico no vNext (ou perfil misto sem consolidado) não reduz sozinha a confiança dos dados.',
    )
  }

  if (hasCandidates) {
    messages.push(
      'Candidatos a Safety Issue indicam recorrência observada e requerem revisão de contexto, exposição e barreiras.',
    )
  } else if (totalAnalyses > 0) {
    messages.push(
      'Ausência de candidatos a Safety Issue não significa ausência de padrões organizacionais.',
    )
  }

  return {
    level,
    total_analyses: totalAnalyses,
    minimum_recommended: minimumRecommended,
    valid_erc_count: validErcCount,
    valid_erc_share: validErcShare,
    has_safety_issue_candidates: hasCandidates,
    messages,
    caveat: CAVEAT,
    erc_share_affects_level: ercShareAffectsLevel,
  }
}
