import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSeraActionSuggestions } from '../../frontend/src/lib/corrective-actions/sera-suggestions'
import { SERA_MOST_LIKELY_PRECONDITIONS } from '../../frontend/src/lib/sera-vnext/precondition-taxonomy'

const supportedOutput = {
  factualExtraction: { evidence: [] },
  preconditions: [{
    id: 'PC-EVIDENCE-TIME',
    label: 'TIME_PRESSURE',
    description: 'Pressão temporal confirmada no período causal.',
    category: 'TIME_PRESSURE',
    evidence: ['Havia janela operacional curta antes do ponto de fuga.'],
    relationship: 'ENABLING_PRECONDITION',
    sourceEvidence: [],
    sourceRuleIds: ['SERA-HENDY-ANNEX-B-TIME_PRESSURE', 'SERA-HENDY-TABLE1-P-G-TIME_PRESSURE'],
    linkedActor: 'PF',
    explicitlyNotEscapePoint: true,
    basedOnCandidateCode: false,
    nonFinal: true,
    confidence: 'HIGH',
    canonicalCategory: 'TIME_PRESSURE',
    canonicalLevel: 'IMMEDIATE',
    likelyForActiveFailureCodes: ['P-G'],
    methodologyMatch: 'MOST_LIKELY_AND_EVIDENCED',
  }],
} as any

const suggestions = buildSeraActionSuggestions({
  analysisId: 'analysis-1',
  eventId: 'event-1',
  analysisTitle: 'Evento 1',
  output: supportedOutput,
})
assert.equal(suggestions.length, 1)
assert.equal(suggestions[0].kind, 'CORRECTIVE_PREVENTIVE')
assert.equal(suggestions[0].preconditionId, 'PC-EVIDENCE-TIME')
assert.equal(suggestions[0].canonicalCategory, 'TIME_PRESSURE')
assert.equal(suggestions[0].preconditionLabel, 'Pressão do tempo')
assert.ok(suggestions[0].sourceRuleIds.some((id) => id.includes('TABLE1-P-G-TIME_PRESSURE')))
assert.ok(SERA_MOST_LIKELY_PRECONDITIONS['P-G'].includes('TIME_PRESSURE'))

const actionsRoute = readFileSync('frontend/src/app/api/actions/route.ts', 'utf8')
assert.match(actionsRoute, /Toda nova ação deve estar vinculada a uma pré-condição SERA identificada/)
assert.match(actionsRoute, /matchedPrecondition/)
assert.match(actionsRoute, /SUPPORTED_RELATIONSHIPS/)
assert.match(actionsRoute, /source_event_id/)
assert.match(actionsRoute, /STALE_PRECONDITION_LINK/, 'reanalyzed events must flag actions whose precondition is no longer current')
assert.match(actionsRoute, /is\('deleted_at', null\)/)
assert.match(actionsRoute, /Ação corretiva exige uma pré-condição sustentada pela evidência do evento/)

const suggestionsRoute = readFileSync('frontend/src/app/api/actions/suggestions/route.ts', 'utf8')
assert.match(suggestionsRoute, /activeEventById/)
assert.match(suggestionsRoute, /\.in\('source_reference', activeEventIds\)/)
assert.match(suggestionsRoute, /sourceEventId\}\|\$\{suggestion.kind\}\|\$\{suggestion.canonicalCategory\}/)

const actionsPage = readFileSync('frontend/src/app/(dashboard)/actions/page.tsx', 'utf8')
assert.match(actionsPage, /Todos os eventos ativos/)
assert.match(actionsPage, /eventFilter/)
assert.match(actionsPage, /suggestion\.preconditionId/)
assert.match(actionsPage, /suggestion\.canonicalCategory/)
assert.match(actionsPage, /Pré-condição:/)

const riskServer = readFileSync('frontend/src/lib/risk-profile/server.ts', 'utf8')
assert.match(riskServer, /activeEventIds/)
assert.match(riskServer, /activeVNextRows/)
assert.match(riskServer, /action\.action_kind === 'CORRECTIVE_PREVENTIVE'/)
assert.match(riskServer, /action\.precondition_category/)
assert.match(riskServer, /currentPreconditionsByEvent/, 'risk treatment must be revalidated against the latest event preconditions')

const preconditionStep = readFileSync('frontend/src/lib/sera-vnext/engine-v0/steps/09-preconditions.ts', 'utf8')
assert.match(preconditionStep, /Hendy Table 1 is the investigation route after the active failure is known/)
assert.match(preconditionStep, /likelyTraversalOrder/)
assert.match(preconditionStep, /SERA_MOST_LIKELY_PRECONDITIONS/)

const migration = readFileSync('supabase/migrations/20260929004500_event_precondition_treatment_dynamic_recalculation.sql', 'utf8')
assert.match(migration, /precondition_category/)
assert.match(migration, /corrective_actions_current_precondition_traceability_check/)
assert.match(migration, /drop trigger if exists trg_block_event_soft_delete_current_sera_actions/)
assert.match(migration, /RECALCULATE_ACTIVE_UNIVERSE/)
assert.doesNotMatch(migration, /raise exception 'EVENT_DELETE_CORRECTIVE_ACTION_BLOCK'/)

console.log('PASS dynamic event/precondition treatment lifecycle')
