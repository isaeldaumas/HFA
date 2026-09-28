import type { SeraPreconditionCandidate, SeraVNextEngineOutput } from './engine-contract'

export type PreconditionContextReadout = {
  supported: string[]
  contextual: string[]
  rejected: string[]
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function hasAny(texts: string[], pattern: RegExp): boolean {
  return texts.some((text) => pattern.test(normalize(text)))
}

export function buildPreconditionContextReadout(
  output: SeraVNextEngineOutput,
  candidate: SeraPreconditionCandidate,
  pt = true,
): PreconditionContextReadout | null {
  if (candidate.canonicalCategory !== 'ENVIRONMENT') return null

  const candidateEvidence = candidate.evidence ?? []
  const factual = output.factualExtraction.evidence ?? []
  const rejectedEvidence = factual
    .filter((item) => item.assertionStatus === 'REJECTED_AS_FACTOR')
    .map((item) => item.statement)
  const supported: string[] = []
  const contextual: string[] = []
  const rejected: string[] = []

  if (hasAny(candidateEvidence, /\b(proxim|proximo|proxima|nearby|adjacent|1[,.]7\s*nm|rota\b.*\bunidade|unidade\b.*\brota)\b/)) {
    supported.push(pt
      ? 'Geometria/proximidade operacional entre os destinos ou unidades: sustentada pela evidência do evento.'
      : 'Operational geometry/proximity between destinations or units: supported by event evidence.')
  }

  const eventStatements = factual
    .filter((item) => item.occurrenceScope !== 'HISTORICAL_COMPARATOR' && item.temporalRelation !== 'POST_ESCAPE')
    .map((item) => item.statement)
  const windEvidence = [...candidateEvidence, ...eventStatements].filter((text, index, all) =>
    /\b(vento|wind)\b/i.test(normalize(text)) && all.indexOf(text) === index,
  )
  if (windEvidence.length > 0) {
    const conditional = windEvidence.some((text) => /\b(poderia|pode ter|could|might|may have|possivel|possivelmente)\b/i.test(normalize(text)))
    ;(conditional ? contextual : supported).push(pt
      ? (conditional
          ? 'Vento/correções de proa: contexto possível; a fonte usa linguagem condicional e não sustenta causalidade independente.'
          : 'Vento/correções de proa: condição presente e sustentada como contexto operacional.')
      : (conditional
          ? 'Wind/heading corrections: possible context; the source uses conditional wording and does not establish independent causality.'
          : 'Wind/heading corrections: present and supported as operational context.'))
  }

  if (hasAny(rejectedEvidence, /\b(visibil\w*|meteorolog\w*|weather\w*)\b/)) {
    rejected.push(pt
      ? 'Meteorologia/visibilidade genérica: a investigação registra esse fator como não contribuinte; não deve ser usado para justificar a pré-condição.'
      : 'Generic weather/visibility: the investigation records this factor as non-contributory and it must not justify the precondition.')
  }

  if (!supported.length && !contextual.length && !rejected.length) return null
  return { supported, contextual, rejected }
}
