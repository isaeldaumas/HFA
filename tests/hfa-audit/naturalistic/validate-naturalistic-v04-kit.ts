#!/usr/bin/env npx tsx
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'docs/hfa-backlog/naturalistic-kit')
const REQUIRED = [
  'V04_PROTOCOL.md',
  'V04_DEVELOPMENT_EXPOSURE_LEDGER.json',
  'schemas/axis-assessment-v2.schema.json',
  'schemas/case-manifest-v2.schema.json',
  'schemas/human-reference-v2.schema.json',
  'schemas/blind-evaluator-form-v2.schema.json',
  'schemas/vnext-output-capture-v2.schema.json',
  'schemas/descriptive-pair-v2.schema.json',
  'campaigns/_TEMPLATE_V04/manifest.json',
  'fixtures/TEST_V04_PAIR_001.json',
  'fixtures/TEST_V04_PAIR_002.json',
]

type AxisAssessment = { score: boolean; status: 'code'|'unresolved'|'not_scored'; code?: string|null }
function assertAxis(a: AxisAssessment, where: string) {
  if (!a || typeof a.score !== 'boolean') throw new Error(`AXIS_SCORE_INVALID ${where}`)
  if (!['code','unresolved','not_scored'].includes(a.status)) throw new Error(`AXIS_STATUS_INVALID ${where}`)
  if (a.status === 'code' && (typeof a.code !== 'string' || a.code.length < 2)) throw new Error(`AXIS_CODE_REQUIRED ${where}`)
  if (a.status !== 'code' && a.code != null) throw new Error(`AXIS_CODE_MUST_BE_NULL ${where}`)
  if (!a.score && a.status !== 'not_scored') throw new Error(`AXIS_NOT_SCORED_CONTRACT ${where}`)
}

for (const rel of REQUIRED) if (!existsSync(join(ROOT, rel))) throw new Error(`MISSING ${rel}`)
for (const file of readdirSync(join(ROOT,'schemas'))) if (file.endsWith('-v2.schema.json')) JSON.parse(readFileSync(join(ROOT,'schemas',file),'utf8'))

const ledger = JSON.parse(readFileSync(join(ROOT,'V04_DEVELOPMENT_EXPOSURE_LEDGER.json'),'utf8'))
for (const c of ledger.excludedCohorts ?? []) if (c.holdoutEligible !== false) throw new Error(`EXPOSED_COHORT_HOLDOUT_ELIGIBLE ${c.cohortId}`)

const PUBLIC_SEAL_KEYS = new Set([
  'schemaVersion','campaignId','createdAt','caseCount','agencyCounts','caseIdRange',
  'privateSourceIndexSha256','caseManifestSha256','sourceLockMode',
  'sourceContentSnapshotsCaptured','sourceContentSnapshotLimitation','engineExecuted',
  'poaOracleAssigned','humanReviewStarted','developmentExposure','holdoutEligible',
  'productionAuthorization'
])
let sealedHoldoutCases = 0
const campaignsRoot = join(ROOT,'campaigns')
for (const campaignDir of readdirSync(campaignsRoot).filter((x)=>x !== '_TEMPLATE_V04')) {
  const sealPath = join(campaignsRoot,campaignDir,'PUBLIC_SEAL.json')
  if (!existsSync(sealPath)) continue
  const seal = JSON.parse(readFileSync(sealPath,'utf8'))
  for (const key of Object.keys(seal)) if (!PUBLIC_SEAL_KEYS.has(key)) throw new Error(`PUBLIC_SEAL_UNEXPECTED_KEY ${campaignDir}:${key}`)
  if (seal.schemaVersion !== 'SERA_V04_HOLDOUT_PUBLIC_SEAL_V1') throw new Error(`PUBLIC_SEAL_VERSION ${campaignDir}`)
  if (seal.campaignId !== campaignDir) throw new Error(`PUBLIC_SEAL_CAMPAIGN_ID ${campaignDir}`)
  if (!Number.isInteger(seal.caseCount) || seal.caseCount < 1) throw new Error(`PUBLIC_SEAL_CASE_COUNT ${campaignDir}`)
  if (seal.developmentExposure !== false || seal.holdoutEligible !== true) throw new Error(`PUBLIC_SEAL_ELIGIBILITY ${campaignDir}`)
  if (seal.engineExecuted !== false || seal.poaOracleAssigned !== false || seal.humanReviewStarted !== false) throw new Error(`PUBLIC_SEAL_PREMATURE_USE ${campaignDir}`)
  if (seal.productionAuthorization !== 'NOT_AUTHORIZED') throw new Error(`PUBLIC_SEAL_PRODUCTION ${campaignDir}`)
  const serialized = JSON.stringify(seal)
  if (/https?:\/\//i.test(serialized)) throw new Error(`PUBLIC_SEAL_URL_LEAK ${campaignDir}`)
  if (/registration|investigationId|sourceUrl/i.test(serialized)) throw new Error(`PUBLIC_SEAL_IDENTITY_KEY_LEAK ${campaignDir}`)
  sealedHoldoutCases += seal.caseCount
}

for (const c of ledger.sealedCohorts ?? []) {
  if (c.holdoutEligible !== true || c.developmentExposure !== false) throw new Error(`SEALED_LEDGER_ELIGIBILITY ${c.cohortId}`)
  if (c.engineExecuted !== false || c.poaOracleAssigned !== false || c.humanReviewStarted !== false) throw new Error(`SEALED_LEDGER_PREMATURE_USE ${c.cohortId}`)
}

const manifest = JSON.parse(readFileSync(join(ROOT,'campaigns/_TEMPLATE_V04/manifest.json'),'utf8'))
if (manifest.schemaVersion !== 'NATURALISTIC_CASE_MANIFEST_V2') throw new Error('BAD_V04_MANIFEST_VERSION')
if (manifest.status !== 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY') throw new Error('BAD_V04_GATE_STATUS')
for (const c of manifest.cases ?? []) {
  if (c.caseRole === 'sealed_holdout' && (c.developmentExposure !== false || c.holdoutEligible !== true || c.eligibility !== 'eligible')) {
    throw new Error(`INVALID_SEALED_HOLDOUT ${c.caseId}`)
  }
}

for (const file of readdirSync(join(ROOT,'fixtures')).filter((f)=>f.startsWith('TEST_V04_') && f.endsWith('.json'))) {
  const p = JSON.parse(readFileSync(join(ROOT,'fixtures',file),'utf8'))
  if (p.schemaVersion !== 'NATURALISTIC_DESCRIPTIVE_PAIR_V2') throw new Error(`BAD_PAIR_VERSION ${file}`)
  if (p.scientificUse !== false) throw new Error(`TEST_FIXTURE_SCIENTIFIC_USE ${file}`)
  if (p.caseRole === 'sealed_holdout') throw new Error(`TEST_FIXTURE_HOLDOUT ${file}`)
  for (const side of ['human','vnext'] as const) for (const axis of ['perception','objective','action'] as const) assertAxis(p[side][axis], `${file}:${side}:${axis}`)
}

console.log(JSON.stringify({
  structuralValidation:'V04_STRUCTURE_OK',
  perAxisContract:'READY',
  exposureLedger:'READY',
  sealedHoldoutCases,
  humanValidation:'BLOCKED_HUMAN',
  scientificValidation:'NOT_RUN',
  productAuthorization:'NOT_AUTHORIZED',
  methodologicalGate:'ENGINE_NATURALISTIC_VALIDATION_NOT_READY'
},null,2))
console.log('NATURALISTIC_V04_TOOLING_READY')
console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
