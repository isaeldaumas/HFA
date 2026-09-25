#!/usr/bin/env npx tsx
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const campaignDir = join(root, 'docs/hfa-backlog/naturalistic-kit/campaigns/V04_SEALED_001')
const freezePath = join(campaignDir, 'CAMPAIGN_FREEZE.json')
const sealPath = join(campaignDir, 'PUBLIC_SEAL.json')
const invalidationPath = join(campaignDir, 'CAMPAIGN_INVALIDATION_20260924.json')
const freeze = JSON.parse(readFileSync(freezePath, 'utf8'))
const seal = JSON.parse(readFileSync(sealPath, 'utf8'))
const invalidation = existsSync(invalidationPath) ? JSON.parse(readFileSync(invalidationPath, 'utf8')) : null

function gitTree(path: string): string {
  return execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8' }).trim()
}
function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(join(root, path))).digest('hex')
}
function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`)
}
function assertTrue(value: unknown, label: string): void {
  if (value !== true) throw new Error(`${label}: expected=true actual=${String(value)}`)
}

assertEqual(freeze.schemaVersion, 'SERA_V04_CAMPAIGN_FREEZE_V1', 'schemaVersion')
assertEqual(freeze.campaignId, 'V04_SEALED_001', 'campaignId')
assertEqual(sha256(freeze.taxonomyPath), freeze.taxonomySha256, 'taxonomySha256')
assertEqual(seal.campaignId, freeze.campaignId, 'publicSealCampaignId')
assertEqual(seal.engineExecuted, false, 'publicSealEngineExecuted')
assertEqual(seal.humanReviewStarted, false, 'publicSealHumanReviewStarted')
assertEqual(freeze.engineExecutedOnHoldout, false, 'engineExecutedOnHoldout')
assertEqual(freeze.humanReferenceFrozen, false, 'humanReferenceFrozen')
assertEqual(freeze.holdoutSourceContentReviewedByRuntimeDeveloper, false, 'holdoutSourceContentReviewedByRuntimeDeveloper')
assertEqual(freeze.productionAuthorization, 'NOT_AUTHORIZED', 'productionAuthorization')

const currentTreeOid = gitTree('frontend/src/lib/sera-vnext')
const currentRuntimeTreeOid = gitTree('frontend/src/lib/sera-vnext-runtime')
const freezeStillMatches =
  currentTreeOid === freeze.seraVNextTreeOid &&
  currentRuntimeTreeOid === freeze.seraVNextRuntimeTreeOid

if (freezeStillMatches) {
  console.log(JSON.stringify({
    campaignFreeze: 'PASS',
    campaignId: freeze.campaignId,
    seraVNextTreeOid: freeze.seraVNextTreeOid,
    seraVNextRuntimeTreeOid: freeze.seraVNextRuntimeTreeOid,
    taxonomySha256: freeze.taxonomySha256,
    engineExecutedOnHoldout: freeze.engineExecutedOnHoldout,
    humanReferenceFrozen: freeze.humanReferenceFrozen,
    productionAuthorization: freeze.productionAuthorization,
  }, null, 2))
  console.log('SERA_V04_CAMPAIGN_FREEZE_OK')
} else {
  if (!invalidation) throw new Error('V04 engine/runtime drift detected without explicit campaign invalidation record')
  assertEqual(invalidation.schemaVersion, 'SERA_V04_CAMPAIGN_INVALIDATION_V1', 'invalidation.schemaVersion')
  assertEqual(invalidation.campaignId, freeze.campaignId, 'invalidation.campaignId')
  assertEqual(invalidation.status, 'INVALIDATED_BEFORE_EXECUTION', 'invalidation.status')
  assertEqual(invalidation.reasonCode, 'ENGINE_RUNTIME_CALIBRATION_AFTER_FREEZE', 'invalidation.reasonCode')
  assertEqual(invalidation.frozenRuntimeBaselineCommit, freeze.runtimeBaselineCommit, 'invalidation.frozenRuntimeBaselineCommit')
  assertEqual(invalidation.frozenSeraVNextTreeOid, freeze.seraVNextTreeOid, 'invalidation.frozenSeraVNextTreeOid')
  assertEqual(invalidation.frozenSeraVNextRuntimeTreeOid, freeze.seraVNextRuntimeTreeOid, 'invalidation.frozenSeraVNextRuntimeTreeOid')
  assertEqual(invalidation.engineExecutedOnHoldoutAtInvalidation, false, 'invalidation.engineExecutedOnHoldoutAtInvalidation')
  assertEqual(invalidation.humanReferenceFrozenAtInvalidation, false, 'invalidation.humanReferenceFrozenAtInvalidation')
  assertEqual(invalidation.humanReviewStartedAtInvalidation, false, 'invalidation.humanReviewStartedAtInvalidation')
  assertEqual(invalidation.productionAuthorization, 'NOT_AUTHORIZED', 'invalidation.productionAuthorization')
  assertEqual(invalidation.holdoutExecutionAllowed, false, 'invalidation.holdoutExecutionAllowed')
  assertEqual(invalidation.humanReferenceFreezeAllowed, false, 'invalidation.humanReferenceFreezeAllowed')
  assertTrue(invalidation.newCampaignRequiredForCurrentRuntime, 'invalidation.newCampaignRequiredForCurrentRuntime')
  assertTrue(invalidation.preserveSealedCorpus, 'invalidation.preserveSealedCorpus')

  console.log(JSON.stringify({
    campaignFreeze: 'INVALIDATED_BEFORE_EXECUTION',
    campaignId: freeze.campaignId,
    frozenSeraVNextTreeOid: freeze.seraVNextTreeOid,
    currentSeraVNextTreeOid: currentTreeOid,
    frozenSeraVNextRuntimeTreeOid: freeze.seraVNextRuntimeTreeOid,
    currentSeraVNextRuntimeTreeOid: currentRuntimeTreeOid,
    engineExecutedOnHoldout: false,
    humanReferenceFrozen: false,
    newCampaignRequiredForCurrentRuntime: true,
    productionAuthorization: 'NOT_AUTHORIZED',
  }, null, 2))
  console.log('SERA_V04_CAMPAIGN_INVALIDATED_SAFELY')
}
