import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldShowConsumerCredits } from '../../frontend/src/lib/product/consumer-credit-visibility'
import { buildCanonicalEventAnalysisInput, createCanonicalEventAnalysis } from '../../frontend/src/lib/sera-vnext-product/canonical-event-analysis'
const read = (name: string) => readFileSync('frontend/src/' + name, 'utf8')
const eventRoute = read('app/api/events/route.ts')
const clarificationRoute = read('app/api/events/[eventId]/clarifications/route.ts')
const analysisRoute = read('app/api/analyze/route.ts')
const trialStatus = read('app/api/trial/status/route.ts')
const card = read('components/product/TrialUsageCard.tsx')
const eventForm = read('app/(dashboard)/events/new/page.tsx')
const createAnalysis = read('lib/sera-vnext-product/persistence/create-analysis.ts')
const canonical = read('lib/sera-vnext-product/canonical-event-analysis.ts')
assert.equal(shouldShowConsumerCredits({ loading:false,verified:true,isAdmin:true,isUnlimited:true,plan:'enterprise' }),false)
assert.equal(shouldShowConsumerCredits({ loading:false,verified:true,isAdmin:false,isUnlimited:true,plan:'enterprise' }),false)
assert.equal(shouldShowConsumerCredits({ loading:false,verified:true,isAdmin:false,plan:'free' }),true)
assert.match(trialStatus,/user\.role\.toLowerCase\(\) === 'admin'/)
assert.match(trialStatus,/planRow\.plan === 'enterprise'/)
assert.match(trialStatus,/status: 204/)
assert.match(card,/res\.status === 204/)
assert.ok(eventRoute.indexOf("stage = 'preflight-ai'") < eventRoute.indexOf("stage = 'insert-event'"), 'provider preflight must precede event creation')
assert.match(eventRoute,/preparedSemantic = await enrichSeraNarrativeSemantically/)
assert.match(eventRoute,/createCanonicalEventAnalysis\(\{[\s\S]*preparedSemantic,/)
assert.match(eventRoute,/Nenhum novo evento foi criado/)
assert.match(eventRoute,/event_id: eventId,[\s\S]*analysis_started: false/)
assert.match(eventForm,/incompleteEventId/)
assert.match(eventForm,/Abrir o evento registrado e tentar novamente sem duplicar/)
assert.match(createAnalysis,/args\.preparedSemantic \?\? await enrichSeraNarrativeSemantically/)
assert.match(canonical,/preparedSemantic: args\.preparedSemantic/)
assert.match(clarificationRoute,/await applyUserAiSettingsToEnv\(admin, user\.userId\)/)
assert.match(clarificationRoute,/O provedor de IA configurado para esta conta está sem saldo/)
assert.match(analysisRoute,/A ocorrência continua registrada, mas a análise não foi concluída/)
// Passing through the one-shot canonical route preserves the caller's enrichment
// and does not turn a preflight into an additional billable analysis.
let forwarded=false
void createCanonicalEventAnalysis({
  eventId:'urgent-test',title:'Test',narrative:'Exemplo',mode:'INITIAL',
  context:{tenantId:'org',userId:'user',role:'analyst',email:'x@y.com',requestId:'req'},
  preparedSemantic: {annotations:[],safeOperationModel:undefined,meta:{provider:'openai',model:'gpt',requestedAt:'test',acceptedAnnotations:0,rejectedAnnotations:0,schemaVersion:'SERA_SEMANTIC_AI_V1'}} as never,
  create: async ({preparedSemantic,input})=> {forwarded=preparedSemantic?.meta?.provider==='openai' && input.metadata?.semanticAiRequired===true;return {analysis:{} as never,revision:{} as never,idempotent:false}},
}).then(()=>{assert.equal(forwarded,true); console.log('URGENT_AI_BILLING_EVENT_RETRY_PASS: admin/enterprise display, preflight before event insertion, one semantic pass, clarification provider, preserved failed event retry')}).catch(e=>{console.error(e);process.exitCode=1})
