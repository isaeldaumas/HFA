import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import type { SeraSemanticEvidenceAnnotation } from '../../frontend/src/lib/sera-vnext/engine-contract'

function run(id: string, narrative: string, quote: string, actor: string) {
  const semanticEvidence: SeraSemanticEvidenceAnnotation[] = [{
    id, sourceQuote: quote, sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR'], concepts: [], actor,
    temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN',
    actionMechanismEvidenceQuote: null, displayInterpretation: null, confidence: 'HIGH', rationale: 'Verbatim source quote',
  }]
  return runSeraVNextEngineV0({ inputId: id, narrative, locale: 'pt-BR', sourceType: 'real_event', requestId: id,
    mode: 'CANDIDATE_ONLY', semanticEvidence, semanticEnrichmentMeta: {
      provider: 'frozen', model: 'v2', requestedAt: 'frozen', acceptedAnnotations: 1,
      rejectedAnnotations: 0, schemaVersion: 'SERA_SEMANTIC_AI_V2', humanEscapeDisposition: 'HUMAN_DEPARTURE',
    }, options: { allowLlm: true, requireHumanReview: true, includeDebugTrace: true },
  })
}

// Independent assessment of a naturalistic instruction-flight interview: a *plan to abort*
// is not, by itself, the first unsafe departure. This does not license anchoring a later act
// until temporal scope and the unsafe state at the earlier moment have been independently checked.
const safePlan = 'O instrutor estipulou que a gente ia voar mais duas milhas nessa condição e arremeter.'
const plan = run('SERA-DAUMAS-CAL-GEN-01', `${safePlan} Depois, outro piloto tentou comandar com o automatismo acoplado.`, safePlan, 'instrutor')
assert.equal(plan.escapePoint.status, 'INSUFFICIENT_EVIDENCE', 'a prospective go-around plan alone must not be treated as a demonstrated unsafe departure')
assert.equal(plan.directActor.status, 'AMBIGUOUS')
assert.equal(plan.canonicalTraversal.paths.length, 0)
assert.ok(plan.escapePoint.counterEvidence.some(item => /plano|planejamento|intenção|intencao|plan/i.test(item)))

// An explicitly unsafe continuation despite an observed limit is not a merely safe plan.
const explicitUnsafe = 'O comandante decidiu prosseguir abaixo dos mínimos em IMC apesar do alerta de arremetida.'
const unsafe = run('SERA-DAUMAS-CAL-GEN-02', `${explicitUnsafe} A aproximação continuou.`, explicitUnsafe, 'comandante')
assert.equal(unsafe.escapePoint.status, 'CANDIDATE')
assert.equal(unsafe.directActor.actor, 'comandante')

// The first person plural and semantic label "pilot and copilot" cannot be a single actor.
const joint = 'A gente resolveu continuar o voo e tentar o pouso em condições não visuais.'
const collective = run('SERA-DAUMAS-CAL-GEN-03', `${joint} O copiloto desacoplou o automatismo depois.`, joint, 'piloto e copiloto')
assert.equal(collective.directActor.status, 'AMBIGUOUS', 'a joint decision must require individual actor attribution')
assert.equal(collective.directActor.actor, null)
assert.equal(collective.canonicalTraversal.paths.length, 0)
assert.ok(collective.directActor.actorMigrationWarnings.some(w => /coletiv|individual|conjunt/i.test(w)))

// A long mixed functional label is also a collective, not a resolved operator.
const mixedLabel = run('SERA-DAUMAS-CAL-GEN-03B', joint, joint, 'piloto entrevistado e outro piloto')
assert.equal(mixedLabel.directActor.status, 'AMBIGUOUS')
assert.equal(mixedLabel.directActor.actor, null)

// No false individual attribution for source-coreference labels either.
const crew = run('SERA-DAUMAS-CAL-GEN-04', `${joint} A tripulação percebeu a condição.`, joint, 'tripulação de voo')
assert.equal(crew.directActor.status, 'AMBIGUOUS')
assert.equal(crew.canonicalTraversal.paths.length, 0)

// A specific act and its accountable operator remain eligible to proceed.
const action = 'O piloto em adaptação tentou manobrar manualmente sem desligar o automatismo.'
const specific = run('SERA-DAUMAS-CAL-GEN-05', `${action} O instrutor assumiu o controle depois.`, action, 'piloto em adaptação')
assert.equal(specific.escapePoint.status, 'CANDIDATE')
assert.equal(specific.directActor.status, 'IDENTIFIED')
assert.equal(specific.directActor.actor, 'piloto em adaptação')

// A physically observable own-action withdrawal stays with the actor, not with a later
// equipment defect; an incorrect action leaf cannot be inferred from equipment alone.
const withdrawal = 'O piloto retirou a mão do coletivo para pegar documentos.'
const single = run('SERA-DAUMAS-CAL-GEN-06', `${withdrawal} Posteriormente foi encontrado defeito no coletivo.`, withdrawal, 'piloto')
assert.equal(single.directActor.actor, 'piloto')
assert.equal(single.escapePoint.status, 'CANDIDATE')
assert.ok(single.escapePoint.firstDepartureCandidate?.includes('retirou a mão'))
// A naturalistic interview can put a pre-landing judgment and a later discovery
// in one quotation. Truncate the P/O/A temporal anchor without changing the source fact.
const mixedTime = 'O piloto julgou que o melhor lado era o seu e aí, quando eu fiz o pouso, percebi que o lado oposto teria menos obstáculos.'
const selectedSide = run('SERA-DAUMAS-CAL-GEN-07', mixedTime, mixedTime, 'piloto entrevistado')
assert.equal(selectedSide.escapePoint.status, 'CANDIDATE')
assert.ok(selectedSide.escapePoint.firstDepartureCandidate?.includes('julgou que o melhor lado'))
assert.ok(!selectedSide.escapePoint.firstDepartureCandidate?.includes('percebi que o lado oposto'),
  'retrospective post-landing discovery cannot become pre-landing perception')

console.log('DAUMAS_INDEPENDENT_GUARDRAILS_PASS: prospective safe plan, explicit unsafe decision, group attribution, single accountable actor, material confound and retrospective scope')
