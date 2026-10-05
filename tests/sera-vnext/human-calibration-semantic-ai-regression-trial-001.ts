import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { focusedPoaEvidenceExcerpt } from '../../frontend/src/lib/sera-vnext/ai/semantic-enrichment'
import { enforceSemanticEvidenceIntegrity } from '../../frontend/src/lib/sera-vnext/evidence/semantic-integrity'
import type { SeraSemanticEvidenceAnnotation, SeraSemanticSafeOperationModel } from '../../frontend/src/lib/sera-vnext/engine-contract'

const base = path.join(process.cwd(), 'tests/sera-vnext/human-calibration-fixtures')

type FrozenSemantic = {
  provider: string
  model: string
  safeOperationModel: SeraSemanticSafeOperationModel | null
  annotations: SeraSemanticEvidenceAnnotation[]
}

const integrityProbeNarrative = 'O piloto disse que pretendia pousar. E se vocês tivessem combinado melhor, isso teria evitado o evento? Depois do pouso ele percebeu que o outro lado era melhor.'
const integrityProbe: SeraSemanticEvidenceAnnotation[] = [
  { id: 'goal', sourceSentenceIndex: 0, sourceQuote: 'O piloto disse que pretendia pousar.', roles: ['OBJECTIVE_INTENT'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', occurrenceScope: 'CURRENT_EVENT', assertionStatus: 'AFFIRMED', confidence: 'HIGH', concepts: [], preconditionCategory: null, rationale: 'probe' },
  { id: 'question', sourceSentenceIndex: 1, sourceQuote: 'E se vocês tivessem combinado melhor, isso teria evitado o evento?', roles: ['PRECONDITION', 'OBJECTIVE_INTENT'], actor: 'piloto', temporalRelation: 'PRE_ESCAPE', occurrenceScope: 'CURRENT_EVENT', assertionStatus: 'AFFIRMED', confidence: 'HIGH', concepts: [], preconditionCategory: 'SOCIAL', rationale: 'probe' },
  { id: 'foreign', sourceSentenceIndex: 2, sourceQuote: 'Trecho que não existe neste evento.', roles: ['PRECONDITION'], actor: 'piloto', temporalRelation: 'PRE_ESCAPE', occurrenceScope: 'CURRENT_EVENT', assertionStatus: 'AFFIRMED', confidence: 'HIGH', concepts: [], preconditionCategory: 'PSYCHOLOGICAL', rationale: 'probe' },
]
const integrityResult = enforceSemanticEvidenceIntegrity({ annotations: integrityProbe, narrative: integrityProbeNarrative })
assert.equal(integrityResult.some((item) => item.id === 'foreign'), false, 'semantic evidence must be present verbatim in the current event source')
assert.equal(integrityResult.some((item) => item.id === 'question'), false, 'investigator questions must not be promoted to causal P/O/A or precondition evidence')
assert.equal(integrityResult.some((item) => item.id === 'goal' && item.roles.includes('OBJECTIVE_INTENT')), true)

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
assert.match(e1.directActor.actor ?? '', /piloto entrevistado|instrutor/i)
assert.equal(e1.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')
assert.equal(e1.escapePoint.poaAnchorBasis, 'FIRST_DEPARTURE')
assert.equal(e1.escapePoint.poaAnchorCandidate, e1.escapePoint.firstDepartureCandidate)
assert.match(e1.escapePoint.firstDepartureActor ?? '', /piloto entrevistado|instrutor/i)
assert.notEqual(e1.escapePoint.firstDepartureCandidate, e1.escapePoint.criticalUnsafeActCandidate, 'later critical act remains a distinct downstream landmark')
assert.equal(e1.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)
assert.equal(e1.axes.action.supportingEvidence.some((text) => /luz de transmiss[aã]o|praia/i.test(text)), false)
const e1Narrative = fs.readFileSync(path.join(base, 'evento-1.txt'), 'utf8')
const e1Focus = focusedPoaEvidenceExcerpt({ narrative: e1Narrative, escapePoint: e1.escapePoint.firstDepartureCandidate!, directActor: e1.directActor.actor! })
assert.match(e1Focus, /quinhentos p[eé]s|500 p[eé]s|entrar e sair da camada/i)
assert.match(e1Focus, /quando ele achou que estava tudo certo/i)
assert.match(e1Focus, /DEMAIS FRASES FACTUAIS DO RELATO PARA INTERPRETAÇÃO SEMÂNTICA/i, 'V2 focus passes the full factual source to the model; actor/temporal locks, not keyword filtering, prevent episode drift')

const e2 = runEvent('2')
assert.match(e2.escapePoint.firstDepartureCandidate ?? '', /500 p[eé]s.*IMC.*continuar|500 p[eé]s.*continuar.*pouso/i)
assert.match(e2.escapePoint.criticalUnsafeActCandidate ?? '', /barra na barra|desacoplou.*automatismo|diretor de voo/i)
assert.match(e2.directActor.actor ?? '', /piloto entrevistado.*outro piloto|tripula[cç][aã]o/i)
assert.notEqual(e2.escapePoint.firstDepartureCandidate, e2.escapePoint.criticalUnsafeActCandidate)
assert.equal(e2.axes.perception.supportingEvidence.some((text) => /eu tomei o comando|fiquei t[aã]o cego/i.test(text)), false)
assert.equal(e2.axes.objective.supportingEvidence.some((text) => /eu tomei o comando|fiquei t[aã]o cego/i.test(text)), false)
assert.equal(e2.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)
assert.equal(e2.escapePoint.poaAnchorBasis, 'FIRST_DEPARTURE')
assert.equal(e2.escapePoint.poaAnchorCandidate, e2.escapePoint.firstDepartureCandidate)
for (const axis of [e2.axes.perception, e2.axes.objective, e2.axes.action]) {
  assert.equal(axis.supportingEvidence.some((text) => /barra na barra|desacoplou.*automatismo|diretor de voo/i.test(text)), false, 'later individual act must not migrate into P/O/A anchored to the collective first departure')
}
assert.match(e2.escapePoint.firstDepartureActor ?? '', /piloto entrevistado.*outro piloto|tripula[cç][aã]o/i)
assert.match(e2.escapePoint.criticalUnsafeActActor ?? '', /outro piloto/i)

const e3 = runEvent('3')
assert.match(e3.escapePoint.criticalUnsafeActCandidate ?? '', /tirei.*m[aã]o.*coletivo|desguarneci.*coletivo/i)
assert.match(e3.directActor.actor ?? '', /piloto entrevistado/i)
const e3Narrative = fs.readFileSync(path.join(base, 'evento-3.txt'), 'utf8')
const e3Focus = focusedPoaEvidenceExcerpt({ narrative: e3Narrative, escapePoint: e3.escapePoint.firstDepartureCandidate!, directActor: e3.directActor.actor! })
assert.match(e3Focus, /pra ajudar.*proativo|para ajudar.*proativo/i)
assert.match(e3Focus, /tirei a m[aã]o esquerda do coletivo/i)
assert.match(e3Focus, /vendo ele com o bra[cç]o parado/i)
const e3Categories = new Set(e3.preconditions.map((p) => p.canonicalCategory))
assert.equal(e3Categories.has('PHYSIOLOGICAL'), true)
assert.equal(e3Categories.has('EQUIPMENT'), true)
assert.equal(e3Categories.has('TRAINING_SELECTION'), false, 'explicit training negation must never become a positive training precondition')
assert.equal(e3Categories.has('ENVIRONMENT'), false, 'landing wind from another episode must not become a precondition of removing the hand from the collective')
assert.equal(e3.preconditions.every((p) => p.methodologyMatch === 'HYPOTHESIS_ONLY' && p.confidence === 'LOW'), true)
assert.equal(e3.axes.action.proposedCode, 'A-F', 'known-wrong deliberate selection must not stop at action-root abstention')
assert.match(e3.axes.objective.statementAtEscapePoint ?? '', /ajudar|proativo/i)
assert.equal(e3.axes.perception.supportingEvidence.some((text) => /maior problema.*cansa[cç]o/i.test(text)), false, 'retrospective causal assessment must not answer perception at the escape point')
assert.equal(e3.preconditions.some((p) => p.evidence.some((text) => /acidente anterior.*pouso era dele/i.test(text))), false, 'approach/landing evidence from a separate episode must not contaminate the ground paperwork event')
const e3Equipment = e3.preconditions.find((p) => p.canonicalCategory === 'EQUIPMENT')
assert.equal(e3Equipment?.methodologyMatch, 'HYPOTHESIS_ONLY', 'parallel equipment defect must not become a causal precondition without an explicit causal link to the selected human failure')

const e4 = runEvent('4')
assert.match(e4.escapePoint.firstDepartureCandidate ?? '', /julguei.*lado.*pous(?:o|ar)|julgamento errado.*lado/i)
assert.match(e4.escapePoint.criticalUnsafeActCandidate ?? '', /julguei.*lado.*pous(?:o|ar)|preferido.*pouso|mais trabalhoso/i)
assert.match(e4.directActor.actor ?? '', /piloto entrevistado/i)
assert.equal(e4.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)
assert.equal(e4.axes.perception.supportingEvidence.some((text) => /depois de pousado/i.test(text)), false, 'post-landing evaluation cannot be used as pre-critical perception')
assert.doesNotMatch(e4.escapePoint.firstDepartureCandidate ?? '', /quando eu fiz o pouso|lado oposto.*menos obst[aá]culos/i, 'post-landing realization must be trimmed from the event-moment landmark')
assert.doesNotMatch(e4.escapePoint.criticalUnsafeActCandidate ?? '', /quando eu fiz o pouso|lado oposto.*menos obst[aá]culos/i)
assert.equal(e4.axes.action.proposedCode, 'A-A', 'action remains coherent with the mistaken perceived state; no independent action failure is added')
assert.equal(e4.preconditions.some((p) => p.canonicalCategory === 'PSYCHOLOGICAL' && p.evidence.some((text) => /acidente anterior.*insegur/i.test(text))), true, 'prior accident influence must remain visible as a psychological hypothesis')
assert.match(e4.escapePoint.criticalUnsafeActActor ?? '', /piloto entrevistado/i)

console.log('PASS human calibration semantic AI regression — four naturalistic interviews')
