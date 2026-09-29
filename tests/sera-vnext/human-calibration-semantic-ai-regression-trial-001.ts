import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { focusedPoaEvidenceExcerpt } from '../../frontend/src/lib/sera-vnext/ai/semantic-enrichment'
import type { SeraSemanticEvidenceAnnotation, SeraSemanticSafeOperationModel } from '../../frontend/src/lib/sera-vnext/engine-contract'

const base = path.join(process.cwd(), 'tests/sera-vnext/human-calibration-fixtures')

type FrozenSemantic = {
  provider: string
  model: string
  safeOperationModel: SeraSemanticSafeOperationModel | null
  annotations: SeraSemanticEvidenceAnnotation[]
}

function runEvent(no: string) {
  const narrative = fs.readFileSync(path.join(base, `evento-${no}.txt`), 'utf8')
  const semantic = JSON.parse(fs.readFileSync(path.join(base, `evento-${no}.semantic.json`), 'utf8')) as FrozenSemantic
  return runSeraVNextEngineV0({
    inputId: `HUMAN-CAL-${no}`, narrative, locale: 'pt-BR', sourceType: 'real_event', requestId: `human-cal-${no}`, mode: 'CANDIDATE_ONLY',
    semanticEvidence: semantic.annotations, semanticSafeOperationModel: semantic.safeOperationModel ?? undefined,
    semanticEnrichmentMeta: { provider: semantic.provider, model: semantic.model, requestedAt: 'frozen-fixture', acceptedAnnotations: semantic.annotations.length, rejectedAnnotations: 0, schemaVersion: 'SERA_SEMANTIC_AI_V1' },
    options: { allowLlm: true, requireHumanReview: true, includeDebugTrace: false },
  })
}

const e1 = runEvent('1')
assert.match(e1.escapePoint.firstDepartureCandidate ?? '', /quinhentos p[eé]s|500 p[eé]s|guardado/i)
assert.match(e1.escapePoint.criticalUnsafeActCandidate ?? '', /meteu.*comandos|puxou.*c[ií]clico|puxou.*coletivo/i)
assert.match(e1.directActor.actor ?? '', /outro piloto|piloto em adapta[cç][aã]o/i)
assert.equal(e1.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')
assert.equal(e1.escapePoint.poaAnchorCandidate, e1.escapePoint.criticalUnsafeActCandidate)
assert.equal(e1.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)
assert.equal(e1.axes.action.supportingEvidence.some((text) => /luz de transmiss[aã]o|praia/i.test(text)), false)
const e1Narrative = fs.readFileSync(path.join(base, 'evento-1.txt'), 'utf8')
const e1Focus = focusedPoaEvidenceExcerpt({ narrative: e1Narrative, criticalAct: e1.escapePoint.criticalUnsafeActCandidate!, directActor: e1.directActor.actor!, firstDeparture: e1.escapePoint.firstDepartureCandidate })
assert.match(e1Focus, /meteu.*comandos|puxou.*c[ií]clico|puxou.*coletivo/i)
assert.match(e1Focus, /quando ele achou que estava tudo certo/i)
assert.doesNotMatch(e1Focus, /luz vermelha de transmiss[aã]o/i, 'focused P\/O\/A excerpt must not drift into the later transmission-light episode')

const e2 = runEvent('2')
assert.match(e2.escapePoint.firstDepartureCandidate ?? '', /500 p[eé]s.*IMC.*continuar|500 p[eé]s.*continuar.*pouso/i)
assert.match(e2.escapePoint.criticalUnsafeActCandidate ?? '', /barra na barra|desacoplou.*automatismo|diretor de voo/i)
assert.match(e2.directActor.actor ?? '', /outro piloto|comandante em treinamento/i)
assert.notEqual(e2.escapePoint.firstDepartureCandidate, e2.escapePoint.criticalUnsafeActCandidate)
assert.equal(e2.axes.perception.supportingEvidence.some((text) => /eu tomei o comando|fiquei t[aã]o cego/i.test(text)), false)
assert.equal(e2.axes.objective.supportingEvidence.some((text) => /eu tomei o comando|fiquei t[aã]o cego/i.test(text)), false)
assert.equal(e2.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)

const e3 = runEvent('3')
assert.match(e3.escapePoint.criticalUnsafeActCandidate ?? '', /tirei.*m[aã]o.*coletivo|desguarneci.*coletivo/i)
assert.match(e3.directActor.actor ?? '', /piloto entrevistado/i)
const e3Narrative = fs.readFileSync(path.join(base, 'evento-3.txt'), 'utf8')
const e3Focus = focusedPoaEvidenceExcerpt({ narrative: e3Narrative, criticalAct: e3.escapePoint.criticalUnsafeActCandidate!, directActor: e3.directActor.actor!, firstDeparture: e3.escapePoint.firstDepartureCandidate })
assert.match(e3Focus, /pra ajudar.*proativo|para ajudar.*proativo/i)
assert.match(e3Focus, /tirei a m[aã]o esquerda do coletivo/i)
assert.match(e3Focus, /vendo ele com o bra[cç]o parado/i)
const e3Categories = new Set(e3.preconditions.map((p) => p.canonicalCategory))
assert.equal(e3Categories.has('PHYSIOLOGICAL'), true)
assert.equal(e3Categories.has('EQUIPMENT'), true)
assert.equal(e3Categories.has('TRAINING_SELECTION'), false, 'explicit training negation must never become a positive training precondition')
assert.equal(e3Categories.has('ENVIRONMENT'), false, 'landing wind from another episode must not become a precondition of removing the hand from the collective')
assert.equal(e3.preconditions.every((p) => p.methodologyMatch === 'HYPOTHESIS_ONLY' && p.confidence === 'LOW'), true)

const e4 = runEvent('4')
assert.match(e4.escapePoint.firstDepartureCandidate ?? '', /julguei.*lado.*pouso|julgamento errado.*lado/i)
assert.match(e4.escapePoint.criticalUnsafeActCandidate ?? '', /julguei.*lado.*pouso|preferido.*pouso|mais trabalhoso/i)
assert.match(e4.directActor.actor ?? '', /piloto entrevistado/i)
assert.equal(e4.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)
assert.equal(e4.axes.perception.supportingEvidence.some((text) => /depois de pousado/i.test(text)), false, 'post-landing evaluation cannot be used as pre-critical perception')

console.log('PASS human calibration semantic AI regression — four naturalistic interviews')
